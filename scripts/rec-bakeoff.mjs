// LLM bake-off for Discover recommendations.
//
// Replays real Discover requests through several models using the app's exact
// prompt (buildPrompt in src/components/discover/QueryFlow.jsx, copied below)
// and the app's exact verification rule (enrichBook: Google Books title match).
// Then two blinded judges from different vendors score each list.
//
//   node scripts/rec-bakeoff.mjs gen      # call every model (resumable)
//   node scripts/rec-bakeoff.mjs verify   # parse + Google Books verification
//   node scripts/rec-bakeoff.mjs judge    # blinded LLM judging
//   node scripts/rec-bakeoff-report.mjs   # build the HTML report
//
// Input: scripts/rec-bakeoff-data.json (library, tags, past sessions), exported
// from Supabase. It and every output file hold personal data and are gitignored.
// Keys come from .env.local: GEMINI_API_KEY, ANTHROPIC_API_KEY, VITE_GOOGLE_BOOKS_API_KEY.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

export const DATA = path.join(here, 'rec-bakeoff-data.json')
export const RUNS = path.join(here, 'rec-bakeoff-runs.json')
export const GB_CACHE = path.join(here, 'rec-bakeoff-gbcache.json')
export const JUDGE = path.join(here, 'rec-bakeoff-judge.json')
const REPS = 2

