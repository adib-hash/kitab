import { useState } from 'react'
import { Download, Upload, Trash2, Edit2, Tag, Target } from 'lucide-react'
import { useLibrary } from '../hooks/useLibrary'
import { useTags, useUpdateTag, useDeleteTag } from '../hooks/useTags'
import { Button, Divider } from '../components/ui/index.jsx'
import { buildGoodreadsCSV } from '../lib/utils'
import Papa from 'papaparse'
import { useAddBook } from '../hooks/useLibrary'
import toast from 'react-hot-toast'

function TagRow({ tag, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 group hover:bg-paper-50 dark:hover:bg-ink-800 rounded-xl transition-colors">
      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
      <span className="flex-1 text-sm text-ink-800 dark:text-ink-200">{tag.name}</span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
    <div className="space-y-8 max-w-2xl">
      <h1 className="page-title">Settings</h1>

      {/* Export */}
      <div className="card p-6 space-y-4">
        <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
          <Download size={18} className="text-teal-600" /> Export Your Library
        </h2>
        <p className="text-sm text-ink-600 dark:text-ink-400">Download a copy of all your books, ratings, and reviews.</p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={exportCSV}>
            <Download size={14} /> Export CSV (Goodreads format)
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
          <p className="text-sm text-ink-500">No tags yet. Tags are created when you add them to books.</p>
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
            <span className="text-ink-500">Total books</span>
            <span className="font-medium text-ink-900 dark:text-paper-50">{books.length}</span>
          </div>
          {['read','reading','tbr','dnf'].map(s => (
            <div key={s} className="flex justify-between">
              <span className="text-ink-500 capitalize">{s === 'tbr' ? 'To be read' : s === 'dnf' ? 'Did not finish' : s}</span>
              <span className="font-medium text-ink-900 dark:text-paper-50">{books.filter(b=>b.status===s).length}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
