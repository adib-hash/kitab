import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Sparkles } from 'lucide-react'
import { searchBooks } from '../../lib/googleBooks'
import { verifyRecommendation, filterUnseen } from '../../lib/recVerify'
import { buildDiscoverPrompt } from '../../lib/recPrompt'
import { API_BASE, searchCatalog } from '../../lib/bookSearch'
import { supabase } from '../../lib/supabase'

const SUGGESTIONS = [
  'Surprise me',
  'Something totally new',
  'Based on my favorites',
  'Dark and atmospheric',
  'Page-turning thriller',
]

// Verify a recommended book exists in Google Books and enrich it with metadata.
// Returns null if no credible match is found; the caller filters these out.
// The matching rules live in lib/recVerify.js (tested against real model output).
// Checks go to Kitab's Hardcover-first search proxy before Google Books.
async function enrichBook(book) {
  try {
    const match = await verifyRecommendation(book, { catalog: searchCatalog, google: searchBooks })
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
// highlights: rows from useAllHighlights (each with book_id); they're joined to the
// library here so the prompt can show each book's rating and shelf.
export async function generateRecommendations(userText, libraryBooks, sessions, tags, highlights = []) {
  const pastRecTitles = (sessions || [])
    .slice(0, 10)
    .flatMap(s => (s.books || []).map(b => `"${b.title}" by ${b.author}`))

  const tagNames = (tags || [])
    .map(t => t.name)
    .filter(n => !/^\d+$/.test(n)) // exclude numeric tags

  const byId = new Map(libraryBooks.map(b => [b.id, b]))
  const bookHighlights = (highlights || [])
    .filter(h => byId.has(h.book_id))
    .sort((a, b) => (a.location ?? a.page ?? 0) - (b.location ?? b.page ?? 0))
    .map(h => ({ text: h.text, book: byId.get(h.book_id) }))

  const prompt = buildDiscoverPrompt({ userText, libraryBooks, highlights: bookHighlights, pastRecTitles, tagNames })

  // /api/recommend verifies this token server-side before spending model credit.
  // getSession() refreshes an expired access token itself.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Please sign in again to get recommendations')

  const response = await fetch(`${API_BASE}/api/recommend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
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

  // Drop books already in the library or recommended in an earlier session (see recVerify.js).
  const filtered = filterUnseen(enriched, libraryBooks, sessions)

  if (filtered.length === 0) {
    throw new Error('Couldn’t find any new books you haven’t seen. Please try again.')
  }

  return filtered
}

export function QueryFlow({ library, sessions, tags, highlights, onComplete }) {
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(overrideText) {
    const text = (overrideText || inputText).trim()
    if (!text) return

    setLoading(true)
    setError(null)

    try {
      const books = await generateRecommendations(text, library, sessions, tags, highlights)
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
