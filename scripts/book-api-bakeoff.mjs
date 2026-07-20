#!/usr/bin/env node
// Book Metadata API Bake-Off — Google Books vs Open Library vs Hardcover.
// Read-only benchmark. Touches no app code. See scripts/README-bakeoff.md.
//
// Usage:
//   node scripts/book-api-bakeoff.mjs [--limit N] [--full] [--curated-only]
//        [--library-only] [--cover-size M|L] [--dump-hardcover] [--out FILE]

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { normalizeTitle } from '../src/lib/openLibrary.js'
import {
  searchGoogle,
  searchOpenLibrary,
  searchHardcover,
  probeCover,
} from './providers.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = n => args.includes(`--${n}`)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const LIMIT = flag('full') ? Infinity : parseInt(opt('limit', '60'))
const COVER_SIZE = (opt('cover-size', 'M')).toUpperCase()
const DUMP_HC = flag('dump-hardcover')
const OUT = opt('out', join(__dirname, 'bakeoff-report.html'))

// ── env ───────────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const txt = readFileSync(join(ROOT, '.env.local'), 'utf8')
    const env = {}
    for (const line of txt.split('\n')) {
      if (!line.includes('=') || line.trim().startsWith('#')) continue
      const i = line.indexOf('=')
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
    }
    return env
  } catch { return {} }
}
const env = loadEnv()
const GOOGLE_KEY = env.VITE_GOOGLE_BOOKS_API_KEY || process.env.VITE_GOOGLE_BOOKS_API_KEY
const HC_TOKEN = env.HARDCOVER_API_TOKEN || process.env.HARDCOVER_API_TOKEN

// ── rate limiters (serialized per provider with a minimum gap) ─────────────────
function makeLimiter(minGapMs) {
  let chain = Promise.resolve()
  let last = 0
  return fn => {
    const run = async () => {
      const wait = Math.max(0, minGapMs - (Date.now() - last))
      if (wait) await new Promise(r => setTimeout(r, wait))
      last = Date.now()
      return fn()
    }
    chain = chain.then(run, run)
    return chain
  }
}
const gGate = makeLimiter(120)   // Google: generous
const oGate = makeLimiter(360)   // Open Library: ~3/s with UA
const hGate = makeLimiter(1100)  // Hardcover: 60/min

// ── test set ────────────────────────────────────────────────────────────────
const curated = JSON.parse(readFileSync(join(__dirname, 'bakeoff-testset.json'), 'utf8'))
  .map(b => ({ ...b, source: 'curated' }))
let library = JSON.parse(readFileSync(join(__dirname, 'bakeoff-library.json'), 'utf8'))
  .map(b => ({ ...b, source: 'library', category: 'from your library' }))

// dedupe library by normalized title+author, sort recent-first (chosen stress focus)
const seen = new Set()
library = library.filter(b => {
  const k = normalizeTitle(b.title) + '|' + (b.author || '').toLowerCase().slice(0, 10)
  if (seen.has(k)) return false
  seen.add(k); return true
}).sort((a, b) => (b.published_year || 0) - (a.published_year || 0))

let books
if (flag('curated-only')) books = curated
else if (flag('library-only')) books = library.slice(0, LIMIT)
else books = [...curated, ...library.slice(0, Math.max(0, LIMIT - curated.length))]

// ── relevance scoring ─────────────────────────────────────────────────────────
function titleMatch(qTitle, rTitle) {
  if (!qTitle || !rTitle) return false
  const a = normalizeTitle(qTitle), b = normalizeTitle(rTitle)
  if (!a || !b) return false
  const short = Math.min(a.length, b.length)
  if (short <= 3) return a === b
  return a === b || a.includes(b) || b.includes(a)
}
function authorLast(qAuthor) {
  if (!qAuthor) return null
  const first = qAuthor.split(',')[0].trim().replace(/\s+/g, ' ')
  const parts = first.split(' ').filter(w => w.replace(/[^a-z]/gi, '').length > 1)
  return (parts[parts.length - 1] || '').toLowerCase().replace(/[^a-z]/g, '')
}
function authorMatch(qAuthor, rAuthor) {
  const last = authorLast(qAuthor)
  if (!last) return true
  return (rAuthor || '').toLowerCase().includes(last)
}
function scoreProvider(query, results) {
  const found = results.length > 0
  let correctRank = null
  for (let i = 0; i < results.length; i++) {
    if (titleMatch(query.title, results[i].title) && authorMatch(query.author, results[i].author)) {
      correctRank = i + 1; break
    }
  }
  const top3 = results.slice(0, 3)
  const junkTop3 = top3.filter(r => !titleMatch(query.title, r.title)).length
  const chosen = correctRank ? results[correctRank - 1] : results[0] || null
  return { found, correctRank, junkTop3, top3Count: top3.length, chosen, count: results.length }
}
function metaScore(r) {
  if (!r) return 0
  return [r.author, r.published_year, r.page_count, r.description, r.isbn, r.genres?.length]
    .filter(Boolean).length
}

