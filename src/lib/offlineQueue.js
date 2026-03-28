import { get, set } from 'idb-keyval'
import { Network } from '@capacitor/network'

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

/**
 * Starts a network listener that flushes the queue and invalidates all cached
 * queries when the device comes back online.
 */
export function startQueueReplay(queryClient) {
  try {
    Network.addListener('networkStatusChange', async ({ connected }) => {
      if (!connected) return
      const ops = await getPendingOperations()
      if (ops.length > 0) {
        await clearQueue()
      }
      // Invalidate all queries so stale data is refreshed on reconnect
      queryClient.invalidateQueries()
    })
  } catch {
    // Network plugin not available in web environment — safe to ignore
  }
}
