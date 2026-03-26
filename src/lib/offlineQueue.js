import { get, set } from 'idb-keyval'

const QUEUE_KEY = 'kitab-offline-queue'

/**
 * Enqueue a mutation to be replayed when connectivity is restored.
 * @param {{ type: string, payload: object }} item
 */
export async function enqueueOperation(item) {
  const queue = (await get(QUEUE_KEY)) || []
  queue.push({ ...item, enqueuedAt: Date.now() })
  await set(QUEUE_KEY, queue)
}

/**
 * Returns all pending operations in order.
 */
export async function getPendingOperations() {
  return (await get(QUEUE_KEY)) || []
}

/**
 * Clears the entire queue (call after successful sync).
 */
export async function clearQueue() {
  await set(QUEUE_KEY, [])
}

/**
 * Removes a single operation by its enqueuedAt timestamp.
 */
export async function removeOperation(enqueuedAt) {
  const queue = (await get(QUEUE_KEY)) || []
  await set(QUEUE_KEY, queue.filter(op => op.enqueuedAt !== enqueuedAt))
}
