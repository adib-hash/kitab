import { format, formatDistanceToNow, parseISO, differenceInDays } from 'date-fns'

export function formatDate(date) {
  if (!date) return null
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'MMM d, yyyy')
  } catch { return null }
}

export function formatDateShort(date) {
  if (!date) return null
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'MMM yyyy')
  } catch { return null }
}

export function timeAgo(date) {
  if (!date) return null
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return formatDistanceToNow(d, { addSuffix: true })
  } catch { return null }
}

export function daysBetween(start, end) {
  if (!start || !end) return null
  try {
    return differenceInDays(
      typeof end === 'string' ? parseISO(end) : end,
      typeof start === 'string' ? parseISO(start) : start
    )
  } catch { return null }
}

export function pluralize(count, word, plural) {
  return `${count} ${count === 1 ? word : (plural || word + 's')}`
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// Compute reading statistics from a list of books
export function computeStats(books) {
  const read    = books.filter(b => b.status === 'read' && b.date_finished)
  const allRead = books.filter(b => b.status === 'read')
  const rated   = allRead.filter(b => b.rating != null)

  // Average rating
  const avgRating = rated.length
    ? (rated.reduce((sum, b) => sum + parseFloat(b.rating), 0) / rated.length).toFixed(1)
    : null

  // Total pages
  const totalPages = allRead.reduce((sum, b) => sum + (b.page_count || 0), 0)

  // Books per month — uses date_finished (stored as YYYY-MM-01)
  const monthCounts = {}
  read.forEach(b => {
    try {
      const key = format(parseISO(b.date_finished), 'yyyy-MM')
      monthCounts[key] = (monthCounts[key] || 0) + 1
    } catch {}
  })
  const booksPerMonth = Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({
      month: format(parseISO(month + '-01'), 'MMM yy'),
      count,
    }))
    .slice(-12)

  // Tag breakdown — count books per tag (only tags that have at least 1 book)
  const tagCounts = {}
  allRead.forEach(b => {
    (b.tags || []).forEach(tag => {
      if (tag?.name) {
        tagCounts[tag.name] = (tagCounts[tag.name] || 0) + 1
      }
    })
  })
  const tagBreakdown = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }))

  // Longest and shortest
  const withPages = allRead.filter(b => b.page_count)
  const longest  = withPages.length ? withPages.reduce((a, b) => b.page_count > a.page_count ? b : a) : null
  const shortest = withPages.length ? withPages.reduce((a, b) => b.page_count < a.page_count ? b : a) : null

  // This year
  const thisYear = new Date().getFullYear()
  const booksThisYear = allRead.filter(b =>
    b.date_finished && parseInt(b.date_finished.slice(0, 4)) === thisYear
  ).length

  return {
    totalRead: allRead.length,
    totalPages,
    avgRating: avgRating ? parseFloat(avgRating) : null,
    booksPerMonth,
    tagBreakdown,
    longest,
    shortest,
    booksThisYear,
  }
}

// Build Goodreads-compatible CSV
export function buildGoodreadsCSV(books, tags) {
  const tagMap = {}
  tags.forEach(t => { tagMap[t.id] = t.name })

  const rows = books.map(b => ({
    'Title': b.title,
    'Author': b.author || '',
    'ISBN': b.isbn || '',
    'My Rating': b.rating || '',
    'Average Rating': '',
    'Publisher': '',
    'Binding': '',
    'Number of Pages': b.page_count || '',
    'Year Published': b.published_year || '',
    'Date Read': b.date_finished || '',
    'Date Added': b.created_at ? b.created_at.slice(0, 10) : '',
    'Bookshelves': b.status === 'read' ? 'read' : b.status === 'tbr' ? 'to-read' : b.status,
    'My Review': b.review || '',
  }))

  return rows
}

export const STATUS_LABELS = {
  read: 'Read',
  tbr: 'To Be Read',
  reading: 'Currently Reading',
  dnf: 'Did Not Finish',
}

export const STATUS_ORDER = ['reading', 'read', 'tbr', 'dnf']

export function getCoverFallback(title, author) {
  const initials = (title || '?').slice(0, 2).toUpperCase()
  const colors = ['#0F766E', '#1D4ED8', '#7C3AED', '#B45309', '#BE185D', '#047857']
  const idx = (title?.charCodeAt(0) || 0) % colors.length
  return { initials, color: colors[idx] }
}