// ── run ─────────────────────────────────────────────────────────────────────
function rawQuery(b) { return [b.title, b.author].filter(Boolean).join(' ') }

async function runProvider(book) {
  const q = rawQuery(book)
  const [g, o, h] = await Promise.all([
    gGate(() => searchGoogle(q, { max: 10, apiKey: GOOGLE_KEY })),
    oGate(() => searchOpenLibrary({ title: book.title, author: book.author, isbn: book.isbn, mode: 'raw', max: 10, coverSize: COVER_SIZE })),
    HC_TOKEN ? hGate(() => searchHardcover(q, { token: HC_TOKEN, max: 10, dump: DUMP_HC })) : Promise.resolve({ results: [], ms: 0, error: 'no-token' }),
  ])
  const providers = {}
  for (const [name, r] of [['google', g], ['openlibrary', o], ['hardcover', h]]) {
    const s = scoreProvider(book, r.results)
    const cover = await probeCover(s.chosen?.cover_url)
    providers[name] = { ...s, apiMs: r.ms, apiError: r.error || null, cover, meta: metaScore(s.chosen) }
  }
  return { book, providers }
}

// ── aggregate + console ───────────────────────────────────────────────────────
const PROV = ['google', 'openlibrary', 'hardcover']
const LABEL = { google: 'Google Books', openlibrary: 'Open Library', hardcover: 'Hardcover' }

function aggregate(rows) {
  const agg = {}
  for (const p of PROV) {
    const cells = rows.map(r => r.providers[p])
    const n = cells.length
    const found = cells.filter(c => c.found)
    const withMatch = cells.filter(c => c.correctRank)
    const coversPresent = cells.filter(c => c.cover?.present)
    const pct = x => Math.round((x / n) * 100)
    agg[p] = {
      n,
      foundPct: pct(found.length),
      top1Pct: pct(cells.filter(c => c.correctRank === 1).length),
      top3Pct: pct(cells.filter(c => c.correctRank && c.correctRank <= 3).length),
      avgRank: withMatch.length ? (withMatch.reduce((s, c) => s + c.correctRank, 0) / withMatch.length).toFixed(2) : '—',
      junkAvg: (cells.reduce((s, c) => s + (c.top3Count ? c.junkTop3 / c.top3Count : 0), 0) / n * 100).toFixed(0),
      coverPct: pct(coversPresent.length),
      avgKb: coversPresent.length ? (coversPresent.reduce((s, c) => s + (c.cover.kb || 0), 0) / coversPresent.length).toFixed(0) : '—',
      avgDim: coversPresent.length ? Math.round(coversPresent.filter(c => c.cover.w).reduce((s, c) => s + c.cover.w, 0) / (coversPresent.filter(c => c.cover.w).length || 1)) : '—',
      avgMeta: (cells.reduce((s, c) => s + c.meta, 0) / n).toFixed(1),
      avgApiMs: Math.round(cells.reduce((s, c) => s + (c.apiMs || 0), 0) / n),
      avgCoverMs: coversPresent.length ? Math.round(coversPresent.reduce((s, c) => s + (c.cover.ms || 0), 0) / coversPresent.length) : '—',
      errors: cells.filter(c => c.apiError && c.apiError !== 'no-token').length,
      noToken: cells.some(c => c.apiError === 'no-token'),
    }
  }
  return agg
}

// ── main ──────────────────────────────────────────────────────────────────────
console.error(`\nBake-off: ${books.length} books  |  Google:${GOOGLE_KEY ? 'key' : 'no-key'}  OpenLibrary:on  Hardcover:${HC_TOKEN ? 'token' : 'NO TOKEN (skipped)'}\n`)
const rows = []
for (let i = 0; i < books.length; i++) {
  const b = books[i]
  process.stderr.write(`  [${String(i + 1).padStart(3)}/${books.length}] ${b.title.slice(0, 48)}\r`)
  try { rows.push(await runProvider(b)) }
  catch (e) { console.error('\n  ! failed:', b.title, e.message) }
}
console.error('\n')

const agg = aggregate(rows)

