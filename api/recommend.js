// Vercel Serverless Function — proxies the Discovery recommendation call server-side
// so API keys are never exposed to the client.
//
// Primary model:  Gemini 3.5 Flash (Google Generative Language API, free tier).
// Fallback model: Claude Haiku 4.5 — used only when GEMINI_API_KEY is not set,
//                 so the feature never breaks while the Vercel env var rolls out.
//
// Returns the Anthropic Messages shape the client already parses:
//   data.content.find(b => b.type === 'text').text

const GEMINI_MODEL = 'gemini-3.5-flash'

export default async function handler(req, res) {
  // CORS — needed for iOS Capacitor (origin: capacitor://localhost)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body || {}
  if (!prompt) {
    return res.status(400).json({ error: `Missing prompt. Received keys: ${Object.keys(req.body || {}).join(', ')}` })
  }

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

// --- Gemini 3.5 Flash (primary) ---
// Thinking is disabled (thinkingBudget: 0) for a fast, single-shot answer.
async function callGemini(prompt, apiKey, thinking = false) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 1,
      maxOutputTokens: thinking ? 8192 : 4096,
      ...(thinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
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
    // A few Gemini variants reject an explicit thinkingBudget of 0 — retry once with thinking on.
    if (!thinking && /thinking/i.test(JSON.stringify(data))) return callGemini(prompt, apiKey, true)
    const e = new Error(data.error?.message || 'Gemini upstream error')
    e.status = resp.status
    throw e
  }

  const parts = data.candidates?.[0]?.content?.parts || []
  const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('')

  // If the answer was starved by thinking tokens, retry once with more headroom.
  if (!text.trim() && !thinking) return callGemini(prompt, apiKey, true)
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
