import { useState, useEffect, useCallback } from 'react'
import { Download, Upload, Trash2, Edit2, Tag, Sparkles, CheckCircle, XCircle, Loader2, BookOpen, Zap, AlertCircle, LogOut, ChevronLeft } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { useLibrary, useUpdateBook } from '../hooks/useLibrary'
import { useTags, useUpdateTag, useDeleteTag } from '../hooks/useTags'
import { Button, Divider } from '../components/ui/index.jsx'
import { useUIStore } from '../store/uiStore'
import { buildGoodreadsCSV } from '../lib/utils'
import { searchBooks } from '../lib/googleBooks'
import { findCoverUrl } from '../lib/openLibrary'
import { BookCover } from '../components/books/BookCover'
import Papa from 'papaparse'
import { useAddBook } from '../hooks/useLibrary'
import { useClippingsImport, useAllUnmatched, useAssignHighlights, useKindleSync, KINDLE_SCRAPER_JS } from '../hooks/useHighlights'
import { supabase } from '../lib/supabase'
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

        const updates = {}
        let enriched = null

        if (best) {
          enriched = best
          // Only fill in fields that are missing
          if (!book.cover_url && best.cover_url) updates.cover_url = best.cover_url
          if (!book.page_count && best.page_count) updates.page_count = best.page_count
          if (!book.description && best.description) updates.description = best.description
          if (!book.published_year && best.published_year) updates.published_year = best.published_year
          if (!book.google_books_id && best.google_books_id) updates.google_books_id = best.google_books_id
          if (!book.isbn && best.isbn) updates.isbn = best.isbn
        }

        // If cover still missing after Google Books, try Open Library
        if (!book.cover_url && !updates.cover_url) {
          const olCover = await findCoverUrl(book.title, book.author, book.isbn)
          if (olCover) updates.cover_url = olCover
        }

        const hasUpdates = Object.keys(updates).length > 0
        found.push({ book, updates, enriched, hasUpdates, selected: hasUpdates })
      } catch {
        found.push({ book, updates: {}, enriched: null, hasUpdates: false, selected: false })
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 300))
    }

    setResults(found)
    setProgress(100)
    setCurrent(null)
    setStatus('done')
  }

  function toggleSelected(bookId) {
    setResults(prev => prev.map(r => r.book.id === bookId ? { ...r, selected: !r.selected } : r))
  }

  function toggleAll() {
    const allSelected = results.filter(r => r.hasUpdates).every(r => r.selected)
    setResults(prev => prev.map(r => r.hasUpdates ? { ...r, selected: !allSelected } : r))
  }

  async function applySelected() {
    const toApply = results.filter(r => r.selected && r.hasUpdates)
    let count = 0
    for (const { book, updates } of toApply) {
      try {
        await updateBook.mutateAsync({ id: book.id, updates })
        count++
      } catch {}
    }
    toast.success(`Enriched ${count} book${count !== 1 ? 's' : ''}!`)
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-sm font-medium text-ink-800 dark:text-ink-300">
                  Found data for {results.filter(r => r.hasUpdates).length} of {results.length} books
                </p>
                {results.filter(r => r.hasUpdates).length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    {results.filter(r => r.hasUpdates).every(r => r.selected) ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setStatus('idle'); setResults([]) }}>Cancel</Button>
                <Button onClick={applySelected} disabled={results.filter(r => r.selected && r.hasUpdates).length === 0}>
                  Apply {results.filter(r => r.selected && r.hasUpdates).length} Selected
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {results.map(({ book, updates, hasUpdates, selected }) => {
              const coverToShow = updates.cover_url || null
              return (
                <div
                  key={book.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    hasUpdates && !selected
                      ? 'border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 opacity-50'
                      : 'border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!hasUpdates}
                    onChange={() => toggleSelected(book.id)}
                    className="flex-shrink-0 w-4 h-4 accent-teal-600 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                  />
                  {coverToShow ? (
                    <img src={coverToShow} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0" />
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
                    {!hasUpdates && (
                      <p className="text-xs text-ink-400 dark:text-ink-500 mt-0.5">No data found</p>
                    )}
                  </div>
                  {hasUpdates ? (
                    <CheckCircle size={16} className="text-teal-600 flex-shrink-0" />
                  ) : (
                    <XCircle size={16} className="text-ink-300 dark:text-ink-600 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Kindle WKWebView sync (iOS native only) ───────────────────────────────
function KindleSyncSection() {
  const kindleSync = useKindleSync()
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState(null)

  async function handleSync() {
    let InAppBrowser
    try {
      InAppBrowser = (await import('@capgo/inappbrowser')).InAppBrowser
    } catch {
      toast.error('Kindle sync requires the iOS app')
      return
    }

    setSyncing(true)
    setProgress('Opening Kindle…')

    const listeners = []
    let finished = false

    function cleanup() {
      listeners.forEach(l => { try { l.remove() } catch {} })
      listeners.length = 0
      setSyncing(false)
      setProgress(null)
    }

    try {
      // Listen for messages posted by the injected scraper via window.mobileApp.postMessage()
      const msgListener = await InAppBrowser.addListener('messageFromWebview', async ({ detail }) => {
        if (!detail) return
        if (detail.type === 'kitabProgress') {
          setProgress(`${detail.current}/${detail.total} books…`)
        }
        if (detail.type === 'kitabDone') {
          finished = true
          try { await InAppBrowser.close() } catch {}
          cleanup()
          const highlights = detail.highlights || []
          if (highlights.length === 0) {
            toast('No highlights found. Make sure you are logged in to Amazon.')
          } else {
            kindleSync.mutate({ highlights })
          }
        }
      })
      listeners.push(msgListener)

      // Inject the scraper after each page load (handles login redirects)
      const pageListener = await InAppBrowser.addListener('browserPageLoaded', () => {
        setProgress('Loading Kindle notebook…')
        setTimeout(() => {
          InAppBrowser.executeScript({ code: KINDLE_SCRAPER_JS }).catch(() => {})
        }, 2500)
      })
      listeners.push(pageListener)

      // Handle user closing the webview manually
      const closeListener = await InAppBrowser.addListener('closeEvent', () => {
        if (!finished) cleanup()
      })
      listeners.push(closeListener)

      await InAppBrowser.openWebView({ url: 'https://read.amazon.com/kp/notebook' })
    } catch (e) {
      toast.error('Sync failed. Try again.')
      try { await InAppBrowser.close() } catch {}
      cleanup()
    }
  }

  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
        <Zap size={18} className="text-teal-600" /> Kindle Highlights Sync
      </h2>
      <p className="text-sm text-ink-600 dark:text-ink-400">
        Sync all your Kindle highlights in one tap. An Amazon sign-in page will open — log in once and your session will be remembered for future syncs.
      </p>
      <button
        onClick={handleSync}
        disabled={syncing || kindleSync.isPending}
        className={`btn-secondary ${(syncing || kindleSync.isPending) ? 'opacity-50' : ''}`}
      >
        <Zap size={14} />
        {syncing ? (progress || 'Syncing…') : kindleSync.isPending ? 'Importing…' : 'Sync Kindle Highlights'}
      </button>
      {syncing && (
        <p className="text-xs text-ink-400">
          This may take a few minutes if you have many books. Keep the app open.
        </p>
      )}
    </div>
  )
}

// ── Kindle clippings import card ──────────────────────────────────────────
function ClippingsSection() {
  const importClippings = useClippingsImport()
  const { data: unmatched = [] } = useAllUnmatched()
  const assign = useAssignHighlights()
  const { data: books = [] } = useLibrary()
  const readBooks = books.filter(b => b.status === 'read')

  // Group unmatched by book_title
  const unmatchedGroups = Object.values(
    unmatched.reduce((acc, h) => {
      const key = h.book_title || 'Unknown'
      if (!acc[key]) acc[key] = { title: key, author: h.book_author, highlights: [] }
      acc[key].highlights.push(h)
      return acc
    }, {})
  )

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    importClippings.mutate({ file })
    e.target.value = ''
  }

  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
        <Zap size={18} className="text-teal-600" /> Kindle Highlights
      </h2>
      <p className="text-sm text-ink-600 dark:text-ink-400">
        Import from a physical Kindle: connect Kindle to Mac → copy <span className="font-mono text-xs bg-paper-100 dark:bg-ink-700 px-1.5 py-0.5 rounded">documents/My Clippings.txt</span> → AirDrop to iPhone → pick it below.
      </p>

      <label className={`btn-secondary cursor-pointer ${importClippings.isPending ? 'opacity-50' : ''}`}>
        <Upload size={14} />
        {importClippings.isPending ? 'Importing…' : 'Choose My Clippings.txt'}
        <input
          type="file"
          accept=".txt"
          onChange={handleFile}
          className="hidden"
          disabled={importClippings.isPending}
        />
      </label>

      {/* Unmatched review queue */}
      {unmatchedGroups.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertCircle size={14} />
            <span>{unmatchedGroups.length} book{unmatchedGroups.length > 1 ? 's' : ''} couldn't be matched automatically — link them below.</span>
          </div>
          <div className="space-y-2">
            {unmatchedGroups.map(group => (
              <div key={group.title} className="flex items-center gap-3 p-3 bg-paper-50 dark:bg-ink-800 rounded-lg text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-900 dark:text-paper-100 truncate">{group.title}</p>
                  <p className="text-ink-400 text-xs">{group.highlights.length} highlight{group.highlights.length > 1 ? 's' : ''}</p>
                </div>
                <select
                  className="input text-xs py-1"
                  style={{ fontSize: '16px' }}
                  defaultValue=""
                  onChange={async e => {
                    if (!e.target.value) return
                    await assign.mutateAsync({ bookTitle: group.title, bookId: e.target.value })
                  }}
                >
                  <option value="">Link to book…</option>
                  {readBooks.map(b => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
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
  const navigate = useNavigate()
  const [editingTag, setEditingTag] = useState(null)
  const [editName, setEditName] = useState('')
  const [importing, setImporting] = useState(false)
  const { librarySlug, setLibrarySlug } = useUIStore()
  const [slugInput, setSlugInput] = useState(librarySlug || '')

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  function exportCSV() {
    const rows = buildGoodreadsCSV(books, tags)
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kitab-export.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 100)
    toast.success('Library exported!')
  }

  function exportJSON() {
    const data = JSON.stringify(books.map(b => ({ ...b, tags: b.tags?.map(t => t.name) || [] })), null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kitab-library.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 100)
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
    const tag = tags.find(t => t.id === id)
    const bookCount = books.filter(b => b.tags?.some(t => t.id === id)).length
    const bookText = bookCount === 1 ? '1 book' : `${bookCount} books`
    const msg = tag
      ? `Delete "${tag.name}"? This will remove it from ${bookText}.`
      : `Delete this tag? This will remove it from ${bookText}.`
    if (!confirm(msg)) return
    await deleteTag.mutateAsync(id)
  }

  return (
    <div className="space-y-6 max-w-2xl pb-10">
      <div className="flex items-center gap-3 mb-0">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl hover:bg-paper-100 dark:hover:bg-ink-800 text-ink-500 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="page-title">Settings</h1>
      </div>

      {/* Libby */}
      <div className="card p-6 space-y-4">
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
          <BookOpen size={18} className="text-teal-600" /> Libby
        </h2>
        <p className="text-sm text-ink-600 dark:text-ink-400">
          Enter your library's OverDrive subdomain to enable "Check Libby" links on every book.
          Find it in your library's Libby URL — e.g. <span className="font-mono text-xs bg-paper-100 dark:bg-ink-700 px-1.5 py-0.5 rounded">sfpl.overdrive.com</span> → enter <span className="font-mono text-xs bg-paper-100 dark:bg-ink-700 px-1.5 py-0.5 rounded">sfpl</span>.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={slugInput}
            onChange={e => setSlugInput(e.target.value.toLowerCase().trim())}
            placeholder="e.g. sfpl"
            className="input flex-1"
          />
          <Button
            variant="primary"
            onClick={() => setLibrarySlug(slugInput)}
            disabled={!slugInput || slugInput === librarySlug}
          >
            Save
          </Button>
        </div>
        {librarySlug && (
          <p className="text-xs text-ink-400">
            Links will open: <span className="font-mono">libbyapp.com/search/{librarySlug}/search/query-…</span>
          </p>
        )}
      </div>
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

      {/* Kindle Highlights — WKWebView sync (iOS only) */}
      {Capacitor.isNativePlatform() && <KindleSyncSection />}

      {/* Kindle Highlights — My Clippings.txt file import (backup) */}
      <ClippingsSection />

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
      {/* Account / Logout */}
      <div className="card p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 mb-3 flex items-center gap-2">
          <LogOut size={18} className="text-ink-500" /> Account
        </h2>
        <button onClick={handleLogout} className="btn-secondary flex items-center gap-2">
          <LogOut size={14} /> Log out
        </button>
      </div>

      {/* App version */}
      <p className="text-center text-xs text-ink-400 dark:text-ink-600 pb-2">
        Kitab · v2.1.2
      </p>
    </div>
  )
}
