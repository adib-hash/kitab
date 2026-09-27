// Prompt bake-off for Discover: does giving the model Adib's reviews and Kindle
// highlights produce better recommendations? The model stays fixed at the
// production setup (Gemini 3.8 Flash, light thinking, strict JSON schema); only
// the prompt changes. Picks go through the production pipeline: normalizeRecs
// (api/recommend.js), findVerifiedMatch and filterUnseen (src/lib/recVerify.js).
//
//   node scripts/rec-prompt-bakeoff.mjs gen            # 6 variants x 9 requests x 2 runs
//   node scripts/rec-prompt-bakeoff.mjs verify         # Google Books + repeat filter
//   node scripts/rec-prompt-bakeoff.mjs judge          # Gemini 3.1 Pro judge (API)
//   node scripts/rec-prompt-bakeoff.mjs judge-files D  # prompts for Claude subagent judges
//   node scripts/rec-prompt-bakeoff.mjs judge-ingest D
//   node scripts/rec-prompt-bakeoff.mjs report         # REC-PROMPT-BAKEOFF.html
//
// Needs scripts/rec-bakeoff-data.json with books (incl. review, date_finished),
// tags, sessions and highlights. All data and output files are gitignored.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROMPTS, CONFIGS, buildPrompt, loadData, callModel } from './rec-bakeoff.mjs'
import { normalizeRecs, REC_SCHEMA } from '../api/recommend.js'
import { findVerifiedMatch, filterUnseen } from '../src/lib/recVerify.js'
import { TOKENS } from './rec-report-tokens.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const RUNS = path.join(here, 'rec-prompt-runs.json')
const GB = path.join(here, 'rec-prompt-gbcache.json')
const JUDGE = path.join(here, 'rec-prompt-judge.json')
const OUT = path.join(here, '..', 'REC-PROMPT-BAKEOFF.html')
const REPS = 2
const MODEL = CONFIGS.find(c => c.id === 'g38ft')
const readJSON = (f, fb) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fb)
const writeJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1))
const sleep = ms => new Promise(r => setTimeout(r, ms))

export const VARIANTS = [
  { id: 'base', label: 'Today', note: 'Top 20 rated books, first 100 characters of any review on them (3 of 19 reviews)', reviews: 0, highlights: 'none' },
  { id: 'r1500', label: 'Reviews, excerpted', note: 'Every review, up to 1,500 characters', reviews: 1500, highlights: 'none' },
  { id: 'rfull', label: 'Reviews, full', note: 'Every review in full', reviews: Infinity, highlights: 'none' },
  { id: 'r1500h6', label: 'Reviews + highlight sample', note: 'Excerpted reviews, up to 6 highlights per book', reviews: 1500, highlights: 6 },
  { id: 'r1500hall', label: 'Reviews + all highlights', note: 'Excerpted reviews, all 105 highlights', reviews: 1500, highlights: Infinity },
  { id: 'rfullhall', label: 'Everything', note: 'Full reviews, all 105 highlights', reviews: Infinity, highlights: Infinity },
]

// ---------------- prompt ----------------
const stars = r => (r ? ` (${r}★)` : '')
const shelf = b => (b.status === 'read' ? '' : b.status === 'reading' ? ', currently reading' : ', not read yet')

function excerpt(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  return (end > max * 0.6 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '')) + ' […]'
}

// Evenly spaced picks across the book, so a sample isn't just the opening chapters.
function spread(items, n) {
  if (items.length <= n) return items
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)])
}

export function reviewsSection(d, max) {
  const reviewed = d.books.filter(b => b.review?.trim()).sort((a, b) => (b.rating || 0) - (a.rating || 0))
  if (!reviewed.length) return ''
  return `\nThe reader's own reviews, in their words. Use these to understand what they value, what moved them and what they criticised:\n` +
    reviewed.map(b => `- "${b.title}" by ${b.author}${stars(b.rating)}${shelf(b)}: ${excerpt(b.review, max)}`).join('\n') + '\n'
}

