import { useState, useMemo } from 'react'
import { LayoutGrid, List, Plus, SlidersHorizontal } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLibrary } from '../hooks/useLibrary'
import { useUIStore } from '../store/uiStore'
import { BookCard } from '../components/books/BookCard'
import { BookRow } from '../components/books/BookRow'
import { LibraryFilters } from '../components/library/LibraryFilters'
import { BookSearchModal } from '../components/books/BookSearch'
import { BookForm } from '../components/books/BookForm'
import { BookCardSkeleton, EmptyState } from '../components/ui/index.jsx'

function applySort(books, sortKey) {
  const sorted = [...books]
  switch (sortKey) {
    case 'date_finished_desc': return sorted.sort((a, b) => (b.date_finished || '').localeCompare(a.date_finished || ''))
    case 'date_finished_asc': return sorted.sort((a, b) => (a.date_finished || '').localeCompare(b.date_finished || ''))
    case 'created_at_desc': return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
    case 'title_asc': return sorted.sort((a, b) => a.title.localeCompare(b.title))
    case 'author_asc': return sorted.sort((a, b) => (a.author || '').localeCompare(b.author || ''))
    case 'rating_desc': return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    case 'page_count_desc': return sorted.sort((a, b) => (b.page_count || 0) - (a.page_count || 0))
    default: return sorted
  }
}

export function Library() {
  const { data: books = [], isLoading } = useLibrary()
  const { libraryView, setLibraryView, librarySort, libraryFilters, librarySearch } = useUIStore()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)

  const filtered = useMemo(() => {
    let result = books.filter(b => b.status !== "tbr")
    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase()
      result = result.filter(b => b.title.toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q))
    }
    if (libraryFilters.status.length > 0) result = result.filter(b => libraryFilters.status.includes(b.status))
    if (libraryFilters.tags.length > 0) result = result.filter(b => libraryFilters.tags.every(tagId => b.tags?.some(t => t.id === tagId)))
    return applySort(result, librarySort)
  }, [books, librarySearch, libraryFilters, librarySort])

  const activeFilterCount = libraryFilters.status.length + libraryFilters.tags.length

  function handleSearchSelect(book) { setSelectedBook(book); setFormOpen(true) }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            {isLoading ? '...' : `${filtered.length} ${filtered.length === 1 ? 'book' : 'books'}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Filters */}
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`p-2 rounded-lg border transition-colors relative ${activeFilterCount > 0 ? 'border-teal-500 text-teal-700 bg-teal-50 dark:bg-teal-900/20' : 'border-paper-200 dark:border-ink-600 text-ink-500 hover:bg-paper-50'}`}
          >
            <SlidersHorizontal size={17} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-teal-600 text-white text-[10px] rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* View toggle */}
          <div className="flex items-center border border-paper-200 dark:border-ink-600 rounded-lg overflow-hidden">
            <button onClick={() => setLibraryView('grid')}
              className={`p-2 transition-colors ${libraryView === 'grid' ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' : 'hover:bg-paper-50 text-ink-500'}`}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setLibraryView('list')}
              className={`p-2 transition-colors ${libraryView === 'list' ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' : 'hover:bg-paper-50 text-ink-500'}`}>
              <List size={16} />
            </button>
          </div>
          {/* Add button */}
          <button onClick={() => setSearchOpen(true)} className="btn-primary">
            <Plus size={16} />
            <span className="hidden sm:inline">Add Book</span>
          </button>
        </div>
      </div>

      {/* Filters panel */}
      <AnimatePresence>
        {filtersOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="card p-4"><LibraryFilters /></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Books */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {[...Array(12)].map((_, i) => <BookCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 && librarySearch.trim() ? (
        <div className="flex flex-col items-center py-14 text-center gap-3">
          <p className="text-sm font-medium text-ink-700 dark:text-paper-200">"{librarySearch}" isn't in your library.</p>
          <button
            onClick={() => setSearchOpen(true)}
            className="btn-primary"
          >
            <Plus size={16} /> Add it to your Library
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No books found" description="Try adjusting your filters or add books to your library." />
      ) : libraryView === 'grid' ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {filtered.map((book, i) => <BookCard key={book.id} book={book} index={i} />)}
        </div>
      ) : (
        <div className="card overflow-hidden divide-y divide-paper-100 dark:divide-ink-700">
          {filtered.map(book => <BookRow key={book.id} book={book} />)}
        </div>
      )}

      <BookSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} onManual={() => { setSelectedBook(null); setFormOpen(true) }} />
      <BookForm open={formOpen} onClose={() => { setFormOpen(false); setSelectedBook(null) }} initialBook={selectedBook} />
    </div>
  )
}
