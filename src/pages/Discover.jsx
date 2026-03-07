import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Trash2, ChevronDown, ChevronUp, Sparkles, Clock } from 'lucide-react'
import { useLibrary } from '../hooks/useLibrary'
import { useRecommendations, useSaveRecommendation, useDeleteRecommendation, useUpdateRecommendation } from '../hooks/useRecommendations'
import { QueryFlow } from '../components/discover/QueryFlow'
import { RecBookCard } from '../components/discover/RecBookCard'
import { RecDetailModal } from '../components/discover/RecDetailModal'

const MODE_LABELS = {
  vibe: '✨ A specific vibe',
  author: '✍️ More from authors I like',
  fresh: '🌍 Something totally new',
  favorites: '⭐ Based on my favorites',
}

const RECENT_MS = 48 * 60 * 60 * 1000 // 48 hours

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SessionCard({ session, libraryTitles, onBookClick, onDelete, onDeleteBook }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
              {MODE_LABELS[session.mode] || session.mode}
            </span>
            <span className="text-xs text-ink-400">{timeAgo(session.created_at)}</span>
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

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              {(session.books || []).map((book, i) => (
                <RecBookCard
                  key={`${book.title}-${i}`}
                  book={book}
                  inLibrary={libraryTitles.has(book.title?.toLowerCase().trim())}
                  onClick={() => onBookClick(book)}
                  onDelete={() => onDeleteBook(session.id, session.books, i)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function OlderSection({ sessions, libraryTitles, onBookClick, onDelete, onDeleteBook }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full py-2 px-1 text-left group"
      >
        <Clock size={13} className="text-ink-400 flex-shrink-0" />
        <span className="section-label flex-1">
          Older recommendations ({sessions.length})
        </span>
        <ChevronDown
          size={14}
          className={`text-ink-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-2">
              {sessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  libraryTitles={libraryTitles}
                  onBookClick={onBookClick}
                  onDelete={onDelete}
                  onDeleteBook={onDeleteBook}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Discover() {
  const { data: books = [], isLoading: libraryLoading } = useLibrary()
  const { data: sessions = [], isLoading: sessionsLoading } = useRecommendations()
  const saveRec = useSaveRecommendation()
  const deleteRec = useDeleteRecommendation()
  const updateRec = useUpdateRecommendation()

  function handleDeleteBook(sessionId, currentBooks, bookIndex) {
    const updated = currentBooks.filter((_, i) => i !== bookIndex)
    if (updated.length === 0) {
      deleteRec.mutate(sessionId)
    } else {
      updateRec.mutate({ id: sessionId, books: updated })
    }
  }

  const [showFlow, setShowFlow] = useState(false)
  const [previewBook, setPreviewBook] = useState(null)

  const libraryTitles = useMemo(
    () => new Set(books.map(b => b.title?.toLowerCase().trim())),
    [books]
  )

  async function handleComplete(result) {
    setShowFlow(false)
    await saveRec.mutateAsync(result)
  }

  // Split sessions: recent (< 48h) vs older
  const now = Date.now()
  const recentSessions = sessions.filter(s => now - new Date(s.created_at).getTime() < RECENT_MS)
  const olderSessions = sessions.filter(s => now - new Date(s.created_at).getTime() >= RECENT_MS)

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

      {/* Desktop two-column layout */}
      <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-8 lg:items-start space-y-6 lg:space-y-0">

        {/* Left panel – desktop only */}
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
                    className="hidden lg:block mt-3 text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors"
                  >
                    ← cancel
                  </button>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">
                    Tell me what you're looking for and I'll find your next read.
                  </p>
                  <button onClick={() => setShowFlow(true)} className="w-full btn-primary gap-2 justify-center">
                    <Sparkles size={14} /> Get recommendations
                  </button>
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

        {/* Right column: sessions */}
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
              {[...Array(2)].map((_, i) => <div key={i} className="h-24 skeleton rounded-xl" />)}
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
              {/* Recent sessions */}
              {recentSessions.length > 0 && (
                <div className="space-y-3">
                  {recentSessions.map(session => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      libraryTitles={libraryTitles}
                      onBookClick={setPreviewBook}
                      onDelete={(id) => deleteRec.mutate(id)}
                      onDeleteBook={handleDeleteBook}
                    />
                  ))}
                </div>
              )}

              {/* Older sessions - collapsible */}
              {olderSessions.length > 0 && (
                <div className={recentSessions.length > 0 ? 'border-t border-paper-200 dark:border-ink-700 pt-3' : ''}>
                  <OlderSection
                    sessions={olderSessions}
                    libraryTitles={libraryTitles}
                    onBookClick={setPreviewBook}
                    onDelete={(id) => deleteRec.mutate(id)}
                    onDeleteBook={handleDeleteBook}
                  />
                </div>
              )}

              {/* Edge case: no recent, but older exists and that's it */}
              {recentSessions.length === 0 && olderSessions.length === 0 && (
                <div className="card p-10 text-center">
                  <Compass size={36} className="mx-auto text-ink-300 mb-3" />
                  <p className="font-medium text-ink-700 dark:text-ink-300">No recommendations yet</p>
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