export function highlightsSection(d, perBook) {
  const byBook = new Map()
  for (const h of d.highlights || []) {
    const k = h.title + '|' + h.author
    if (!byBook.has(k)) byBook.set(k, { b: h, items: [] })
    byBook.get(k).items.push(h)
  }
  if (!byBook.size) return ''
  const blocks = [...byBook.values()]
    .sort((x, y) => (y.b.rating || 0) - (x.b.rating || 0))
    .map(({ b, items }) => `From "${b.title}" by ${b.author}${stars(b.rating)}${shelf(b)}:\n` +
      spread(items, perBook).map(h => `  - "${String(h.text).replace(/\s+/g, ' ').trim()}"`).join('\n'))
  return `\nPassages the reader highlighted while reading. They show what catches their attention sentence by sentence (voice, ideas, emotional register):\n${blocks.join('\n')}\n`
}

export function buildRichPrompt(userText, d, v) {
  if (v.id === 'base') return buildPrompt(userText, d.books, d.pastRecTitles, d.tagNames)
  const topBooks = d.books
    .filter(b => b.status === 'read' && b.rating)
    // ties broken by most recently finished, so the cut among 33 five-star books isn't arbitrary
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(b.date_finished || '').localeCompare(String(a.date_finished || '')))
    .slice(0, 20)
    .map(b => {
      const tags = (b.tags || []).map(t => t.name).filter(n => !/^\d+$/.test(n))
      return `- "${b.title}" by ${b.author} (${b.rating}★)${tags.length ? ` [${tags.join(', ')}]` : ''}`
    }).join('\n')
  const allTitles = d.books.filter(b => ['read', 'reading', 'tbr'].includes(b.status)).map(b => `"${b.title}" by ${b.author}`).join(', ')
  const genre = d.tagNames.length ? `\nReader's genre categories (tags they use to organize their library):\n${d.tagNames.join(', ')}\n` : ''
  const past = d.pastRecTitles.length ? `\nBooks from previous recommendation sessions (DO NOT recommend these either):\n${d.pastRecTitles.join(', ')}\n` : ''
  const reviews = v.reviews ? reviewsSection(d, v.reviews) : ''
  const highlights = v.highlights !== 'none' ? highlightsSection(d, v.highlights) : ''

  return `You are an expert book curator with deep knowledge of literature across all genres.

The reader is looking for their next great read. They've described what they want below. Use their ratings, their own reviews, the passages they highlighted, and their tags to understand their taste deeply, then recommend books that fit their request.

Reader's highest-rated books:
${topBooks}
${reviews}${highlights}${genre}
All books already in their library (DO NOT recommend any of these):
${allTitles}
${past}
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
- The "why" must be specific, not generic ("you'll love the world-building" is bad; "the same slow-burn dread as McCarthy but set in modern Tokyo" is good). Where it fits, connect it to something the reader said in a review or chose to highlight, but never misquote them.`
}

// ---------------- gen ----------------
async function gen() {
  const d = loadData()
  const runs = readJSON(RUNS, {})
  for (const v of VARIANTS) console.log(v.id.padEnd(10), buildRichPrompt('Surprise me', d, v).length, 'chars')
  // One worker per variant; calls within a variant run in sequence so latency is comparable.
  await Promise.all(VARIANTS.map(async v => {
    for (let rep = 1; rep <= REPS; rep++) for (const p of PROMPTS) {
      const key = `${v.id}|${p.id}|${rep}`
      if (runs[key]?.text) continue
      try {
        const r = await callModel(MODEL, buildRichPrompt(p.text, d, v), { schema: REC_SCHEMA })
        runs[key] = { v: v.id, prompt: p.id, rep, ...r }
        console.log(`${key} ${(r.ms / 1000).toFixed(1)}s in ${r.inTok} out ${r.outTok}`)
      } catch (e) {
        runs[key] = { v: v.id, prompt: p.id, rep, error: e.message }
        console.log(`${key} ERROR ${e.message}`)
      }
      writeJSON(RUNS, runs)
    }
  }))
}