// console scorecard
const cols = ['metric', ...PROV.map(p => LABEL[p])]
const line = (label, pick) => [label, ...PROV.map(p => String(pick(agg[p])))]
const table = [
  line('books tested', a => a.n),
  line('found %', a => a.foundPct + '%'),
  line('exact match #1 %', a => a.top1Pct + '%'),
  line('match in top-3 %', a => a.top3Pct + '%'),
  line('avg rank of match', a => a.avgRank),
  line('junk in top-3 %', a => a.junkAvg + '%'),
  line('cover present %', a => a.coverPct + '%'),
  line('avg cover KB', a => a.avgKb),
  line('avg cover width px', a => a.avgDim),
  line('avg metadata /6', a => a.avgMeta),
  line('avg API ms', a => a.avgApiMs),
  line('avg cover fetch ms', a => a.avgCoverMs),
]
const widths = cols.map((_, ci) => Math.max(cols[ci].length, ...table.map(r => r[ci].length)))
const fmt = r => r.map((c, ci) => c.padEnd(widths[ci])).join('  ')
console.error(fmt(cols))
console.error(widths.map(w => '─'.repeat(w)).join('  '))
for (const r of table) console.error(fmt(r))
console.error('')

// ── HTML report ────────────────────────────────────────────────────────────────
writeFileSync(OUT, renderHtml(rows, agg))
console.error(`Report written: ${OUT}`)
console.error(`Open with:  open "${OUT}"\n`)

// ── html ───────────────────────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }

function coverCell(p) {
  if (!p.chosen) return `<div class="nocover">no result</div>`
  const c = p.cover
  const img = c.present
    ? `<img loading="lazy" decoding="async" src="${esc(c.url)}" alt="">`
    : `<div class="nocover">${p.chosen.cover_url ? 'cover failed' : 'no cover'}<br><span class="dim">${esc(c.reason || '')}</span></div>`
  const matchBadge = p.correctRank === 1 ? `<span class="b ok">#1 match</span>`
    : p.correctRank ? `<span class="b warn">match #${p.correctRank}</span>`
    : `<span class="b bad">no match</span>`
  const junk = p.junkTop3 > 0 ? `<span class="b bad">${p.junkTop3} junk/3</span>` : `<span class="b ok">clean</span>`
  const kb = c.present ? `<span class="b">${c.kb}KB${c.w ? ` · ${c.w}×${c.h}` : ''}</span>` : ''
  return `
    <div class="cov">${img}</div>
    <div class="rtitle">${esc(p.chosen.title)}</div>
    <div class="rauth">${esc(p.chosen.author || '—')}${p.chosen.published_year ? ` · ${p.chosen.published_year}` : ''}</div>
    <div class="badges">${matchBadge}${junk}<span class="b">meta ${p.meta}/6</span>${kb}</div>`
}

