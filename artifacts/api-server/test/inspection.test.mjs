import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  invalidFindingCases,
  invalidSummaryCases,
  validFinding,
  validModelOutput,
} from "./inspection-fixtures.mjs";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDeviceId = "inspection-test-device";
const media = {
  mimeType: "image/jpeg",
  data: "a".repeat(100),
};

let apiBaseUrl;
let apiProcess;
let providerServer;
let providerResponse = providerPayload(validModelOutput);
let providerRequestCount = 0;

function providerPayload(text) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(text) }] } }],
  };
}

function startServer(server) {
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => server.address().port);
}

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
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBaseUrl}/healthz`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const output = apiProcess?.stderr ? " See API stderr in the test output." : "";
  throw new Error(`API server did not become ready.${output}`, { cause: lastError });
}

async function createSession() {
  const { response, body } = await fetchJson("/inspection/session", {
    method: "POST",
    body: JSON.stringify({ deviceId: testDeviceId }),
  });
  assert.equal(response.status, 200);
  assert.equal(typeof body.token, "string");
  assert.equal(body.expiresIn, 86400);
  return body.token;
}

function analysisRequest(overrides = {}) {
  return {
    component: "Engine",
    mediaKind: "photo",
    vehicle: "2017 Honda CR-V",
    media: [media],
    ...overrides,
  };
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

before(async () => {
  providerServer = createServer((_request, response) => {
    providerRequestCount += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(providerResponse));
  });
  const providerPort = await startServer(providerServer);

  const apiPort = await new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
  apiBaseUrl = `http://127.0.0.1:${apiPort}/api`;

  apiProcess = spawn("node", ["--enable-source-maps", "dist/index.mjs"], {
    cwd: packageDir,
    env: {
      ...process.env,
      PORT: String(apiPort),
      SESSION_SECRET: "inspection-test-session-secret",
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://inspection-test:inspection-test@127.0.0.1:5432/inspection-test",
      AI_INTEGRATIONS_GEMINI_API_KEY: "inspection-test-key",
      AI_INTEGRATIONS_GEMINI_BASE_URL: `http://127.0.0.1:${providerPort}`,
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
  if (providerServer) {
    providerServer.close();
    await once(providerServer, "close");
  }
});

describe("inspection session boundary", () => {
  it("issues a signed session for a stable device id", async () => {
    const token = await createSession();
    assert.match(token, /^ds\.[^.]+\.[^.]+$/);
    assert.doesNotMatch(token, /inspection-test-session-secret/);
  });

  it("rejects an invalid device id", async () => {
    const { response, body } = await fetchJson("/inspection/session", {
      method: "POST",
      body: JSON.stringify({ deviceId: "too-short" }),
    });
    assert.equal(response.status, 400);
    assert.equal(body.error, "A stable device id is required.");
  });

  it("rejects missing and invalid bearer tokens before model access", async () => {
    const beforeRequests = providerRequestCount;
    for (const headers of [{}, { authorization: "Bearer not-a-session" }]) {
      const { response, body } = await fetchJson("/inspection/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify(analysisRequest()),
      });
      assert.equal(response.status, 401);
      assert.equal(body.error, "A valid inspection session is required.");
    }
    assert.equal(providerRequestCount, beforeRequests);
  });
});

describe("inspection payload boundaries", () => {
  it("rejects media data over the per-item limit", async () => {
    const token = await createSession();
    const { response, body } = await fetchJson("/inspection/analyze", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(
        analysisRequest({ media: [{ ...media, data: "a".repeat(1_600_001) }] }),
      ),
    });
    assert.equal(response.status, 400);
    assert.equal(body.error, "Inspection media did not match the analysis contract.");
  });

  it("rejects more than four media items", async () => {
    const token = await createSession();
    const { response, body } = await fetchJson("/inspection/analyze", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(analysisRequest({ media: Array(5).fill(media) })),
    });
    assert.equal(response.status, 400);
    assert.equal(body.error, "Inspection media did not match the analysis contract.");
  });
});

describe("inspection model response fixture", () => {
  it("accepts a finding with valid severity, confidence, evidence, recommendation, and summary", async () => {
    const token = await createSession();
    providerResponse = providerPayload(validModelOutput);
    const { response, body } = await fetchJson("/inspection/analyze", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(analysisRequest()),
    });
    assert.equal(response.status, 200);
    assert.equal(body.findings[0].severity, validFinding.severity);
    assert.equal(body.findings[0].confidence, validFinding.confidence);
    assert.deepEqual(body.findings[0].evidence, validFinding.evidence);
    assert.equal(body.findings[0].recommendation, validFinding.recommendation);
    assert.equal(body.summary, validModelOutput.summary);
  });

  for (const testCase of [...invalidFindingCases, ...invalidSummaryCases]) {
    it(`rejects an invalid ${testCase.name}`, async () => {
      const token = await createSession();
      const invalidOutput = invalidFindingCases.includes(testCase)
        ? {
            ...validModelOutput,
            findings: [testCase.update(validFinding)],
          }
        : testCase.update(validModelOutput);
      providerResponse = providerPayload(invalidOutput);
      const { response, body } = await fetchJson("/inspection/analyze", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(analysisRequest()),
      });
      assert.equal(response.status, 502);
      assert.equal(body.error, "The vision model returned an invalid analysis.");
    });
  }

  it("rejects provider text that is not JSON", async () => {
    const token = await createSession();
    providerResponse = {
      candidates: [{ content: { parts: [{ text: "not-json" }] } }],
    };
    const { response, body } = await fetchJson("/inspection/analyze", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(analysisRequest()),
    });
    assert.equal(response.status, 502);
    assert.equal(body.error, "The vision model returned an invalid analysis.");
  });
});