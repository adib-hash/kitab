import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { RecommendationCard } from './RecommendationCard'
import { BookPreviewModal } from './BookPreviewModal'

export function DiscoverSection({ title, subtitle, icon, books, loading, error, onRefresh, libraryTitles }) {
  const [refreshing, setRefreshing] = useState(false)
  const [previewBook, setPreviewBook] = useState(null)

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try { await onRefresh?.() } finally { setRefreshing(false) }
  }

  const isLoading = loading || refreshing

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50">{title}</h2>
          </div>
          {subtitle && (
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 ml-7">{subtitle}</p>
          )}
        </div>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors disabled:opacity-40"
            title="Load different recommendations"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-ink-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Finding books for you...</span>
        </div>
      ) : error ? (
        <div className="py-6 text-sm text-ink-500 dark:text-ink-400">
          Couldn't load recommendations.{' '}
          {onRefresh && (
            <button onClick={handleRefresh} className="text-teal-600 dark:text-teal-400 underline">
              Try again
            </button>
          )}
        </div>
      ) : books.length === 0 ? (
        <div className="py-6 text-sm text-ink-500 dark:text-ink-400">
          No recommendations found yet — keep reading!
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {books.map((book, i) => (
            <RecommendationCard
              key={book.ol_key || book.google_books_id || `${book.title}-${i}`}
              book={book}
              index={i}
              inLibrary={libraryTitles.has(book.title.toLowerCase().trim())}
              onClick={setPreviewBook}
            />
          ))}
        </div>
      )}

      {/* Book preview modal */}
      <BookPreviewModal
        book={previewBook}
        open={!!previewBook}
        onClose={() => setPreviewBook(null)}
      />
    </section>
  )
}
