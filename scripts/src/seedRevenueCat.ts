import { ReplitConnectors } from "@replit/connectors-sdk";

const PROJECT_NAME = "Downriver Springs Mobile";
const PRODUCT_IDENTIFIER = "downriver_springs_pro_monthly";
const ENTITLEMENT_KEY = "pro";
const OFFERING_KEY = "default";
const PACKAGE_KEY = "$rc_monthly";

const connectors = new ReplitConnectors();

async function revenueCat<T>(path: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<T> {
  const response = await connectors.proxy("revenuecat", `/v2${path}`, init);
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`RevenueCat ${init?.method ?? "GET"} ${path} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload as T;
}

type Collection<T> = { items?: T[] };
type Project = { id: string; name: string };
type App = { id: string; name: string; type: string };
type Product = { id: string; store_identifier: string; app_id: string };
type Entitlement = { id: string; lookup_key: string };
type Offering = { id: string; lookup_key: string; is_current?: boolean };
type Package = { id: string; lookup_key: string };

async function seed() {
  const projectList = await revenueCat<Collection<Project>>("/projects?limit=100");
  const project =
    projectList.items?.find((item) => item.name === PROJECT_NAME) ??
    await revenueCat<Project>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: PROJECT_NAME }),
    });

  const apps = await revenueCat<Collection<App>>(`/projects/${project.id}/apps?limit=100`);
  const testStore = apps.items?.find((app) => app.type === "test_store");
  if (!testStore) throw new Error("RevenueCat did not provide a test store app for the project.");

  const products = await revenueCat<Collection<Product>>(`/projects/${project.id}/products?limit=100`);
  const testProduct =
    products.items?.find((item) => item.app_id === testStore.id && item.store_identifier === PRODUCT_IDENTIFIER) ??
    await revenueCat<Product>(`/projects/${project.id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_identifier: PRODUCT_IDENTIFIER,
        app_id: testStore.id,
        type: "subscription",
        display_name: "Downriver Springs Pro",
        title: "Downriver Springs Pro Monthly",
        subscription: { duration: "P1M" },
      }),
    });

  try {
    await revenueCat(`/projects/${project.id}/products/${testProduct.id}/test_store_prices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices: [{ amount_micros: 9990000, currency: "USD" }] }),
    });
  } catch (error) {
    if (!String(error).includes("already_exists")) throw error;
  }

  const entitlements = await revenueCat<Collection<Entitlement>>(`/projects/${project.id}/entitlements?limit=100`);
  const entitlement =
    entitlements.items?.find((item) => item.lookup_key === ENTITLEMENT_KEY) ??
    await revenueCat<Entitlement>(`/projects/${project.id}/entitlements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookup_key: ENTITLEMENT_KEY, display_name: "Downriver Springs Pro" }),
    });

  await revenueCat(`/projects/${project.id}/entitlements/${entitlement.id}/actions/attach_products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_ids: [testProduct.id] }),
  }).catch((error) => {
    if (!String(error).includes("unprocessable_entity")) throw error;
  });

  const offerings = await revenueCat<Collection<Offering>>(`/projects/${project.id}/offerings?limit=100`);
  const offering =
    offerings.items?.find((item) => item.lookup_key === OFFERING_KEY) ??
    await revenueCat<Offering>(`/projects/${project.id}/offerings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookup_key: OFFERING_KEY, display_name: "Downriver Springs Pro" }),
    });

  if (!offering.is_current) {
    await revenueCat(`/projects/${project.id}/offerings/${offering.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_current: true }),
    });
  }

  const packages = await revenueCat<Collection<Package>>(`/projects/${project.id}/offerings/${offering.id}/packages?limit=100`);
  const pkg =
    packages.items?.find((item) => item.lookup_key === PACKAGE_KEY) ??
    await revenueCat<Package>(`/projects/${project.id}/offerings/${offering.id}/packages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lookup_key: PACKAGE_KEY, display_name: "Monthly" }),
    });

  await revenueCat(`/projects/${project.id}/packages/${pkg.id}/actions/attach_products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products: [{ product_id: testProduct.id, eligibility_criteria: "all" }] }),
  }).catch((error) => {
    if (!String(error).includes("unprocessable_entity")) throw error;
  });

  const apiKeys = await revenueCat<Collection<{ key: string }>>(`/projects/${project.id}/apps/${testStore.id}/public_api_keys`);
  console.log(JSON.stringify({
    projectId: project.id,
    testStoreAppId: testStore.id,
    entitlementIdentifier: ENTITLEMENT_KEY,
    testApiKey: apiKeys.items?.[0]?.key ?? null,
  }));
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});