import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Trash2, ChevronDown, ChevronUp, RefreshCw,
         Sparkles, Loader2 } from 'lucide-react'
import { useLibrary } from '../hooks/useLibrary'
import { useTags } from '../hooks/useTags'
import { useRecommendations, useSaveRecommendation, useDeleteRecommendation, useUpdateRecommendation } from '../hooks/useRecommendations'
import { QueryFlow, generateRecommendations } from '../components/discover/QueryFlow'
import { RecDetailModal } from '../components/discover/RecDetailModal'
import { timeAgo } from '../lib/utils'

// ── CoverThumb — small cover thumbnail for the horizontal strip ─────────────
function CoverThumb({ book, inLibrary, onClick }) {
  const [imgError, setImgError] = useState(false)
  const titleColor = `hsl(${(book.title?.charCodeAt(0) ?? 65) * 37 % 360}, 35%, 28%)`

  return (
    <button
      onClick={onClick}
      className="relative rounded-lg overflow-hidden shadow-md w-full book-cover focus:outline-none focus:ring-2 focus:ring-teal-500"
    >
      {book.cover_url && !imgError ? (
        <img
          src={book.cover_url}
          alt={book.title}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-1 px-2 text-center"
          style={{ backgroundColor: titleColor }}
        >
          <span className="font-serif text-lg font-bold text-white/80 leading-none">
            {book.title?.slice(0, 2).toUpperCase()}
          </span>
          <span className="font-serif text-[10px] font-semibold text-white/70 leading-snug line-clamp-2">
            {book.title}
          </span>
        </div>
      )}

      {/* Genre badge */}
      {book.genre_hint && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent pt-4 pb-1.5 px-1.5">
          <span className="text-[9px] text-white/90 font-medium leading-none">{book.genre_hint}</span>
        </div>
      )}

      {/* In-library indicator */}
      {inLibrary && (
        <div className="absolute top-1.5 right-1.5 w-3 h-3 rounded-full bg-teal-500 border border-white/50" />
      )}
    </button>
  )
}

// ── SessionCard — compact card with horizontal book strip ───────────────────
function SessionCard({ session, libraryTitles, onBookClick, onDelete, onDeleteBook, onRegenerate, isRegenerating }) {
  const books = session.books || []

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Session header */}
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="flex-1 min-w-0">
          {session.query && (
            <p className="text-sm text-ink-700 dark:text-ink-300 font-medium">"{session.query}"</p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-ink-400">{timeAgo(session.created_at)}</span>
            <span className="text-xs text-ink-400">{books.length} pick{books.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="p-1.5 rounded-lg text-ink-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-40"
            title="Get fresh recommendations"
          >
            {isRegenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          <button
            onClick={() => onDelete(session.id)}
            className="p-1.5 rounded-lg text-ink-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            title="Delete session"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Horizontal cover strip */}
      <div className="px-4 pb-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide" style={{ touchAction: 'pan-y' }}>
          {books.map((book, i) => (
            <div key={i} className="flex-shrink-0 w-24">
              <CoverThumb
                book={book}
                inLibrary={libraryTitles.has(book.title?.toLowerCase().trim())}
                onClick={() => onBookClick(book)}
              />
              <p className="text-[11px] text-ink-600 dark:text-ink-400 mt-1.5 leading-snug line-clamp-2 font-medium">
                {book.title}
              </p>
              <p className="text-[10px] text-ink-400 leading-snug line-clamp-1">{book.author}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// ── Loading skeleton for new session ────────────────────────────────────────
function SessionSkeleton() {
  return (
    <div className="card overflow-hidden p-4 space-y-3">
      <div className="h-4 w-48 skeleton rounded" />
      <div className="flex gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-24">
            <div className="skeleton rounded-lg book-cover w-full" />
            <div className="h-3 w-20 skeleton rounded mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Discover page ─────────────────────────────────────────────────────────────
export function Discover() {
  const { data: books = [], isLoading: libraryLoading } = useLibrary()
  const { data: tags = [] } = useTags()
  const { data: sessions = [], isLoading: sessionsLoading } = useRecommendations()
  const saveRec   = useSaveRecommendation()
  const deleteRec = useDeleteRecommendation()
  const updateRec = useUpdateRecommendation()

  const [showFlow,        setShowFlow]        = useState(false)
  const [previewBook,     setPreviewBook]     = useState(null)
  const [regeneratingId,  setRegeneratingId]  = useState(null)
  const [isGenerating,    setIsGenerating]    = useState(false)

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
    setIsGenerating(true)
    try {
      await saveRec.mutateAsync(result)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleRegenerate(session) {
    setRegeneratingId(session.id)
    try {
      const newBooks = await generateRecommendations(
        session.query || 'Surprise me',
        books,
        sessions,
        tags
      )
      await saveRec.mutateAsync({
        mode: 'prompt',
        query: session.query || 'Surprise me',
        books: newBooks,
      })
    } catch (err) {
      console.error('Regenerate failed:', err)
    } finally {
      setRegeneratingId(null)
    }
  }

  // Split sessions: 3 most recent shown, rest in "Older"
  const [showOlder, setShowOlder] = useState(false)
  const recentSessions = sessions.slice(0, 3)
  const olderSessions  = sessions.slice(3)

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

        {/* Left: query panel (desktop — always visible) */}
        <div className="hidden lg:block lg:sticky lg:top-6 space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-base font-semibold text-ink-900 dark:text-paper-50">
                Find your next read
              </h2>
            </div>
            <QueryFlow
              library={books}
              sessions={sessions}
              tags={tags}
              onComplete={handleComplete}
            />
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
                <QueryFlow
                  library={books}
                  sessions={sessions}
                  tags={tags}
                  onComplete={handleComplete}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading skeleton when generating */}
          {isGenerating && <SessionSkeleton />}

          {sessionsLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => <div key={i} className="h-40 skeleton rounded-xl" />)}
            </div>
          ) : sessions.length === 0 && !isGenerating ? (
            <div className="card p-10 text-center space-y-3">
              <Compass size={36} className="mx-auto text-ink-300" />
              <div>
                <p className="font-medium text-ink-700 dark:text-ink-300">No recommendations yet</p>
                <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
                  Tap "New" to get your first AI-powered picks
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
                  onRegenerate={() => handleRegenerate(session)}
                  isRegenerating={regeneratingId === session.id}
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
                            onRegenerate={() => handleRegenerate(session)}
                            isRegenerating={regeneratingId === session.id}
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
