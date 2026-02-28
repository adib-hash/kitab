import { useState } from 'react'
import { Plus, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLibrary, useReorderTBR, useUpdateBook } from '../hooks/useLibrary'
import { BookCover } from '../components/books/BookCover'
import { BookSearchModal } from '../components/books/BookSearch'
import { BookForm } from '../components/books/BookForm'
import { EmptyState, Button } from '../components/ui/index.jsx'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

function SortableBook({ book }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: book.id })
  const updateBook = useUpdateBook()

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  async function startReading() {
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'reading' } })
    toast.success(`Started reading "${book.title}"`)
  }

  async function markRead() {
    await updateBook.mutateAsync({ id: book.id, updates: { status: 'read', date_finished: new Date().toISOString().slice(0,10) } })
    toast.success(`Marked "${book.title}" as read`)
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 bg-white dark:bg-ink-800 rounded-xl border border-paper-200 dark:border-ink-700">
      {/* Drag handle */}
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-ink-300 hover:text-ink-500 touch-none flex-shrink-0 p-1">
        <GripVertical size={16} />
      </button>

      {/* Cover */}
      <BookCover book={book} size="sm" className="flex-shrink-0" />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link to={`/library/${book.id}`} className="font-medium text-sm text-ink-900 dark:text-paper-50 hover:text-teal-700 truncate block leading-snug">
          {book.title}
        </Link>
        <p className="text-xs text-ink-500 truncate">{book.author}</p>
      </div>

      {/* Actions — always visible on mobile */}
      <div className="flex flex-col gap-1 flex-shrink-0">
        <button
          onClick={startReading}
          className="text-[11px] px-2 py-1 rounded-lg border border-paper-200 dark:border-ink-600 text-ink-600 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors whitespace-nowrap"
        >
          Reading
        </button>
        <button
          onClick={markRead}
          className="text-[11px] px-2 py-1 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors whitespace-nowrap"
        >
          Done ✓
        </button>
      </div>
    </div>
  )
}

export function TBR() {
  const { data: books = [], isLoading } = useLibrary()
  const reorderTBR = useReorderTBR()
  const [searchOpen, setSearchOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)

  const tbrBooks = books
    .filter(b => b.status === 'tbr')
    .sort((a, b) => (a.tbr_order || 0) - (b.tbr_order || 0))

  const [localOrder, setLocalOrder] = useState(null)
  const displayBooks = localOrder
    ? localOrder.map(id => tbrBooks.find(b => b.id === id)).filter(Boolean)
    : tbrBooks

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = displayBooks.map(b => b.id)
    const newOrder = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id))
    setLocalOrder(newOrder)
    reorderTBR.mutate(newOrder)
  }

  function handleSearchSelect(book) { setSelectedBook({ ...book, status: 'tbr' }); setFormOpen(true) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">To Be Read</h1>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            {isLoading ? '...' : `${tbrBooks.length} ${tbrBooks.length === 1 ? 'book' : 'books'} on your shelf`}
          </p>
        </div>
        <button onClick={() => setSearchOpen(true)} className="btn-primary">
          <Plus size={16} /> <span className="hidden sm:inline">Add Book</span>
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 skeleton rounded-xl" />)}
        </div>
      ) : tbrBooks.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Your reading list is empty"
          description="Add books you want to read — then drag to prioritize."
          action={
            <button onClick={() => setSearchOpen(true)} className="btn-primary">
              <Plus size={16} /> Add Your First Book
            </button>
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayBooks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {displayBooks.map(book => <SortableBook key={book.id} book={book} />)}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <BookSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={handleSearchSelect} onManual={() => { setSelectedBook(null); setFormOpen(true) }} />
      <BookForm open={formOpen} onClose={() => { setFormOpen(false); setSelectedBook(null) }} initialBook={selectedBook} />
    </div>
  )
}
