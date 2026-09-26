import { Network } from '@capacitor/network'

/**
 * When the device comes back online, invalidate every cached query so stale
 * data refreshes. (An earlier version also kept an IndexedDB write queue, but
 * nothing ever enqueued into it, so it was removed in v2.12.0.)
 */
export function startQueueReplay(queryClient) {
  try {
    Network.addListener('networkStatusChange', ({ connected }) => {
      if (connected) queryClient.invalidateQueries()
    })
  } catch {
    // Network plugin not available in web environment — safe to ignore
  }
}