function renderHtml(rows, agg) {
  const genAt = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const scoreRows = [
    ['Books tested', a => a.n, 'higher sample = more reliable'],
    ['Found (any result) %', a => a.foundPct + '%', 'higher better'],
    ['Exact match at #1 %', a => a.top1Pct + '%', 'higher better — right book on top'],
    ['Match in top-3 %', a => a.top3Pct + '%', 'higher better'],
    ['Junk in top-3 %', a => a.junkAvg + '%', 'LOWER better — unrelated results'],
    ['Cover present %', a => a.coverPct + '%', 'higher better'],
    ['Avg cover weight (KB)', a => a.avgKb, 'LOWER better — proxy for load speed'],
    ['Avg cover width (px)', a => a.avgDim, 'context for KB'],
    ['Metadata completeness /6', a => a.avgMeta, 'higher better'],
    ['Avg API latency (ms)', a => a.avgApiMs, 'LOWER better'],
    ['Avg cover fetch (ms)', a => a.avgCoverMs, 'LOWER better'],
  ]
  const best = (getter, lower) => {
    const vals = PROV.map(p => parseFloat(getter(agg[p]))).map(v => isNaN(v) ? (lower ? Infinity : -Infinity) : v)
    const target = lower ? Math.min(...vals) : Math.max(...vals)
    return PROV.filter((p, i) => vals[i] === target)
  }
  const scoreTable = scoreRows.map(([label, get, hint]) => {
    const lower = /LOWER/.test(hint)
    const winners = /higher|LOWER/.test(hint) ? best(get, lower) : []
    return `<tr><td class="lbl">${esc(label)}<span class="hint">${esc(hint)}</span></td>${PROV.map(p =>
      `<td class="${winners.includes(p) ? 'win' : ''}">${esc(get(agg[p]))}</td>`).join('')}</tr>`
  }).join('')

  const hcNote = agg.hardcover.noToken
    ? `<div class="alert">Hardcover column is empty — no <code>HARDCOVER_API_TOKEN</code> in <code>.env.local</code>. Add a free token and re-run to complete the 3-way.</div>` : ''

  const bookRows = rows.map(r => {
    const b = r.book
    const cat = b.category || b.source
    return `<div class="row">
      <div class="q">
        <div class="qcat">${esc(cat)}</div>
        <div class="qtitle">${esc(b.title)}</div>
        <div class="qauth">${esc(b.author || '')}</div>
        ${b.isbn ? `<div class="qisbn">ISBN ${esc(b.isbn)}</div>` : ''}
        ${b.published_year ? `<div class="qisbn">${esc(b.published_year)}</div>` : ''}
      </div>
      ${PROV.map(p => `<div class="cell">${coverCell(r.providers[p])}</div>`).join('')}
    </div>`
  }).join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kitab — Book API Bake-Off</title>
<style>
:root{--bg:#14110e;--panel:#1c1712;--panel2:#241d16;--line:#33291f;--tx:#f0e7db;--dim:#a1907c;--amber:#e0a458;--ok:#5fb87a;--warn:#d9a441;--bad:#d9736a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:32px 20px 80px}
.wrap{max-width:1180px;margin:0 auto}
h1{font-size:26px;margin:0 0 4px;font-weight:700}
.sub{color:var(--dim);margin:0 0 24px;font-size:15px}
.alert{background:#3a2a17;border:1px solid var(--amber);color:#f3d9b0;padding:12px 16px;border-radius:10px;margin:0 0 24px;font-size:14px}
code{background:#000;padding:1px 6px;border-radius:4px;font-size:13px}
table.score{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:12px}
table.score th,table.score td{padding:11px 14px;text-align:center;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
table.score th{background:var(--panel2);font-size:14px;color:var(--tx);font-weight:600}
table.score th:first-child,table.score td.lbl{text-align:left}
td.lbl{color:var(--dim);font-size:14px}
td.lbl .hint{display:block;font-size:11px;color:#6f6255;margin-top:1px}
td.win{background:rgba(95,184,122,.14);color:var(--ok);font-weight:700}
.legend{color:var(--dim);font-size:13px;margin:0 0 30px}
.row{display:grid;grid-template-columns:200px 1fr 1fr 1fr;gap:14px;padding:16px 0;border-top:1px solid var(--line);align-items:start}
.head{position:sticky;top:0;background:var(--bg);z-index:2;padding:10px 0;border-top:none;font-weight:700}
.head>div{color:var(--amber)}
.q .qcat{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--amber);margin-bottom:4px}
.q .qtitle{font-weight:600;font-size:15px;line-height:1.3}
.q .qauth{color:var(--dim);font-size:13px;margin-top:2px}
.q .qisbn{color:#6f6255;font-size:11px;margin-top:3px;font-variant-numeric:tabular-nums}
.cell{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px;min-height:120px}
.cov{width:88px;height:132px;border-radius:6px;overflow:hidden;background:var(--panel2);margin-bottom:8px}
.cov img{width:100%;height:100%;object-fit:cover;display:block}
.nocover{width:88px;height:132px;border-radius:6px;background:repeating-linear-gradient(45deg,#241d16,#241d16 6px,#1c1712 6px,#1c1712 12px);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--dim);font-size:11px;text-align:center;margin-bottom:8px;padding:6px}
.rtitle{font-size:13px;font-weight:600;line-height:1.25}
.rauth{font-size:12px;color:var(--dim);margin-top:1px}
.badges{margin-top:7px;display:flex;flex-wrap:wrap;gap:4px}
.b{font-size:11px;padding:2px 6px;border-radius:5px;background:var(--panel2);color:var(--dim);border:1px solid var(--line);font-variant-numeric:tabular-nums}
.b.ok{color:var(--ok);border-color:rgba(95,184,122,.4)}
.b.warn{color:var(--warn);border-color:rgba(217,164,65,.4)}
.b.bad{color:var(--bad);border-color:rgba(217,115,106,.4)}
.dim{color:#6f6255}
@media(max-width:820px){.row{grid-template-columns:1fr;gap:8px}.head{display:none}.cell{display:flex;gap:12px;align-items:flex-start}.cov,.nocover{flex:0 0 auto}}
</style></head><body><div class="wrap">
<h1>Book Metadata API Bake-Off</h1>
<p class="sub">Google Books vs Open Library vs Hardcover · ${rows.length} books · covers @ Open Library size ${esc(COVER_SIZE)} · generated ${esc(genAt)}</p>
${hcNote}
<table class="score"><thead><tr><th>Metric</th>${PROV.map(p => `<th>${esc(LABEL[p])}</th>`).join('')}</tr></thead><tbody>${scoreTable}</tbody></table>
<p class="legend">Green = winner on that metric. "Junk in top-3" and cover KB are <b>lower-is-better</b>. Google covers are fetched at <code>zoom=3</code> (exactly what the app serves today) — that inflates its KB; Open Library is shown at size <code>${esc(COVER_SIZE)}</code>. Cover thumbnails below load live from each provider's host, so missing/slow covers are visible directly.</p>
<div class="row head"><div>Query</div><div>Google Books</div><div>Open Library</div><div>Hardcover</div></div>
${bookRows}
</div></body></html>`
}
