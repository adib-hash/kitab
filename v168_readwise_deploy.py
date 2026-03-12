#!/usr/bin/env python3
"""
v1.6.8 — Readwise Highlights Sync

Adds:
  1. /api/readwise-sync.js            — Vercel serverless proxy for Readwise API
  2. src/hooks/useHighlights.js       — Supabase queries + sync orchestration
  3. Settings.jsx                     — Readwise card: token input + sync button + unmatched review
  4. BookDetail.jsx                   — Highlights tab with quote cards
"""

import subprocess, sys, re
from pathlib import Path
import shutil

REPO = Path.home() / "Downloads" / "kitab"

def write(path, content):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
    print(f"  wrote {p.relative_to(REPO)}")

def patch(path, old, new, label=""):
    p = Path(path)
    content = p.read_text()
    if old in content:
        p.write_text(content.replace(old, new, 1))
        print(f"  patched {p.relative_to(REPO)}" + (f" — {label}" if label else ""))
        return True
    print(f"  [WARN] pattern not found: {label or old[:60]!r}")
    return False

def run(cmd, cwd=REPO):
    r = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ERROR running: {cmd}\n  {r.stderr}")
        sys.exit(1)
    return r.stdout.strip()

print("=== Kitab v1.6.8 — Readwise Highlights deploy ===\n")

# ══════════════════════════════════════════════════════════════════════════════
# FILE 1: /api/readwise-sync.js  (Vercel serverless route)
# ══════════════════════════════════════════════════════════════════════════════
READWISE_SYNC_API = """\
// api/readwise-sync.js
// Vercel serverless function that proxies calls to the Readwise v2 API.
// The user's token is passed per-request — never stored server-side.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { token, action, bookId } = req.body
  if (!token) return res.status(400).json({ error: 'Missing Readwise token' })

  const RW = 'https://readwise.io/api/v2'
  const hdrs = { 'Authorization': `Token ${token}`, 'Content-Type': 'application/json' }

  try {
    // ── verify ──────────────────────────────────────────────────────────────
    if (action === 'verify') {
      const r = await fetch(`${RW}/auth/`, { headers: hdrs })
      return res.status(200).json({ valid: r.status === 204 })
    }

    // ── books: fetch all Readwise books in the "books" category ─────────────
    if (action === 'books') {
      const books = []
      let next = `${RW}/books/?category=books&page_size=100`
      while (next) {
        const r = await fetch(next, { headers: hdrs })
        if (!r.ok) {
          const e = await r.json().catch(() => ({}))
          return res.status(r.status).json({ error: e.detail || 'Readwise books error' })
        }
        const d = await r.json()
        books.push(...(d.results || []))
        next = d.next || null
      }
      return res.status(200).json({ books })
    }

    // ── highlights: fetch highlights for one Readwise book id ───────────────
    if (action === 'highlights') {
      if (!bookId) return res.status(400).json({ error: 'Missing bookId' })
      const highlights = []
      let next = `${RW}/highlights/?book_id=${bookId}&page_size=500`
      while (next) {
        const r = await fetch(next, { headers: hdrs })
        if (!r.ok) {
          const e = await r.json().catch(() => ({}))
          return res.status(r.status).json({ error: e.detail || 'Readwise highlights error' })
        }
        const d = await r.json()
        highlights.push(...(d.results || []))
        next = d.next || null
      }
      return res.status(200).json({
        highlights: highlights.map(h => ({
          readwise_id: h.id,
          text: h.text,
          note: h.note || null,
          location: h.location || null,
          highlighted_at: h.highlighted_at || null,
        }))
      })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error('readwise-sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}
"""
write(REPO / "api/readwise-sync.js", READWISE_SYNC_API)

