import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Compass, Trash2, ChevronDown, ChevronUp, Plus, Sparkles } from 'lucide-react'
import { useLibrary } from '../hooks/useLibrary'
import { useRecommendations, useSaveRecommendation, useDeleteRecommendation } from '../hooks/useRecommendations'
import { QueryFlow } from '../components/discover/QueryFlow'
import { RecBookCard } from '../components/discover/RecBookCard'
import { RecDetailModal } from '../components/discover/RecDetailModal'

const MODE_LABELS = {
  vibe: '✨ A specific vibe',
  author: '✍️ More from authors I like',
  fresh: '🌍 Something totally new',
  favorites: '⭐ Based on my favorites',
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SessionCard({ session, libraryTitles, onBookClick, onDelete }) {
  const [expanded, setExpanded] = useState(true)

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
            title="Delete this session"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Books */}
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
                  index={i}
                  inLibrary={libraryTitles.has(book.title?.toLowerCase().trim())}
                  onClick={onBookClick}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function Discover() {
  const { data: books = [], isLoading: libraryLoading } = useLibrary()
  const { data: sessions = [], isLoading: sessionsLoading } = useRecommendations()
  const saveRec = useSaveRecommendation()
  const deleteRec = useDeleteRecommendation()

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

  if (libraryLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-ink-400 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Discover</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
            AI-powered picks built around your taste
          </p>
        </div>
        {!showFlow && (
          <button
            onClick={() => setShowFlow(true)}
            className="btn-primary gap-2"
          >
            <Sparkles size={14} /> New
          </button>
        )}
      </div>

      {/* Query flow */}
      <AnimatePresence>
        {showFlow && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-base font-semibold text-ink-900 dark:text-paper-50">Find your next read</h2>
              <button
                onClick={() => setShowFlow(false)}
                className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition-colors"
              >
                cancel
              </button>
            </div>
            <QueryFlow
              library={books}
              onComplete={handleComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sessions */}
      {sessionsLoading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => <div key={i} className="h-40 skeleton rounded-xl" />)}
        </div>
      ) : sessions.length === 0 && !showFlow ? (
        <div className="card p-10 text-center space-y-4">
          <Compass size={36} className="mx-auto text-ink-300" />
          <div>
            <p className="font-medium text-ink-700 dark:text-ink-300">No recommendations yet</p>
            <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
              Hit "New" to get your first AI-powered picks
            </p>
          </div>
          <button onClick={() => setShowFlow(true)} className="btn-primary gap-2 mx-auto">
            <Sparkles size={14} /> Get recommendations
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              libraryTitles={libraryTitles}
              onBookClick={setPreviewBook}
              onDelete={(id) => deleteRec.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Book detail modal */}
      <RecDetailModal
        book={previewBook}
        open={!!previewBook}
        onClose={() => setPreviewBook(null)}
        inLibrary={previewBook ? libraryTitles.has(previewBook.title?.toLowerCase().trim()) : false}
      />
    </motion.div>
  )
}
