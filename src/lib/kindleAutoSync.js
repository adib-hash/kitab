// Automatic daily Kindle sync (iOS only).
//
// Two paths, both invisible, both running the same scraper as the manual button:
//
//   1. Nightly — a BGProcessingTask scrapes Amazon while the phone is charging
//      and parks the highlights in the App Group. Nothing is written to Supabase
//      there; auth stays on this side. drainPending() picks them up next launch.
//   2. Foreground fallback — iOS grants background windows at its own discretion
//      and can skip nights entirely. If nothing has synced in over a day, we run
//      the same scrape in an offscreen webview while the app is open.
//
// Silent by design: it only speaks up when it actually imported something, or
// when the Amazon session has lapsed and needs a real sign-in.
import { Capacitor, registerPlugin } from '@capacitor/core'
import toast from 'react-hot-toast'
import { supabase } from './supabase'
import { upsertHighlights } from '../hooks/useHighlights'
import {
  buildScraperConfig,
  applyScrapeResult,
  saveSyncState,
  getSyncState,
  daysSinceLastSync,
} from './kindleSyncState'

const KindleSync = registerPlugin('KindleSync')

const native = () => Capacitor.isNativePlatform()

// Don't nag about a lapsed Amazon session more than once a day.
const LOGIN_PROMPT_KEY = 'kitab_kindle_login_prompt_at'

function shouldPromptLogin() {
  const last = localStorage.getItem(LOGIN_PROMPT_KEY)
  if (!last) return true
  return Date.now() - new Date(last).getTime() > 86400000
}

/**
 * Mirror the current sync state into the App Group so the nightly task can build
 * the same scraper config without a JS context, and (re)submit the task.
 */
export async function configureBackgroundSync({ books = [] } = {}) {
  if (!native()) return
  const { autoSyncEnabled } = getSyncState()
  try {
    await KindleSync.configureBackgroundSync({
      enabled: autoSyncEnabled,
      // Everything crosses the bridge as JSON text — see readPendingRaw() in
      // KindleSyncPlugin.swift for why.
      config: JSON.stringify(buildScraperConfig({ books, transport: 'headless' })),
    })
  } catch {}
}

/** Read the native background status card (last run, pending count). */
export async function getBackgroundStatus() {
  if (!native()) return null
  try {
    return await KindleSync.getStatus()
  } catch {
    return null
  }
}

/** Push a batch of scraped highlights into Supabase via the shared upsert. */
async function importHighlights(highlights, books) {
  if (!highlights || highlights.length === 0) return { totalHighlights: 0, unmatched: 0 }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  return upsertHighlights(user, books, highlights)
}

/** Collect whatever the nightly task scraped and write it to Supabase. */
async function drainPending(books) {
  let pending
  try {
    const res = await KindleSync.getPending()
    pending = res?.payload ? JSON.parse(res.payload) : null
  } catch {
    return { totalHighlights: 0, unmatched: 0, drained: false }
  }
  if (!pending) return { totalHighlights: 0, unmatched: 0, drained: false }

  const highlights = pending?.highlights || []
  const hasState = highlights.length > 0 || (pending?.seenTitles || []).length > 0
  if (!hasState) return { totalHighlights: 0, unmatched: 0, drained: false }

  const result = await importHighlights(highlights, books)
  applyScrapeResult({
    bookCounts: pending.bookCounts,
    seenTitles: pending.seenTitles,
    fullSweep: pending.fullSweep,
  })
  return { ...result, drained: true }
}

/** Run the scrape now in an offscreen webview. No UI, no browser takeover. */
async function runHeadlessSync(books) {
  const config = buildScraperConfig({ books, transport: 'headless' })
  const res = await KindleSync.runSync({
    config: JSON.stringify(config),
    // A full sweep legitimately takes minutes; an incremental run should be well
    // under a minute, so this only ever trips on a genuine hang.
    timeoutMs: config.fullSweep ? 300000 : 120000,
  })

  if (res.status !== 'ok') {
    saveSyncState({ lastStatus: res.status })
    return { totalHighlights: 0, unmatched: 0, status: res.status }
  }

  let scraped = {}
  try { scraped = JSON.parse(res.payload || '{}') } catch {}

  const result = await importHighlights(scraped.highlights || [], books)
  applyScrapeResult({
    bookCounts: scraped.bookCounts,
    seenTitles: scraped.seenTitles,
    fullSweep: config.fullSweep,
  })
  return { ...result, status: 'ok' }
}

/**
 * Entry point — call once per app session, after the library has loaded.
 *
 * @param {Object} params
 * @param {Array} params.books Kitab library; drives book matching and which
 *   titles count as "currently reading" for the incremental scrape.
 * @param {Object} [params.queryClient] react-query client, invalidated on import.
 */
export async function runDailyAutoSync({ books = [], queryClient } = {}) {
  if (!native()) return
  const state = getSyncState()
  if (!state.autoSyncEnabled) return

  // Never scrape before the first manual sync — that flow is where you sign in
  // to Amazon, and without a session the headless webview can only fail.
  if (!state.lastSyncAt) return

  let imported = 0
  let unmatched = 0
  let status = 'ok'

  try {
    const drained = await drainPending(books)
    imported += drained.totalHighlights
    unmatched += drained.unmatched

    // If the nightly task already covered today, don't scrape again.
    if (!drained.drained && daysSinceLastSync() >= 1) {
      const fresh = await runHeadlessSync(books)
      imported += fresh.totalHighlights
      unmatched += fresh.unmatched
      status = fresh.status
    }
  } catch (e) {
    saveSyncState({ lastStatus: 'error' })
    return
  }

  if (imported > 0) {
    queryClient?.invalidateQueries({ queryKey: ['highlights'] })
    queryClient?.invalidateQueries({ queryKey: ['highlight_count'] })
    queryClient?.invalidateQueries({ queryKey: ['highlights_unmatched'] })
    queryClient?.invalidateQueries({ queryKey: ['all_highlights'] })

    // The one thing worth interrupting for — highlights actually landed.
    toast.success(
      `${imported} new Kindle highlight${imported !== 1 ? 's' : ''} synced`
        + (unmatched > 0 ? ` · ${unmatched} unmatched` : ''),
      { duration: 4000 }
    )
  }

  if (status === 'needs_login' && shouldPromptLogin()) {
    localStorage.setItem(LOGIN_PROMPT_KEY, new Date().toISOString())
    toast('Kindle sign-in expired — open Settings to reconnect.', { duration: 5000 })
  }

  // Push the freshly widened known-book map down to the nightly task.
  await configureBackgroundSync({ books })
}