# ══════════════════════════════════════════════════════════════════════════════
# FILE 2: src/hooks/useHighlights.js
# ══════════════════════════════════════════════════════════════════════════════
USE_HIGHLIGHTS = """\
// src/hooks/useHighlights.js
// Supabase queries + full Readwise sync orchestration.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// ── Highlights for one book (shown in BookDetail) ─────────────────────────
export function useHighlights(bookId) {
  return useQuery({
    queryKey: ['highlights', bookId],
    enabled: !!bookId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlights')
        .select('*')
        .eq('book_id', bookId)
        .order('location', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 10,
  })
}

// ── Count only — for the tab badge ────────────────────────────────────────
export function useHighlightCount(bookId) {
  return useQuery({
    queryKey: ['highlight_count', bookId],
    enabled: !!bookId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('highlights')
        .select('*', { count: 'exact', head: true })
        .eq('book_id', bookId)
      if (error) throw error
      return count ?? 0
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ── Highlights with no matched book (review queue in Settings) ────────────
export function useAllUnmatched() {
  return useQuery({
    queryKey: ['highlights_unmatched'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlights')
        .select('*')
        .is('book_id', null)
        .order('book_title')
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ── Manually link an unmatched group to a Kitab book ─────────────────────
export function useAssignHighlights() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ bookTitle, bookId }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('highlights')
        .update({ book_id: bookId })
        .eq('user_id', user.id)
        .eq('book_title', bookTitle)
        .is('book_id', null)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      toast.success('Highlights linked!')
    },
    onError: (err) => toast.error(`Failed to link: ${err.message}`),
  })
}

// ── Normalize titles for fuzzy matching ───────────────────────────────────
function normalize(str = '') {
  return str
    .toLowerCase()
    .replace(/^(the|a|an)\\s+/i, '')
    .replace(/[^\\w\\s]/g, '')
    .replace(/\\s+/g, ' ')
    .trim()
}

function matchBook(rwBook, kitabBooks) {
  const rwTitle = normalize(rwBook.title)
  const rwAuthor = normalize(rwBook.author || '')

  // Pass 1: exact normalized title
  let m = kitabBooks.find(k => normalize(k.title) === rwTitle)
  if (m) return m.id

  // Pass 2: Kitab title is prefix of Readwise title (e.g. "Dune" vs "Dune: A Novel")
  m = kitabBooks.find(k => {
    const kt = normalize(k.title)
    return kt.length >= 4 && rwTitle.startsWith(kt)
  })
  if (m) return m.id

  // Pass 3: Readwise title is prefix of Kitab title
  m = kitabBooks.find(k => {
    const kt = normalize(k.title)
    return rwTitle.length >= 4 && kt.startsWith(rwTitle)
  })
  if (m) return m.id

  // Pass 4: title prefix overlap + author first-word match
  const rwFirstAuthorWord = rwAuthor.split(' ')[0]
  if (rwFirstAuthorWord.length >= 3) {
    m = kitabBooks.find(k => {
      const kt = normalize(k.title)
      const ka = normalize(k.author || '')
      const titleOverlap = rwTitle.includes(kt.slice(0, 6)) || kt.includes(rwTitle.slice(0, 6))
      return titleOverlap && ka.startsWith(rwFirstAuthorWord)
    })
    if (m) return m.id
  }

  return null
}

// ── Main sync: token → Readwise → Supabase ────────────────────────────────
export function useReadwiseSync() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ token }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      // 1. Verify token
      const verifyRes = await fetch('/api/readwise-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'verify' }),
      })
      const { valid } = await verifyRes.json()
      if (!valid) throw new Error('Invalid Readwise token — check readwise.io/access_token')

      // 2. Load Kitab books for matching
      const { data: kitabBooks } = await supabase
        .from('books')
        .select('id, title, author')
        .eq('user_id', user.id)

      // 3. Fetch Readwise books
      const booksRes = await fetch('/api/readwise-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'books' }),
      })
      if (!booksRes.ok) {
        const { error } = await booksRes.json()
        throw new Error(error || 'Failed to fetch Readwise books')
      }
      const { books: rwBooks } = await booksRes.json()

      // 4 + 5. Per book: fetch highlights, match, upsert
      let totalHighlights = 0
      let unmatched = 0

      for (const rwBook of rwBooks) {
        const hlRes = await fetch('/api/readwise-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'highlights', bookId: rwBook.id }),
        })
        if (!hlRes.ok) continue
        const { highlights } = await hlRes.json()
        if (!highlights || !highlights.length) continue

        const matchedBookId = matchBook(rwBook, kitabBooks || [])
        if (!matchedBookId) unmatched++

        const rows = highlights.map(h => ({
          user_id: user.id,
          book_id: matchedBookId,
          readwise_id: h.readwise_id,
          text: h.text,
          note: h.note,
          location: h.location,
          book_title: rwBook.title,
          book_author: rwBook.author,
          highlighted_at: h.highlighted_at,
        }))

        const { error } = await supabase
          .from('highlights')
          .upsert(rows, { onConflict: 'readwise_id' })

        if (!error) totalHighlights += rows.length
      }

      return { totalHighlights, unmatched, books: rwBooks.length }
    },

    onSuccess: ({ totalHighlights, unmatched, books }) => {
      qc.invalidateQueries({ queryKey: ['highlights'] })
      qc.invalidateQueries({ queryKey: ['highlight_count'] })
      qc.invalidateQueries({ queryKey: ['highlights_unmatched'] })
      const msg = `Synced ${totalHighlights} highlight${totalHighlights !== 1 ? 's' : ''} from ${books} book${books !== 1 ? 's' : ''}`
        + (unmatched > 0 ? ` · ${unmatched} unmatched (check Settings)` : '')
      toast.success(msg, { duration: 6000 })
    },

    onError: (err) => toast.error(err.message),
  })
}
"""
write(REPO / "src/hooks/useHighlights.js", USE_HIGHLIGHTS)

