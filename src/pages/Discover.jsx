import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Compass } from 'lucide-react'
import { useLibrary } from '../hooks/useLibrary'
import { useAuthorRecs, useGenreRecs, useStretchRecs } from '../hooks/useDiscover'
import { DiscoverSection } from '../components/discover/DiscoverSection'
import { Link } from 'react-router-dom'

export function Discover() {
  const { data: books = [], isLoading: libraryLoading } = useLibrary()

  // Build set of library titles for deduplication
  const libraryTitles = useMemo(
    () => new Set(books.map(b => b.title.toLowerCase().trim())),
    [books]
  )

  const authorRecs = useAuthorRecs(libraryTitles)
  const genreRecs  = useGenreRecs(libraryTitles)
  const stretchRecs = useStretchRecs(libraryTitles)

  const readBooks = books.filter(b => b.status === 'read')

  if (libraryLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-ink-400 text-sm">Loading your library...</div>
      </div>
    )
  }

  if (readBooks.length < 2) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Discover</h1>
        <div className="card p-10 text-center space-y-3">
          <Compass size={36} className="mx-auto text-ink-300" />
          <p className="font-medium text-ink-700 dark:text-ink-300">Not enough data yet</p>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            Mark a few books as Read and Discover will find recommendations tailored to your taste.
          </p>
          <Link to="/library" className="btn-primary inline-flex mx-auto">Go to Library</Link>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-10"
    >
      {/* Header */}
      <div>
        <h1 className="page-title">Discover</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
          Recommendations built from your library — no algorithms, just books.
        </p>
      </div>

      {/* Section 1: Author recs */}
      <DiscoverSection
        title="More from authors you love"
        subtitle={
          authorRecs.recs[0]?._because
            ? `Based on books like "${authorRecs.recs[0]._because}"`
            : 'From your highest-rated authors'
        }
        icon="✍️"
        books={authorRecs.recs}
        loading={authorRecs.loading}
        error={authorRecs.error}
        onRefresh={authorRecs.refresh}
        libraryTitles={libraryTitles}
      />

      <div className="border-t border-paper-200 dark:border-ink-700" />

      {/* Section 2: Genre recs */}
      <DiscoverSection
        title="In your wheelhouse"
        subtitle={
          genreRecs.topGenres.length > 0
            ? `Based on your taste in ${genreRecs.topGenres.slice(0, 2).map(g => g.genre).join(' & ')}`
            : 'Matching your reading genres'
        }
        icon="🎯"
        books={genreRecs.recs}
        loading={genreRecs.loading}
        error={genreRecs.error}
        onRefresh={genreRecs.refresh}
        libraryTitles={libraryTitles}
      />

      <div className="border-t border-paper-200 dark:border-ink-700" />

      {/* Section 3: Stretch picks */}
      <DiscoverSection
        title="Stretch picks"
        subtitle="Award winners and hidden gems outside your usual"
        icon="✦"
        books={stretchRecs.recs}
        loading={stretchRecs.loading}
        error={stretchRecs.error}
        onRefresh={stretchRecs.refresh}
        libraryTitles={libraryTitles}
      />
    </motion.div>
  )
}
