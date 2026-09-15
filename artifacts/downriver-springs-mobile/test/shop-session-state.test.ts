import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearShopCache,
  createLiveShopState,
  createOfflineShopState,
  createSignedOutShopState,
  isExpiredShopToken,
  loadShopCache,
  saveShopCache,
} from '../lib/shopSessionState.ts';

type Vehicle = { id: string; label: string };
type Order = { id: string; customerId: string; status: string };

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
    return Promise.resolve();
  }

  removeItem(key: string) {
    this.values.delete(key);
    return Promise.resolve();
  }
}

function tokenWithExpiry(exp: number) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `shop.${payload}.signature`;
}

const aliceVehicle = { id: 'vehicle-alice', label: 'Alice vehicle' };
const bobVehicle = { id: 'vehicle-bob', label: 'Bob vehicle' };
const aliceOrder = { id: 'order-alice', customerId: 'alice', status: 'In progress' };
const bobOrder = { id: 'order-bob', customerId: 'bob', status: 'Awaiting approval' };

describe('shop account session and offline cache state', () => {
  it('renders the signed-in account cache without leaking another account order', async () => {
    const storage = new MemoryStorage();
    await saveShopCache(storage, 'alice', [aliceVehicle], [aliceOrder, bobOrder], '2026-09-15T10:00:00.000Z');
    await saveShopCache(storage, 'bob', [bobVehicle], [bobOrder, aliceOrder], '2026-09-15T10:01:00.000Z');

    const aliceCache = await loadShopCache<Vehicle, Order>(storage, 'alice');
    const bobCache = await loadShopCache<Vehicle, Order>(storage, 'bob');

    assert.deepEqual(aliceCache?.workOrders, [aliceOrder]);
    assert.deepEqual(bobCache?.workOrders, [bobOrder]);
    assert.notEqual(aliceCache?.workOrders[0]?.id, bobCache?.workOrders[0]?.id);
  });

  it('clears the signed-out account cache and exposes an empty signed-out view', async () => {
    const storage = new MemoryStorage();
    await saveShopCache(storage, 'alice', [aliceVehicle], [aliceOrder], '2026-09-15T10:00:00.000Z');

    await clearShopCache(storage, 'alice');

    assert.equal(await loadShopCache<Vehicle, Order>(storage, 'alice'), null);
    assert.deepEqual(createSignedOutShopState(), {
      token: null,
      sessionId: null,
      user: null,
      vehicles: [],
      workOrders: [],
      sessions: [],
      syncState: 'idle',
      error: null,
      lastSyncAt: null,
    });
  });

  it('rejects expired sessions before cached rendering', () => {
    assert.equal(isExpiredShopToken(tokenWithExpiry(1_000), 2_000), true);
    assert.equal(isExpiredShopToken(tokenWithExpiry(3_000), 2_000), false);
    assert.equal(isExpiredShopToken('not-a-shop-token'), true);
  });

  it('keeps the account cache visible during an offline refresh', async () => {
    const storage = new MemoryStorage();
    await saveShopCache(storage, 'alice', [aliceVehicle], [aliceOrder], '2026-09-15T10:00:00.000Z');
    const cached = await loadShopCache<Vehicle, Order>(storage, 'alice');
    assert.ok(cached);

    const offline = createOfflineShopState('alice', cached, cached);

    assert.equal(offline.syncState, 'offline');
    assert.match(offline.error, /last saved updates/);
    assert.deepEqual(offline.workOrders, [aliceOrder]);
  });

  it('replaces stale cached work orders after the API recovers', () => {
    const recovered = createLiveShopState(
      'alice',
      [aliceVehicle],
      [{ ...aliceOrder, status: 'Ready for pickup' }],
      '2026-09-15T10:05:00.000Z',
    );

    assert.equal(recovered.syncState, 'idle');
    assert.equal(recovered.error, null);
    assert.equal(recovered.workOrders[0]?.status, 'Ready for pickup');
    assert.equal(recovered.syncedAt, '2026-09-15T10:05:00.000Z');
  });
});