# ══════════════════════════════════════════════════════════════════════════════
# FILE 3: Settings.jsx — patch to add Readwise card before "Library Overview"
# ══════════════════════════════════════════════════════════════════════════════
settings_path = REPO / "src/pages/Settings.jsx"
settings = settings_path.read_text()

# Add imports
OLD_IMPORTS = "import { useState } from 'react'\nimport { Download, Upload, Trash2, Edit2, Tag, Sparkles, CheckCircle, XCircle, Loader2, BookOpen } from 'lucide-react'"
NEW_IMPORTS = "import { useState, useEffect } from 'react'\nimport { Download, Upload, Trash2, Edit2, Tag, Sparkles, CheckCircle, XCircle, Loader2, BookOpen, Zap, RefreshCw, AlertCircle } from 'lucide-react'"
if OLD_IMPORTS in settings:
    settings = settings.replace(OLD_IMPORTS, NEW_IMPORTS, 1)
    print("  patched Settings.jsx — imports")

OLD_HOOKS_IMPORT = "import { useAddBook } from '../hooks/useLibrary'"
NEW_HOOKS_IMPORT = "import { useAddBook } from '../hooks/useLibrary'\nimport { useReadwiseSync, useAllUnmatched, useAssignHighlights } from '../hooks/useHighlights'"
if OLD_HOOKS_IMPORT in settings:
    settings = settings.replace(OLD_HOOKS_IMPORT, NEW_HOOKS_IMPORT, 1)
    print("  patched Settings.jsx — useHighlights import")

# Add the Readwise section before "Library Overview"
OLD_LIBRARY_OVERVIEW = "      {/* Library stats */}\n      <div className=\"card p-6\">"
NEW_WITH_READWISE = """\
      {/* Readwise */}
      <ReadwiseSection />

      {/* Library stats */}
      <div className="card p-6">"""
if OLD_LIBRARY_OVERVIEW in settings:
    settings = settings.replace(OLD_LIBRARY_OVERVIEW, NEW_WITH_READWISE, 1)
    print("  patched Settings.jsx — inserted <ReadwiseSection />")

