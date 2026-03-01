import { useState, useRef, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { useTags, useCreateTag } from '../../hooks/useTags'
import { clsx } from 'clsx'

export function TagInput({ selectedTagIds = [], onChange }) {
  const { data: allTags = [] } = useTags()
  const createTag = useCreateTag()
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selectedTags = allTags.filter(t => selectedTagIds.includes(t.id))
  const filteredTags = allTags.filter(t =>
    !selectedTagIds.includes(t.id) &&
    t.name.includes(input.toLowerCase().trim())
  )
  const canCreate = input.trim() && !allTags.some(t => t.name === input.trim().toLowerCase())

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function removeTag(id) {
    onChange(selectedTagIds.filter(t => t !== id))
  }

  function addTag(tag) {
    onChange([...selectedTagIds, tag.id])
    setInput('')
  }

  async function createAndAdd() {
    if (!canCreate) return
    const tag = await createTag.mutateAsync({ name: input.trim() })
    onChange([...selectedTagIds, tag.id])
    setInput('')
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap gap-1.5 p-2 min-h-[40px] bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-600 rounded-lg focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 transition-colors">
        {selectedTags.map(tag => (
          <span key={tag.id} className="tag-pill flex items-center gap-1 pr-1">
            {tag.name}
            <button type="button" onClick={() => removeTag(tag.id)} className="hover:text-rose-500 transition-colors">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={selectedTags.length ? '' : 'Add tags...'}
          className="flex-1 min-w-[80px] text-sm bg-transparent outline-none text-ink-900 dark:text-paper-50 placeholder:text-ink-400"
        />
      </div>

      {open && (filteredTags.length > 0 || canCreate) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-600 rounded-lg shadow-card z-20 overflow-hidden">
          {filteredTags.slice(0, 8).map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => addTag(tag)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-800 dark:text-ink-300 hover:bg-paper-50 dark:hover:bg-ink-700 transition-colors text-left"
            >
              <span className="tag-pill">{tag.name}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={createAndAdd}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors border-t border-paper-200 dark:border-ink-600"
            >
              <Plus size={14} />
              Create "{input.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
