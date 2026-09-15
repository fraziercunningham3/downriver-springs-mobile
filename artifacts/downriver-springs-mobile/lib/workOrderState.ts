export type IdentifiedWorkOrder = {
  id: string;
};

/**
 * Apply a successful work-order response without allowing a retry response
 * for the same server record to add a second visible queue item.
 */
export function upsertWorkOrder<T extends IdentifiedWorkOrder>(current: T[], incoming: T): T[] {
  return [incoming, ...current.filter((order) => order.id !== incoming.id)];
}