// ---------------- verify (production pipeline) ----------------
async function gbSearch(q, maxResults) {
  const params = new URLSearchParams({ q, maxResults, printType: 'books', key: process.env.VITE_GOOGLE_BOOKS_API_KEY })
  for (let a = 0; a < 5; a++) {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`)
    if (res.ok) { const j = await res.json(); return (j.items || []).map(x => ({ title: x.volumeInfo?.title || '', author: x.volumeInfo?.authors?.join(', ') || 'Unknown Author' })) }
    await sleep(1500 * (a + 1))
  }
  throw new Error('Google Books unavailable')
}

async function verify() {
  const d = loadData()
  const runs = readJSON(RUNS, {})
  const cache = readJSON(GB, {})
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const todo = new Map()
  for (const r of Object.values(runs)) {
    if (!r.text) continue
    try { r.recs = normalizeRecs(r.text); r.parsed = true } catch { r.recs = []; r.parsed = false }
    for (const b of r.recs) { const k = norm(b.title) + '|' + norm(b.author); if (!(k in cache)) todo.set(k, b) }
  }
  console.log('lookups', todo.size)
  const items = [...todo.entries()]
  let i = 0
  await Promise.all([1, 2, 3].map(async () => {
    while (i < items.length) {
      const [k, b] = items[i++]
      try { const m = await findVerifiedMatch(b, gbSearch); cache[k] = m ? { ok: true, title: m.title } : { ok: false } } catch (e) { console.log('lookup failed', b.title) }
    }
  }))
  writeJSON(GB, cache)
  for (const r of Object.values(runs)) {
    for (const b of r.recs || []) { const g = cache[norm(b.title) + '|' + norm(b.author)]; b.verified = g ? g.ok : null; b.gbTitle = g?.title }
    const verified = (r.recs || []).filter(b => b.verified).map(b => ({ ...b, title: b.gbTitle || b.title }))
    const unseen = filterUnseen(verified, d.books, d.sessions)
    r.shown = unseen.length
    r.filteredSeen = verified.length - unseen.length
    const shownTitles = new Set(unseen.map(b => b.title))
    for (const b of r.recs || []) b.shown = shownTitles.has(b.gbTitle || b.title)
  }
  writeJSON(RUNS, runs)
  console.log('verified')
}

// ---------------- judging ----------------
// Judges always see the richest profile (full reviews, all highlights, full library)
// so they can tell whether a list actually reflects them.
function judgeProfile(d) {
  const top = buildRichPrompt('x', d, VARIANTS.find(v => v.id === 'rfullhall')).split('Reader\'s highest-rated books:')[1].split('All books already in their library')[0]
  const shelfList = st => d.books.filter(b => b.status === st).map(b => `"${b.title}" by ${b.author}${b.rating ? ` (${b.rating}★)` : ''}`).join('; ')
  return `Reader's highest-rated books:${top}
Full library:
Read: ${shelfList('read')}
Currently reading: ${shelfList('reading')}
Want to read (TBR, not yet read): ${shelfList('tbr')}`
}

function judgePrompt(d, p, lists) {
  const blocks = lists.map(l => `### List ${l.letter}\n` + l.recs.map((b, i) => `${i + 1}. "${b.title}" by ${b.author} (${b.genre_hint || '?'}): ${b.why || ''}`).join('\n')).join('\n\n')
  return `You are judging book-recommendation lists produced by different AI systems for one real reader. The systems are anonymous, the list order is random, and the systems may have been given different amounts of information about the reader.

Here is everything known about the reader:
---
${judgeProfile(d).trim()}
---

The reader's request was: "${p.text}"

${blocks}

Score every list from 1 to 10 on each criterion. Use the full range and compare the lists against each other.
- fit: how well the picks answer this specific request.
- taste: how well the picks match this reader's ratings, reviews and highlights (not just the request).
- insight: do the picks and reasons show real understanding of what this reader values, as revealed in their reviews and highlights, beyond genre and ratings? Reward picks that follow what they praised or criticised in their own words.
- discovery: would this reader likely not already know these books, while still trusting them? Penalise the most obvious bestsellers and famous classics; reward well-chosen deeper cuts.
- accuracy: are these real books by the named authors, and is each "why" factually right about the book and about the reader? Penalise invented books, wrong authors, wrong claims, misquotes of the reader, and claims that contradict the library (for example saying they loved a book that is only on their TBR). References to books that are in the library are allowed.
- why_quality: are the one-sentence reasons specific and persuasive?
- overall: how happy would this reader be to receive this list?

Also list any factual problems you are confident about.

Return only JSON, no other text, in this shape:
{"lists": [{"letter": "A", "fit": 0, "taste": 0, "insight": 0, "discovery": 0, "accuracy": 0, "why_quality": 0, "overall": 0, "problems": ["..."], "comment": "one sentence"}]}`
}

function judgeJobs(d, runs, judgeId) {
  const jobs = []
  for (const p of PROMPTS) for (let rep = 1; rep <= REPS; rep++) {
    const key = `${judgeId}|${p.id}|${rep}`
    const lists = VARIANTS.map(v => runs[`${v.id}|${p.id}|${rep}`]).filter(r => r?.recs?.length).map(r => ({ v: r.v, recs: r.recs }))
    let seed = [...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 11)
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32)
    for (let k = lists.length - 1; k > 0; k--) { const m = Math.floor(rnd() * (k + 1)); [lists[k], lists[m]] = [lists[m], lists[k]] }
    lists.forEach((l, k) => (l.letter = String.fromCharCode(65 + k)))
    jobs.push({ key, lists, prompt: judgePrompt(d, p, lists) })
  }
  return jobs
}

