import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, BookOpen, ArrowRight, Target, Settings, Star, FileText, Bookmark, CheckCircle, Moon, Sun, RefreshCw, Zap, AlertCircle, Loader2, CalendarHeart } from 'lucide-react'
import { motion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { useLibrary } from '../hooks/useLibrary'
import { useReadingGoal } from '../hooks/useTags'
import { useAllHighlights } from '../hooks/useHighlights'
import { useKindleSyncFlow } from '../hooks/useKindleSyncFlow'
import { useKindleAutoSync } from '../hooks/useKindleAutoSync'
import { BookCard } from '../components/books/BookCard'
import { ProgressBar, StatCard, EmptyState, BookCardSkeleton } from '../components/ui/index.jsx'
import { BookSearchModal } from '../components/books/BookSearch'
import { BookForm } from '../components/books/BookForm'
import { computeStats, pluralize } from '../lib/utils'
import { useUIStore } from '../store/uiStore'
import { syncWidgetData } from '../lib/widgetBridge'
import { rescheduleAllNotifications } from '../lib/notifications'

export function Dashboard() {
  const { data: books = [], isLoading } = useLibrary()
  const thisYear = new Date().getFullYear()
  const { data: goal } = useReadingGoal(thisYear)
  const { darkMode, toggleDarkMode } = useUIStore()
  const { data: allHighlights = [] } = useAllHighlights()

  const [searchOpen, setSearchOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [highlightExpanded, setHighlightExpanded] = useState(false)

  // Date-seeded highlight — same highlight all day, changes each day
  useEffect(() => {
    if (allHighlights.length > 0) {
      const seed = [...new Date().toISOString().slice(0, 10)].reduce((a, c) => a + c.charCodeAt(0), 0)
      setHighlightIdx(seed % allHighlights.length)
    }
  }, [allHighlights.length])

  const highlight = allHighlights.length > 0
    ? allHighlights[highlightIdx % allHighlights.length]
    : null

  // Sync data to iOS widgets and reschedule notifications
  useEffect(() => {
    if (books.length > 0) {
      syncWidgetData({ books, goal, highlights: allHighlights })
      rescheduleAllNotifications({ books, highlights: allHighlights, goal })
    }
  }, [books, goal, allHighlights])

  function shuffleHighlight() {
    if (allHighlights.length <= 1) return
    setHighlightExpanded(false)
    setHighlightIdx(i => {
      let next = Math.floor(Math.random() * allHighlights.length)
      while (next === i) next = Math.floor(Math.random() * allHighlights.length)
      return next
    })
  }

  // iOS Kindle sync state
  const isNative = Capacitor.isNativePlatform()
  const { syncing, progress, handleSync, kindleSync } = useKindleSyncFlow()
  // Invisible daily sync — drains anything the nightly background task scraped,
  // and scrapes in an offscreen webview if iOS skipped the night.
  useKindleAutoSync({ books, ready: !isLoading })
  const lastSyncRaw = localStorage.getItem('kindle_last_sync')
  const daysSinceSync = lastSyncRaw
    ? Math.floor((Date.now() - new Date(lastSyncRaw).getTime()) / (1000 * 60 * 60 * 24))
    : null
  const showSyncReminder = isNative && (daysSinceSync === null || daysSinceSync >= 7)

  const currentlyReading = useMemo(() => books.filter(b => b.status === 'reading'), [books])
  const recentlyRead = useMemo(() =>
    books.filter(b => b.status === 'read' && b.date_finished)
      .sort((a,b) => b.date_finished.localeCompare(a.date_finished)).slice(0, 6),
    [books]
  )
  const yearBooks = useMemo(() =>
    books.filter(b =>
      b.status === 'read' && b.date_finished &&
      parseInt(b.date_finished.slice(0, 4)) === thisYear
    ),
    [books, thisYear]
  )
  const yearStats = useMemo(() => computeStats(yearBooks), [yearBooks])
  const booksThisYear = yearStats.totalRead

  // Anniversary books — finished on the same MM-DD in a prior year
  const anniversaryBooks = useMemo(() => {
    const todayMMDD = new Date().toISOString().slice(5, 10)
    return books.filter(b =>
      b.status === 'read' &&
      b.date_finished &&
      b.date_finished.slice(5, 10) === todayMMDD &&
      parseInt(b.date_finished.slice(0, 4)) < thisYear
    )
  }, [books, thisYear])

  function handleSearchSelect(book) {
    setSelectedBook(book)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold text-ink-900 dark:text-paper-50">
            Your Library
          </h1>
          <p className="text-ink-500 dark:text-ink-400 text-xs md:text-sm mt-0.5">
            {books.length > 0
              ? `${pluralize(books.filter(b=>b.status==='read').length, 'book')} read · ${pluralize(books.filter(b=>b.status==='tbr').length, 'book')} on shelf`
              : 'Start building your reading life'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleDarkMode} className="md:hidden p-2 rounded-xl text-ink-500 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <Link to="/settings" className="md:hidden p-2 rounded-xl text-ink-500 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors">
            <Settings size={20} />
          </Link>
          <button onClick={() => setSearchOpen(true)} className="btn-primary">
            <Plus size={16} /> <span className="hidden sm:inline">Add Book</span><span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Reading goal */}
      {goal && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={15} className="text-amber-600" />
              <p className="font-medium text-sm text-ink-800 dark:text-ink-300">{thisYear} Reading Goal</p>
            </div>
            <p className="text-sm font-semibold text-ink-900 dark:text-paper-50">
              {booksThisYear} / {goal.target}
            </p>
          </div>
          <ProgressBar value={booksThisYear} max={goal.target} className="h-2" gradient />
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-2">
            {booksThisYear >= goal.target
              ? <span className="flex items-center gap-1"><CheckCircle size={13} className="text-teal-600" /> Goal achieved!</span>
              : `${goal.target - booksThisYear} more to go`}
          </p>
        </motion.div>
      )}

      {/* Highlight of the day */}
      {highlight && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-6 relative overflow-hidden"
        >
          {/* Decorative quote mark */}
          <div
            className="absolute -top-3 left-3 font-serif leading-none select-none pointer-events-none text-teal-500 opacity-10"
            style={{ fontSize: '6rem' }}
          >&ldquo;</div>

          <div className="relative space-y-4">
            <div>
              <p
                className="font-serif leading-relaxed italic text-ink-800 dark:text-paper-100"
                style={{
                  fontSize: '0.9375rem',
                  lineHeight: '1.7',
                  ...(!highlightExpanded ? {
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  } : {}),
                }}
              >
                {highlight.text}
              </p>
              {highlight.text && highlight.text.length > 150 && (
                <button
                  onClick={() => setHighlightExpanded(e => !e)}
                  className="text-xs font-medium mt-2 transition-colors text-teal-700 dark:text-teal-500"
                >
                  {highlightExpanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>

            <div className="flex items-end justify-between gap-3 pt-1 border-t border-paper-100 dark:border-ink-700">
              <Link to={`/library/${highlight.book_id}`} className="min-w-0 group">
                <p className="text-sm font-semibold text-teal-700 dark:text-teal-400 group-hover:underline truncate">
                  {highlight.books?.title}
                </p>
                {highlight.books?.author && (
                  <p className="text-xs mt-0.5 text-ink-400 dark:text-ink-500">
                    {highlight.books.author}
                  </p>
                )}
              </Link>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Link to="/highlights" className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium px-1">
                  View all
                </Link>
                <button
                  onClick={shuffleHighlight}
                  title="Show another highlight"
                  className="p-2 rounded-xl transition-colors text-ink-300 dark:text-ink-600 hover:text-teal-500"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Currently Reading */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-lg md:text-xl font-semibold text-ink-900 dark:text-paper-50">Currently Reading</h2>
          <Link to="/library?status=reading" className="text-sm text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1">
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {[...Array(3)].map((_, i) => <BookCardSkeleton key={i} />)}
          </div>
        ) : currentlyReading.length === 0 ? (
          <div className="card p-6 text-center">
            <BookOpen size={28} className="mx-auto mb-2 text-ink-300" />
            <p className="text-sm text-ink-500 dark:text-ink-400">You're not reading anything right now.</p>
            <button onClick={() => setSearchOpen(true)} className="btn-ghost mt-2 text-teal-700 dark:text-teal-400 text-sm flex items-center gap-1 mx-auto">
              Start a book <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {currentlyReading.map((book, i) => (
              <div key={book.id} className="space-y-2">
                <BookCard book={book} index={i} />
                {book.page_count && book.current_page && (
                  <div>
                    <ProgressBar value={book.current_page} max={book.page_count} className="h-1" />
                    <p className="text-[10px] text-ink-400 dark:text-ink-500 mt-1">p.{book.current_page}/{book.page_count}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quick stats — current year only */}
      {!isLoading && books.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg md:text-xl font-semibold text-ink-900 dark:text-paper-50">At a Glance</h2>
              <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">{thisYear}</span>
            </div>
            <Link to="/stats" className="text-sm text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1">
              Full stats <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Books Read" value={yearStats.totalRead} icon={<BookOpen size={18} />} sub={String(thisYear)} />
            <StatCard label="Pages Read" value={yearStats.totalPages.toLocaleString()} icon={<FileText size={18} />} sub={String(thisYear)} />
            <StatCard label="Avg Rating" value={yearStats.avgRating ? `${yearStats.avgRating}★` : null} icon={<Star size={18} />} sub={String(thisYear)} />
            <StatCard label="On TBR" value={books.filter(b=>b.status==='tbr').length} icon={<Bookmark size={18} />} sub="total" />
          </div>
        </section>
      )}

      {/* Anniversary card */}
      {anniversaryBooks.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarHeart size={16} className="text-rose-400 flex-shrink-0" />
            <h2 className="font-serif text-base font-semibold text-ink-900 dark:text-paper-50">On this day</h2>
          </div>
          <div className="space-y-2">
            {anniversaryBooks.map(b => (
              <Link key={b.id} to={`/library/${b.id}`} className="flex items-center gap-3 group">
                <p className="text-sm text-ink-800 dark:text-ink-300 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors truncate flex-1">
                  {b.title}
                </p>
                <span className="text-xs text-ink-400 dark:text-ink-500 flex-shrink-0">
                  {thisYear - parseInt(b.date_finished.slice(0, 4))}y ago
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* Recently Read */}
      {recentlyRead.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg md:text-xl font-semibold text-ink-900 dark:text-paper-50">Recently Read</h2>
            <Link to="/library" className="text-sm text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1">
              Library <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {recentlyRead.map((book, i) => <BookCard key={book.id} book={book} index={i} />)}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && books.length === 0 && (
        <EmptyState
          icon={<BookOpen size={48} />}
          title="Your library is empty"
          description="Add your first book to get started."
          action={
            <button onClick={() => setSearchOpen(true)} className="btn-primary">
              <Plus size={16} /> Add Your First Book
            </button>
          }
        />
      )}

      {/* Kindle Highlights sync — iOS only */}
      {isNative && (
        <section className="space-y-3 pb-2">
          <h2 className="font-serif text-lg md:text-xl font-semibold text-ink-900 dark:text-paper-50">
            Kindle Highlights
          </h2>

          {showSyncReminder && (
            <div className="flex items-start gap-3 p-4 rounded-xl border bg-amber-50 dark:bg-amber-800/15 border-amber-100 dark:border-amber-800/40">
              <AlertCircle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-400">
                {daysSinceSync === null
                  ? "You haven't synced your Kindle highlights yet."
                  : "It's been a week since your last Kindle sync. Sync now?"}
              </p>
            </div>
          )}

          <div className="card p-4 space-y-3">
            {lastSyncRaw && !showSyncReminder && (
              <p className="text-xs text-ink-400 dark:text-ink-600">
                Synced automatically · last {daysSinceSync === 0 ? 'today' : daysSinceSync === 1 ? 'yesterday' : `${daysSinceSync} days ago`}
              </p>
            )}
            <button
              onClick={handleSync}
              disabled={syncing || kindleSync.isPending}
              className={`btn-secondary w-full ${(syncing || kindleSync.isPending) ? 'opacity-50' : ''}`}
            >
              {syncing || kindleSync.isPending
                ? <Loader2 size={14} className="animate-spin" />
                : <Zap size={14} />
              }
              {syncing
                ? (progress || 'Syncing…')
                : kindleSync.isPending
                ? 'Importing…'
                : 'Sync Kindle Highlights'}
            </button>
            {kindleSync.isSuccess && (
              <p className="text-xs text-teal-600 dark:text-teal-400 text-center">
                {kindleSync.data?.totalHighlights ?? 0} new highlight{kindleSync.data?.totalHighlights !== 1 ? 's' : ''} imported
              </p>
            )}
          </div>
        </section>
      )}

      <BookSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} onManual={() => { setSelectedBook(null); setFormOpen(true) }} />
      <BookForm open={formOpen} onClose={() => { setFormOpen(false); setSelectedBook(null) }} initialBook={selectedBook} />
    </div>
  )
}
