export type ShopSessionUser = {
  id: string;
  role: 'customer' | 'staff';
};

export type AccountScopedShopCache<TVehicle = unknown, TWorkOrder extends { customerId?: string } = { customerId?: string }> = {
  vehicles: TVehicle[];
  workOrders: TWorkOrder[];
  syncedAt: string;
};

export const SHOP_CACHE_PREFIX = 'downriver-springs-shop-cache:';

export type ShopStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function getShopCacheKey(userId: string) {
  return `${SHOP_CACHE_PREFIX}${userId}`;
}

export function isExpiredShopToken(token: string, now = Date.now()) {
  try {
    const [, encodedPayload] = token.split('.');
    if (!encodedPayload) return true;
    const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + (4 - (normalized.length % 4 || 4)) % 4, '=');
    const payload = JSON.parse(
      globalThis.atob
        ? globalThis.atob(padded)
        : '',
    ) as { exp?: number };
    return typeof payload.exp !== 'number' || payload.exp <= now;
  } catch {
    return true;
  }
}

export function scopeShopCache<TVehicle, TWorkOrder extends { customerId?: string }>(
  userId: string,
  cache: AccountScopedShopCache<TVehicle, TWorkOrder>,
): AccountScopedShopCache<TVehicle, TWorkOrder> {
  return {
    vehicles: cache.vehicles,
    workOrders: cache.workOrders.filter((workOrder) => workOrder.customerId === userId),
    syncedAt: cache.syncedAt,
  };
}

export function parseShopCache<TVehicle, TWorkOrder extends { customerId?: string }>(
  userId: string,
  raw: string | null,
): AccountScopedShopCache<TVehicle, TWorkOrder> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AccountScopedShopCache<TVehicle, TWorkOrder>>;
    if (!Array.isArray(parsed.vehicles) || !Array.isArray(parsed.workOrders) || typeof parsed.syncedAt !== 'string') {
      return null;
    }
    return scopeShopCache(userId, {
      vehicles: parsed.vehicles,
      workOrders: parsed.workOrders,
      syncedAt: parsed.syncedAt,
    });
  } catch {
    return null;
  }
}

export function createShopCache<TVehicle, TWorkOrder extends { customerId?: string }>(
  userId: string,
  vehicles: TVehicle[],
  workOrders: TWorkOrder[],
  syncedAt: string,
) {
  return scopeShopCache(userId, { vehicles, workOrders, syncedAt });
}

export async function saveShopCache<TVehicle, TWorkOrder extends { customerId?: string }>(
  storage: ShopStorage,
  userId: string,
  vehicles: TVehicle[],
  workOrders: TWorkOrder[],
  syncedAt: string,
) {
  await storage.setItem(getShopCacheKey(userId), JSON.stringify(createShopCache(userId, vehicles, workOrders, syncedAt)));
}

export async function loadShopCache<TVehicle, TWorkOrder extends { customerId?: string }>(
  storage: ShopStorage,
  userId: string,
) {
  return parseShopCache<TVehicle, TWorkOrder>(userId, await storage.getItem(getShopCacheKey(userId)));
}

export async function clearShopCache(storage: ShopStorage, userId: string) {
  await storage.removeItem(getShopCacheKey(userId));
}

export function createLiveShopState<TVehicle, TWorkOrder extends { customerId?: string }>(
  userId: string,
  vehicles: TVehicle[],
  workOrders: TWorkOrder[],
  syncedAt: string,
) {
  return {
    ...createShopCache(userId, vehicles, workOrders, syncedAt),
    syncState: 'idle' as const,
    error: null,
  };
}

export function createSignedOutShopState() {
  return {
    token: null,
    sessionId: null,
    user: null,
    vehicles: [],
    workOrders: [],
    sessions: [],
    syncState: 'idle' as const,
    error: null,
    lastSyncAt: null,
  };
}

export function createOfflineShopState<TVehicle, TWorkOrder extends { customerId?: string }>(
  userId: string,
  current: AccountScopedShopCache<TVehicle, TWorkOrder>,
  cached: AccountScopedShopCache<TVehicle, TWorkOrder> | null,
) {
  const safeCurrent = scopeShopCache(userId, current);
  const safeCached = cached ? scopeShopCache(userId, cached) : null;
  const view = safeCached ?? safeCurrent;
  return {
    ...view,
    syncState: 'offline' as const,
    error: 'We could not reach the service desk. Showing your last saved updates.',
  };
}