const toScores = (parsed, lists) => Object.fromEntries(parsed.lists.map(s => [lists.find(l => l.letter === s.letter)?.v, s]).filter(([v]) => v))

async function judge() {
  const d = loadData(), runs = readJSON(RUNS, {}), out = readJSON(JUDGE, {})
  const J = { provider: 'gemini', model: 'gemini-3.1-pro-preview', thinking: 'high' }
  const jobs = judgeJobs(d, runs, 'gpro').filter(j => !out[j.key]?.scores)
  let i = 0
  await Promise.all([1, 2, 3, 4].map(async () => {
    while (i < jobs.length) {
      const job = jobs[i++]
      try {
        const r = await callModel(J, job.prompt, { json: true, maxOut: 32000 })
        out[job.key] = { scores: toScores(JSON.parse(r.text.match(/\{[\s\S]*\}/)[0]), job.lists) }
        console.log(job.key, 'ok')
      } catch (e) { out[job.key] = { error: e.message }; console.log(job.key, 'ERROR', e.message) }
      writeJSON(JUDGE, out)
    }
  }))
}

function judgeFiles(dir) {
  const d = loadData(), runs = readJSON(RUNS, {})
  fs.mkdirSync(dir, { recursive: true })
  for (const j of judgeJobs(d, runs, 'claude')) fs.writeFileSync(path.join(dir, j.key.replaceAll('|', '_') + '.prompt.txt'), j.prompt)
  console.log('wrote', dir)
}

function judgeIngest(dir) {
  const d = loadData(), runs = readJSON(RUNS, {}), out = readJSON(JUDGE, {})
  for (const j of judgeJobs(d, runs, 'claude')) {
    const f = path.join(dir, j.key.replaceAll('|', '_') + '.json')
    if (!fs.existsSync(f)) { console.log('missing', f); continue }
    out[j.key] = { scores: toScores(JSON.parse(fs.readFileSync(f, 'utf8').match(/\{[\s\S]*\}/)[0]), j.lists) }
  }
  writeJSON(JUDGE, out)
  console.log('ingested')
}

