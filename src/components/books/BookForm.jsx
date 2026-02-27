import { useState, useEffect } from 'react'
import { Modal } from '../ui/index.jsx'
import { Button } from '../ui/index.jsx'
import { BookCover } from './BookCover'
import { StarRating } from './StarRating'
import { TagInput } from './TagInput'
import { STATUS_LABELS } from '../../lib/utils'
import MDEditor from '@uiw/react-md-editor'
import { useAddBook } from '../../hooks/useLibrary'
import { useUpdateBook } from '../../hooks/useLibrary'
import { AlertTriangle } from 'lucide-react'

const DEFAULT_STATUS = 'tbr'

export function BookForm({ open, onClose, initialBook, editingId, editingTags }) {
  const addBook = useAddBook()
  const updateBook = useUpdateBook()

  const [form, setForm] = useState({
    title: '',
    author: '',
    cover_url: '',
    published_year: '',
    page_count: '',
    isbn: '',
    status: DEFAULT_STATUS,
    rating: null,
    review: '',
    review_spoiler: false,
    date_started: '',
    date_finished: '',
    current_page: '',
    genres: [],
    description: '',
    google_books_id: '',
  })
  const [tagIds, setTagIds] = useState([])
  const [tab, setTab] = useState('details')

  useEffect(() => {
    if (initialBook) {
      setForm({
        title: initialBook.title || '',
        author: initialBook.author || '',
        cover_url: initialBook.cover_url || '',
        published_year: initialBook.published_year || '',
        page_count: initialBook.page_count || '',
        isbn: initialBook.isbn || '',
        status: initialBook.status || DEFAULT_STATUS,
        rating: initialBook.rating || null,
        review: initialBook.review || '',
        review_spoiler: initialBook.review_spoiler || false,
        date_started: initialBook.date_started || '',
        date_finished: initialBook.date_finished || '',
        current_page: initialBook.current_page || '',
        genres: initialBook.genres || [],
        description: initialBook.description || '',
        google_books_id: initialBook.google_books_id || '',
      })
    }
    if (editingTags) setTagIds(editingTags.map(t => t.id))
  }, [initialBook, editingTags])

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      ...form,
      published_year: form.published_year ? parseInt(form.published_year) : null,
      page_count: form.page_count ? parseInt(form.page_count) : null,
      current_page: form.current_page ? parseInt(form.current_page) : null,
      date_started: form.date_started || null,
      date_finished: form.date_finished || null,
      cover_url: form.cover_url || null,
      isbn: form.isbn || null,
    }

    if (editingId) {
      await updateBook.mutateAsync({ id: editingId, updates: payload, tagIds })
    } else {
      await addBook.mutateAsync({ book: payload, tagIds })
    }
    onClose()
  }

  const isSubmitting = addBook.isPending || updateBook.isPending

  return (
    <Modal open={open} onClose={onClose} title={editingId ? 'Edit Book' : 'Add to Library'} size="xl">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-6 p-6">
          {/* Cover preview */}
          <div className="flex-shrink-0 flex flex-col items-center gap-3">
            <BookCover book={form} size="lg" />
            <input
              value={form.cover_url}
              onChange={e => set('cover_url', e.target.value)}
              placeholder="Cover image URL"
              className="input text-xs w-36"
            />
          </div>

          {/* Main fields */}
          <div className="flex-1 space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-paper-200 dark:border-ink-700">
              {['details', 'review', 'dates'].map(t => (
                <button
                  key={t} type="button"
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors -mb-px border-b-2 ${
                    tab === t
                      ? 'border-teal-600 text-teal-700 dark:text-teal-400'
                      : 'border-transparent text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'details' && (
              <div className="space-y-3">
                <div>
                  <label className="section-label block mb-1">Title *</label>
                  <input required value={form.title} onChange={e => set('title', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="section-label block mb-1">Author</label>
                  <input value={form.author} onChange={e => set('author', e.target.value)} className="input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="section-label block mb-1">Year</label>
                    <input type="number" value={form.published_year} onChange={e => set('published_year', e.target.value)} className="input" min="1" max="2099" />
                  </div>
                  <div>
                    <label className="section-label block mb-1">Pages</label>
                    <input type="number" value={form.page_count} onChange={e => set('page_count', e.target.value)} className="input" min="1" />
                  </div>
                </div>
                <div>
                  <label className="section-label block mb-1">Status</label>
                  <select value={form.status} onChange={e => set('status', e.target.value)} className="input">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="section-label block mb-1">Rating</label>
                  <StarRating value={form.rating} onChange={v => set('rating', v)} size="lg" />
                </div>
                <div>
                  <label className="section-label block mb-1">Tags</label>
                  <TagInput selectedTagIds={tagIds} onChange={setTagIds} />
                </div>
              </div>
            )}

            {tab === 'review' && (
              <div className="space-y-3" data-color-mode="light">
                <div>
                  <label className="section-label block mb-1">Review / Notes</label>
                  <MDEditor
                    value={form.review}
                    onChange={v => set('review', v || '')}
                    preview="edit"
                    height={200}
                    className="!font-sans"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.review_spoiler}
                    onChange={e => set('review_spoiler', e.target.checked)}
                    className="rounded text-teal-600"
                  />
                  <AlertTriangle size={14} className="text-amber-500" />
                  Mark as spoiler
                </label>
              </div>
            )}

            {tab === 'dates' && (
              <div className="space-y-3">
                <div>
                  <label className="section-label block mb-1">Date Started</label>
                  <input type="date" value={form.date_started} onChange={e => set('date_started', e.target.value)} className="input" />
                </div>
                <div>
                  <label className="section-label block mb-1">Date Finished</label>
                  <input type="date" value={form.date_finished} onChange={e => set('date_finished', e.target.value)} className="input" />
                </div>
                {form.status === 'reading' && (
                  <div>
                    <label className="section-label block mb-1">Current Page</label>
                    <input type="number" value={form.current_page} onChange={e => set('current_page', e.target.value)} className="input" min="0" max={form.page_count || undefined} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 pb-5 border-t border-paper-200 dark:border-ink-700 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : (editingId ? 'Save Changes' : 'Add to Library')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
