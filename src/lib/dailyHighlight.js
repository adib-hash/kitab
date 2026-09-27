// One rule for "today's highlight", shared by the Dashboard, the Highlights
// page, the iOS widget and the daily notification, so all four show the same
// quote on the same day.
//
// Only highlights short enough to read in full on a lock-screen notification
// are eligible (iOS shows roughly four lines, ~180 characters, before it
// truncates). Long passages still live on the Highlights page; they just
// aren't pushed at you as a clipped snippet.
//
// KitabWidgets/SharedDataProvider.swift mirrors this exactly: it receives the
// same pool (sorted by id) and indexes it by local days-since-epoch.

export const DAILY_MAX_CHARS = 180
const DAILY_MIN_CHARS = 20

/** Local calendar day as an integer, identical to the widget's calculation. */
export function localDayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
}

/** Highlights eligible for the daily pick, in a stable order. */
export function dailyHighlightPool(highlights = []) {
  return highlights
    .filter(h => {
      const n = (h.text || '').trim().length
      return n >= DAILY_MIN_CHARS && n <= DAILY_MAX_CHARS
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

/** Today's (or `date`'s) highlight. Falls back to the shortest if none qualify. */
export function pickDailyHighlight(highlights = [], date = new Date()) {
  if (!highlights.length) return null
  const pool = dailyHighlightPool(highlights)
  if (!pool.length) {
    return [...highlights].sort((a, b) => (a.text || '').length - (b.text || '').length)[0]
  }
  return pool[localDayNumber(date) % pool.length]
}
