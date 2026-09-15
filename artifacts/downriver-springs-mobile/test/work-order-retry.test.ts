import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { upsertWorkOrder } from '../lib/workOrderState.ts';

type QueueOrder = {
  id: string;
  customerId: string;
  service: string;
};

type RetryState = {
  queue: QueueOrder[];
  syncState: 'idle' | 'syncing' | 'offline';
  error: string | null;
};

const order: QueueOrder = {
  id: 'work-order-committed-once',
  customerId: 'customer-lost-response',
  service: 'Front suspension inspection',
};

describe('staff work-order retry after a lost response', () => {
  it('keeps one staff queue item and one customer item after retrying the same action', async () => {
    const actionKey = 'staff-action-lost-response';
    const committedServerOrders: QueueOrder[] = [];
    let attempts = 0;
    let state: RetryState = { queue: [], syncState: 'idle', error: null };

    const submit = async (key: string) => {
      state = { ...state, syncState: 'syncing', error: null };
      assert.equal(key, actionKey);
      attempts += 1;
      if (attempts === 1) {
        // The server commits before the mobile request loses its response.
        committedServerOrders.push(order);
        state = {
          ...state,
          syncState: 'offline',
          error: 'The service desk is offline.',
        };
        throw new Error(state.error);
      }

      state = {
        queue: upsertWorkOrder(state.queue, order),
        syncState: 'idle',
        error: null,
      };
      return order;
    };

    await assert.rejects(() => submit(actionKey), /service desk is offline/);
    assert.equal(state.queue.length, 0);
    assert.equal(state.syncState, 'offline');
    assert.equal(state.error, 'The service desk is offline.');

    await submit(actionKey);

    assert.equal(attempts, 2);
    assert.equal(state.syncState, 'idle');
    assert.equal(state.error, null);
    assert.deepEqual(state.queue, [order]);
    assert.deepEqual(committedServerOrders, [order]);
    assert.equal(state.queue[0]?.id, committedServerOrders[0]?.id);

    // A response replayed by a later retry is still safe if the queue already
    // contains the committed record.
    state = { ...state, queue: upsertWorkOrder(state.queue, order) };
    assert.deepEqual(state.queue, [order]);
    assert.deepEqual(committedServerOrders, [order]);
  });
});