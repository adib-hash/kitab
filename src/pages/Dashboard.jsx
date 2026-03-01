import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, BookOpen, ArrowRight, Target, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import { useLibrary } from '../hooks/useLibrary'
import { useReadingGoal } from '../hooks/useTags'
import { BookCard } from '../components/books/BookCard'
import { ProgressBar, StatCard, EmptyState, BookCardSkeleton } from '../components/ui/index.jsx'
import { BookSearchModal } from '../components/books/BookSearch'
import { BookForm } from '../components/books/BookForm'
import { computeStats, pluralize } from '../lib/utils'
import { useUIStore } from '../store/uiStore'
import { Moon, Sun } from 'lucide-react'

export function Dashboard() {
  const { data: books = [], isLoading } = useLibrary()
  const thisYear = new Date().getFullYear()
  const { data: goal } = useReadingGoal(thisYear)
  const { darkMode, toggleDarkMode } = useUIStore()

  const [searchOpen, setSearchOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)

  const currentlyReading = books.filter(b => b.status === 'reading')
  const recentlyRead = books.filter(b => b.status === 'read' && b.date_finished)
    .sort((a,b) => b.date_finished.localeCompare(a.date_finished)).slice(0, 6)
  const stats = computeStats(books)
  const booksThisYear = stats.booksThisYear

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
              ? `${pluralize(stats.totalRead, 'book')} read · ${pluralize(books.filter(b=>b.status==='tbr').length, 'book')} on shelf`
              : 'Start building your reading life'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Dark mode toggle - mobile only (desktop has it in sidebar) */}
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
          <ProgressBar value={booksThisYear} max={goal.target} className="h-2" color="amber" />
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-2">
            {booksThisYear >= goal.target ? '🎉 Goal achieved!' : `${goal.target - booksThisYear} more to go`}
          </p>
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
            <button onClick={() => setSearchOpen(true)} className="btn-ghost mt-2 text-teal-700 dark:text-teal-400 text-sm">
              Start a book →
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

      {/* Quick stats */}
      {!isLoading && books.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg md:text-xl font-semibold text-ink-900 dark:text-paper-50">At a Glance</h2>
            <Link to="/stats" className="text-sm text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1">
              Full stats <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Books Read" value={stats.totalRead} icon="📚" />
            <StatCard label="This Year" value={booksThisYear} sub={String(thisYear)} icon="📅" />
            <StatCard label="Pages Read" value={stats.totalPages.toLocaleString()} icon="📄" />
            <StatCard label="Avg Rating" value={stats.avgRating ? `${stats.avgRating}★` : null} icon="⭐" />
          </div>
        </section>
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
          icon="📖"
          title="Your library is empty"
          description="Add your first book to get started."
          action={
            <button onClick={() => setSearchOpen(true)} className="btn-primary">
              <Plus size={16} /> Add Your First Book
            </button>
          }
        />
      )}


      <BookSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} onManual={() => { setSelectedBook(null); setFormOpen(true) }} />
      <BookForm open={formOpen} onClose={() => { setFormOpen(false); setSelectedBook(null) }} initialBook={selectedBook} />
    </div>
  )
}
