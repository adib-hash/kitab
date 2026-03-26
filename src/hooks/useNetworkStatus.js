import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * Returns { isOnline } — reactive network status.
 * On native: uses @capacitor/network for accurate connectivity events.
 * On web: falls back to navigator.onLine + online/offline events.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    let cleanup = () => {}

    if (Capacitor.isNativePlatform()) {
      let listenerHandle = null

      import('@capacitor/network').then(({ Network }) => {
        // Get initial state
        Network.getStatus().then(status => {
          setIsOnline(status.connected)
        })
        // Listen for changes
        Network.addListener('networkStatusChange', status => {
          setIsOnline(status.connected)
        }).then(handle => {
          listenerHandle = handle
        })
      })

      cleanup = () => {
        listenerHandle?.remove()
      }
    } else {
      // Web fallback
      setIsOnline(navigator.onLine)
      const onOnline  = () => setIsOnline(true)
      const onOffline = () => setIsOnline(false)
      window.addEventListener('online',  onOnline)
      window.addEventListener('offline', onOffline)
      cleanup = () => {
        window.removeEventListener('online',  onOnline)
        window.removeEventListener('offline', onOffline)
      }
    }

    return cleanup
  }, [])

  return { isOnline }
}
