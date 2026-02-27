import { SlidersHorizontal, Search, X } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useTags } from '../../hooks/useTags'
import { clsx } from 'clsx'

const SORT_OPTIONS = [
  { value: 'date_finished_desc', label: 'Date Read (newest)' },
  { value: 'date_finished_asc', label: 'Date Read (oldest)' },
  { value: 'created_at_desc', label: 'Date Added' },
  { value: 'title_asc', label: 'Title (A–Z)' },
  { value: 'author_asc', label: 'Author (A–Z)' },
  { value: 'rating_desc', label: 'Rating (highest)' },
  { value: 'page_count_desc', label: 'Pages (most)' },
]

const STATUS_OPTIONS = [
  { value: 'read', label: 'Read' },
  { value: 'reading', label: 'Currently Reading' },
  { value: 'tbr', label: 'To Be Read' },
  { value: 'dnf', label: 'Did Not Finish' },
]

export function LibraryFilters() {
  const { librarySort, libraryFilters, librarySearch, setLibrarySort, setLibraryFilters, setLibrarySearch, clearLibraryFilters } = useUIStore()
  const { data: tags = [] } = useTags()

  const hasActiveFilters = libraryFilters.status.length > 0 || libraryFilters.tags.length > 0 || libraryFilters.ratingMin

  function toggleStatus(status) {
    const current = libraryFilters.status
    setLibraryFilters({
      status: current.includes(status) ? current.filter(s => s !== status) : [...current, status]
    })
  }

  function toggleTag(tagId) {
    const current = libraryFilters.tags
    setLibraryFilters({
      tags: current.includes(tagId) ? current.filter(t => t !== tagId) : [...current, tagId]
    })
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={librarySearch}
          onChange={e => setLibrarySearch(e.target.value)}
          placeholder="Search your library..."
          className="input pl-9"
        />
        {librarySearch && (
          <button onClick={() => setLibrarySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Sort */}
      <div>
        <label className="section-label block mb-1.5">Sort by</label>
        <select value={librarySort} onChange={e => setLibrarySort(e.target.value)} className="input">
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Status filters */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="section-label">Status</label>
          {hasActiveFilters && (
            <button onClick={clearLibraryFilters} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
              Clear all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => toggleStatus(opt.value)}
              className={clsx(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                libraryFilters.status.includes(opt.value)
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white dark:bg-ink-800 border-paper-200 dark:border-ink-600 text-ink-600 dark:text-ink-400 hover:border-teal-400'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filters */}
      {tags.length > 0 && (
        <div>
          <label className="section-label block mb-1.5">Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={clsx(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                  libraryFilters.tags.includes(tag.id)
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white dark:bg-ink-800 border-paper-200 dark:border-ink-600 text-ink-600 dark:text-ink-400 hover:border-teal-400'
                )}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
