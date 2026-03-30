// Shared Kindle sync flow — used by both Settings and Dashboard.
// Encapsulates the InAppBrowser listeners, syncing state, and progress tracking.
import { useState } from 'react'
import { useKindleSync, KINDLE_SCRAPER_JS } from './useHighlights'
import toast from 'react-hot-toast'

export function useKindleSyncFlow() {
  const kindleSync = useKindleSync()
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState(null)

  async function handleSync() {
    let InAppBrowser
    try {
      InAppBrowser = (await import('@capgo/inappbrowser')).InAppBrowser
    } catch {
      toast.error('Kindle sync requires the iOS app')
      return
    }

    setSyncing(true)
    setProgress('Opening Kindle…')
    kindleSync.reset()

    const listeners = []
    let finished = false

    function cleanup() {
      listeners.forEach(l => { try { l.remove() } catch {} })
      listeners.length = 0
      setSyncing(false)
      setProgress(null)
    }

    try {
      const msgListener = await InAppBrowser.addListener('messageFromWebview', async ({ detail }) => {
        if (!detail) return
        if (detail.type === 'kitabProgress') {
          setProgress(`${detail.current}/${detail.total} books…`)
        }
        if (detail.type === 'kitabDone') {
          finished = true
          try { await InAppBrowser.close() } catch {}
          cleanup()
          const highlights = detail.highlights || []
          if (highlights.length === 0) {
            toast('No highlights found. Make sure you are logged in to Amazon.')
          } else {
            kindleSync.mutate({ highlights })
          }
        }
      })
      listeners.push(msgListener)

      const pageListener = await InAppBrowser.addListener('browserPageLoaded', () => {
        setProgress('Loading Kindle notebook…')
        setTimeout(() => {
          InAppBrowser.executeScript({ code: KINDLE_SCRAPER_JS }).catch(() => {})
        }, 800)
      })
      listeners.push(pageListener)

      const closeListener = await InAppBrowser.addListener('closeEvent', () => {
        if (!finished) {
          cleanup()
          toast('Sync cancelled — tap Sync to try again.')
        }
      })
      listeners.push(closeListener)

      await InAppBrowser.openWebView({ url: 'https://read.amazon.com/kp/notebook' })
    } catch (e) {
      toast.error('Sync failed. Try again.')
      try { await InAppBrowser.close() } catch {}
      cleanup()
    }
  }

  return { syncing, progress, handleSync, kindleSync }
}
