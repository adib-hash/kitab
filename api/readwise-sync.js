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
