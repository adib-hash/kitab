// Vercel Serverless Function — proxies the Discovery recommendation call server-side
// so API keys are never exposed to the client.
//
// Requires a signed-in Kitab user: the client sends its Supabase access token as
// `Authorization: Bearer <token>` and we verify it against Supabase Auth before
// spending any model credit. Vercel publishes every file in api/ as a public
// route, so without this check anyone could run prompts on our keys.
//
// Primary model:  Gemini 3.8 Flash with light thinking (Google Generative Language API).
//                  Chosen by the Sep 2026 bake-off (scripts/rec-bakeoff.mjs): better picks
//                  and fewer invented books than 3.5 Flash, same ~3 s wait, under half the cost.
// Fallback model: Claude Opus 5.5 at low effort, used when Gemini errors (e.g. "high
//                 demand") or returns something unreadable, or when GEMINI_API_KEY is
//                 unset. In the bake-off it made no invented books and ranked among the
//                 best lists; it's slower (~10 s) and pricier, but it rarely runs.
//                 Replaced Claude Haiku 4.5, which came last on quality.
//
// Whichever model answers, the text is normalised into a clean JSON array of
// recommendations and returned in the Anthropic Messages shape the client parses:
//   data.content.find(b => b.type === 'text').text

const GEMINI_MODEL = 'gemini-3.8-flash'
const CLAUDE_MODEL = 'claude-opus-5-5'
// The prompt carries reviews and Kindle highlights (src/lib/recPrompt.js budgets
// those to about 50,000 characters), plus every library title.
const MAX_PROMPT_CHARS = 100000

export default async function handler(req, res) {
  // CORS — needed for iOS Capacitor (origin: capacitor://localhost)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body || {}
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt' })
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(413).json({ error: 'Prompt too long' })
  }

  const authEnv = getAuthEnv()
  if (!authEnv) return res.status(500).json({ error: 'Server auth is not configured' })
  const user = await verifySupabaseUser(req, authEnv)
  if (!user) return res.status(401).json({ error: 'Sign in required' })

  try {
    let books
    if (process.env.GEMINI_API_KEY) {
      try {
        books = normalizeRecs(await callGemini(prompt, process.env.GEMINI_API_KEY))
      } catch (gemErr) {
        // Gemini busy, erroring, or unreadable: answer with Claude instead.
        if (!process.env.ANTHROPIC_API_KEY) throw gemErr
        books = normalizeRecs(await callClaude(prompt, process.env.ANTHROPIC_API_KEY))
      }
    } else {
      books = normalizeRecs(await callClaude(prompt, process.env.ANTHROPIC_API_KEY))
    }

    const text = JSON.stringify(books)
    return res.status(200).json({ content: [{ type: 'text', text }] })
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message })
  }
}

// --- Gemini 3.8 Flash (primary) ---
// Light thinking ('low') adds almost no latency here and cut invented or
// misattributed books from 6 to 1 in 144 picks versus thinking off.
// Thinking tokens count against maxOutputTokens, hence the 8192 headroom.
async function callGemini(prompt, apiKey) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: 'low' },
      // Constrain the answer to the exact shape the app reads, so it can't come
      // back as malformed JSON.
      responseMimeType: 'application/json',
      responseSchema: REC_SCHEMA,
    },
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    }
  )
  const data = await resp.json()

  if (!resp.ok) {
    const e = new Error(data.error?.message || 'Gemini upstream error')
    e.status = resp.status
    throw e
  }

  const parts = data.candidates?.[0]?.content?.parts || []
  const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('')
  // An empty answer throws, which sends the request to the Claude fallback.
  if (!text.trim()) throw new Error('Empty response from Gemini')
  return text
}

// --- Claude Opus 5.5 (fallback) ---
// Adaptive thinking at low effort, the setting tested in the bake-off. Opus 5.5
// can't turn thinking off; effort is the control. Thinking tokens count toward
// max_tokens, hence the headroom.
async function callClaude(prompt, apiKey) {
  if (!apiKey) {
    const e = new Error('No model API key configured')
    e.status = 500
    throw e
  }
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const e = new Error(data.error?.message || 'Anthropic upstream error')
    e.status = resp.status
    throw e
  }
  if (data.stop_reason === 'refusal') throw new Error('The model declined this request')
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  if (!text.trim()) throw new Error('Empty response from Anthropic')
  return text
}

// --- Response shape ---
export const REC_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      author: { type: 'STRING' },
      published_year: { type: 'INTEGER', nullable: true },
      genre_hint: { type: 'STRING' },
      why: { type: 'STRING' },
    },
    required: ['title', 'author', 'published_year', 'genre_hint', 'why'],
    propertyOrdering: ['title', 'author', 'published_year', 'genre_hint', 'why'],
  },
}

// Turns a model's answer into a clean array of recommendations. Accepts a JSON
// array (optionally in a ```json fence or with stray text around it), an object
// wrapping the array, or one JSON object per line, all of which models produced
// in the bake-off. Throws if nothing usable is found, which triggers the fallback.
export function normalizeRecs(text) {
  const raw = String(text || '').replace(/```(?:json)?/g, '').trim()
  let items = tryParse(raw)
  if (items && !Array.isArray(items)) items = Object.values(items).find(Array.isArray) || null
  if (!items) {
    const start = raw.indexOf('['), end = raw.lastIndexOf(']')
    if (start !== -1 && end > start) items = tryParse(raw.slice(start, end + 1))
  }
  if (!Array.isArray(items)) items = (raw.match(/\{[^{}]*\}/g) || []).map(tryParse).filter(Boolean)

  const books = items
    .filter(b => b && typeof b.title === 'string' && b.title.trim() && typeof b.author === 'string' && b.author.trim())
    .map(b => ({
      title: b.title.trim(),
      author: b.author.trim(),
      published_year: Number.isInteger(b.published_year) ? b.published_year : null,
      genre_hint: typeof b.genre_hint === 'string' ? b.genre_hint : '',
      why: typeof b.why === 'string' ? b.why : '',
    }))
  if (!books.length) throw new Error('The recommendation service returned an unreadable answer')
  return books
}

function tryParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// --- Caller verification ---
// The anon key is the same public key the frontend ships with; it only
// identifies the project. Missing env is reported as a 500 by the handler so
// a misconfigured deploy is distinguishable from an unauthenticated call.
function getAuthEnv() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  return url && anon ? { url, anon } : null
}

// Asks Supabase Auth who the bearer token belongs to. Any failure (no token,
// network error, expired session) returns null → 401.
async function verifySupabaseUser(req, { url, anon }) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    const u = await r.json()
    return u?.id ? u : null
  } catch {
    return null
  }
}
