// Offline outbox for the Commonplace Book.
//
// A note or typed highlight written with no connection is not lost: the row
// gets its id and timestamp on the device, is shown immediately, and waits here
// until the network is back. flushOutbox() then sends queued rows in order.
// Only inserts are queued; editing and deleting need a connection.
import toast from 'react-hot-toast'
import { supabase } from './supabase'

const KEY = 'kitab-outbox'
const MAX_ATTEMPTS = 5
const listeners = new Set()

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}
function write(ops) {
  try { localStorage.setItem(KEY, JSON.stringify(ops)) } catch {}
  listeners.forEach(fn => fn(ops.length))
}

export function isOfflineError(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = String(err?.message || err || '')
  return /Failed to fetch|NetworkError|Load failed|network connection|internet connection/i.test(msg)
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Queue a row. `meta` is display-only (e.g. the book) and is never sent. */
export function enqueue(type, row, meta = {}) {
  const ops = read()
  ops.push({ type, row, meta, queuedAt: Date.now(), attempts: 0 })
  write(ops)
}

/** Queued rows of a type, shaped like fetched rows and flagged `_pending`. */
export function pendingRows(type, predicate = () => true) {
  return read()
    .filter(o => o.type === type && predicate(o.row))
    .map(o => ({ ...o.row, ...o.meta, _pending: true }))
}

export function pendingCount() { return read().length }
export function onOutboxChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

const EXEC = {
  'note.insert': row => supabase.from('book_notes').insert(row),
  'highlight.insert': async row => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: new Error('Not signed in') }
    return supabase.from('highlights').insert({ ...row, user_id: session.user.id })
  },
}

let flushing = false

export async function flushOutbox(queryClient) {
  if (flushing || !read().length) return 0
  flushing = true
  let sent = 0
  try {
    for (;;) {
      const op = read()[0]
      if (!op) break
      let error = null
      try { ({ error } = await EXEC[op.type](op.row)) } catch (e) { error = e }
      if (error && isOfflineError(error)) break
      if (error && error.code !== '23505') {           // 23505: already saved on an earlier try
        op.attempts = (op.attempts || 0) + 1
        if (op.attempts < MAX_ATTEMPTS) {
          write([op, ...read().slice(1)])
          break
        }
        toast.error(`A ${op.type === 'note.insert' ? 'note' : 'highlight'} saved offline couldn't be synced: ${error.message}`)
      }
      write(read().filter(o => !(o.queuedAt === op.queuedAt && o.row.id === op.row.id)))
      if (!error || error.code === '23505') sent++
    }
  } finally {
    flushing = false
  }
  if (sent && queryClient) {
    for (const key of ['book_notes', 'all_notes', 'highlights', 'all_highlights', 'highlight_count']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
    toast.success(`Synced ${sent} saved offline`, { id: 'outbox-synced' })
  }
  return sent
}
