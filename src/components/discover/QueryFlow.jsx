import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Sparkles } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { searchBooks } from '../../lib/googleBooks'

// On native iOS, relative /api/ URLs resolve against capacitor://localhost which doesn't work.
const API_BASE = Capacitor.isNativePlatform() ? 'https://kitab.ihsan.build' : ''

const SUGGESTIONS = [
  'Surprise me',
  'Something totally new',
  'Based on my favorites',
  'Dark and atmospheric',
  'Page-turning thriller',
]

// Build the Claude prompt from library + user text + past recs
function buildPrompt(userText, libraryBooks, pastRecTitles, tagNames) {
  const topBooks = libraryBooks
    .filter(b => b.status === 'read' && b.rating)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 20)
    .map(b => {
      const bookTags = (b.tags || [])
        .map(t => t.name)
        .filter(n => !/^\d+$/.test(n)) // exclude numeric tags like "2026"
      const tagStr = bookTags.length ? ` [${bookTags.join(', ')}]` : ''
      const snippet = b.review
        ? ` — "${b.review.slice(0, 100)}${b.review.length > 100 ? '...' : ''}"`
        : ''
      return `- "${b.title}" by ${b.author} (${b.rating}\u2605)${tagStr}${snippet}`
    })
    .join('\n')

  const allReadTitles = libraryBooks
    .filter(b => b.status === 'read' || b.status === 'reading' || b.status === 'tbr')
    .map(b => `"${b.title}" by ${b.author}`)
    .join(', ')

  const genreContext = tagNames.length
    ? `\nReader's genre categories (tags they use to organize their library):\n${tagNames.join(', ')}\n`
    : ''

  const pastRecsSection = pastRecTitles.length
    ? `\nBooks from previous recommendation sessions (DO NOT recommend these either):\n${pastRecTitles.join(', ')}\n`
    : ''

  return `You are an expert book curator with deep knowledge of literature across all genres.

The reader is looking for their next great read. They've described what they want below. Use their library, ratings, reviews, and tags to understand their taste deeply, then recommend books that fit their request.

Reader's highest-rated books (with tags and review snippets where available):
${topBooks || '(no rated books yet)'}
${genreContext}
All books already in their library (DO NOT recommend any of these):
${allReadTitles || '(none)'}
${pastRecsSection}
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
- The "why" must be specific, not generic ("you'll love the world-building" is bad; "the same slow-burn dread as McCarthy but set in modern Tokyo" is good)`
}

// Verify a Claude-returned book exists in Google Books and enrich with metadata.
// Returns null if no credible match is found — caller must filter these out.
async function enrichBook(book) {
  try {
    const query = `intitle:"${book.title}" inauthor:"${book.author}"`
    const results = await searchBooks(query, 5)
    if (!results.length) return null

    // Find a credible match: title must overlap significantly
    const titleWords = book.title.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const match = results.find(r => {
      const rTitle = r.title.toLowerCase()
      const hits = titleWords.filter(w => rTitle.includes(w))
      return hits.length >= Math.ceil(titleWords.length * 0.5)
    })

    if (!match) return null

    return {
      ...book,
      title: match.title,
      cover_url: match.cover_url || null,
      description: match.description || null,
      page_count: match.page_count || null,
      published_year: book.published_year || match.published_year || null,
      google_books_id: match.google_books_id || null,
      isbn: match.isbn || null,
      genres: match.genres || [],
    }
  } catch {
    return null
  }
}

// Shared function so both QueryFlow and regenerate can call it
export async function generateRecommendations(userText, libraryBooks, sessions, tags) {
  const pastRecTitles = (sessions || [])
    .slice(0, 10)
    .flatMap(s => (s.books || []).map(b => `"${b.title}" by ${b.author}`))

  const tagNames = (tags || [])
    .map(t => t.name)
    .filter(n => !/^\d+$/.test(n)) // exclude numeric tags

  const prompt = buildPrompt(userText, libraryBooks, pastRecTitles, tagNames)

  const response = await fetch(`${API_BASE}/api/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(`${response.status}: ${errData.error || 'Unknown error'}`)
  }
  const data = await response.json()

  const rawText = data.content?.find(b => b.type === 'text')?.text || ''
  if (!rawText) throw new Error('Empty response from API')

  const jsonText = rawText.replace(/```json|```/g, '').trim()
  let books
  try {
    books = JSON.parse(jsonText)
  } catch {
    throw new Error(`JSON parse failed. Raw: ${rawText.slice(0, 200)}`)
  }

  if (!Array.isArray(books)) throw new Error('Invalid response format')

  const enriched = (await Promise.all(books.map(enrichBook))).filter(Boolean)

  if (enriched.length === 0) {
    throw new Error('None of the suggested books could be verified. Please try again.')
  }

  return enriched
}

export function QueryFlow({ library, sessions, tags, onComplete }) {
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(overrideText) {
    const text = (overrideText || inputText).trim()
    if (!text) return

    setLoading(true)
    setError(null)

    try {
      const books = await generateRecommendations(text, library, sessions, tags)
      onComplete({
        mode: 'prompt',
        query: text,
        books,
      })
    } catch (err) {
      console.error(err)
      setError(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  function handleChipClick(suggestion) {
    setInputText(suggestion)
    handleSubmit(suggestion)
  }

  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-10 flex flex-col items-center gap-4 text-center"
          >
            <Loader2 size={28} className="animate-spin text-teal-600" />
            <div>
              <p className="font-medium text-ink-800 dark:text-ink-200">Finding your next read...</p>
              <p className="text-xs text-ink-400 mt-1">Consulting your library and thinking carefully</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <textarea
              autoFocus
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder={'e.g. "dark and atmospheric", "more like Cormac McCarthy", "surprise me"...'}
              rows={2}
              style={{ fontSize: '16px' }}
              className="w-full input resize-none"
            />

            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleChipClick(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-paper-200 dark:border-ink-600
                             text-ink-600 dark:text-ink-400 hover:bg-teal-50 dark:hover:bg-teal-900/20
                             hover:border-teal-300 dark:hover:border-teal-700 hover:text-teal-700 dark:hover:text-teal-400
                             transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>

            {error && (
              <p className="text-xs text-rose-500">{error}</p>
            )}

            <button
              onClick={() => handleSubmit()}
              disabled={!inputText.trim()}
              className="w-full btn-primary gap-2 justify-center disabled:opacity-40"
            >
              <Sparkles size={14} /> Find my next read
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
