import { Capacitor, registerPlugin } from '@capacitor/core'

const KitabDataBridge = registerPlugin('KitabDataBridge')

const native = () => Capacitor.isNativePlatform()

/**
 * Sync app data to shared UserDefaults for iOS widgets.
 * Call after book mutations and on Dashboard mount.
 *
 * @param {Object} params
 * @param {Array} params.books - All books from library
 * @param {Object|null} params.goal - Reading goal { target }
 * @param {Array} params.highlights - All highlights with book refs
 */
export async function syncWidgetData({ books = [], goal = null, highlights = [] }) {
  if (!native()) return

  try {
    console.log('[WidgetBridge] Syncing widget data...')
    const thisYear = new Date().getFullYear()

    // Currently reading books
    const currentlyReading = books
      .filter(b => b.status === 'reading')
      .map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        coverUrl: b.cover_url,
        currentPage: b.current_page || 0,
        pageCount: b.page_count || 0,
      }))

    // Reading goal progress
    const booksReadThisYear = books.filter(
      b => b.status === 'read' && b.date_finished &&
      parseInt(b.date_finished.slice(0, 4)) === thisYear
    ).length
    const readingGoal = goal
      ? { year: thisYear, target: goal.target, current: booksReadThisYear }
      : null

    // Random highlight of the day (seeded by date so it's stable within a day)
    let highlightOfDay = null
    if (highlights.length > 0) {
      const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % highlights.length
      const h = highlights[dayIndex]
      highlightOfDay = {
        text: h.text,
        bookTitle: h.books?.title || 'Unknown',
        bookAuthor: h.books?.author || '',
        bookId: h.book_id,
      }
    }

    // Top 5 TBR books
    const tbrNext = books
      .filter(b => b.status === 'tbr')
      .sort((a, b) => (a.tbr_order || 0) - (b.tbr_order || 0))
      .slice(0, 5)
      .map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        coverUrl: b.cover_url,
      }))

    // Year stats
    const readBooks = books.filter(
      b => b.status === 'read' && b.date_finished &&
      parseInt(b.date_finished.slice(0, 4)) === thisYear
    )
    const rated = readBooks.filter(b => b.rating != null)
    const yearStats = {
      totalRead: readBooks.length,
      totalPages: readBooks.reduce((sum, b) => sum + (b.page_count || 0), 0),
      avgRating: rated.length
        ? parseFloat((rated.reduce((sum, b) => sum + parseFloat(b.rating), 0) / rated.length).toFixed(1))
        : null,
    }

    // Top 3 ranked books by ELO
    const topRanked = books
      .filter(b => b.elo && b.elo !== 1500)
      .sort((a, b) => (b.elo || 0) - (a.elo || 0))
      .slice(0, 3)
      .map(b => ({
        title: b.title,
        author: b.author,
        elo: b.elo,
      }))

    const payload = {
      currentlyReading,
      tbrNext,
      yearStats,
      topRanked,
    }

    // Only include optional fields if they have data
    if (readingGoal) payload.readingGoal = readingGoal
    if (highlightOfDay) payload.highlightOfDay = highlightOfDay

    await KitabDataBridge.syncWidgetData(payload)
    console.log('[WidgetBridge] Widget data synced successfully')

    // Cache cover images for currently reading books
    for (const book of currentlyReading.slice(0, 3)) {
      if (book.coverUrl) {
        await cacheCoverForWidget(book.id, book.coverUrl)
      }
    }
  } catch (e) {
    // Log for debugging — widget data sync failures
    console.warn('Widget sync failed:', e?.message || e)
  }
}

/**
 * Fetch a cover image and cache it in the shared App Group container.
 */
async function cacheCoverForWidget(bookId, coverUrl) {
  try {
    const response = await fetch(coverUrl)
    if (!response.ok) return

    const blob = await response.blob()
    const base64 = await blobToBase64(blob)

    await KitabDataBridge.cacheCoverImage({
      bookId,
      base64: base64.split(',')[1], // strip data:image/... prefix
    })
  } catch {
    // Silent fail
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
