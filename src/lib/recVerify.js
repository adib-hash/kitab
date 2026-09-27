// Checks that a book an AI model recommended really exists, using Google Books.
// Kept free of React and Vite so scripts can test it: the caller passes in the
// search function (searchBooks from googleBooks.js in the app).
//
// Two lookups. The strict one (intitle + inauthor phrases) is precise but often
// comes back empty for real books: an author written "Douglas Preston and Lincoln
// Child", a subtitle Google files differently, or plain flakiness. Only when it
// finds nothing do we try a looser keyword search, and then the match must share
// the title words AND an author surname, so invented books and wrong-author picks
// still get dropped.

// Lowercase, strip accents, and spell out letters that accent-stripping misses
// (Sigurðardóttir -> sigurdardottir, Nesbø -> nesbo).
const LETTERS = { ð: 'd', þ: 'th', ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ı: 'i' }
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[ðþøæœßłđı]/g, c => LETTERS[c])

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'but', 'not', 'our', 'your'])
const tokens = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)

// "Range: Why Generalists Triumph..." -> "Range"; "Babel, or The Necessity of Violence" -> "Babel".
// Google often stores only the main title, so subtitles can't be required to match.
const mainTitle = title => String(title || '').split(':')[0].split(/,\s*or\s/i)[0]

// Most of the main title's meaningful words must appear as whole words in the candidate.
// Filler words don't count: "The Secrets of the Dead" must not match "The Silence of the Sea".
export function titleMatches(title, candidateTitle) {
  const all = [...new Set(tokens(mainTitle(title)).filter(w => w.length > 2 || /\d/.test(w)))]
  const words = all.filter(w => !STOPWORDS.has(w))
  const need = words.length ? words : all
  if (!need.length) return false
  const cand = new Set(tokens(candidateTitle))
  const hits = need.filter(w => cand.has(w)).length
  return hits >= Math.ceil(need.length * 0.6)
}

// Surnames of every credited author: "Douglas Preston and Lincoln Child" -> preston, child.
function surnames(author) {
  return fold(author)
    .replace(/\(.*?\)/g, ' ')
    .split(/,|&|\band\b|;/)
    .map(name => name.trim().split(/\s+/).pop()?.replace(/[^a-z]/g, ''))
    .filter(s => s && s.length > 1)
}

// Whole-word comparison with hyphens dropped, so "Brodesser-Akner" matches itself
// and a surname can't match inside a longer name.
export function authorMatches(author, candidateAuthor) {
  const words = new Set(fold(candidateAuthor).split(/[\s,;&]+/).map(w => w.replace(/[^a-z]/g, '')).filter(Boolean))
  return surnames(author).some(s => words.has(s))
}

// Discover's check. Tries Kitab's own search proxy first (api/book-search:
// Hardcover, cached at the edge), which also handles co-authors and subtitles
// well, and only then Google Books. Google's key has a daily query limit shared
// with the rest of the app, so most checks should never reach it.
//   catalog(query, max) -> [{ title, author, ... }]  (searchCatalog in the app)
//   google(query, max)  -> [{ title, author, ... }]  (searchBooks in the app)
export async function verifyRecommendation(book, { catalog, google }) {
  if (!book?.title || !book?.author) return null
  try {
    const results = await catalog(`${mainTitle(book.title)} ${book.author}`, 10)
    const hit = results.find(r => titleMatches(book.title, r.title) && authorMatches(book.author, r.author))
    if (hit) return hit
  } catch {
    // proxy unreachable: fall through to Google
  }
  return findVerifiedMatch(book, google)
}

export async function findVerifiedMatch(book, search) {
  if (!book?.title || !book?.author) return null
  const strict = await search(`intitle:"${book.title}" inauthor:"${book.author}"`, 5)
  const exact = strict.find(r => titleMatches(book.title, r.title))
  if (exact) return exact

  const loose = await search(`${mainTitle(book.title)} ${book.author}`, 10)
  return loose.find(r => titleMatches(book.title, r.title) && authorMatches(book.author, r.author)) || null
}

// Drops books already in the library or recommended in any earlier session. The
// prompt asks the model to avoid both, but models slip (the Sep 2026 bake-off
// caught up to 9 repeats in 18 requests). Titles are compared in full and without
// their subtitle, so "The Wager" matches "The Wager: A Tale of Shipwreck...".
export function filterUnseen(books, libraryBooks, sessions) {
  const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const forms = title => [normalize(title), normalize(String(title || '').split(':')[0])].filter(Boolean)
  const seen = new Set([
    ...(libraryBooks || []).flatMap(b => forms(b.title)),
    ...(sessions || []).flatMap(s => (s.books || []).flatMap(b => forms(b.title))),
  ])
  return books.filter(b => !forms(b.title).some(f => seen.has(f)))
}
