import { useState } from 'react'
import { Download, Upload, Trash2, Edit2, Tag, Sparkles, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useLibrary, useUpdateBook } from '../hooks/useLibrary'
import { useTags, useUpdateTag, useDeleteTag } from '../hooks/useTags'
import { Button, Divider } from '../components/ui/index.jsx'
import { buildGoodreadsCSV } from '../lib/utils'
import { searchBooks } from '../lib/googleBooks'
import { BookCover } from '../components/books/BookCover'
import Papa from 'papaparse'
import { useAddBook } from '../hooks/useLibrary'
import toast from 'react-hot-toast'

function TagRow({ tag, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 group hover:bg-paper-50 dark:hover:bg-ink-800 rounded-xl transition-colors">
      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
      <span className="flex-1 text-sm text-ink-800 dark:text-ink-300">{tag.name}</span>
      <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(tag)} className="p-1.5 rounded-lg hover:bg-paper-200 dark:hover:bg-ink-700 text-ink-500">
          <Edit2 size={13} />
        </button>
        <button onClick={() => onDelete(tag.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-ink-500 hover:text-rose-600">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

function EnrichLibrary({ books }) {
  const updateBook = useUpdateBook()
  const [status, setStatus] = useState('idle') // idle | running | done
  const [results, setResults] = useState([]) // { book, found, enriched }
  const [current, setCurrent] = useState(null)
  const [progress, setProgress] = useState(0)

  const booksNeedingEnrichment = books.filter(b => !b.cover_url || !b.page_count || !b.description)

  async function runEnrichment() {
    if (booksNeedingEnrichment.length === 0) return
    setStatus('running')
    setResults([])
    const found = []

    for (let i = 0; i < booksNeedingEnrichment.length; i++) {
      const book = booksNeedingEnrichment[i]
      setCurrent(book.title)
      setProgress(Math.round((i / booksNeedingEnrichment.length) * 100))

      try {
        const query = `${book.title} ${book.author || ''}`.trim()
        const googleResults = await searchBooks(query, 3)
        const best = googleResults[0]

        if (best) {
          // Only fill in fields that are missing
          const updates = {}
          if (!book.cover_url && best.cover_url) updates.cover_url = best.cover_url
          if (!book.page_count && best.page_count) updates.page_count = best.page_count
          if (!book.description && best.description) updates.description = best.description
          if (!book.published_year && best.published_year) updates.published_year = best.published_year
          if (!book.google_books_id && best.google_books_id) updates.google_books_id = best.google_books_id
          if (!book.isbn && best.isbn) updates.isbn = best.isbn

          found.push({ book, updates, enriched: best, hasUpdates: Object.keys(updates).length > 0 })
        } else {
          found.push({ book, updates: {}, enriched: null, hasUpdates: false })
        }
      } catch {
        found.push({ book, updates: {}, enriched: null, hasUpdates: false })
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300))
    }

    setResults(found)
    setProgress(100)
    setCurrent(null)
    setStatus('done')
  }

  async function applyAll() {
    const toApply = results.filter(r => r.hasUpdates)
    let count = 0
    for (const { book, updates } of toApply) {
      try {
        await updateBook.mutateAsync({ id: book.id, updates })
        count++
      } catch {}
    }
    toast.success(`Enriched ${count} books!`)
    setStatus('idle')
    setResults([])
  }

  if (booksNeedingEnrichment.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-400">
        <CheckCircle size={16} />
        All books already have full details.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600 dark:text-ink-400">
        <span className="font-semibold text-ink-900 dark:text-paper-50">{booksNeedingEnrichment.length} books</span> are missing covers, page counts, or descriptions. This will search Google Books to fill in the gaps.
      </p>

      {status === 'idle' && (
        <Button onClick={runEnrichment}>
          <Sparkles size={14} /> Enrich {booksNeedingEnrichment.length} Books
        </Button>
      )}

      {status === 'running' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-ink-600 dark:text-ink-400">
            <Loader2 size={16} className="animate-spin text-teal-600" />
            <span>Searching for <span className="font-medium text-ink-900 dark:text-paper-50 truncate">{current}</span>...</span>
          </div>
          <div className="w-full bg-paper-200 dark:bg-ink-700 rounded-full h-2">
            <div className="bg-teal-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-ink-400 dark:text-ink-500">{progress}% complete</p>
        </div>
      )}

      {status === 'done' && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink-800 dark:text-ink-300">
              Found data for {results.filter(r => r.hasUpdates).length} of {results.length} books
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setStatus('idle'); setResults([]) }}>Cancel</Button>
              <Button onClick={applyAll} disabled={results.filter(r => r.hasUpdates).length === 0}>
                Apply All Updates
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {results.map(({ book, enriched, updates, hasUpdates }) => (
              <div key={book.id} className="flex items-center gap-3 p-3 rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800">
                {enriched?.cover_url ? (
                  <img src={enriched.cover_url} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0" />
                ) : (
                  <div className="w-8 h-12 bg-paper-200 dark:bg-ink-700 rounded flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-900 dark:text-paper-50 truncate">{book.title}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400 truncate">{book.author}</p>
                  {hasUpdates && (
                    <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
                      Adding: {Object.keys(updates).join(', ').replace(/_/g, ' ')}
                    </p>
                  )}
                </div>
                {hasUpdates ? (
                  <CheckCircle size={16} className="text-teal-600 flex-shrink-0" />
                ) : (
                  <XCircle size={16} className="text-ink-300 dark:text-ink-600 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Settings() {
  const { data: books = [] } = useLibrary()
  const { data: tags = [] } = useTags()
  const addBook = useAddBook()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const [editingTag, setEditingTag] = useState(null)
  const [editName, setEditName] = useState('')
  const [importing, setImporting] = useState(false)

  function exportCSV() {
    const rows = buildGoodreadsCSV(books, tags)
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kitab-export.csv'; a.click()
    toast.success('Library exported!')
  }

  function exportJSON() {
    const data = JSON.stringify(books.map(b => ({ ...b, tags: b.tags?.map(t => t.name) || [] })), null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kitab-library.json'; a.click()
    toast.success('Library exported as JSON!')
  }

  function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const rows = results.data.filter(r => r.Title)
        let added = 0
        for (const row of rows) {
          try {
            const status = row['Exclusive Shelf'] === 'read' ? 'read'
              : row['Exclusive Shelf'] === 'to-read' ? 'tbr'
              : row['Exclusive Shelf'] === 'currently-reading' ? 'reading'
              : 'tbr'
            await addBook.mutateAsync({
              book: {
                title: row.Title || '',
                author: row.Author || '',
                isbn: row.ISBN?.replace(/[="]/g, '') || null,
                rating: parseFloat(row['My Rating']) || null,
                review: row['My Review'] || null,
                date_finished: row['Date Read'] || null,
                status,
                published_year: parseInt(row['Year Published']) || null,
                page_count: parseInt(row['Number of Pages']) || null,
              },
              tagIds: []
            })
            added++
          } catch {}
        }
        toast.success(`Imported ${added} books from Goodreads!`)
        setImporting(false)
      }
    })
  }

  function startEditTag(tag) { setEditingTag(tag); setEditName(tag.name) }
  async function saveTag() {
    if (!editName.trim()) return
    await updateTag.mutateAsync({ id: editingTag.id, name: editName })
    setEditingTag(null); setEditName('')
    toast.success('Tag updated')
  }
  async function handleDeleteTag(id) {
    if (!confirm('Delete this tag? It will be removed from all books.')) return
    await deleteTag.mutateAsync(id)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="page-title">Settings</h1>

      {/* Enrich Library */}
      <div className="card p-6 space-y-4">
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
          <Sparkles size={18} className="text-teal-600" /> Enrich Library
        </h2>
        <EnrichLibrary books={books} />
      </div>

      {/* Export */}
      <div className="card p-6 space-y-4">
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
          <Download size={18} className="text-teal-600" /> Export Your Library
        </h2>
        <p className="text-sm text-ink-600 dark:text-ink-400">Download a copy of all your books, ratings, and reviews.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={exportCSV}>
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="secondary" onClick={exportJSON}>
            <Download size={14} /> Export JSON
          </Button>
        </div>
      </div>

      {/* Import */}
      <div className="card p-6 space-y-4">
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
          <Upload size={18} className="text-teal-600" /> Import from Goodreads
        </h2>
        <p className="text-sm text-ink-600 dark:text-ink-400">
          Export your library from Goodreads (My Books → Import/Export) then upload it here.
        </p>
        <label className={`btn-secondary cursor-pointer ${importing ? 'opacity-50' : ''}`}>
          <Upload size={14} />
          {importing ? 'Importing...' : 'Choose CSV file'}
          <input type="file" accept=".csv" onChange={handleImport} className="hidden" disabled={importing} />
        </label>
      </div>

      {/* Tag management */}
      <div className="card p-6 space-y-4">
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
          <Tag size={18} className="text-teal-600" /> Manage Tags
        </h2>
        {tags.length === 0 ? (
          <p className="text-sm text-ink-500 dark:text-ink-400">No tags yet. Tags are created when you add them to books.</p>
        ) : (
          <div className="divide-y divide-paper-100 dark:divide-ink-700">
            {tags.map(tag => (
              editingTag?.id === tag.id ? (
                <div key={tag.id} className="flex items-center gap-3 py-2.5 px-4">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveTag()}
                    className="input flex-1"
                    autoFocus
                  />
                  <Button size="sm" onClick={saveTag}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingTag(null)}>Cancel</Button>
                </div>
              ) : (
                <TagRow key={tag.id} tag={tag} onEdit={startEditTag} onDelete={handleDeleteTag} />
              )
            ))}
          </div>
        )}
      </div>

      {/* Library stats */}
      <div className="card p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-4">Library Overview</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-500 dark:text-ink-400">Total books</span>
            <span className="font-medium text-ink-900 dark:text-paper-50">{books.length}</span>
          </div>
          {['read','reading','tbr','dnf'].map(s => (
            <div key={s} className="flex justify-between">
              <span className="text-ink-500 dark:text-ink-400 capitalize">{s === 'tbr' ? 'To be read' : s === 'dnf' ? 'Did not finish' : s}</span>
              <span className="font-medium text-ink-900 dark:text-paper-50">{books.filter(b=>b.status===s).length}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