settings_path.write_text(settings)

# Now prepend the ReadwiseSection component before export function Settings()
READWISE_COMPONENT = '''\
// ── Readwise sync card ────────────────────────────────────────────────────
function ReadwiseSection() {
  const [token, setToken] = useState(() => localStorage.getItem('rw_token') || '')
  const [savedToken, setSavedToken] = useState(() => localStorage.getItem('rw_token') || '')
  const [lastSync, setLastSync] = useState(() => localStorage.getItem('rw_last_sync') || null)
  const sync = useReadwiseSync()
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

  function saveToken() {
    localStorage.setItem('rw_token', token)
    setSavedToken(token)
  }

  async function handleSync() {
    await sync.mutateAsync({ token: savedToken })
    const now = new Date().toLocaleString()
    localStorage.setItem('rw_last_sync', now)
    setLastSync(now)
  }

  return (
    <div className="card p-6 space-y-4">
      <h2 className="font-serif text-lg font-semibold text-ink-900 dark:text-paper-50 flex items-center gap-2">
        <Zap size={18} className="text-teal-600" /> Readwise · Kindle Highlights
      </h2>
      <p className="text-sm text-ink-600 dark:text-ink-400">
        Connect your Readwise account to sync all your Kindle highlights into Kitab.
        Get your access token at{' '}
        <a href="https://readwise.io/access_token" target="_blank" rel="noopener noreferrer"
          className="text-teal-600 hover:underline">readwise.io/access_token</a>.
      </p>

      {/* Token input */}
      <div className="flex gap-2">
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Paste your Readwise access token"
          className="input flex-1 font-mono text-sm"
          style={{ fontSize: '16px' }}
        />
        <Button
          variant="secondary"
          onClick={saveToken}
          disabled={!token || token === savedToken}
        >
          Save
        </Button>
      </div>

      {/* Sync button */}
      {savedToken && (
        <div className="flex items-center gap-3">
          <Button
            onClick={handleSync}
            disabled={sync.isPending}
          >
            <RefreshCw size={14} className={sync.isPending ? 'animate-spin' : ''} />
            {sync.isPending ? 'Syncing…' : 'Sync Highlights'}
          </Button>
          {lastSync && (
            <span className="text-xs text-ink-400">Last synced: {lastSync}</span>
          )}
        </div>
      )}

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

'''

settings = settings_path.read_text()
INSERT_BEFORE = "export function Settings() {"
if INSERT_BEFORE in settings and "function ReadwiseSection" not in settings:
    settings = settings.replace(INSERT_BEFORE, READWISE_COMPONENT + INSERT_BEFORE, 1)
    settings_path.write_text(settings)
    print("  patched Settings.jsx — ReadwiseSection component added")
else:
    print("  [WARN] Could not insert ReadwiseSection — check Settings.jsx manually")

# ══════════════════════════════════════════════════════════════════════════════
# FILE 4: BookDetail.jsx — add Highlights tab
# ══════════════════════════════════════════════════════════════════════════════
bd_path = REPO / "src/pages/BookDetail.jsx"
bd = bd_path.read_text()

# Add import for useHighlights + useHighlightCount
OLD_BD_IMPORT = "import { useLibrary, useUpdateBook, useDeleteBook } from '../hooks/useLibrary'"
NEW_BD_IMPORT = "import { useLibrary, useUpdateBook, useDeleteBook } from '../hooks/useLibrary'\nimport { useHighlights, useHighlightCount } from '../hooks/useHighlights'"
if OLD_BD_IMPORT in bd:
    bd = bd.replace(OLD_BD_IMPORT, NEW_BD_IMPORT, 1)
    print("  patched BookDetail.jsx — useHighlights import")
else:
    print("  [WARN] BookDetail import pattern not found — add useHighlights import manually")