// ---------------- report ----------------
function report() {
  const d = loadData(), runs = readJSON(RUNS, {}), judged = readJSON(JUDGE, {})
  const notes = readJSON(path.join(here, 'rec-prompt-notes.json'), { verdict: '', findings: [], options: [] })
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
  const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }
  const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : '–')
  const CRIT = [['overall', 'Overall'], ['fit', 'Fits the ask'], ['taste', 'Fits your taste'], ['insight', 'Understands you'], ['discovery', 'Discovery'], ['accuracy', 'Accuracy'], ['why_quality', 'Why line']]
  const stats = VARIANTS.map(v => {
    const rs = PROMPTS.flatMap(p => [1, 2].map(rep => runs[`${v.id}|${p.id}|${rep}`])).filter(r => r?.text)
    const cost = rs.map(r => (r.inTok * MODEL.price[0] + r.outTok * MODEL.price[1]) / 1e6)
    const lat = rs.map(r => r.ms / 1000)
    const byJudge = {}
    for (const jid of ['gpro', 'claude']) {
      const rows = Object.entries(judged).filter(([k, x]) => k.startsWith(jid + '|') && x.scores?.[v.id]).map(([, x]) => x.scores[v.id])
      byJudge[jid] = Object.fromEntries(CRIT.map(([c]) => [c, avg(rows.map(r => Number(r[c])).filter(Number.isFinite))]))
      byJudge[jid].n = rows.length
    }
    const crit = Object.fromEntries(CRIT.map(([c]) => [c, avg(['gpro', 'claude'].map(j => byJudge[j][c]).filter(Number.isFinite))]))
    let wins = 0
    for (const x of Object.values(judged)) {
      if (!x.scores?.[v.id]) continue
      const top = Math.max(...Object.values(x.scores).map(s => Number(s.overall)))
      if (Number(x.scores[v.id].overall) === top) wins++
    }
    const promptChars = buildRichPrompt('Surprise me', d, v).length
    return {
      v, n: rs.length, byJudge, crit, wins, promptChars,
      inTok: avg(rs.map(r => r.inTok)), p50: pct(lat, 0.5), p90: pct(lat, 0.9), cost: avg(cost),
      // Repeats counted over every pick (library or past sessions). Google Books verification is
      // left out: it doesn't depend on the prompt, and the key's daily quota ran out mid-run.
      repeats: rs.reduce((a, r) => a + (r.recs || []).length - filterUnseen(r.recs || [], d.books, d.sessions).length, 0), parsed: rs.filter(r => r.parsed).length,
      comments: Object.entries(judged).filter(([, x]) => x.scores?.[v.id]?.comment).map(([k, x]) => ({ k, c: x.scores[v.id].comment })),
    }
  })
  const base = stats.find(s => s.v.id === 'base')
  const best = [...stats].sort((a, b) => b.crit.overall - a.crit.overall)[0]
  const rounds = Object.values(judged).filter(x => x.scores).length
  const maxOverall = Math.max(...stats.map(s => s.crit.overall))

  const rows = stats.map(s => `<tr class="${s === best ? 'is-best' : ''}${s === base ? ' is-base' : ''}">
    <td><div class="model">${esc(s.v.label)}${s === base ? ' <span class="chip slate">Live today</span>' : ''}</div><div class="sub">${esc(s.v.note)}</div></td>
    ${CRIT.map(([c], i) => `<td class="num${i === 0 ? ' strong' : ''}">${f1(s.crit[c])}</td>`).join('')}
    <td class="num">${s.wins}</td></tr>`).join('')

  const opsRows = stats.map(s => `<tr><td><div class="model">${esc(s.v.label)}</div></td>
    <td class="num">${Math.round(s.promptChars / 1000)}k</td><td class="num">${Math.round(s.inTok).toLocaleString()}</td>
    <td class="num">${s.p50.toFixed(1)}s</td><td class="num">${s.p90.toFixed(1)}s</td>
    <td class="num">$${(s.cost * 1000).toFixed(1)}</td><td class="num">$${(s.cost * 72).toFixed(2)}</td>
    <td class="num">${s.repeats}</td><td class="num">${s.parsed}/${s.n}</td></tr>`).join('')

  const judgeRows = stats.map(s => `<tr><td><div class="model">${esc(s.v.label)}</div></td>
    <td class="num">${f1(s.byJudge.gpro.overall)}</td><td class="num">${f1(s.byJudge.gpro.insight)}</td>
    <td class="num">${f1(s.byJudge.claude.overall)}</td><td class="num">${f1(s.byJudge.claude.insight)}</td></tr>`).join('')

  const barRows = [...stats].sort((a, b) => b.crit.overall - a.crit.overall).map(s => `<div class="lrow"><div class="lname">${esc(s.v.label)}</div>
    <div class="ltrack"><span class="lp50" style="width:${(s.crit.overall / 10) * 100}%"></span><span class="lins" style="left:${(s.crit.insight / 10) * 100}%" title="Understands you"></span></div>
    <div class="lval num">${f1(s.crit.overall)}</div></div>`).join('')

  const tabs = PROMPTS.map((p, i) => `<button class="ptab" role="tab" aria-selected="${i === 0}" data-p="${p.id}">${esc(p.text.length > 34 ? p.text.slice(0, 32) + '…' : p.text)}</button>`).join('')
  const panels = PROMPTS.map((p, i) => `<section class="ppanel" data-p="${p.id}" ${i ? 'hidden' : ''}>
    <p class="ask"><span class="eyebrow">${esc(p.kind)} request</span><br>“${esc(p.text)}”</p>
    <div class="lists">${stats.map(s => {
      const r = runs[`${s.v.id}|${p.id}|1`]
      const sc = ['gpro', 'claude'].map(j => judged[`${j}|${p.id}|1`]?.scores?.[s.v.id]).filter(Boolean)
      const o = avg(sc.map(x => Number(x.overall)))
      return `<details class="lcard" ${s === best || s === base ? 'open' : ''}><summary><span class="model">${esc(s.v.label)}</span>${s === base ? ' <span class="chip slate">Live today</span>' : ''}<span class="lscore num">${f1(o)}</span></summary>
        ${sc[0]?.comment ? `<p class="jc">Judge: ${esc(sc[0].comment)}</p>` : ''}
        <ol class="picks">${(r?.recs || []).map(b => `<li><div class="pt"><b>${esc(b.title)}</b> <span class="muted">· ${esc(b.author)}</span>${filterUnseen([b], d.books, d.sessions).length ? '' : ' <span class="chip amber">Already seen</span>'}</div><div class="pw">${esc(b.why)}</div></li>`).join('')}</ol>
        ${r?.ms ? `<p class="lmeta num">${(r.ms / 1000).toFixed(1)}s · ${r.inTok.toLocaleString()} input tokens</p>` : ''}</details>`
    }).join('')}</div></section>`).join('')

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Discover Prompt Bake-off</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
${TOKENS}
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans); font-size: 16px; line-height: 1.6; padding-block: 0 96px; padding-inline: 20px; -webkit-font-smoothing: antialiased; }
  h1, h2 { font-family: var(--serif); font-weight: 600; line-height: 1.15; margin: 0; text-wrap: balance; }
  p { margin: 0; }
  .frame { max-width: 1120px; margin: 0 auto; display: grid; gap: 52px; }
  .eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
  .num { font-variant-numeric: tabular-nums; }
  .muted { color: var(--ink-3); }
  header.mast { padding-block: 56px 36px; display: grid; gap: 18px; border-bottom: 1px solid var(--line); }
  header.mast h1 { font-size: clamp(36px, 6vw, 60px); letter-spacing: -.01em; }
  header.mast h1 em { font-style: italic; font-weight: 400; color: var(--teal); }
  .thesis { font-size: 20px; line-height: 1.5; max-width: 64ch; color: var(--ink-2); }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 24px; font-size: 14px; color: var(--ink-3); }
  .meta b { color: var(--ink-2); font-weight: 500; }
  section.block { display: grid; gap: 16px; }
  section.block > h2 { font-size: 30px; }
  .lede { max-width: 70ch; color: var(--ink-2); }
  .verdict { background: var(--teal-wash); border: 1px solid var(--teal-line); border-radius: 12px; padding: 20px 22px; display: grid; gap: 8px; max-width: 80ch; }
  .verdict p { color: var(--ink-2); }
  .tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  th { text-align: left; font-family: var(--mono); font-weight: 500; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); padding: 12px 14px; border-bottom: 1px solid var(--line); white-space: nowrap; vertical-align: bottom; }
  th.num, td.num { text-align: right; }
  td { padding: 11px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  tr.is-best td { background: var(--teal-wash); }
  td.strong { font-weight: 600; }
  .model { font-weight: 600; white-space: nowrap; }
  .sub { font-size: 14px; color: var(--ink-3); min-width: 220px; }
  .chip { display: inline-block; font-size: 12px; font-weight: 500; line-height: 1; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--line-strong); color: var(--ink-2); vertical-align: 2px; white-space: nowrap; }
  .chip.slate { background: var(--slate-wash); color: var(--slate); }
  .chip.rose { border-color: var(--rose-line); color: var(--rose); background: var(--rose-wash); }
  .chip.amber { border-color: var(--amber-line); color: var(--amber); background: var(--amber-wash); }
  .note { font-size: 14px; color: var(--ink-3); max-width: 80ch; }
  .lchart { display: grid; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; }
  .lrow { display: grid; grid-template-columns: minmax(150px, 230px) 1fr auto; gap: 14px; align-items: center; font-size: 15px; }
  .ltrack { position: relative; height: 12px; border-radius: 6px; background: var(--surface-2); }
  .lp50 { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; background: var(--teal); }
  .lins { position: absolute; top: -4px; bottom: -4px; width: 3px; margin-left: -1px; border-radius: 2px; background: var(--amber); }
  .lval { min-width: 44px; text-align: right; font-weight: 600; }
  @media (max-width: 560px) { .lrow { grid-template-columns: 1fr auto; } .ltrack { grid-column: 1 / -1; order: 3; } }
  .legend { font-size: 14px; color: var(--ink-3); display: flex; gap: 18px; flex-wrap: wrap; }
  .legend i { display: inline-block; width: 14px; height: 10px; border-radius: 3px; background: var(--teal); margin-right: 6px; vertical-align: 0; }
  .legend i.a { width: 3px; background: var(--amber); }
  .list { display: grid; gap: 12px; padding: 0; list-style: none; margin: 0; }
  .list li { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; color: var(--ink-2); }
  .list li b { color: var(--ink); }
  .ptabs { display: flex; flex-wrap: wrap; gap: 8px; }
  .ptab { font: inherit; font-size: 14px; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-2); cursor: pointer; }
  .ptab[aria-selected="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .ptab:focus-visible, summary:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
  .ppanel { display: grid; gap: 14px; }
  .ask { font-family: var(--serif); font-size: 20px; font-style: italic; color: var(--ink-2); max-width: 70ch; }
  .ask .eyebrow { font-style: normal; }
  .lists { display: grid; gap: 10px; }
  .lcard { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 4px 18px; }
  .lcard[open] { padding-bottom: 14px; }
  .lcard summary { cursor: pointer; padding: 12px 0; display: flex; gap: 8px; align-items: center; list-style: none; }
  .lcard summary::-webkit-details-marker { display: none; }
  .lcard summary::before { content: ''; width: 7px; height: 7px; border-right: 2px solid var(--ink-3); border-bottom: 2px solid var(--ink-3); transform: rotate(-45deg); margin-right: 6px; transition: transform .15s; }
  .lcard[open] summary::before { transform: rotate(45deg); }
  .lscore { margin-left: auto; font-weight: 600; color: var(--teal); }
  .jc { font-size: 14px; color: var(--ink-3); font-style: italic; margin-bottom: 8px; }
  .picks { margin: 0; padding-left: 1.3em; display: grid; gap: 8px; }
  .pt { font-size: 15px; } .pw { font-size: 14px; color: var(--ink-2); }
  .lmeta { font-size: 13px; color: var(--ink-3); margin-top: 10px; font-family: var(--mono); }
  footer { font-size: 14px; color: var(--ink-3); border-top: 1px solid var(--line); padding-top: 20px; display: grid; gap: 8px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style></head><body><div class="frame">
<header class="mast">
  <span class="eyebrow">Kitab · Discover · ${new Date().toISOString().slice(0, 10)}</span>
  <h1>Does it help to <em>read your reviews?</em></h1>
  <p class="thesis">Six versions of the Discover prompt, from today’s to one carrying every review and highlight you’ve written, each answered your same nine real requests twice on the production model, Gemini 3.8 Flash. Two judges who could see all your reviews and highlights scored every list blind.</p>
  <div class="meta"><span><b>${stats.reduce((a, s) => a + s.n, 0)}</b> answers</span><span><b>${rounds}</b> judging rounds</span><span><b>${(d.books || []).filter(b => b.review?.trim()).length}</b> reviews</span><span><b>${(d.highlights || []).length}</b> highlights from <b>${new Set((d.highlights || []).map(h => h.title)).size}</b> books</span></div>
</header>
<section class="block"><h2>The short version</h2><div class="verdict">${notes.verdict}</div></section>
<section class="block"><h2>Judges’ scores</h2>
  <p class="lede">Average of both judges, 1 to 10, with lists compared side by side for each request. “Understands you” is new for this round: whether the picks and reasons reflect what you’ve praised or criticised in your own words.</p>
  <div class="lchart">${barRows}</div>
  <div class="legend"><span><i></i>Overall</span><span><i class="a"></i>Understands you</span></div>
  <div class="tablewrap"><table><thead><tr><th>Prompt</th>${CRIT.map(([, l]) => `<th class="num">${l}</th>`).join('')}<th class="num">Top-rated</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="note">“Top-rated” counts judging rounds where that version had the best overall score, ties included, out of ${rounds}.</p>
</section>
<section class="block"><h2>Findings</h2><ul class="list">${notes.findings.map(f => `<li>${f}</li>`).join('')}</ul></section>
<section class="block"><h2>Size, speed and cost</h2>
  <div class="tablewrap"><table><thead><tr><th>Prompt</th><th class="num">Prompt size</th><th class="num">Input tokens</th><th class="num">Typical wait</th><th class="num">Slow wait</th><th class="num">Per 1,000 requests</th><th class="num">Per year*</th><th class="num">Repeats caught</th><th class="num">Readable</th></tr></thead><tbody>${opsRows}</tbody></table></div>
  <p class="note">*At about six requests a month. Prompt size is in characters. The server currently rejects prompts over 20,000 characters, so any richer version needs that limit raised. “Repeats caught” counts picks, out of 144 per version, that were already in your library or an earlier session; the app now filters these out. “Slow wait” is the slowest one in ten.</p>
</section>
<section class="block"><h2>Do the two judges agree?</h2>
  <div class="tablewrap"><table><thead><tr><th>Prompt</th><th class="num">Gemini judge: overall</th><th class="num">Gemini judge: understands you</th><th class="num">Claude judge: overall</th><th class="num">Claude judge: understands you</th></tr></thead><tbody>${judgeRows}</tbody></table></div>
</section>
${notes.options?.length ? `<section class="block"><h2>Options</h2><ul class="list">${notes.options.map(f => `<li>${f}</li>`).join('')}</ul></section>` : ''}
<section class="block"><h2>Read the lists yourself</h2>
  <p class="lede">First run of every request. Today’s prompt and the top-scoring version start open.</p>
  <div class="ptabs" role="tablist">${tabs}</div>${panels}
</section>
<footer><p>Model: Gemini 3.8 Flash, light thinking, strict JSON format, the production setup. Picks were run through the production repeat filter. The Google Books check was left out of this comparison because it doesn’t depend on the prompt and the key’s daily quota ran out. Judges: Gemini 3.1 Pro through the API and Claude Opus 5.5 through Claude Code, each given your full library, every review in full and all highlights. The “do not recommend” list used your 10 most recent sessions, as the app does.</p>
<p>Regenerate: node scripts/rec-prompt-bakeoff.mjs gen | verify | judge | report.</p></footer>
</div>
<script>
document.querySelectorAll('.ptab').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.ptab').forEach(x => x.setAttribute('aria-selected', String(x === b)))
  document.querySelectorAll('.ppanel').forEach(p => { p.hidden = p.dataset.p !== b.dataset.p })
}))
</script></body></html>`
  fs.writeFileSync(OUT, html)
  console.log('wrote', OUT)
  if (process.argv[3] === 'json') for (const s of stats) console.log(s.v.id.padEnd(10), JSON.stringify({ crit: Object.fromEntries(Object.entries(s.crit).map(([k, x]) => [k, +x.toFixed(2)])), gpro: +s.byJudge.gpro.overall.toFixed(2), claude: +s.byJudge.claude.overall.toFixed(2), gI: +s.byJudge.gpro.insight.toFixed(2), cI: +s.byJudge.claude.insight.toFixed(2), wins: s.wins, chars: s.promptChars, inTok: Math.round(s.inTok), p50: +s.p50.toFixed(1), p90: +s.p90.toFixed(1), cost: +s.cost.toFixed(4) , repeats: s.repeats, parsed: s.parsed + '/' + s.n }))
}

const phase = process.argv[2]
if (phase === 'gen') await gen()
else if (phase === 'verify') await verify()
else if (phase === 'judge') await judge()
else if (phase === 'judge-files') judgeFiles(process.argv[3])
else if (phase === 'judge-ingest') judgeIngest(process.argv[3])
else if (phase === 'report') report()
else console.log('usage: node scripts/rec-prompt-bakeoff.mjs gen|verify|judge|judge-files DIR|judge-ingest DIR|report')
