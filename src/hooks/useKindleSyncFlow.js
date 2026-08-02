// Manual Kindle sync — used by both Settings and Dashboard.
//
// This is the visible path: it opens @capgo/inappbrowser so you can sign in to
// Amazon when the session lapses. The automatic daily sync uses the headless
// path in src/lib/kindleAutoSync.js instead, which shares the same scraper and
// the same Amazon cookies but shows no UI.
import { useState } from 'react'
import { useKindleSync, loadKindleScraper, buildScraperScript } from './useHighlights'
import { useLibrary } from './useLibrary'
import { buildScraperConfig, applyScrapeResult, saveSyncState } from '../lib/kindleSyncState'
import { configureBackgroundSync } from '../lib/kindleAutoSync'
import toast from 'react-hot-toast'

export function useKindleSyncFlow() {
  const kindleSync = useKindleSync()
  const { data: books = [] } = useLibrary()
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState(null)

  /**
   * @param {Object} [opts]
   * @param {boolean} [opts.forceFullSweep] Re-open every book instead of only
   *   the new and in-progress ones. Slow (minutes) — offered explicitly in
   *   Settings rather than being the default for the Sync button.
   */
  async function handleSync(opts = {}) {
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

    let scraperScript
    const config = buildScraperConfig({
      books,
      transport: 'inappbrowser',
      forceFullSweep: opts.forceFullSweep,
    })
    try {
      scraperScript = buildScraperScript(await loadKindleScraper(), config)
    } catch (e) {
      setSyncing(false)
      setProgress(null)
      toast.error('Could not load the Kindle scraper')
      return
    }

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

          if (detail.status === 'error') {
            saveSyncState({ lastStatus: 'error' })
            toast.error('Sync failed. Try again.')
            return
          }

          // Record what we covered even when nothing new turned up — that is
          // what lets the next run skip these books.
          applyScrapeResult({
            bookCounts: detail.bookCounts,
            seenTitles: detail.seenTitles,
            fullSweep: config.fullSweep,
          })

          // The first manual sync is what establishes the Amazon session, so it
          // is also what arms the nightly background task — and every later one
          // hands it a wider known-book map to skip.
          configureBackgroundSync({ books })

          const highlights = detail.highlights || []
          if (highlights.length === 0) {
            toast(detail.visited === 0
              ? 'Already up to date.'
              : 'No new highlights found.')
          } else {
            kindleSync.mutate({ highlights })
          }
        }
      })
      listeners.push(msgListener)

      const pageListener = await InAppBrowser.addListener('browserPageLoaded', () => {
        setProgress('Loading Kindle notebook…')
        setTimeout(() => {
          InAppBrowser.executeScript({ code: scraperScript }).catch(() => {})
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

      await InAppBrowser.openWebView({ url: 'https://read.amazon.com/notebook' })
    } catch (e) {
      toast.error('Sync failed. Try again.')
      try { await InAppBrowser.close() } catch {}
      cleanup()
    }
  }

  return { syncing, progress, handleSync, kindleSync }
}
