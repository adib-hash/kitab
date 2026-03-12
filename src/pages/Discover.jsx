import { useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
         Sparkles, BookmarkPlus, Check, Loader2, X } from 'lucide-react'
import { useLibrary, useAddBook } from '../hooks/useLibrary'
import { useRecommendations, useSaveRecommendation, useDeleteRecommendation, useUpdateRecommendation } from '../hooks/useRecommendations'
import { QueryFlow } from '../components/discover/QueryFlow'
import { RecDetailModal } from '../components/discover/RecDetailModal'
import { timeAgo } from '../lib/utils'

const MODE_LABELS = {
  vibe:      '✨ A specific vibe',
  author:    '✍️ More from authors I like',
  fresh:     '🌍 Something totally new',
  favorites: '⭐ Based on my favorites',
}

// ── CoverCard — book cover with fallback, X + TBR bookmark buttons ────────────
function CoverCard({ book, inLibrary, onAdd, onRemove, isPending, added }) {
  const [imgError, setImgError] = useState(false)
  const titleColor = `hsl(${(book.title?.charCodeAt(0) ?? 65) * 37 % 360}, 35%, 28%)`

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-xl mx-auto"
         style={{ width: 240, height: 320 }}>

      {/* Cover image or fallback */}
      {book.cover_url && !imgError ? (
        <img
          src={book.cover_url}
          alt={book.title}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-3 px-4 text-center"
          style={{ backgroundColor: titleColor }}
        >
          <span className="font-serif text-4xl font-bold text-white/80 leading-none">
            {book.title?.slice(0, 2).toUpperCase()}
          </span>
          <span className="font-serif text-sm font-semibold text-white/90 leading-snug px-2">
            {book.title}
          </span>
          <span className="text-xs text-white/60">{book.author}</span>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

      {/* Title/Author on cover */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="font-serif font-semibold text-white text-sm leading-snug drop-shadow">{book.title}</p>
        <p className="text-white/70 text-xs mt-0.5">{book.author}</p>
      </div>

      {/* Remove (X) button — top left */}
      <button
        onClick={onRemove}
        className="absolute top-2 left-2 p-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        title="Remove from recommendations"
      >
        <X size={14} />
      </button>

      {/* Add to TBR — top right */}
      <button
        onClick={onAdd}
        disabled={added || isPending}
        className={`absolute top-2 right-2 p-1.5 rounded-full transition-colors ${
          added
            ? 'bg-teal-500 text-white'
            : 'bg-black/50 hover:bg-black/70 text-white'
        }`}
        title={added ? 'In your TBR' : 'Add to TBR'}
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> :
         added    ? <Check size={14} /> :
                    <BookmarkPlus size={14} />}
      </button>
    </div>
  )
}

// ── SessionCard — expandable card with book carousel ─────────────────────────
function SessionCard({ session, libraryTitles, onBookClick, onDelete, onDeleteBook }) {
  const [expanded, setExpanded] = useState(true)
  const [idx, setIdx]           = useState(0)
  const addBook                 = useAddBook()
  const [addedSet, setAddedSet] = useState(new Set())

  const books = session.books || []
  const book  = books[idx] ?? null

  function prev() { setIdx(i => (i - 1 + books.length) % books.length) }
  function next() { setIdx(i => (i + 1) % books.length) }

  // Touch swipe — horizontal only, pan-y allowed for page scroll
  const touchStartX = useRef(null)
  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) > 40) dx < 0 ? next() : prev()
  }

  async function handleAdd(book) {
    if (addedSet.has(book.title) || addBook.isPending) return
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
    setAddedSet(s => new Set([...s, book.title]))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Session header */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
              {MODE_LABELS[session.mode] || session.mode}
            </span>
            <span className="text-xs text-ink-400">{timeAgo(session.created_at)}</span>
            <span className="text-xs text-ink-400">{books.length} pick{books.length !== 1 ? 's' : ''}</span>
          </div>
          {session.query && (
            <p className="text-sm text-ink-600 dark:text-ink-400 mt-1.5 italic">"{session.query}"</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-700 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={() => onDelete(session.id)}
            className="p-1.5 rounded-lg text-ink-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Carousel body */}
      <AnimatePresence initial={false}>
        {expanded && book && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 space-y-4">

              {/* Cover carousel — touch-action pan-y keeps page scroll alive */}
              <div
                className="flex flex-col items-center gap-3"
                style={{ touchAction: 'pan-y' }}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => onBookClick(book)}
                    className="cursor-pointer"
                  >
                    <CoverCard
                      book={book}
                      inLibrary={libraryTitles.has(book.title?.toLowerCase().trim())}
                      added={addedSet.has(book.title) || libraryTitles.has(book.title?.toLowerCase().trim())}
                      isPending={addBook.isPending}
                      onAdd={e => { e.stopPropagation(); handleAdd(book) }}
                      onRemove={e => { e.stopPropagation(); onDeleteBook(session.id, books, idx); if (idx >= books.length - 1) setIdx(0) }}
                    />
                  </motion.div>
                </AnimatePresence>

                {/* Nav dots + arrows */}
                {books.length > 1 && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={prev}
                      className="p-1 text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div className="flex gap-1.5">
                      {books.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setIdx(i)}
                          className={`rounded-full transition-all ${
                            i === idx
                              ? 'w-5 h-2 bg-teal-500'
                              : 'w-2 h-2 bg-paper-300 dark:bg-ink-600 hover:bg-ink-400'
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={next}
                      className="p-1 text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Why you'll love it */}
              {book.why && (
                <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400 mb-2">
                    Why you'll love it
                  </p>
                  <p className="text-sm text-ink-700 dark:text-ink-300 leading-relaxed">{book.why}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Discover page ─────────────────────────────────────────────────────────────
export function Discover() {
  const { data: books = [], isLoading: libraryLoading } = useLibrary()
  const { data: sessions = [], isLoading: sessionsLoading } = useRecommendations()
  const saveRec   = useSaveRecommendation()
  const deleteRec = useDeleteRecommendation()
  const updateRec = useUpdateRecommendation()

  const [showFlow,     setShowFlow]     = useState(false)
  const [previewBook,  setPreviewBook]  = useState(null)

  const libraryTitles = useMemo(
    () => new Set(books.map(b => b.title?.toLowerCase().trim())),
    [books]
  )

  function handleDeleteBook(sessionId, currentBooks, bookIndex) {
    const updated = currentBooks.filter((_, i) => i !== bookIndex)
    if (updated.length === 0) {
      deleteRec.mutate(sessionId)
    } else {
      updateRec.mutate({ id: sessionId, books: updated })
    }
  }

  async function handleComplete(result) {
    setShowFlow(false)
    await saveRec.mutateAsync(result)
  }

  // Split sessions: 2 most recent shown, rest in "Older"
  const [showOlder, setShowOlder] = useState(false)
  const recentSessions = sessions.slice(0, 2)
  const olderSessions  = sessions.slice(2)

  if (libraryLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-ink-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Discover</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
            AI-powered picks built around your taste
          </p>
        </div>
        {!showFlow && (
          <button onClick={() => setShowFlow(true)} className="btn-primary gap-2 lg:hidden">
            <Sparkles size={14} /> New
          </button>
        )}
      </div>

      {/* Desktop two-column */}
      <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">

        {/* Left: query panel (desktop) */}
        <div className="hidden lg:block lg:sticky lg:top-6 space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-base font-semibold text-ink-900 dark:text-paper-50">
                Find your next read
              </h2>
            </div>
            <AnimatePresence mode="wait">
              {showFlow ? (
                <motion.div key="flow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <QueryFlow library={books} onComplete={handleComplete} />
                  <button
                    onClick={() => setShowFlow(false)}
                    className="mt-3 text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors"
                  >
                    ← cancel
                  </button>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">
                    Tell me what you're looking for and I'll find your next read from your library's taste.
                  </p>
                  <button onClick={() => setShowFlow(true)} className="w-full btn-primary gap-2 justify-center">
                    <Sparkles size={14} /> Get recommendations
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {sessions.length > 0 && (
            <p className="text-xs text-ink-400 text-center">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {sessions.reduce((n, s) => n + (s.books?.length || 0), 0)} recommendations
            </p>
          )}
        </div>

        {/* Right: session history */}
        <div className="space-y-4">
          {/* Mobile query flow */}
          <AnimatePresence>
            {showFlow && (
              <motion.div
                key="mobile-flow"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="card p-5 lg:hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif text-base font-semibold text-ink-900 dark:text-paper-50">Find your next read</h2>
                  <button onClick={() => setShowFlow(false)} className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors">
                    cancel
                  </button>
                </div>
                <QueryFlow library={books} onComplete={handleComplete} />
              </motion.div>
            )}
          </AnimatePresence>

          {sessionsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <div key={i} className="h-40 skeleton rounded-xl" />)}
            </div>
          ) : sessions.length === 0 ? (
            <div className="card p-10 text-center space-y-3">
              <Compass size={36} className="mx-auto text-ink-300" />
              <div>
                <p className="font-medium text-ink-700 dark:text-ink-300">No recommendations yet</p>
                <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
                  Use the panel to get your first AI-powered picks
                </p>
              </div>
            </div>
          ) : (
            <>
              {recentSessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  libraryTitles={libraryTitles}
                  onBookClick={setPreviewBook}
                  onDelete={id => deleteRec.mutate(id)}
                  onDeleteBook={handleDeleteBook}
                />
              ))}

              {/* Older sessions collapsible */}
              {olderSessions.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowOlder(o => !o)}
                    className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200 transition-colors py-1"
                  >
                    {showOlder ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    Older Recommendations ({olderSessions.length})
                  </button>
                  <AnimatePresence>
                    {showOlder && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mt-3 space-y-4"
                      >
                        {olderSessions.map(session => (
                          <SessionCard
                            key={session.id}
                            session={session}
                            libraryTitles={libraryTitles}
                            onBookClick={setPreviewBook}
                            onDelete={id => deleteRec.mutate(id)}
                            onDeleteBook={handleDeleteBook}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <RecDetailModal
        book={previewBook}
        open={!!previewBook}
        onClose={() => setPreviewBook(null)}
        inLibrary={previewBook ? libraryTitles.has(previewBook.title?.toLowerCase().trim()) : false}
      />
    </motion.div>
  )
}
