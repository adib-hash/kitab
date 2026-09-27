// Builds the Discover prompt. Plain JS (no React, no Vite env) so the bake-off
// scripts can build exactly the prompt the app sends.
//
// The Sep 2026 prompt bake-off (scripts/rec-prompt-bakeoff.mjs) compared six
// versions on the production model. Giving the model the reader's own reviews
// (excerpted) and every Kindle highlight scored 7.5/10 against 6.1 for the old
// prompt, which only carried the first 100 characters of 3 reviews. Speed was
// unchanged. This is that winning version, plus a size budget so the prompt
// stays bounded as reviews and highlights accumulate.

export const REVIEW_EXCERPT_CHARS = 1500
export const REVIEWS_BUDGET_CHARS = 24000
export const HIGHLIGHTS_BUDGET_CHARS = 26000

const stars = r => (r ? ` (${r}★)` : '')
const shelf = b => (b.status === 'read' ? '' : b.status === 'reading' ? ', currently reading' : ', not read yet')
const clean = s => String(s || '').replace(/\s+/g, ' ').trim()

// Books the reader cares most about come first when the budget runs short:
// highest rating, then currently reading, then most recently finished.
function priority(a, b) {
  return (b.rating || 0) - (a.rating || 0)
    || (b.status === 'reading') - (a.status === 'reading')
    || String(b.date_finished || '').localeCompare(String(a.date_finished || ''))
}

export function excerpt(text, max) {
  const t = clean(text)
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (end > max * 0.6 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')) + ' […]'
}

// n evenly spaced items, so a trimmed set spans the whole book, not its opening.
function spread(items, n) {
  if (items.length <= n) return items
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)])
}

export function reviewsSection(libraryBooks) {
  const reviewed = libraryBooks.filter(b => clean(b.review)).sort(priority)
  const lines = []
  let used = 0
  for (const b of reviewed) {
    const line = `- "${b.title}" by ${b.author}${stars(b.rating)}${shelf(b)}: ${excerpt(b.review, REVIEW_EXCERPT_CHARS)}`
    if (used + line.length > REVIEWS_BUDGET_CHARS) break
    lines.push(line)
    used += line.length
  }
  if (!lines.length) return ''
  return `\nThe reader's own reviews, in their words. Use these to understand what they value, what moved them and what they criticised:\n${lines.join('\n')}\n`
}

// highlights: [{ text, book: { title, author, rating, status, date_finished } }],
// already in reading order within each book.
export function highlightsSection(highlights) {
  const byBook = new Map()
  for (const h of highlights || []) {
    const text = clean(h.text)
    if (!text || !h.book?.title) continue
    const key = `${h.book.title}|${h.book.author}`
    if (!byBook.has(key)) byBook.set(key, { book: h.book, items: [] })
    byBook.get(key).items.push(text)
  }
  if (!byBook.size) return ''
  const books = [...byBook.values()].sort((x, y) => priority(x.book, y.book))

  // Largest per-book cap that fits the budget. Every book keeps an even spread of
  // its passages; if even one per book is too much, the lowest-priority books go.
  const render = (list, cap) => list
    .map(({ book, items }) => `From "${book.title}" by ${book.author}${stars(book.rating)}${shelf(book)}:\n` +
      spread(items, cap).map(t => `  - "${t}"`).join('\n'))
    .join('\n')
  let cap = Math.max(...books.map(b => b.items.length))
  let list = books
  let body = render(list, cap)
  while (body.length > HIGHLIGHTS_BUDGET_CHARS && cap > 1) body = render(list, --cap)
  while (body.length > HIGHLIGHTS_BUDGET_CHARS && list.length > 1) body = render((list = list.slice(0, -1)), cap)

  return `\nPassages the reader highlighted while reading. They show what catches their attention sentence by sentence (voice, ideas, emotional register):\n${body}\n`
}

export function buildDiscoverPrompt({ userText, libraryBooks = [], highlights = [], pastRecTitles = [], tagNames = [] }) {
  const topBooks = libraryBooks
    .filter(b => b.status === 'read' && b.rating)
    .sort(priority)
    .slice(0, 20)
    .map(b => {
      const tags = (b.tags || []).map(t => t.name).filter(n => !/^\d+$/.test(n)) // skip year tags
      return `- "${b.title}" by ${b.author} (${b.rating}★)${tags.length ? ` [${tags.join(', ')}]` : ''}`
    })
    .join('\n')

  const allTitles = libraryBooks
    .filter(b => ['read', 'reading', 'tbr'].includes(b.status))
    .map(b => `"${b.title}" by ${b.author}`)
    .join(', ')

  const genre = tagNames.length ? `\nReader's genre categories (tags they use to organize their library):\n${tagNames.join(', ')}\n` : ''
  const past = pastRecTitles.length ? `\nBooks from previous recommendation sessions (DO NOT recommend these either):\n${pastRecTitles.join(', ')}\n` : ''

  return `You are an expert book curator with deep knowledge of literature across all genres.

The reader is looking for their next great read. They've described what they want below. Use their ratings, their own reviews, the passages they highlighted, and their tags to understand their taste deeply, then recommend books that fit their request.

Reader's highest-rated books:
${topBooks || '(no rated books yet)'}
${reviewsSection(libraryBooks)}${highlightsSection(highlights)}${genre}
All books already in their library (DO NOT recommend any of these):
${allTitles || '(none)'}
${past}
Reader's request: "${userText}"

Return ONLY a JSON array of exactly 8 book recommendations. No other text, no markdown, no explanation outside the JSON.

Each object must have:
- "title": exact title (no subtitles unless essential)
- "author": full author name
- "published_year": integer year or null
- "genre_hint": short genre label (e.g. "literary fiction", "memoir", "sci-fi", "philosophy")
- "why": one punchy sentence (15-25 words) explaining specifically why THIS reader will love it

Rules:
- Only recommend real, widely-available books
- No study guides, summaries, lecture collections, omnibus sets, or companion books
- Prioritize books with strong critical reception
- Never recommend a book already in the reader's library or from previous sessions
- Ensure at least 3 different genres across the 8 picks
- No more than 2 books from the same genre
- Include at least 1 book from a genre NOT heavily represented in the reader's library
- The "why" must be specific, not generic ("you'll love the world-building" is bad; "the same slow-burn dread as McCarthy but set in modern Tokyo" is good). Where it fits, connect it to something the reader said in a review or chose to highlight, but never misquote them.
- Describe the reader's feelings only as their ratings and reviews show them: don't call a 3.5★ book a favourite, and don't imply they've read a book that is only on their want-to-read list. Say "you highlighted" only for highlighted passages and "you wrote" only for reviews.`
}
