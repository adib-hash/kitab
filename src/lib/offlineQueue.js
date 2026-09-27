import { Network } from '@capacitor/network'
import { flushOutbox } from './outbox'

/**
 * When the device comes back online, invalidate every cached query so stale
 * data refreshes. (An earlier version also kept an IndexedDB write queue, but
 * nothing ever enqueued into it, so it was removed in v2.12.0.)
 */
export function startQueueReplay(queryClient) {
  try {
    Network.addListener('networkStatusChange', async ({ connected }) => {
      if (!connected) return
      await flushOutbox(queryClient) // send notes/passages saved offline first
      queryClient.invalidateQueries()
    })
  } catch {
    // Network plugin not available in web environment — safe to ignore
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => flushOutbox(queryClient))
    setTimeout(() => flushOutbox(queryClient), 4000) // anything left from a previous session
  }
}