// Prices in USD per 1M tokens (standard tier, text, prompts under 200k), checked 2026-09-26.
// Gemini "thinking" tokens bill as output. Claude thinking tokens are part of output_tokens.
export const CONFIGS = [
  { id: 'g35f', label: 'Gemini 3.5 Flash', note: 'Production today, thinking off', provider: 'gemini', model: 'gemini-3.5-flash', thinking: 'off', price: [1.5, 9.0], current: true },
  { id: 'g38f', label: 'Gemini 3.8 Flash', note: 'Newest Flash, thinking off', provider: 'gemini', model: 'gemini-3.8-flash', thinking: 'off', price: [0.75, 3.75], priceNote: '$1.50 / $7.50 from Jan 1, 2027' },
  { id: 'g38ft', label: 'Gemini 3.8 Flash + thinking', note: 'Newest Flash, low thinking', provider: 'gemini', model: 'gemini-3.8-flash', thinking: 'low', price: [0.75, 3.75], priceNote: '$1.50 / $7.50 from Jan 1, 2027' },
  { id: 'g35fl', label: 'Gemini 3.5 Flash-Lite', note: 'Cheapest current Gemini, minimal thinking', provider: 'gemini', model: 'gemini-3.5-flash-lite', thinking: 'minimal', price: [0.3, 2.5] },
  { id: 'g31p', label: 'Gemini 3.1 Pro', note: 'Preview, low thinking, no free tier', provider: 'gemini', model: 'gemini-3.1-pro-preview', thinking: 'low', price: [2.0, 12.0] },
  { id: 'haiku', label: 'Claude Haiku 4.5', note: 'Production fallback, no thinking', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', price: [1.0, 5.0], fallback: true },
  { id: 'sonnet', label: 'Claude Sonnet 5', note: 'Adaptive thinking, low effort', provider: 'anthropic', model: 'claude-sonnet-5', effort: 'low', price: [2.0, 10.0] },
  { id: 'opus', label: 'Claude Opus 5', note: 'Adaptive thinking, low effort', provider: 'anthropic', model: 'claude-opus-5', effort: 'low', price: [5.0, 25.0] },
  { id: 'opus55', label: 'Claude Opus 5.5', note: 'Adaptive thinking, low effort', provider: 'anthropic', model: 'claude-opus-5-5', effort: 'low', price: [4.0, 20.0] },
  { id: 'fable', label: 'Claude Fable 5.1', note: 'Thinking always on, low effort', provider: 'anthropic', model: 'claude-fable-5-1', effort: 'low', price: [10.0, 50.0] },
]

// Real requests from Adib's Discover history (two are suggestion chips).
export const PROMPTS = [
  { id: 'surprise', kind: 'Chip', text: 'Surprise me' },
  { id: 'favorites', kind: 'Chip', text: 'Based on my favorites' },
  { id: 'slap', kind: 'Open-ended', text: 'Read my reviews and pick something out that you think would slap' },
  { id: 'lostcity', kind: 'Specific', text: 'I really liked The Lost City of Z, but specifically the feeling of following Percy Fawcett who comes across like a “Nathan drake” type obsessive explorer. Or maybe like Indiana Jones uncovering ancient civilization. What are some books that capture this? Perhaps with a bit of action mixed in. Fiction and nonfiction are fine' },
  { id: 'oneday', kind: 'Specific', text: 'I watched “One Day” on Netflix and really enjoyed it - books like this?' },
  { id: 'lecarre', kind: 'Specific', text: 'John Le Carre type spy novel but maybe fantasy setting' },
  { id: 'moscow', kind: 'Specific', text: 'Something similar to Gentleman in Moscow -  personal narrative about a character living through a historic backdrop' },
  { id: 'islamic', kind: 'Genre', text: 'Islamic literature' },
  { id: 'housel', kind: 'Specific', text: 'Give me something nonfiction that has the conversational style / tone of Morgan Housel' },
]

// ---- Copied verbatim from src/components/discover/QueryFlow.jsx (keep in sync) ----
export function buildPrompt(userText, libraryBooks, pastRecTitles, tagNames) {
  const topBooks = libraryBooks
    .filter(b => b.status === 'read' && b.rating)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 20)
    .map(b => {
      const bookTags = (b.tags || [])
        .map(t => t.name)
        .filter(n => !/^\d+$/.test(n))
      const tagStr = bookTags.length ? ` [${bookTags.join(', ')}]` : ''
      const snippet = b.review
        ? ` — "${b.review.slice(0, 100)}${b.review.length > 100 ? '...' : ''}"`
        : ''
      return `- "${b.title}" by ${b.author} (${b.rating}★)${tagStr}${snippet}`
    })
    .join('\n')

  const allReadTitles = libraryBooks
    .filter(b => b.status === 'read' || b.status === 'reading' || b.status === 'tbr')
    .map(b => `"${b.title}" by ${b.author}`)
    .join(', ')

  const genreContext = tagNames.length
    ? `\nReader's genre categories (tags they use to organize their library):\n${tagNames.join(', ')}\n`
    : ''

  const pastRecsSection = pastRecTitles.length
    ? `\nBooks from previous recommendation sessions (DO NOT recommend these either):\n${pastRecTitles.join(', ')}\n`
    : ''

  return `You are an expert book curator with deep knowledge of literature across all genres.

The reader is looking for their next great read. They've described what they want below. Use their library, ratings, reviews, and tags to understand their taste deeply, then recommend books that fit their request.

Reader's highest-rated books (with tags and review snippets where available):
${topBooks || '(no rated books yet)'}
${genreContext}
All books already in their library (DO NOT recommend any of these):
${allReadTitles || '(none)'}
${pastRecsSection}
Reader's request: "${userText}"

Return ONLY a JSON array of exactly 8 book recommendations. No other text, no markdown, no explanation outside the JSON.

Each object must have:
- "title": exact title (no subtitles unless essential)
- "author": full author name
- "published_year": integer year or null
- "genre_hint": short genre label (e.g. "literary fiction", "memoir", "sci-fi", "philosophy")
- "why": one punchy sentence (15-25 words) explaining specifically why THIS reader will love it

Rules:
- Only recommend real, widely-available books
- No study guides, summaries, lecture collections, omnibus sets, or companion books
- Prioritize books with strong critical reception
- Never recommend a book already in the reader's library or from previous sessions
- Ensure at least 3 different genres across the 8 picks
- No more than 2 books from the same genre
- Include at least 1 book from a genre NOT heavily represented in the reader's library
- The "why" must be specific, not generic ("you'll love the world-building" is bad; "the same slow-burn dread as McCarthy but set in modern Tokyo" is good)`
}
// ---- end copy ----

