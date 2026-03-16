import { useState, useRef } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Sparkles, Check, X, RefreshCw, Loader2, BookMarked, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react'
import { useLibrary, useAddBook } from '../hooks/useLibrary'
import { supabase } from '../lib/supabase'
import { searchBooks } from '../lib/googleBooks'
import { BookCover } from '../components/books/BookCover'
import { Button, EmptyState } from '../components/ui/index.jsx'
import toast from 'react-hot-toast'

const BIAS_OPTIONS = [
  { value: 'similar', label: 'Similar to my favorites' },
  { value: 'new_genre', label: 'A new genre for me' },
  { value: 'new_author', label: 'Authors I haven\'t tried' },
]

function SwipeCard({ rec, onAccept, onSkip, isTop }) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 200], [-15, 15])
  const acceptOpacity = useTransform(x, [0, 100], [0, 1])
  const skipOpacity = useTransform(x, [-100, 0], [1, 0])
  const cardOpacity = useTransform(x, [-300, -200, 0, 200, 300], [0, 1, 1, 1, 0])

  function handleDragEnd(_, info) {
    const threshold = 100
    if (info.offset.x > threshold) {
      animate(x, 400, { duration: 0.3 }).then(onAccept)
    } else if (info.offset.x < -threshold) {
      animate(x, -400, { duration: 0.3 }).then(onSkip)
    } else {
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 20 })
    }
  }

  return (
    <motion.div
      style={{ x, rotate, opacity: cardOpacity }}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      className="absolute inset-0 swipe-card cursor-grab active:cursor-grabbing"
    >
      <div className="h-full bg-white dark:bg-ink-800 rounded-2xl border border-paper-200 dark:border-ink-700 shadow-book overflow-hidden flex flex-col">
        {/* Accept indicator */}
        <motion.div style={{ opacity: acceptOpacity }}
          className="absolute top-6 left-6 z-10 bg-teal-500 text-white rounded-full px-3 py-1 text-sm font-bold rotate-[-12deg] border-2 border-teal-600">
          ADD TO TBR ✓
        </motion.div>
        {/* Skip indicator */}
        <motion.div style={{ opacity: skipOpacity }}
          className="absolute top-6 right-6 z-10 bg-rose-500 text-white rounded-full px-3 py-1 text-sm font-bold rotate-[12deg] border-2 border-rose-600">
          SKIP ✕
        </motion.div>

        <div className="flex-1 flex items-center justify-center p-8 bg-paper-50 dark:bg-ink-900/50">
          <BookCover book={rec} size="xl" className="shadow-book-hover" />
        </div>
        <div className="p-6 space-y-2">
          <h3 className="font-serif text-xl font-bold text-ink-900 dark:text-paper-50 leading-tight">{rec.title}</h3>
          <p className="text-ink-600 dark:text-ink-400">by {rec.author}</p>
          {rec.reason && (
            <p className="text-sm text-ink-600 dark:text-ink-400 border-l-2 border-teal-200 pl-3 mt-3 leading-relaxed">
              {rec.reason}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(rec.genres || []).slice(0, 3).map(g => (
              <span key={g} className="tag-pill">{g}</span>
            ))}
            {rec.published_year && <span className="tag-pill">{rec.published_year}</span>}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function Recommendations() {
  const { data: books = [] } = useLibrary()
  const addBook = useAddBook()
  const [recs, setRecs] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [bias, setBias] = useState('similar')
  const [done, setDone] = useState(false)

  const readBooks = books.filter(b => b.status === 'read')
  const canRecommend = readBooks.length >= 2

  async function generateRecs() {
    setLoading(true)
    setDone(false)
    setCurrentIndex(0)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: skipped } = await supabase
        .from('skipped_recommendations')
        .select('google_books_id, title')
        .eq('user_id', user.id)

      const skippedIds = (skipped || []).map(s => s.google_books_id)
      const existingTitles = books.map(b => b.title.toLowerCase())

      const libraryContext = readBooks.slice(0, 30).map(b =>
        `"${b.title}" by ${b.author || 'Unknown'}${b.rating ? ` (${b.rating}★)` : ''}${b.genres?.length ? ` [${b.genres.slice(0,2).join(', ')}]` : ''}`
      ).join('\n')

      const biasText = {
        similar: 'books similar to the user\'s highest-rated books',
        new_genre: 'books in genres the user hasn\'t read yet',
        new_author: 'books by authors the user hasn\'t read yet',
      }[bias]

      // Fetch highlights for context
      const { data: highlights } = await supabase
        .from('highlights')
        .select('text, book_title')
        .eq('user_id', user.id)
        .not('book_id', 'is', null)
        .order('highlighted_at', { ascending: false })
        .limit(20)

      const reviewContext = readBooks
        .filter(b => b.review && b.rating >= 4)
        .slice(0, 5)
        .map(b => `- "${b.title}" (${b.rating}★): ${b.review.slice(0, 200)}`)
        .join('\n')

      const highlightContext = (highlights || [])
        .slice(0, 12)
        .map(h => `- From "${h.book_title}": "${h.text.slice(0, 120)}"`)
        .join('\n')

      const prompt = `You are a personal book recommendation engine. Based on this person's reading history, recommend 10 books they would love.

Reading history:
${libraryContext}

TBR list includes: ${books.filter(b=>b.status==='tbr').slice(0,10).map(b=>b.title).join(', ')}

Bias: ${biasText}
${reviewContext ? `\nUser's reviews (excerpts):\n${reviewContext}` : ''}
${highlightContext ? `\nHighlighted passages (what resonated with this reader):\n${highlightContext}` : ''}
Do NOT recommend books with these titles (already in library): ${existingTitles.slice(0,20).join(', ')}

Return ONLY a JSON array of 10 objects with these exact fields:
- title (string)
- author (string)
- reason (string, 1-2 sentences explaining why this matches their taste)

Return ONLY valid JSON, no markdown, no prose.`

      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })

      if (!res.ok) throw new Error('Recommendation API failed')
      const { recommendations } = await res.json()

      // Enrich with Google Books data (covers etc.)
      const enriched = await Promise.all(
        recommendations.slice(0, 10).map(async (rec) => {
          const results = await searchBooks(`${rec.title} ${rec.author}`, 1)
          const bookData = results[0] || {}
          return {
            ...rec,
            ...bookData,
            title: rec.title,
            author: rec.author,
            reason: rec.reason,
          }
        })
      )

      setRecs(enriched)
    } catch (err) {
      console.error(err)
      toast.error('Failed to get recommendations. Check your API configuration.')
      // Demo mode: show placeholder cards
      setRecs([
        { title: 'The Name of the Wind', author: 'Patrick Rothfuss', reason: 'Based on your love of epic fantasy.', genres: ['Fantasy'] },
        { title: 'Project Hail Mary', author: 'Andy Weir', reason: 'Hard sci-fi with a compelling lone-hero narrative.', genres: ['Science Fiction'] },
        { title: 'All the Light We Cannot See', author: 'Anthony Doerr', reason: 'Beautifully written literary historical fiction.', genres: ['Historical Fiction'] },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function handleAccept() {
    const rec = recs[currentIndex]
    await addBook.mutateAsync({
      book: {
        title: rec.title,
        author: rec.author,
        cover_url: rec.cover_url,
        google_books_id: rec.google_books_id,
        published_year: rec.published_year,
        page_count: rec.page_count,
        genres: rec.genres || [],
        description: rec.description,
        isbn: rec.isbn,
        status: 'tbr',
      },
      tagIds: []
    })
    toast.success(`"${rec.title}" added to your TBR`, { id: 'book-added' })
    advance()
  }

  async function handleSkip() {
    const rec = recs[currentIndex]
    if (rec.google_books_id) {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('skipped_recommendations').upsert({
        user_id: user.id,
        google_books_id: rec.google_books_id,
        title: rec.title,
      })
    }
    advance()
  }

  function advance() {
    if (currentIndex >= recs.length - 1) {
      setDone(true)
    } else {
      setCurrentIndex(i => i + 1)
    }
  }

  if (!canRecommend) return (
    <div className="space-y-6">
      <h1 className="page-title">Discover</h1>
      <EmptyState
        icon={<Sparkles size={48} />}
        title="Read more to unlock recommendations"
        description="Mark at least 2 books as read and we'll suggest books you'll love."
      />
    </div>
  )

  return (
    <div className="max-w-sm mx-auto space-y-6">
      <div className="text-center">
        <h1 className="page-title">Discover Books</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">Swipe right to add to TBR, left to skip</p>
      </div>

      {/* Bias selector */}
      {recs.length === 0 && !loading && (
        <div className="card p-5 space-y-4">
          <p className="section-label">Recommend me books that are...</p>
          <div className="space-y-2">
            {BIAS_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors">
                <input
                  type="radio"
                  name="bias"
                  value={opt.value}
                  checked={bias === opt.value}
                  onChange={() => setBias(opt.value)}
                  className="text-teal-600"
                />
                <span className="text-sm text-ink-700 dark:text-ink-300">{opt.label}</span>
              </label>
            ))}
          </div>
          <button onClick={generateRecs} className="btn-primary w-full justify-center py-3">
            <Sparkles size={16} /> Generate Recommendations
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-20 gap-4 text-ink-500">
          <Loader2 size={32} className="animate-spin text-teal-600" />
          <p className="text-sm">Finding books for you...</p>
        </div>
      )}

      {/* Swipe deck */}
      {!loading && recs.length > 0 && !done && (
        <div>
          <div className="relative" style={{ height: 520 }}>
            {/* Background cards */}
            {recs.slice(currentIndex + 1, currentIndex + 3).reverse().map((rec, i) => (
              <div
                key={rec.title}
                className="absolute inset-0 bg-white dark:bg-ink-800 rounded-2xl border border-paper-200 dark:border-ink-700"
                style={{
                  transform: `scale(${0.94 + i * 0.03}) translateY(${(1 - i) * 8}px)`,
                  zIndex: i,
                }}
              />
            ))}
            {/* Active card */}
            <SwipeCard
              key={recs[currentIndex]?.title}
              rec={recs[currentIndex]}
              onAccept={handleAccept}
              onSkip={handleSkip}
              isTop
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-center gap-6 mt-4">
            <button
              onClick={handleSkip}
              className="w-14 h-14 rounded-full bg-white dark:bg-ink-800 border-2 border-rose-200 dark:border-rose-800 text-rose-500 flex items-center justify-center shadow-card hover:border-rose-400 hover:scale-110 transition-all"
            >
              <X size={24} />
            </button>
            <p className="text-xs text-ink-400 w-20 text-center">
              {currentIndex + 1} of {recs.length}
            </p>
            <button
              onClick={handleAccept}
              className="w-14 h-14 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-book hover:bg-teal-700 hover:scale-110 transition-all"
            >
              <Check size={24} />
            </button>
          </div>

          <p className="text-center text-xs text-ink-400 mt-3 flex items-center justify-center gap-1">
            <ChevronLeft size={12} /> Skip <span className="mx-2">·</span> Add to TBR <ChevronRight size={12} />
          </p>
        </div>
      )}

      {/* Done state */}
      {done && (
        <div className="card p-8 text-center space-y-4">
          <CheckCircle size={48} className="text-teal-600 mx-auto" />
          <h3 className="font-serif text-xl font-semibold text-ink-900 dark:text-paper-50">All done!</h3>
          <p className="text-sm text-ink-500">Check your TBR for the books you added.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setRecs([]); setDone(false); setCurrentIndex(0) }}
              className="btn-secondary"
            >
              <RefreshCw size={14} /> New batch
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
