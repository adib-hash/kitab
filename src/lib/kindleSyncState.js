// Kindle sync bookkeeping.
//
// The scraper is expensive per book (~6s to open one, ~2s per page of its
// highlights), so an unattended daily sync can't afford to walk the whole
// notebook. This module remembers which books we've already scraped so a normal
// run only opens the handful that could have something new.
//
// State lives in localStorage and is mirrored into the App Group via
// KindleSyncPlugin.configureBackgroundSync() so the native background task can
// build the same config without a JS context.

const KEY = 'kitab_kindle_sync_state'

// A full sweep re-opens every book, catching highlights added to a book that
// isn't marked 'reading' in Kitab (re-reads, skimming an old title). Rare enough
// that monthly is plenty, and it's the only run that can take minutes.
const FULL_SWEEP_INTERVAL_DAYS = 30

const defaults = {
  knownBooks: {},        // { [normalizedTitle]: highlightCount }
  lastSyncAt: null,      // ISO — last run that reached Amazon successfully
  lastFullSweepAt: null, // ISO
  lastStatus: null,      // 'ok' | 'needs_login' | 'no_books' | 'error'
  autoSyncEnabled: true,
}

export function getSyncState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }

    // Pre-v2.11 installs have a sync history but no state file. Auto-sync refuses
    // to run before a first manual sync (that's where the Amazon session comes
    // from), so without this an existing user would have to tap Sync once more
    // for no reason. knownBooks stays empty, which just means the first automatic
    // run does more work than usual.
    const legacy = localStorage.getItem('kindle_last_sync')
    return legacy ? { ...defaults, lastSyncAt: legacy } : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

export function saveSyncState(patch) {
  const next = { ...getSyncState(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  return next
}

function daysSince(iso) {
  if (!iso) return Infinity
  const ms = Date.now() - new Date(iso).getTime()
  return Number.isFinite(ms) ? ms / 86400000 : Infinity
}

export function daysSinceLastSync() {
  return daysSince(getSyncState().lastSyncAt)
}

/** True when it's time for the periodic every-book run. */
export function shouldFullSweep() {
  return daysSince(getSyncState().lastFullSweepAt) >= FULL_SWEEP_INTERVAL_DAYS
}

/**
 * Fold a finished scrape back into the known-book map.
 *
 * Books we opened get their highlight count recorded, which is what makes them
 * skippable next run. On a full sweep we also drop titles that are no longer in
 * the notebook, so a removed-then-re-added book gets re-scraped rather than
 * being skipped forever. We only prune on a full sweep because an incremental
 * run's seenTitles is complete but its bookCounts is not — pruning against a
 * partial run would be correct here too, but keeping it to full sweeps means one
 * less way for a mid-run failure to corrupt the map.
 */
export function applyScrapeResult({ bookCounts = {}, seenTitles = [], fullSweep = false }) {
  const state = getSyncState()
  const known = { ...state.knownBooks, ...bookCounts }

  if (fullSweep && seenTitles.length > 0) {
    const present = new Set(seenTitles)
    for (const title of Object.keys(known)) {
      if (!present.has(title)) delete known[title]
    }
  }

  const now = new Date().toISOString()
  // notifications.js (the 7-day nag) and Dashboard both read this key. Writing it
  // here means the manual and automatic paths can't drift apart.
  try {
    localStorage.setItem('kindle_last_sync', now)
    localStorage.removeItem('kindle_sync_reminder_sent_at')
  } catch {}
  return saveSyncState({
    knownBooks: known,
    lastSyncAt: now,
    lastStatus: 'ok',
    ...(fullSweep ? { lastFullSweepAt: now } : {}),
  })
}

/**
 * Build the config the scraper reads from window.__KITAB_SYNC_CONFIG.
 *
 * `books` is the Kitab library — anything marked 'reading' is always revisited,
 * since that's where new highlights actually show up day to day.
 */
export function buildScraperConfig({ books = [], transport = 'headless', forceFullSweep = false }) {
  const { knownBooks } = getSyncState()
  const fullSweep = forceFullSweep || shouldFullSweep()

  const activeTitles = books
    .filter(b => b.status === 'reading')
    .map(b => normalizeTitle(b.title))
    .filter(Boolean)

  return {
    transport,
    knownBooks: fullSweep ? {} : knownBooks,
    activeTitles,
    fullSweep,
    // A full sweep is allowed to be slow; an incremental run should not be.
    maxBooks: fullSweep ? 400 : 25,
  }
}

// Must stay identical to normalize() in public/kindle-scraper.js and
// useHighlights.js, otherwise knownBooks lookups miss and nothing is skippable.
export function normalizeTitle(str = '') {
  return str.toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
