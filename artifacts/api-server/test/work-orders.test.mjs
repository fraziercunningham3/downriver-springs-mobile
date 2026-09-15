import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionSecret = "work-order-test-session-secret";
const testRunId = randomUUID();
const apiPort = 31_000 + Math.floor(Math.random() * 2_000);
const apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;
let apiProcess;

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json();
  return { response, body };
}

async function waitForApi() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${apiBaseUrl}/healthz`)).ok) return;
    } catch {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Work-order API server did not become ready.");
}

async function registerCustomer(label) {
  const email = `work-order-${label}-${testRunId}@example.test`;
  const { response, body } = await fetchJson("/shop/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: `Work Order ${label}`,
      email,
      phone: "313-555-0199",
      password: "work-order-password",
      deviceName: `${label} test device`,
      vehicle: { label: `2018 Test ${label}`, plate: `WO${label.toUpperCase()}1` },
    }),
  });
  assert.equal(response.status, 201);
  assert.equal(body.user.role, "customer");
  assert.equal(body.vehicles.length, 1);
  return body;
}

function auth(token) {
  return { authorization: `Bearer ${token}` };
}

before(async () => {
  apiProcess = spawn("node", ["--enable-source-maps", "dist/index.mjs"], {
    cwd: packageDir,
    env: {
      ...process.env,
      PORT: String(apiPort),
      SESSION_SECRET: sessionSecret,
      DATABASE_URL: process.env.DATABASE_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForApi();
});

after(async () => {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill("SIGTERM");
    await once(apiProcess, "exit");
  }
});

describe("shop work-order authorization and live updates", () => {
  it("isolates customer reads, persists approvals, and gates every mutation by role", async () => {
    const alice = await registerCustomer("alice");
    const bob = await registerCustomer("bob");
    const staffEmail = `work-order-staff-${testRunId}@example.test`;
    const staffResult = await fetchJson("/shop/staff/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        name: "Work Order Staff",
        email: staffEmail,
        phone: "313-555-0198",
        password: "work-order-password",
        inviteToken: sessionSecret,
        deviceName: "staff test device",
      }),
    });
    assert.equal(staffResult.response.status, 201);

    const customerStaffList = await fetchJson("/shop/staff/work-orders", {
      headers: auth(alice.token),
    });
    assert.equal(customerStaffList.response.status, 401);

    const staffListBeforeCreate = await fetchJson("/shop/staff/work-orders", {
      headers: auth(staffResult.body.token),
    });
    assert.equal(staffListBeforeCreate.response.status, 200);
    assert.ok(staffListBeforeCreate.body.customers.some((customer) => customer.id === alice.user.id));
    assert.ok(staffListBeforeCreate.body.customers.some((customer) => customer.id === bob.user.id));

    const mismatchedVehicleCreate = await fetchJson("/shop/staff/work-orders", {
      method: "POST",
      headers: auth(staffResult.body.token),
      body: JSON.stringify({
        customerId: alice.user.id,
        vehicleId: bob.vehicles[0].id,
        service: "Should reject mismatched vehicle",
        status: "Awaiting approval",
        progress: 0.2,
        eta: "Tomorrow",
        technician: "Test Technician",
        note: "Should not save",
        estimate: "$425",
      }),
    });
    assert.equal(mismatchedVehicleCreate.response.status, 400);

    async function createWorkOrder(customer, suffix, idempotencyKey) {
      const result = await fetchJson("/shop/staff/work-orders", {
        method: "POST",
        headers: {
          ...auth(staffResult.body.token),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify({
          customerId: customer.user.id,
          vehicleId: customer.vehicles[0].id,
          service: `Ownership test service ${suffix}`,
          status: "Awaiting approval",
          progress: 0.2,
          eta: "Tomorrow",
          technician: "Test Technician",
          note: `Private note for ${suffix}`,
          estimate: "$425",
        }),
      });
      assert.equal(result.response.status, 201);
      return result.body.workOrder;
    }

    const duplicateKey = `staff-action-${testRunId}`;
    const duplicateResults = await Promise.all([
      fetchJson("/shop/staff/work-orders", {
        method: "POST",
        headers: { ...auth(staffResult.body.token), "Idempotency-Key": duplicateKey },
        body: JSON.stringify({
          customerId: alice.user.id,
          vehicleId: alice.vehicles[0].id,
          service: "Ownership test service alice",
          status: "Awaiting approval",
          progress: 0.2,
          eta: "Tomorrow",
          technician: "Test Technician",
          note: "Private note for alice",
          estimate: "$425",
        }),
      }),
      fetchJson("/shop/staff/work-orders", {
        method: "POST",
        headers: { ...auth(staffResult.body.token), "Idempotency-Key": duplicateKey },
        body: JSON.stringify({
          customerId: alice.user.id,
          vehicleId: alice.vehicles[0].id,
          service: "Ownership test service alice",
          status: "Awaiting approval",
          progress: 0.2,
          eta: "Tomorrow",
          technician: "Test Technician",
          note: "Private note for alice",
          estimate: "$425",
        }),
      }),
    ]);
    assert.deepEqual(duplicateResults.map(({ response }) => response.status).sort(), [200, 201]);
    assert.equal(duplicateResults[0].body.workOrder.id, duplicateResults[1].body.workOrder.id);
    const aliceOrder = duplicateResults[0].body.workOrder;
    const bobOrder = await createWorkOrder(bob, "bob");

    const staffListAfterDuplicate = await fetchJson("/shop/staff/work-orders", {
      headers: auth(staffResult.body.token),
    });
    assert.equal(
      staffListAfterDuplicate.body.workOrders.filter((order) => order.id === aliceOrder.id).length,
      1,
    );

    const aliceDashboard = await fetchJson("/shop/dashboard", { headers: auth(alice.token) });
    assert.equal(aliceDashboard.response.status, 200);
    assert.deepEqual(aliceDashboard.body.workOrders.map((order) => order.id), [aliceOrder.id]);

    const bobDashboard = await fetchJson("/shop/dashboard", { headers: auth(bob.token) });
    assert.equal(bobDashboard.response.status, 200);
    assert.deepEqual(bobDashboard.body.workOrders.map((order) => order.id), [bobOrder.id]);

    const crossAccountApproval = await fetchJson(`/shop/work-orders/${aliceOrder.id}/approve`, {
      method: "POST",
      headers: auth(bob.token),
    });
    assert.equal(crossAccountApproval.response.status, 404);

    const customerStaffCreate = await fetchJson("/shop/staff/work-orders", {
      method: "POST",
      headers: auth(alice.token),
      body: JSON.stringify({
        customerId: bob.user.id,
        vehicleId: bob.vehicles[0].id,
        service: "Unauthorized customer create",
        eta: "Never",
        technician: "Nobody",
        note: "Should not save",
        estimate: "$1",
      }),
    });
    assert.equal(customerStaffCreate.response.status, 401);

    const customerStaffUpdate = await fetchJson(`/shop/staff/work-orders/${bobOrder.id}`, {
      method: "PATCH",
      headers: auth(alice.token),
      body: JSON.stringify({ note: "Unauthorized customer update" }),
    });
    assert.equal(customerStaffUpdate.response.status, 401);

    const approval = await fetchJson(`/shop/work-orders/${aliceOrder.id}/approve`, {
      method: "POST",
      headers: auth(alice.token),
    });
    assert.equal(approval.response.status, 200);
    assert.equal(approval.body.workOrder.approved, true);
    assert.equal(approval.body.workOrder.status, "In progress");

    const staffUpdate = await fetchJson(`/shop/staff/work-orders/${aliceOrder.id}`, {
      method: "PATCH",
      headers: auth(staffResult.body.token),
      body: JSON.stringify({
        service: "Updated full service package",
        status: "Ready for pickup",
        progress: 1,
        eta: "Ready today",
        technician: "Updated Technician",
        note: "Technician completed the repair.",
        estimate: "$575",
        approved: false,
      }),
    });
    assert.equal(staffUpdate.response.status, 200);
    assert.equal(staffUpdate.body.workOrder.service, "Updated full service package");
    assert.equal(staffUpdate.body.workOrder.status, "Ready for pickup");
    assert.equal(staffUpdate.body.workOrder.progress, 1);
    assert.equal(staffUpdate.body.workOrder.eta, "Ready today");
    assert.equal(staffUpdate.body.workOrder.technician, "Updated Technician");
    assert.equal(staffUpdate.body.workOrder.note, "Technician completed the repair.");
    assert.equal(staffUpdate.body.workOrder.estimate, "$575");
    assert.equal(staffUpdate.body.workOrder.approved, false);

    const recoveredAliceDashboard = await fetchJson("/shop/dashboard", { headers: auth(alice.token) });
    assert.equal(recoveredAliceDashboard.response.status, 200);
    assert.equal(recoveredAliceDashboard.body.workOrders[0].id, aliceOrder.id);
    assert.equal(recoveredAliceDashboard.body.workOrders[0].customerId, alice.user.id);
    assert.equal(recoveredAliceDashboard.body.workOrders[0].vehicleId, alice.vehicles[0].id);
    assert.equal(recoveredAliceDashboard.body.workOrders[0].vehicle, alice.vehicles[0].label);
    assert.equal(recoveredAliceDashboard.body.workOrders[0].plate, alice.vehicles[0].plate);
    assert.equal(recoveredAliceDashboard.body.workOrders[0].service, "Updated full service package");
    assert.equal(recoveredAliceDashboard.body.workOrders[0].status, "Ready for pickup");
    assert.equal(recoveredAliceDashboard.body.workOrders[0].progress, 1);
    assert.equal(recoveredAliceDashboard.body.workOrders[0].eta, "Ready today");
    assert.equal(recoveredAliceDashboard.body.workOrders[0].technician, "Updated Technician");
    assert.equal(recoveredAliceDashboard.body.workOrders[0].note, "Technician completed the repair.");
    assert.equal(recoveredAliceDashboard.body.workOrders[0].estimate, "$575");
    assert.equal(recoveredAliceDashboard.body.workOrders[0].approved, false);

    const stillPrivateToBob = await fetchJson("/shop/dashboard", { headers: auth(bob.token) });
    assert.deepEqual(stillPrivateToBob.body.workOrders.map((order) => order.id), [bobOrder.id]);
  });

  it("returns the committed order on a lost-response retry without duplicating either view", async () => {
    const customer = await registerCustomer("lost-response");
    const staffEmail = `work-order-lost-response-staff-${testRunId}@example.test`;
    const staffResult = await fetchJson("/shop/staff/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        name: "Lost Response Staff",
        email: staffEmail,
        phone: "313-555-0197",
        password: "work-order-password",
        inviteToken: sessionSecret,
        deviceName: "lost response test device",
      }),
    });
    assert.equal(staffResult.response.status, 201);

    const actionKey = `staff-lost-response-${testRunId}`;
    const requestBody = {
      customerId: customer.user.id,
      vehicleId: customer.vehicles[0].id,
      service: "Lost response suspension inspection",
      status: "Awaiting approval",
      progress: 0.2,
      eta: "Tomorrow",
      technician: "Test Technician",
      note: "Retry must not create a second order.",
      estimate: "$425",
    };

    async function submitFromMobile({ loseResponse = false } = {}) {
      const result = await fetchJson("/shop/staff/work-orders", {
        method: "POST",
        headers: { ...auth(staffResult.body.token), "Idempotency-Key": actionKey },
        body: JSON.stringify(requestBody),
      });
      if (loseResponse) {
        assert.equal(result.response.status, 201);
        throw new Error("Mobile response lost after the request committed.");
      }
      return result;
    }

    // The server commits this request, but the mobile caller loses the
    // response before it can update its local queue.
    await assert.rejects(
      () => submitFromMobile({ loseResponse: true }),
      /response lost after the request committed/,
    );

    const retry = await submitFromMobile();
    assert.equal(retry.response.status, 200);
    const committedOrder = retry.body.workOrder;

    const staffQueue = await fetchJson("/shop/staff/work-orders", {
      headers: auth(staffResult.body.token),
    });
    assert.equal(staffQueue.response.status, 200);
    assert.deepEqual(
      staffQueue.body.workOrders.filter((workOrder) => workOrder.id === committedOrder.id),
      [committedOrder],
    );

    const customerDashboard = await fetchJson("/shop/dashboard", {
      headers: auth(customer.token),
    });
    assert.equal(customerDashboard.response.status, 200);
    assert.deepEqual(
      customerDashboard.body.workOrders.map((workOrder) => workOrder.id),
      [committedOrder.id],
    );
    assert.equal(customerDashboard.body.workOrders[0].service, committedOrder.service);
    assert.equal(customerDashboard.body.workOrders[0].status, committedOrder.status);
  });
});