export function loadData() {
  const d = JSON.parse(fs.readFileSync(DATA, 'utf8'))
  d.sessions = (d.sessions || []).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const pastRecTitles = d.sessions.slice(0, 10).flatMap(s => (s.books || []).map(b => `"${b.title}" by ${b.author}`))
  const tagNames = (d.tags || []).map(t => t.name).filter(n => !/^\d+$/.test(n))
  return { ...d, pastRecTitles, tagNames }
}

const readJSON = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback)
const writeJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1))
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------------- model calls (mirror api/recommend.js) ----------------
async function callGemini(cfg, prompt, { json = false, maxOut, schema } = {}) {
  const generationConfig = { temperature: 1, maxOutputTokens: maxOut || (cfg.thinking === 'off' ? 4096 : 8192) }
  if (cfg.thinking === 'off') generationConfig.thinkingConfig = { thinkingBudget: 0 }
  else if (cfg.thinking) generationConfig.thinkingConfig = { thinkingLevel: cfg.thinking }
  if (json) generationConfig.responseMimeType = 'application/json'
  if (schema) Object.assign(generationConfig, { responseMimeType: 'application/json', responseSchema: schema })
  const t0 = performance.now()
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
    signal: AbortSignal.timeout(180000),
  })
  const data = await resp.json()
  const ms = performance.now() - t0
  if (!resp.ok) {
    const e = new Error(`${resp.status} ${data.error?.message || 'Gemini error'}`.slice(0, 300))
    e.status = resp.status
    throw e
  }
  const parts = data.candidates?.[0]?.content?.parts || []
  const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('')
  const u = data.usageMetadata || {}
  return {
    text, ms,
    inTok: u.promptTokenCount || 0,
    outTok: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
    thinkTok: u.thoughtsTokenCount || 0,
    finish: data.candidates?.[0]?.finishReason,
  }
}

async function callAnthropic(cfg, prompt, { maxOut } = {}) {
  const body = { model: cfg.model, max_tokens: maxOut || 1500, messages: [{ role: 'user', content: prompt }] }
  if (cfg.effort) {
    body.max_tokens = maxOut || 16000
    body.thinking = { type: 'adaptive' }
    body.output_config = { effort: cfg.effort }
  }
  const t0 = performance.now()
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  })
  const data = await resp.json()
  const ms = performance.now() - t0
  if (!resp.ok) {
    const e = new Error(`${resp.status} ${data.error?.message || 'Anthropic error'}`.slice(0, 300))
    e.status = resp.status
    throw e
  }
  if (data.stop_reason === 'refusal') throw new Error('refusal')
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  return { text, ms, inTok: data.usage?.input_tokens || 0, outTok: data.usage?.output_tokens || 0, thinkTok: null, finish: data.stop_reason }
}

export async function callModel(cfg, prompt, opts) {
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = cfg.provider === 'gemini' ? await callGemini(cfg, prompt, opts) : await callAnthropic(cfg, prompt, opts)
      return { ...r, attempts: attempt + 1 }
    } catch (e) {
      lastErr = e
      if (e.status && e.status < 500 && e.status !== 429) break
      await sleep(3000 * (attempt + 1))
    }
  }
  throw Object.assign(lastErr, { attempts: 3 })
}

// ---------------- phase: gen ----------------
async function gen() {
  const d = loadData()
  const runs = readJSON(RUNS, {})
  const only = process.argv[3]?.split(',')
  const cfgs = CONFIGS.filter(c => !only || only.includes(c.id))
  // One worker per config, calls in sequence, so latency isn't skewed by self-contention.
  await Promise.all(cfgs.map(async cfg => {
    for (let rep = 1; rep <= REPS; rep++) {
      for (const p of PROMPTS) {
        const key = `${cfg.id}|${p.id}|${rep}`
        if (runs[key]?.text) continue
        const prompt = buildPrompt(p.text, d.books, d.pastRecTitles, d.tagNames)
        try {
          const r = await callModel(cfg, prompt)
          runs[key] = { cfg: cfg.id, prompt: p.id, rep, ...r, at: new Date().toISOString() }
          console.log(`${key}  ${(r.ms / 1000).toFixed(1)}s  in ${r.inTok} out ${r.outTok}`)
        } catch (e) {
          runs[key] = { cfg: cfg.id, prompt: p.id, rep, error: e.message, attempts: e.attempts, at: new Date().toISOString() }
          console.log(`${key}  ERROR ${e.message}`)
        }
        writeJSON(RUNS, runs)
      }
    }
  }))
}