# Add hlCount to component body. Find where book data is destructured or used.
# We'll insert after the book fetch hook.
OLD_BD_BOOK = "  const { data: book, isLoading } = useBook(id)"
NEW_BD_BOOK = "  const { data: book, isLoading } = useBook(id)\n  const { data: hlCount = 0 } = useHighlightCount(id)"
if OLD_BD_BOOK in bd:
    bd = bd.replace(OLD_BD_BOOK, NEW_BD_BOOK, 1)
    print("  patched BookDetail.jsx — hlCount hook")
else:
    print("  [WARN] useBook hook pattern not found in BookDetail — patch manually")

bd_path.write_text(bd)

# Now we need to add the Highlights tab to the tab bar and a Highlights panel.
# Find the tabs area — look for the review tab or date tab patterns.
bd = bd_path.read_text()

# Find the tab switching UI. We'll add a Highlights tab after whatever last tab exists.
# Strategy: find the tab selector and add a "highlights" option, then add the panel.

# Locate a tab button pattern to understand the structure
tab_pattern_match = "tab === 'review'" in bd or "tab === 'dates'" in bd
if tab_pattern_match:
    # Add the HighlightsTab component at the bottom of the file before the last }
    HIGHLIGHTS_COMPONENT = """
// ── Highlights tab content ────────────────────────────────────────────────
function HighlightsTab({ bookId }) {
  const { data: highlights = [], isLoading } = useHighlights(bookId)

  if (isLoading) return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
    </div>
  )

  if (highlights.length === 0) return (
    <div className="text-center py-10">
      <p className="text-3xl mb-3">✏️</p>
      <p className="text-sm font-medium text-ink-700 dark:text-ink-300 mb-1">No highlights yet</p>
      <p className="text-xs text-ink-400 dark:text-ink-500">
        Sync your Readwise account in Settings to import Kindle highlights.
      </p>
    </div>
  )

  return (
    <div className="space-y-3">
      {highlights.map(h => (
        <div key={h.id}
          className="rounded-xl border-l-4 border-teal-500 bg-paper-50 dark:bg-ink-800 p-4"
        >
          <p className="text-sm text-ink-800 dark:text-ink-100 leading-relaxed italic">
            "{h.text}"
          </p>
          {h.note && (
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-2 pt-2 border-t border-paper-200 dark:border-ink-700 not-italic">
              💬 {h.note}
            </p>
          )}
          {h.location && (
            <p className="text-xs text-ink-400 mt-1">Loc. {h.location}</p>
          )}
        </div>
      ))}
    </div>
  )
}
"""
    # Insert before the last line of the file (closing }) or just append
    if bd.rstrip().endswith('}'):
        bd = bd.rstrip()[:-1] + HIGHLIGHTS_COMPONENT + '\n}'
        bd_path.write_text(bd)
        print("  patched BookDetail.jsx — HighlightsTab component appended")

# Re-read for tab button + panel patches
bd = bd_path.read_text()

# Find "dates" tab button to insert "highlights" after it
# Typical pattern: onClick={() => setTab('dates')} or similar
# We'll look for the last tab button and add after
OLD_DATES_TAB_BTN = "onClick={() => setTab('dates')}"
if OLD_DATES_TAB_BTN in bd:
    # Find the full button element and add a sibling
    # Look for the pattern including the button closing
    OLD_TAB_BTN_BLOCK = "onClick={() => setTab('dates')}>"
    # We can't easily parse JSX, so we'll do a targeted string insert
    # Find the dates tab button text to locate the button
    DATES_LABEL = "Dates"
    if DATES_LABEL in bd:
        # Find "Dates" in the tab bar context and add Highlights after the button
        # Look for the closing of the Dates button
        import re as _re
        # Find the dates tab button and append highlights tab after
        bd = _re.sub(
            r"(<button[^>]*onClick=\{[^}]*setTab\('dates'\)[^}]*\}[^>]*>Dates</button>)",
            r"\1"
            r"\n              <button"
            r"\n                onClick={() => setTab('highlights')}"
            r"\n                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${"
            r"tab === 'highlights' ? 'bg-teal-600 text-white' : 'text-ink-500 dark:text-ink-400 hover:text-ink-800 dark:hover:text-ink-200'"
            r"}`}"
            r"\n              >"
            r"\n                Highlights{hlCount > 0 ? ` (${hlCount})` : ''}"
            r"\n              </button>",
            bd, count=1
        )
        bd_path.write_text(bd)
        print("  patched BookDetail.jsx — Highlights tab button added")

