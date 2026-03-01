import { Loader2, RefreshCw } from 'lucide-react'
import { RecommendationCard } from './RecommendationCard'

export function DiscoverSection({ title, subtitle, icon, books, loading, error, onRefresh, libraryTitles }) {
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
        {onRefresh && !loading && (
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-ink-400">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Finding books for you...</span>
        </div>
      ) : error ? (
        <div className="py-6 text-sm text-ink-500 dark:text-ink-400">
          Couldn't load recommendations. {onRefresh && (
            <button onClick={onRefresh} className="text-teal-600 dark:text-teal-400 underline">Try again</button>
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
            />
          ))}
        </div>
      )}
    </section>
  )
}
