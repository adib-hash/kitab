import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { Modal, Button } from '../ui/index.jsx'
import { useUpdateBook } from '../../hooks/useLibrary'

export function ReviewModal({ open, onClose, book }) {
  const updateBook = useUpdateBook()
  const DRAFT_KEY = `review_draft_${book?.id}`

  const [text, setText] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const [draftSavedMsg, setDraftSavedMsg] = useState(false)
  const [dirty, setDirty] = useState(false)

  // On open: seed from DB value, check for draft
  useEffect(() => {
    if (!open || !book) return
    const dbReview = book.review ?? ''
    const dbSpoiler = book.review_spoiler ?? false
    const draft = localStorage.getItem(DRAFT_KEY)
    const hasDraft = draft !== null && draft !== dbReview

    setText(hasDraft ? dbReview : dbReview)  // start with DB value always
    setSpoiler(dbSpoiler)
    setDirty(false)
    setShowDraftBanner(hasDraft)
  }, [open, book?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-save to localStorage
  useEffect(() => {
    if (!open || !dirty) return
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, text)
      setDraftSavedMsg(true)
      setTimeout(() => setDraftSavedMsg(false), 1800)
    }, 500)
    return () => clearTimeout(t)
  }, [text, open, dirty]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(val) {
    setText(val)
    setDirty(true)
    setShowDraftBanner(false)
  }

  function handleRestoreDraft() {
    const draft = localStorage.getItem(DRAFT_KEY)
    if (draft !== null) {
      setText(draft)
      setDirty(true)
    }
    setShowDraftBanner(false)
  }

  function handleDiscardDraft() {
    localStorage.removeItem(DRAFT_KEY)
    setShowDraftBanner(false)
  }

  async function handleSave() {
    await updateBook.mutateAsync({
      id: book.id,
      updates: { review: text, review_spoiler: spoiler },
    })
    localStorage.removeItem(DRAFT_KEY)
    setDirty(false)
    onClose()
  }

  function handleClose() {
    if (dirty) {
      // Leave draft intact — user can restore next time
    }
    onClose()
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0

  if (!book) return null

  return (
    <Modal open={open} onClose={handleClose} title={book.review ? 'Edit Review' : 'Write a Review'} size="xl">
      <div className="flex flex-col" style={{ minHeight: '480px', maxHeight: '80vh' }}>
        {/* Book title */}
        <div className="px-6 pb-2 text-sm text-ink-500 dark:text-ink-400 flex-shrink-0">
          {book.title}{book.author ? ` · ${book.author}` : ''}
        </div>

        {/* Draft restore banner */}
        {showDraftBanner && (
          <div className="mx-6 mb-3 flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg flex-shrink-0">
            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span className="flex-1 text-sm text-amber-800 dark:text-amber-300">You have an unsaved draft.</span>
            <button
              onClick={handleRestoreDraft}
              className="text-sm font-medium text-amber-700 dark:text-amber-400 hover:underline"
            >
              Restore
            </button>
            <button
              onClick={handleDiscardDraft}
              className="text-sm text-amber-500 dark:text-amber-500 hover:underline"
            >
              Discard
            </button>
          </div>
        )}

        {/* Textarea */}
        <div className="flex-1 px-6 flex flex-col min-h-0">
          <textarea
            value={text}
            onChange={e => handleChange(e.target.value)}
            placeholder="Write your thoughts, highlights, or notes about this book..."
            className="flex-1 w-full px-4 py-3 bg-paper-50 dark:bg-ink-700 border border-paper-200 dark:border-ink-600 rounded-xl text-ink-900 dark:text-paper-50 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none leading-relaxed"
            style={{ fontSize: '16px', minHeight: '280px' }}
          />
          {/* Footer row: spoiler + word count + draft saved indicator */}
          <div className="flex items-center justify-between py-2 flex-shrink-0">
            <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300 cursor-pointer">
              <input
                type="checkbox"
                checked={spoiler}
                onChange={e => { setSpoiler(e.target.checked); setDirty(true) }}
                className="rounded text-teal-600"
              />
              <AlertTriangle size={13} className="text-amber-500" />
              Mark as spoiler
            </label>
            <div className="flex items-center gap-3">
              {draftSavedMsg && (
                <span className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 animate-pulse">
                  <CheckCircle size={12} /> Draft saved
                </span>
              )}
              <span className="text-xs text-ink-400">{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3 px-6 pb-5 pt-2 border-t border-paper-200 dark:border-ink-700 flex-shrink-0">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Close
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={updateBook.isPending}
          >
            {updateBook.isPending ? 'Saving...' : 'Save Review'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
