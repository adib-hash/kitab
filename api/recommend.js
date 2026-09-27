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
// Fallback model: Claude Haiku 4.5 — used only when GEMINI_API_KEY is not set,
//                 so the feature never breaks while the Vercel env var rolls out.
//
// Returns the Anthropic Messages shape the client already parses:
//   data.content.find(b => b.type === 'text').text

const GEMINI_MODEL = 'gemini-3.8-flash'
const MAX_PROMPT_CHARS = 20000

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
    let text
    if (process.env.GEMINI_API_KEY) {
      try {
        text = await callGemini(prompt, process.env.GEMINI_API_KEY)
      } catch (gemErr) {
        // Gemini overloaded/errored at runtime (e.g. "high demand") — fall back to
        // Claude Haiku so recommendations don't break during a Gemini spike.
        // Previously we only fell back when GEMINI_API_KEY was entirely unset.
        if (!process.env.ANTHROPIC_API_KEY) throw gemErr
        text = await callHaiku(prompt, process.env.ANTHROPIC_API_KEY)
      }
    } else {
      text = await callHaiku(prompt, process.env.ANTHROPIC_API_KEY)
    }

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

// --- Claude Haiku 4.5 (fallback when GEMINI_API_KEY is unset) ---
async function callHaiku(prompt, apiKey) {
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await resp.json()
  if (!resp.ok) {
    const e = new Error(data.error?.message || 'Anthropic upstream error')
    e.status = resp.status
    throw e
  }
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  if (!text.trim()) throw new Error('Empty response from Anthropic')
  return text
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
