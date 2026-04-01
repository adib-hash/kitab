import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Loader2, Sparkles } from 'lucide-react'
import { searchBooks } from '../../lib/googleBooks'

const MODES = [
  {
    id: 'vibe',
    emoji: '✨',
    label: 'A specific vibe',
    placeholder: 'e.g. "dark and atmospheric", "feel-good and funny", "page-turning thriller"',
    prompt: 'The reader is looking for books that match a specific vibe or mood.',
  },
  {
    id: 'author',
    emoji: '✍️',
    label: 'More from authors I like',
    placeholder: 'e.g. "authors like Cormac McCarthy" or just "surprise me based on my library"',
    prompt: 'The reader wants more books from authors similar to ones they already love.',
  },
  {
    id: 'fresh',
    emoji: '🌍',
    label: 'Something totally new',
    placeholder: 'e.g. "I always read sci-fi, shake things up" or "something from a different culture"',
    prompt: 'The reader wants something outside their usual genres — a genuine stretch pick.',
  },
  {
    id: 'favorites',
    emoji: '⭐',
    label: 'Based on my favorites',
    placeholder: 'Any extra guidance? (optional — we already know your highest-rated books)',
    prompt: 'The reader wants recommendations based on their all-time favorite reads.',
  },
]

// Build the Claude prompt from library + mode + user text
function buildPrompt(mode, userText, libraryBooks) {
  const topBooks = libraryBooks
    .filter(b => b.status === 'read' && b.rating)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 20)
    .map(b => `- "${b.title}" by ${b.author} (${b.rating}★)`)
    .join('\n')

  const allReadTitles = libraryBooks
    .filter(b => b.status === 'read' || b.status === 'reading' || b.status === 'tbr')
    .map(b => `"${b.title}" by ${b.author}`)
    .join(', ')

  const modeObj = MODES.find(m => m.id === mode)

  return `You are an expert book curator with deep knowledge of literature across all genres.

${modeObj.prompt}

Reader's highest-rated books:
${topBooks || '(no rated books yet)'}

All books already in their library (DO NOT recommend any of these):
${allReadTitles || '(none)'}

Reader's request: "${userText}"

Return ONLY a JSON array of exactly 5 book recommendations. No other text, no markdown, no explanation outside the JSON.

Each object must have:
- "title": exact title (no subtitles unless essential)
- "author": full author name
- "published_year": integer year or null
- "why": one punchy sentence (15-25 words) explaining specifically why THIS reader will love it

Rules:
- Only recommend real, widely-available books
- No study guides, summaries, lecture collections, omnibus sets, or companion books
- Prioritize books with strong critical reception
- Never recommend a book already in the reader's library
- Vary the picks — different authors, don't cluster in one series
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
      // At least half the significant words from Claude's title appear in the GB title
      const hits = titleWords.filter(w => rTitle.includes(w))
      return hits.length >= Math.ceil(titleWords.length * 0.5)
    })

    if (!match) return null // Book title doesn't match anything real in Google Books

    return {
      ...book,
      title: match.title, // use canonical GB title
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

export function QueryFlow({ library, onComplete }) {
  const [step, setStep] = useState('mode') // 'mode' | 'input' | 'loading'
  const [selectedMode, setSelectedMode] = useState(null)
  const [inputText, setInputText] = useState('')
  const [error, setError] = useState(null)

  async function handleSubmit() {
    const mode = MODES.find(m => m.id === selectedMode)
    const text = inputText.trim() || (selectedMode === 'favorites' ? 'Based on my top-rated books' : '')
    if (!text && selectedMode !== 'favorites') return

    setStep('loading')
    setError(null)

    try {
      const prompt = buildPrompt(selectedMode, text || 'Surprise me based on my library', library)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 25000)

      let response
      try {
        response = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        })
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          throw new Error('Request timed out — please try again.')
        }
        throw fetchErr
      } finally {
        clearTimeout(timeout)
      }

      // Read as text first — response.json() throws an opaque error in Safari
      // ("The string did not match the expected pattern") when body isn't valid JSON
      const responseText = await response.text()

      if (!response.ok) {
        let errMsg = `${response.status}: Unknown error`
        try {
          const errData = JSON.parse(responseText)
          errMsg = `${response.status}: ${errData.error || 'Unknown error'}`
        } catch {}
        throw new Error(errMsg)
      }

      let data
      try {
        data = JSON.parse(responseText)
      } catch {
        // Likely an HTML error page from Vercel (timeout, deploy issue, etc.)
        const isHtml = responseText.trimStart().startsWith('<')
        throw new Error(
          isHtml
            ? 'Server returned an error page — the request may have timed out. Please try again.'
            : `Invalid response from server: ${responseText.slice(0, 120)}`
        )
      }

      const rawText = data.content?.find(b => b.type === 'text')?.text || ''
      if (!rawText) throw new Error('Empty response from API')

      // Strip any markdown fences
      const jsonText = rawText.replace(/```json|```/g, '').trim()
      let books
      try {
        books = JSON.parse(jsonText)
      } catch {
        throw new Error(`Couldn't parse recommendations. Please try again.`)
      }

      if (!Array.isArray(books)) throw new Error('Invalid response format')

      // Enrich and verify all books in parallel — drops any that can't be confirmed in Google Books
      const enriched = (await Promise.all(books.map(enrichBook))).filter(Boolean)

      if (enriched.length === 0) {
        throw new Error('None of the suggested books could be verified. Please try again.')
      }

      onComplete({
        mode: selectedMode,
        query: text || 'Based on my favorites',
        books: enriched,
      })
    } catch (err) {
      console.error(err)
      setError(`Error: ${err.message}`)
      setStep('input')
    }
  }

  const currentMode = MODES.find(m => m.id === selectedMode)

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">

        {/* Step 1: Mode selection */}
        {step === 'mode' && (
          <motion.div
            key="mode"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <p className="text-sm font-medium text-ink-700 dark:text-ink-300">
              What are you looking for?
            </p>
            <div className="grid grid-cols-1 divide-y divide-paper-200 dark:divide-ink-700">
              {MODES.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => { setSelectedMode(mode.id); setStep('input') }}
                  className="flex items-center gap-3 py-3 text-left group hover:text-teal-500 dark:hover:text-teal-400 transition-colors"
                >
                  <span className="text-lg w-7 text-center flex-shrink-0">{mode.emoji}</span>
                  <span className="text-sm font-medium text-paper-900 dark:text-paper-50 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {mode.label}
                  </span>
                  <ArrowRight size={13} className="ml-auto text-ink-400 group-hover:text-teal-500 dark:group-hover:text-teal-400 transition-colors flex-shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Step 2: Text input */}
        {step === 'input' && currentMode && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setStep('mode'); setInputText('') }}
                className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors"
              >
                ← back
              </button>
              <span className="text-xl">{currentMode.emoji}</span>
              <span className="text-sm font-medium text-ink-700 dark:text-ink-300">{currentMode.label}</span>
            </div>

            <textarea
              autoFocus
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
              placeholder={currentMode.placeholder}
              rows={3}
              style={{ fontSize: '16px' }}
              className="w-full input resize-none"
            />

            {error && (
              <p className="text-xs text-rose-500">{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={selectedMode !== 'favorites' && !inputText.trim()}
              className="w-full btn-primary gap-2 justify-center disabled:opacity-40"
            >
              <Sparkles size={14} /> Find my next read
            </button>
          </motion.div>
        )}

        {/* Step 3: Loading */}
        {step === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-12 flex flex-col items-center gap-4 text-center"
          >
            <div className="relative">
              <Loader2 size={32} className="animate-spin text-teal-600" />
            </div>
            <div>
              <p className="font-medium text-ink-800 dark:text-ink-200">Finding your next read...</p>
              <p className="text-xs text-ink-400 mt-1">Consulting your library and thinking carefully</p>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