// ---------------- phase: verify ----------------
const normalize = s => s?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''

export function parseRecs(text) {
  const jsonText = (text || '').replace(/```json|```/g, '').trim()
  try {
    const v = JSON.parse(jsonText)
    return Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

async function googleSearch(q) {
  const params = new URLSearchParams({ q, maxResults: 5, printType: 'books', key: process.env.VITE_GOOGLE_BOOKS_API_KEY })
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`)
    if (res.ok) {
      const data = await res.json()
      return (data.items || []).map(v => ({ title: v.volumeInfo?.title || '', authors: v.volumeInfo?.authors || [], ratingsCount: v.volumeInfo?.ratingsCount || 0 }))
    }
    if (res.status !== 429 && res.status < 500) throw new Error(`Google Books ${res.status}`)
    await sleep(2000 * (attempt + 1))
  }
  throw new Error('Google Books rate limited')
}

// Same acceptance rule as enrichBook() in QueryFlow.jsx.
function credibleMatch(book, results) {
  const titleWords = String(book.title).toLowerCase().split(/\s+/).filter(w => w.length > 2)
  return results.find(r => {
    const rTitle = r.title.toLowerCase()
    const hits = titleWords.filter(w => rTitle.includes(w))
    return hits.length >= Math.ceil(titleWords.length * 0.5)
  })
}

async function verify() {
  const d = loadData()
  const runs = readJSON(RUNS, {})
  const cache = readJSON(GB_CACHE, {})
  const library = new Set(d.books.map(b => normalize(b.title)))
  const past = new Set(d.sessions.slice(0, 10).flatMap(s => (s.books || []).map(b => normalize(b.title))))
  const everPast = new Set(d.sessions.flatMap(s => (s.books || []).map(b => normalize(b.title))))
  const queue = []
  for (const r of Object.values(runs)) {
    if (!r.text) continue
    const recs = parseRecs(r.text)
    r.parsed = !!recs
    r.recs = (recs || []).map(b => ({ title: b.title, author: b.author, genre: b.genre_hint, year: b.published_year, why: b.why }))
    for (const b of r.recs) {
      const key = normalize(b.title) + '|' + normalize(b.author)
      if (!(key in cache)) queue.push([key, b])
    }
  }
  const unique = [...new Map(queue).entries()]
  console.log(`Google Books lookups needed: ${unique.length}`)
  let i = 0
  const worker = async () => {
    while (i < unique.length) {
      const [key, b] = unique[i++]
      try {
        const results = await googleSearch(`intitle:"${b.title}" inauthor:"${b.author}"`)
        const m = credibleMatch(b, results)
        cache[key] = m ? { ok: true, title: m.title, authors: m.authors, ratingsCount: m.ratingsCount } : { ok: false }
      } catch (e) {
        console.log('lookup failed', b.title, e.message)
      }
      if (i % 25 === 0) { writeJSON(GB_CACHE, cache); console.log(`${i}/${unique.length}`) }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  writeJSON(GB_CACHE, cache)
  for (const r of Object.values(runs)) {
    for (const b of r.recs || []) {
      const g = cache[normalize(b.title) + '|' + normalize(b.author)]
      b.verified = g ? g.ok : null
      b.inLibrary = library.has(normalize(b.title)) || (g?.ok && library.has(normalize(g.title)))
      b.pastRec = past.has(normalize(b.title))
      b.everRecommended = everPast.has(normalize(b.title))
      b.whyWords = String(b.why || '').split(/\s+/).filter(Boolean).length
    }
  }
  writeJSON(RUNS, runs)
  console.log('verified')
}

// ---------------- phase: judge ----------------
export const JUDGES = [
  { id: 'opus', label: 'Claude Opus 5', provider: 'anthropic', model: 'claude-opus-5', effort: 'medium' },
  { id: 'gpro', label: 'Gemini 3.1 Pro', provider: 'gemini', model: 'gemini-3.1-pro-preview', thinking: 'high' },
  { id: 'claude', label: 'Claude Opus 5.5 (subagent)', provider: 'subagent' },
]

function judgePrompt(d, p, lists) {
  // The judges must see the whole library the models saw, with status and rating, or they
  // mistake correct references ("you read Grann twice") for hallucinations.
  const profileTop = buildPrompt(p.text, d.books, [], d.tagNames).split('All books already in their library')[0]
  const shelf = st => d.books.filter(b => b.status === st).map(b => `"${b.title}" by ${b.author}${b.rating ? ` (${b.rating}★)` : ''}`).join('; ')
  const profile = `${profileTop.trim()}

Full library (the systems also saw every title below):
Read: ${shelf('read')}
Currently reading: ${shelf('reading')}
Want to read (TBR, not yet read): ${shelf('tbr')}`
  const blocks = lists.map(l => `### List ${l.letter}\n` + l.recs.map((b, i) => `${i + 1}. "${b.title}" by ${b.author} (${b.genre || '?'}): ${b.why || ''}`).join('\n')).join('\n\n')
  return `You are judging book-recommendation lists produced by different AI systems for one real reader. The systems are anonymous and the list order is random.

Here is what the systems know about the reader:
---
${profile.trim()}
---

The reader's request was: "${p.text}"

${blocks}

Score every list from 1 to 10 on each criterion. Use the full range and compare the lists against each other.
- fit: how well the picks answer this specific request.
- taste: how well the picks match this reader's ratings, reviews and tags (not just the request).
- discovery: would this reader likely not already know these books, while still trusting them? Penalise the most obvious bestsellers and famous classics; reward well-chosen deeper cuts.
- accuracy: are these real books by the named authors, and is each "why" factually right about the book and about the reader? Penalise invented books, wrong authors, wrong claims about a book, and claims about the reader that contradict the library above (for example saying they loved a book that is only on their TBR). References to books that are in the library are allowed.
- why_quality: are the one-sentence reasons specific and persuasive, tying the book to this reader rather than generic praise?
- overall: how happy would this reader be to receive this list?

Also list any factual problems you are confident about (invented book, wrong author, wrong claim about the book).

Return only JSON, no other text, in this shape:
{"lists": [{"letter": "A", "fit": 0, "taste": 0, "discovery": 0, "accuracy": 0, "why_quality": 0, "overall": 0, "problems": ["..."], "comment": "one sentence"}]}`
}

function buildJudgeJobs(d, runs, judgeId) {
  const jobs = []
  for (const p of PROMPTS) {
    for (let rep = 1; rep <= REPS; rep++) {
      const key = `${judgeId}|${p.id}|${rep}`
      const lists = CONFIGS.map(c => runs[`${c.id}|${p.id}|${rep}`]).filter(r => r?.recs?.length).map(r => ({ cfg: r.cfg, recs: r.recs }))
      // deterministic shuffle per judge + prompt, so each judge sees its own order
      let seed = [...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)
      const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
      for (let k = lists.length - 1; k > 0; k--) { const m = Math.floor(rnd() * (k + 1)); [lists[k], lists[m]] = [lists[m], lists[k]] }
      lists.forEach((l, k) => (l.letter = String.fromCharCode(65 + k)))
      jobs.push({ p, rep, key, lists, prompt: judgePrompt(d, p, lists) })
    }
  }
  return jobs
}

function scoresFromParsed(parsed, lists) {
  const scores = {}
  for (const s of parsed.lists) {
    const l = lists.find(x => x.letter === s.letter)
    if (l) scores[l.cfg] = s
  }
  return scores
}

// Judging through Claude Code subagents instead of the API (used when API credit ran out).
// judge-files writes one prompt per round; judge-ingest reads <key>.json answers back.
function judgeFiles(dir) {
  const d = loadData()
  const runs = readJSON(RUNS, {})
  fs.mkdirSync(dir, { recursive: true })
  for (const job of buildJudgeJobs(d, runs, 'claude')) fs.writeFileSync(path.join(dir, job.key.replaceAll('|', '_') + '.prompt.txt'), job.prompt)
  console.log('wrote prompts to', dir)
}

function judgeIngest(dir) {
  const d = loadData()
  const runs = readJSON(RUNS, {})
  const out = readJSON(JUDGE, {})
  for (const job of buildJudgeJobs(d, runs, 'claude')) {
    const f = path.join(dir, job.key.replaceAll('|', '_') + '.json')
    if (!fs.existsSync(f)) { console.log('missing', f); continue }
    const parsed = JSON.parse(fs.readFileSync(f, 'utf8').match(/\{[\s\S]*\}/)[0])
    out[job.key] = { scores: scoresFromParsed(parsed, job.lists), letters: Object.fromEntries(job.lists.map(l => [l.letter, l.cfg])) }
  }
  writeJSON(JUDGE, out)
  console.log('ingested')
}

async function judge() {
  const d = loadData()
  const runs = readJSON(RUNS, {})
  const out = readJSON(JUDGE, {})
  const only = process.argv[3]?.split(',')
  const jobs = []
  for (const j of JUDGES.filter(j => !only || only.includes(j.id))) {
    for (const p of PROMPTS) {
      for (let rep = 1; rep <= REPS; rep++) {
        const key = `${j.id}|${p.id}|${rep}`
        if (out[key]?.scores) continue
        const lists = CONFIGS.map(c => runs[`${c.id}|${p.id}|${rep}`]).filter(r => r?.recs?.length).map(r => ({ cfg: r.cfg, recs: r.recs }))
        // deterministic shuffle per key so reruns are stable
        let seed = [...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7)
        const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
        for (let k = lists.length - 1; k > 0; k--) { const m = Math.floor(rnd() * (k + 1)); [lists[k], lists[m]] = [lists[m], lists[k]] }
        lists.forEach((l, k) => (l.letter = String.fromCharCode(65 + k)))
        jobs.push({ j, p, rep, key, lists })
      }
    }
  }
  console.log(`judge calls: ${jobs.length}`)
  let i = 0
  const worker = async () => {
    while (i < jobs.length) {
      const { j, p, key, lists } = jobs[i++]
      try {
        const r = await callModel(j, judgePrompt(d, p, lists), { json: true, maxOut: j.provider === 'gemini' ? 32000 : 20000 })
        const m = r.text.match(/\{[\s\S]*\}/)
        const parsed = JSON.parse(m[0])
        const scores = {}
        for (const s of parsed.lists) {
          const l = lists.find(x => x.letter === s.letter)
          if (l) scores[l.cfg] = s
        }
        out[key] = { scores, letters: Object.fromEntries(lists.map(l => [l.letter, l.cfg])), inTok: r.inTok, outTok: r.outTok, ms: r.ms }
        console.log(`${key} ok ${(r.ms / 1000).toFixed(0)}s`)
      } catch (e) {
        out[key] = { error: e.message }
        console.log(`${key} ERROR ${e.message}`)
      }
      writeJSON(JUDGE, out)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const phase = process.argv[2]
  if (phase === 'gen') await gen()
  else if (phase === 'verify') await verify()
  else if (phase === 'judge') await judge()
  else if (phase === 'judge-files') judgeFiles(process.argv[3])
  else if (phase === 'judge-ingest') judgeIngest(process.argv[3])
  else console.log('usage: node scripts/rec-bakeoff.mjs gen|verify|judge [ids]')
}
