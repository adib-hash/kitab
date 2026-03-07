import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Trash2, Plus, Sparkles, Check, X, BookmarkPlus, Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useLibrary, useAddBook } from '../hooks/useLibrary'
import { useRecommendations, useSaveRecommendation, useDeleteRecommendation, useUpdateRecommendation } from '../hooks/useRecommendations'
import { QueryFlow } from '../components/discover/QueryFlow'
import { RecDetailModal } from '../components/discover/RecDetailModal'

const MODE_LABELS = {
  vibe: '✨ A specific vibe',
  author: '✍️ More from authors I like',
  fresh: '🌍 Something totally new',
  favorites: '⭐ Based on my favorites',
}
const RECENT_MS = 48 * 60 * 60 * 1000

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Swipeable card deck ───────────────────────────────────────────────────────
function RecommendationDeck({ books, libraryTitles, onBookClick, onDeleteBook }) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  const [confirm, setConfirm] = useState(null)
  const addBook = useAddBook()
  const [addedSet, setAddedSet] = useState(
    () => new Set(
      books.map((b, i) => libraryTitles.has(b.title?.toLowerCase().trim()) ? i : null)
           .filter(v => v !== null)
    )
  )

  // Touch tracking — we need both X and Y to disambiguate scroll vs swipe
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const swipeAxis = useRef(null) // 'h' | 'v' | null — locked once determined
  const SWIPE_THRESHOLD = 55
  const AXIS_LOCK_DISTANCE = 8 // px before we decide axis

  const safeBooks = books || []
  const book = safeBooks[index]
  if (!book) return null

  function goTo(newIdx, dir) { setDirection(dir); setIndex(newIdx) }

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    swipeAxis.current = null
  }

  function onTouchMove(e) {
    if (touchStartX.current === null) return
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current)
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current)

    // Lock axis once we've moved enough to determine intent
    if (!swipeAxis.current && (dx > AXIS_LOCK_DISTANCE || dy > AXIS_LOCK_DISTANCE)) {
      swipeAxis.current = dx > dy ? 'h' : 'v'
    }

    // Only prevent default (block page scroll) when we've locked to horizontal
    if (swipeAxis.current === 'h') {
      e.preventDefault()
    }
    // If vertical, do nothing — let the page scroll naturally
  }

  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    // Only act on confirmed horizontal swipes
    if (swipeAxis.current === 'h') {
      const dx = e.changedTouches[0].clientX - touchStartX.current
      if (dx < -SWIPE_THRESHOLD && index < safeBooks.length - 1) goTo(index + 1, -1)
      else if (dx > SWIPE_THRESHOLD && index > 0) goTo(index - 1, 1)
    }
    touchStartX.current = null
    touchStartY.current = null
    swipeAxis.current = null
  }

  async function handleConfirmAdd() {
    await addBook.mutateAsync({
      book: {
        title: book.title, author: book.author,
        cover_url: book.cover_url || null,
        published_year: book.published_year || null,
        page_count: book.page_count || null,
        genres: book.genres || [],
        description: book.description || null,
        google_books_id: book.google_books_id || null,
        isbn: book.isbn || null,
        status: 'tbr',
      },
      tagIds: [],
    })
    setAddedSet(prev => new Set([...prev, index]))
    setConfirm(null)
  }

  function handleConfirmRemove() {
    onDeleteBook(index)
    setConfirm(null)
    if (index >= safeBooks.length - 1 && index > 0) setIndex(index - 1)
  }

  const isAdded = addedSet.has(index)
  const variants = {
    enter: dir => ({ x: dir < 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: dir => ({ x: dir < 0 ? -60 : 60, opacity: 0 }),
  }

  return (
    <div className="space-y-3">
      {/* Card wrapper — touch-action pan-y lets browser own vertical scroll;
          onTouchMove intercepts only after axis is locked to horizontal */}
      <div className="flex justify-center">
        <div
          className="relative select-none"
          style={{ width: 200, touchAction: 'pan-y' }}
          onTouchStart={onTouchStart} style={{ touchAction: "pan-y" }}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={index}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="relative rounded-2xl overflow-hidden shadow-book cursor-pointer"
              style={{ aspectRatio: '2/3' }}
            >
              <div className="absolute inset-0" onClick={() => onBookClick(book)}>
                {book.cover_url ? (
                  <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center font-serif font-bold text-white text-3xl"
                    style={{ backgroundColor: `hsl(${(book.title.charCodeAt(0) * 37) % 360}, 35%, 30%)` }}
                  >
                    {book.title.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="font-serif font-bold text-white text-xs leading-snug line-clamp-2 drop-shadow">{book.title}</p>
                  <p className="text-[11px] text-white/80 mt-0.5 drop-shadow">{book.author}</p>
                </div>
              </div>

              {/* X — remove */}
              <button
                onClick={e => { e.stopPropagation(); setConfirm('remove') }}
                className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-rose-500/80 transition-colors"
              >
                <X size={13} />
              </button>

              {/* Bookmark — add to TBR */}
              <button
                onClick={e => { e.stopPropagation(); if (!isAdded) setConfirm('add') }}
                className={`absolute top-2 right-2 w-7 h-7 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors ${
                  isAdded ? 'bg-teal-500/90 text-white' : 'bg-black/50 text-white hover:bg-teal-500/80'
                }`}
              >
                {isAdded ? <Check size={13} /> : <BookmarkPlus size={13} />}
              </button>
            </motion.div>
          </AnimatePresence>

          {/* Confirm overlays */}
          <AnimatePresence>
            {confirm === 'add' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-2xl bg-teal-900/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
                <p className="text-white text-xs font-medium text-center px-3">Add "{book.title}" to TBR?</p>
                <div className="flex gap-2">
                  <button onClick={handleConfirmAdd} disabled={addBook.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-teal-500 text-white rounded-xl text-xs font-semibold hover:bg-teal-400 transition-colors">
                    {addBook.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Add
                  </button>
                  <button onClick={() => setConfirm(null)}
                    className="px-3 py-1.5 bg-white/20 text-white rounded-xl text-xs font-semibold hover:bg-white/30 transition-colors">
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
            {confirm === 'remove' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-2xl bg-rose-900/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
                <p className="text-white text-xs font-medium text-center px-3">Remove "{book.title}"?</p>
                <div className="flex gap-2">
                  <button onClick={handleConfirmRemove}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-500 text-white rounded-xl text-xs font-semibold hover:bg-rose-400 transition-colors">
                    <Check size={11} /> Remove
                  </button>
                  <button onClick={() => setConfirm(null)}
                    className="px-3 py-1.5 bg-white/20 text-white rounded-xl text-xs font-semibold hover:bg-white/30 transition-colors">
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Dot indicators + arrows */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => index > 0 && goTo(index - 1, 1)} disabled={index === 0}
          className="p-1 text-ink-400 disabled:opacity-30 hover:text-ink-600 dark:hover:text-ink-300 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="flex gap-1.5">
          {safeBooks.map((_, i) => (
            <button key={i} onClick={() => goTo(i, i > index ? -1 : 1)}
              className={`rounded-full transition-all ${
                i === index ? 'w-4 h-2 bg-teal-600 dark:bg-teal-400' : 'w-2 h-2 bg-paper-300 dark:bg-ink-600 hover:bg-teal-400/60'
              }`}
            />
          ))}
        </div>
        <button onClick={() => index < safeBooks.length - 1 && goTo(index + 1, -1)} disabled={index === safeBooks.length - 1}
          className="p-1 text-ink-400 disabled:opacity-30 hover:text-ink-600 dark:hover:text-ink-300 transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Why you'll love it — full session width */}
      <AnimatePresence mode="wait">
        <motion.div key={index}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800 rounded-xl px-4 py-3"
        >
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wide mb-1">Why you'll love it</p>
          <p className="text-sm text-teal-900 dark:text-teal-200 leading-relaxed">
            {book.why || 'Recommended based on your reading taste.'}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Session card ──────────────────────────────────────────────────────────────
function SessionCard({ session, libraryTitles, onBookClick, onDelete, onDeleteBook, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
      <div className="flex items-start justify-between p-4 pb-3">
        <button className="flex-1 min-w-0 text-left" onClick={() => setExpanded(e => !e)}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
              {MODE_LABELS[session.mode] || session.mode}
            </span>
            <span className="text-xs text-ink-400">{timeAgo(session.created_at)}</span>
            <span className="text-xs text-ink-400">{session.books?.length || 0} picks</span>
            <span className="ml-auto text-ink-400">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </div>
          {session.query && (
            <p className="text-sm text-ink-600 dark:text-ink-400 mt-1.5 italic">"{session.query}"</p>
          )}
        </button>
        <button onClick={() => onDelete(session.id)}
          className="ml-2 flex-shrink-0 p-1.5 rounded-lg text-ink-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
      <AnimatePresence>
        {expanded && session.books?.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5">
              <RecommendationDeck
                books={session.books}
                libraryTitles={libraryTitles}
                onBookClick={onBookClick}
                onDeleteBook={(bookIndex) => onDeleteBook(session.id, session.books, bookIndex)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Recent / older split ──────────────────────────────────────────────────────
function SessionList({ sessions, libraryTitles, onBookClick, onDelete, onDeleteBook }) {
  const [olderOpen, setOlderOpen] = useState(false)
  const now = Date.now()
  const recent = sessions.filter(s => now - new Date(s.created_at).getTime() < RECENT_MS)
  const older  = sessions.filter(s => now - new Date(s.created_at).getTime() >= RECENT_MS)

  const renderCard = session => (
    <SessionCard
      key={session.id}
      session={session}
      libraryTitles={libraryTitles}
      onBookClick={onBookClick}
      onDelete={onDelete}
      onDeleteBook={onDeleteBook}
      defaultExpanded={now - new Date(session.created_at).getTime() < RECENT_MS}
    />
  )

  return (
    <div className="space-y-4 pb-8">
      {recent.map(renderCard)}
      {older.length > 0 && (
        <>
          <button onClick={() => setOlderOpen(o => !o)}
            className="flex items-center gap-2 text-xs font-semibold text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors w-full py-1">
            {olderOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Older Recommendations ({older.length})
          </button>
          <AnimatePresence>
            {olderOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                className="space-y-4 overflow-hidden"
              >
                {older.map(renderCard)}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function Discover() {
  const { data: books = [], isLoading: libraryLoading } = useLibrary()
  const { data: sessions = [], isLoading: sessionsLoading } = useRecommendations()
  const saveRec = useSaveRecommendation()
  const deleteRec = useDeleteRecommendation()
  const updateRec = useUpdateRecommendation()

  function handleDeleteBook(sessionId, currentBooks, bookIndex) {
    const updated = currentBooks.filter((_, i) => i !== bookIndex)
    if (updated.length === 0) deleteRec.mutate(sessionId)
    else updateRec.mutate({ id: sessionId, books: updated })
  }

  const [showFlow, setShowFlow] = useState(false)
  const [previewBook, setPreviewBook] = useState(null)
  const libraryTitles = useMemo(() => new Set(books.map(b => b.title?.toLowerCase().trim())), [books])

  async function handleComplete(result) { setShowFlow(false); await saveRec.mutateAsync(result) }

  if (libraryLoading) {
    return <div className="flex items-center justify-center py-20"><div className="text-ink-400 text-sm">Loading...</div></div>
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Discover</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">AI-powered picks built around your taste</p>
        </div>
        {!showFlow && (
          <button onClick={() => setShowFlow(true)} className="btn-primary gap-2 lg:hidden">
            <Sparkles size={14} /> New
          </button>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">
        {/* Desktop left panel */}
        <div className="hidden lg:block lg:sticky lg:top-6 space-y-4">
          <div className="card p-5">
            <h2 className="font-serif text-base font-semibold text-ink-900 dark:text-paper-50 mb-4">Find your next read</h2>
            <AnimatePresence mode="wait">
              {showFlow ? (
                <motion.div key="flow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <QueryFlow library={books} onComplete={handleComplete} />
                  <button onClick={() => setShowFlow(false)} className="hidden lg:block mt-3 text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors">← cancel</button>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">Tell me what you're looking for and I'll find your next read.</p>
                  <button onClick={() => setShowFlow(true)} className="w-full btn-primary gap-2 justify-center"><Sparkles size={14} /> Get recommendations</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {sessions.length > 0 && (
            <p className="hidden lg:block text-xs text-ink-400 text-center">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {sessions.reduce((n, s) => n + (s.books?.length || 0), 0)} recommendations
            </p>
          )}
        </div>

        {/* Session history */}
        <div className="space-y-4">
          <AnimatePresence>
            {showFlow && (
              <motion.div key="mobile-flow" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="card p-5 lg:hidden">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif text-base font-semibold text-ink-900 dark:text-paper-50">Find your next read</h2>
                  <button onClick={() => setShowFlow(false)} className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300">cancel</button>
                </div>
                <QueryFlow library={books} onComplete={handleComplete} />
              </motion.div>
            )}
          </AnimatePresence>

          {sessionsLoading ? (
            <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-40 skeleton rounded-xl" />)}</div>
          ) : sessions.length === 0 ? (
            <div className="card p-10 text-center space-y-3">
              <Compass size={36} className="mx-auto text-ink-300" />
              <p className="font-medium text-ink-700 dark:text-ink-300">No recommendations yet</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Use the panel to get your first AI-powered picks</p>
            </div>
          ) : (
            <SessionList sessions={sessions} libraryTitles={libraryTitles} onBookClick={setPreviewBook}
              onDelete={(id) => deleteRec.mutate(id)} onDeleteBook={handleDeleteBook} />
          )}
        </div>
      </div>

      <RecDetailModal book={previewBook} open={!!previewBook} onClose={() => setPreviewBook(null)}
        inLibrary={previewBook ? libraryTitles.has(previewBook.title?.toLowerCase().trim()) : false} />
    </motion.div>
  )
}