# Add the Highlights tab panel (after the dates panel conditional)
bd = bd_path.read_text()
OLD_DATES_PANEL = "tab === 'dates' && ("
if OLD_DATES_PANEL in bd:
    # Find the dates panel closing and add after
    # We insert the highlights panel as an additional conditional
    bd = bd.replace(
        "            {tab === 'highlights' && (\n              <HighlightsTab bookId={id} />\n            )}",
        ""  # Remove if already there (idempotent)
    )
    # Now add it after the dates panel. Find the dates panel block end.
    # Insert after: tab === 'dates' && ( ... )} — we'll add after the entire dates block
    # Simple approach: find end of dates panel by looking for the pattern after it
    idx = bd.find("tab === 'dates' && (")
    if idx != -1:
        # Find the matching close after it — look for "            )}" as the panel close
        rest = bd[idx:]
        # Find the first ")}" that closes the dates panel (3 levels deep)
        close_idx = rest.find("\n            )}")
        if close_idx != -1:
            insert_pos = idx + close_idx + len("\n            )}")
            HIGHLIGHTS_PANEL = """
            {tab === 'highlights' && (
              <HighlightsTab bookId={id} />
            )}"""
            bd = bd[:insert_pos] + HIGHLIGHTS_PANEL + bd[insert_pos:]
            bd_path.write_text(bd)
            print("  patched BookDetail.jsx — Highlights panel added")
        else:
            print("  [WARN] Could not find dates panel close — add Highlights panel manually")
    else:
        print("  [WARN] Dates panel not found — add Highlights panel manually")
else:
    print("  [WARN] tab === 'dates' pattern not found in BookDetail")

# ══════════════════════════════════════════════════════════════════════════════
# Version + Changelog
# ══════════════════════════════════════════════════════════════════════════════
settings = (REPO / "src/pages/Settings.jsx").read_text()
settings_new = re.sub(r'Kitab\s*[·•]\s*v[\d.]+', 'Kitab · v1.6.8', settings)
if settings_new != settings:
    (REPO / "src/pages/Settings.jsx").write_text(settings_new)
    print("  bumped version → v1.6.8")

CHANGELOG = """## v1.6.8 — 2026-03-07
- Feature: Readwise Highlights Sync
  — New /api/readwise-sync.js Vercel route proxies Readwise v2 API
  — New src/hooks/useHighlights.js with full sync orchestration + fuzzy matching
  — Settings: Readwise card with token input, Sync button, last-sync timestamp,
    and unmatched-book review queue with manual link-to-book selector
  — BookDetail: new Highlights tab showing all Kindle highlights as styled
    quote cards with inline notes and location numbers
  — Sync is idempotent (readwise_id unique key) — safe to run repeatedly
  — Token stored in localStorage only; never written to Supabase
"""
cl = REPO / "CHANGELOG.md"
existing = cl.read_text() if cl.exists() else ""
cl.write_text(CHANGELOG.strip() + "\n\n" + existing)
print("  updated CHANGELOG.md")

run('git add -A')
run('git commit -m "v1.6.8: Readwise highlights sync — API route, hook, Settings card, BookDetail tab"')
run('git push')

print("\n✅ v1.6.8 deployed. Vercel rebuilds in ~30s.")
print("   Step 1 (Supabase migration) must be run separately in your Supabase SQL editor.")
print("   See step1_supabase_migration.sql")
