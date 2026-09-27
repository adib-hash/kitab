// Builds REC-BAKEOFF-REPORT.html from the bake-off outputs. See rec-bakeoff.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIGS, PROMPTS, JUDGES, RUNS, JUDGE, loadData } from './rec-bakeoff.mjs'
import { TOKENS } from './rec-report-tokens.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(here, '..', 'REC-BAKEOFF-REPORT.html')

const runs = JSON.parse(fs.readFileSync(RUNS, 'utf8'))
const judged = fs.existsSync(JUDGE) ? JSON.parse(fs.readFileSync(JUDGE, 'utf8')) : {}
const labels = JSON.parse(fs.readFileSync(path.join(here, 'rec-bakeoff-labels.json'), 'utf8'))
const d = loadData()
const SESSIONS_PER_MONTH = 6 // 39 Discover sessions from Mar 4 to Sep 27, 2026

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x))
const money = v => (v < 0.01 ? '$' + v.toFixed(4) : v < 1 ? '$' + v.toFixed(3) : '$' + v.toFixed(2))

function bookStatus(b) {
  const lab = labels[norm(b.title) + '|' + norm(b.author)]
  if (lab && lab[0] !== 'real') return { kind: lab[0], note: lab[1] }
  if (b.inLibrary) return { kind: 'library' }
  if (b.verified === false) return { kind: 'gap' } // real book the Google Books check missed
  if (b.pastRec) return { kind: 'repeat' }
  return { kind: 'ok' }
}

// ---------- per-config stats ----------
const stats = CONFIGS.map(cfg => {
  const rs = PROMPTS.flatMap(p => [1, 2].map(rep => runs[`${cfg.id}|${p.id}|${rep}`])).filter(Boolean)
  const ok = rs.filter(r => r.text)
  const lat = ok.map(r => r.ms / 1000)
  const cost = ok.map(r => (r.inTok * cfg.price[0] + r.outTok * cfg.price[1]) / 1e6)
  const parsed = ok.filter(r => r.parsed)
  const exact8 = parsed.filter(r => r.recs.length === 8)
  const recs = parsed.flatMap(r => r.recs)
  const st = recs.map(bookStatus)
  const count = k => st.filter(s => s.kind === k).length
  const halluc = count('invented') + count('wrong_author')
  // What the app would actually show: verified by Google Books and not already in the library.
  const survivors = ok.map(r => (r.parsed ? r.recs.filter(b => b.verified && !b.inLibrary).length : 0))
  const genreOK = parsed.filter(r => {
    const g = r.recs.map(b => norm(b.genre))
    const counts = Object.values(g.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {}))
    return new Set(g).size >= 3 && Math.max(...counts) <= 2
  }).length
  const whyOK = recs.filter(b => b.whyWords >= 15 && b.whyWords <= 25).length
  const overlaps = PROMPTS.map(p => {
    const a = runs[`${cfg.id}|${p.id}|1`], b = runs[`${cfg.id}|${p.id}|2`]
    if (!a?.recs?.length || !b?.recs?.length) return null
    const A = new Set(a.recs.map(x => norm(x.title))), B = new Set(b.recs.map(x => norm(x.title)))
    const inter = [...A].filter(x => B.has(x)).length
    return inter / Math.min(A.size, B.size)
  }).filter(x => x !== null)
  const judge = {}
  for (const j of JUDGES) {
    const rows = Object.entries(judged).filter(([k, v]) => k.startsWith(j.id + '|') && v.scores?.[cfg.id]).map(([, v]) => v.scores[cfg.id])
    if (!rows.length) continue
    const m = f => avg(rows.map(r => Number(r[f])).filter(Number.isFinite))
    judge[j.id] = { n: rows.length, fit: m('fit'), taste: m('taste'), discovery: m('discovery'), accuracy: m('accuracy'), why: m('why_quality'), overall: m('overall'), comments: rows.map(r => r.comment).filter(Boolean) }
  }
  const js = Object.values(judge)
  const q = js.length ? avg(js.map(x => x.overall)) : NaN
  const crit = f => (js.length ? avg(js.map(x => x[f])) : NaN)
  return {
    cfg, attempted: rs.length, ok: ok.length, errors: rs.length - ok.length, parsed: parsed.length, exact8: exact8.length,
    p50: pct(lat, 0.5), p90: pct(lat, 0.9), max: Math.max(...lat),
    inTok: avg(ok.map(r => r.inTok)), outTok: avg(ok.map(r => r.outTok)), costPer: avg(cost),
    recs: recs.length, halluc, invented: count('invented'), wrongAuthor: count('wrong_author'), gap: count('gap'), library: count('library'), repeat: count('repeat'),
    survivors: avg(survivors), genreOK, whyOK, overlap: avg(overlaps), judge, quality: q,
    fit: crit('fit'), taste: crit('taste'), discovery: crit('discovery'), accuracy: crit('accuracy'), why: crit('why'),
  }
})

// Wins: rounds where a config had the top "overall" from a judge (ties shared).
for (const s of stats) s.wins = 0
let rounds = 0
for (const v of Object.values(judged)) {
  if (!v.scores) continue
  rounds++
  const entries = Object.entries(v.scores).map(([c, x]) => [c, Number(x.overall)])
  const top = Math.max(...entries.map(e => e[1]))
  for (const [c, x] of entries) if (x === top) stats.find(s => s.cfg.id === c).wins++
}

// ---------- composite ----------
// Quality 45, Trust 20, Speed 20, Cost 10, Reliability 5.
const WEIGHTS = { quality: 45, trust: 20, speed: 20, cost: 10, reliability: 5 }
for (const s of stats) {
  const quality = clamp(((s.quality - 1) / 9) * 100)
  const trust = clamp((s.survivors / 8) * 100 - (s.halluc / Math.max(1, s.recs)) * 300)
  const speed = clamp(100 * (1 - Math.log(Math.max(s.p50, 4) / 4) / Math.log(40 / 4)))
  const cost = clamp(100 * (1 - Math.log10(Math.max(s.costPer, 0.002) / 0.002) / 2))
  const reliability = (s.parsed / s.attempted) * 100
  s.parts = { quality, trust, speed, cost, reliability }
  s.score = Object.entries(WEIGHTS).reduce((a, [k, w]) => a + (s.parts[k] * w) / 100, 0)
}
const ranked = [...stats].sort((a, b) => b.score - a.score)
const current = stats.find(s => s.cfg.current)
const byQuality = [...stats].filter(s => Number.isFinite(s.quality)).sort((a, b) => b.quality - a.quality)

// Judge agreement: Spearman correlation of the two judges' mean overall across configs.
function spearman(a, b) {
  const rank = xs => { const s = xs.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = []; s.forEach(([, i], k) => (r[i] = k + 1)); return r }
  const ra = rank(a), rb = rank(b), n = a.length
  return 1 - (6 * ra.reduce((acc, x, i) => acc + (x - rb[i]) ** 2, 0)) / (n * (n * n - 1))
}
const both = stats.filter(s => s.judge.gpro && s.judge.claude)
const rho = both.length > 2 ? spearman(both.map(s => s.judge.gpro.overall), both.map(s => s.judge.claude.overall)) : NaN

// ---------- html helpers ----------
const f1 = x => (Number.isFinite(x) ? x.toFixed(1) : '–')
const bar = (v, max, cls = '') => `<span class="bar ${cls}"><i style="width:${clamp((v / max) * 100)}%"></i></span>`
const chip = (text, cls) => `<span class="chip ${cls}">${esc(text)}</span>`
const tag = s => (s.cfg.current ? chip('Production', 'teal') : s.cfg.fallback ? chip('Fallback', 'slate') : '')
const vendor = s => (s.cfg.provider === 'gemini' ? 'Google' : 'Anthropic')

function scoreboard() {
  return ranked.map((s, i) => `
    <tr class="${s.cfg.current ? 'is-current' : ''}">
      <td class="num rank">${i + 1}</td>
      <td><div class="model">${esc(s.cfg.label)} ${tag(s)}</div><div class="sub">${vendor(s)} · ${esc(s.cfg.note)}</div></td>
      <td class="num strong">${s.score.toFixed(0)}</td>
      <td class="num">${f1(s.quality)}</td>
      <td class="num">${s.survivors.toFixed(1)}</td>
      <td class="num ${s.halluc ? 'warn' : ''}">${s.halluc}</td>
      <td class="num">${s.p50.toFixed(1)}s</td>
      <td class="num">${money(s.costPer)}</td>
      <td class="num">${money(s.costPer * SESSIONS_PER_MONTH * 12)}</td>
    </tr>`).join('')
}

function qualityTable() {
  const cols = [['fit', 'Fits the ask'], ['taste', 'Fits your taste'], ['discovery', 'Discovery'], ['accuracy', 'Accuracy'], ['why', 'Why line']]
  return byQuality.map(s => `
    <tr class="${s.cfg.current ? 'is-current' : ''}">
      <td><div class="model">${esc(s.cfg.label)} ${tag(s)}</div></td>
      <td class="num strong">${f1(s.quality)}</td>
      ${cols.map(([k]) => `<td class="num">${f1(s[k])}</td>`).join('')}
      <td class="num">${f1(s.judge.gpro?.overall)}</td>
      <td class="num">${f1(s.judge.claude?.overall)}</td>
      <td class="num">${s.wins}</td>
    </tr>`).join('')
}

function speedChart() {
  const max = Math.max(...stats.map(s => s.p90)) * 1.05
  return [...stats].sort((a, b) => a.p50 - b.p50).map(s => `
    <div class="lrow">
      <div class="lname">${esc(s.cfg.label)}</div>
      <div class="ltrack">
        <span class="lp90" style="left:${(s.p50 / max) * 100}%;width:${((s.p90 - s.p50) / max) * 100}%"></span>
        <span class="lp50" style="width:${(s.p50 / max) * 100}%"></span>
      </div>
      <div class="lval num">${s.p50.toFixed(1)}s <span class="muted">/ ${s.p90.toFixed(1)}s</span></div>
    </div>`).join('')
}

function trustTable() {
  return [...stats].sort((a, b) => b.survivors - a.survivors).map(s => `
    <tr>
      <td><div class="model">${esc(s.cfg.label)}</div></td>
      <td class="num">${s.parsed}/${s.attempted}</td>
      <td class="num">${s.exact8}/${s.parsed}</td>
      <td class="num strong">${s.survivors.toFixed(1)}</td>
      <td class="num ${s.invented ? 'warn' : ''}">${s.invented}</td>
      <td class="num ${s.wrongAuthor ? 'warn' : ''}">${s.wrongAuthor}</td>
      <td class="num">${s.library}</td>
      <td class="num">${s.repeat}</td>
      <td class="num">${s.gap}</td>
    </tr>`).join('')
}

function rulesTable() {
  return stats.map(s => `
    <tr>
      <td><div class="model">${esc(s.cfg.label)}</div></td>
      <td class="num">${s.parsed ? Math.round((s.genreOK / s.parsed) * 100) : 0}%</td>
      <td class="num">${s.recs ? Math.round((s.whyOK / s.recs) * 100) : 0}%</td>
      <td class="num">${Number.isFinite(s.overlap) ? Math.round(s.overlap * 100) + '%' : '–'}</td>
      <td class="num">${Math.round(s.inTok).toLocaleString()}</td>
      <td class="num">${Math.round(s.outTok).toLocaleString()}</td>
    </tr>`).join('')
}

const KIND = {
  ok: ['', ''], repeat: ['Recent repeat', 'amber'], library: ['Already in library', 'amber'], gap: ['Real, but the app’s check drops it', 'slate'],
  invented: ['Invented', 'rose'], wrong_author: ['Wrong author', 'rose'],
}
function listHTML(r) {
  if (!r) return '<p class="muted">Not run (API credit ran out).</p>'
  if (!r.text) return `<p class="muted">Error: ${esc(r.error)}</p>`
  if (!r.parsed) return '<p class="bad">The app could not read this answer: the JSON was malformed, so you would see an error.</p>'
  return '<ol class="picks">' + r.recs.map(b => {
    const st = bookStatus(b)
    const [label, cls] = KIND[st.kind]
    return `<li><div class="pt"><b>${esc(b.title)}</b> <span class="muted">· ${esc(b.author)}</span>${label ? ' ' + chip(label, cls) : ''}</div>
      <div class="pw">${esc(b.why)}</div>${st.note ? `<div class="pn">${esc(st.note)}</div>` : ''}</li>`
  }).join('') + '</ol>'
}

function explorer() {
  const tabs = PROMPTS.map((p, i) => `<button class="ptab" role="tab" id="tab-${p.id}" aria-selected="${i === 0}" data-p="${p.id}">${esc(p.text.length > 34 ? p.text.slice(0, 32) + '…' : p.text)}</button>`).join('')
  const panels = PROMPTS.map((p, i) => {
    const order = [...stats].sort((a, b) => {
      const sa = avg(JUDGES.map(j => Number(judged[`${j.id}|${p.id}|1`]?.scores?.[a.cfg.id]?.overall)).filter(Number.isFinite))
      const sb = avg(JUDGES.map(j => Number(judged[`${j.id}|${p.id}|1`]?.scores?.[b.cfg.id]?.overall)).filter(Number.isFinite))
      return (sb || 0) - (sa || 0)
    })
    return `<section class="ppanel" role="tabpanel" data-p="${p.id}" ${i ? 'hidden' : ''}>
      <p class="ask"><span class="eyebrow">${esc(p.kind)} request</span><br>“${esc(p.text)}”</p>
      <div class="lists">${order.map(s => {
        const r = runs[`${s.cfg.id}|${p.id}|1`]
        const sc = JUDGES.map(j => judged[`${j.id}|${p.id}|1`]?.scores?.[s.cfg.id]).filter(Boolean)
        const o = avg(sc.map(x => Number(x.overall)))
        const comment = sc.map(x => x.comment).filter(Boolean)[0]
        return `<details class="lcard" ${s.cfg.current ? 'open' : ''}>
          <summary><span class="model">${esc(s.cfg.label)}</span> ${tag(s)}<span class="lscore num">${f1(o)}</span></summary>
          ${comment ? `<p class="jc">Judge: ${esc(comment)}</p>` : ''}
          ${listHTML(r)}
          ${r?.ms ? `<p class="lmeta num">${(r.ms / 1000).toFixed(1)}s · ${money((r.inTok * s.cfg.price[0] + r.outTok * s.cfg.price[1]) / 1e6)}</p>` : ''}
        </details>`
      }).join('')}</div>
    </section>`
  }).join('')
  return `<div class="ptabs" role="tablist">${tabs}</div>${panels}`
}

const top = ranked[0]
const bestQ = byQuality[0]
const g38 = stats.find(s => s.cfg.id === 'g38f')
const g38t = stats.find(s => s.cfg.id === 'g38ft')
const haiku = stats.find(s => s.cfg.id === 'haiku')
const totalSpend = stats.reduce((a, s) => a + s.costPer * s.ok, 0)

// Narrative text lives in rec-bakeoff-notes.json so it can be written after reading the numbers.
const notesPath = path.join(here, 'rec-bakeoff-notes.json')
const notes = fs.existsSync(notesPath) ? JSON.parse(fs.readFileSync(notesPath, 'utf8')) : { top: '', quality: '', current: '', findings: [] }
const VERDICT_TOP = notes.top, VERDICT_Q = notes.quality, VERDICT_CUR = notes.current
// findings are trusted HTML written by us (may contain <b>)
const FINDINGS = notes.findings.map(f => `<li>${f}</li>`).join('')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Discover Model Bake-off</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
${TOKENS}
  * { box-sizing: border-box; }
  html { -webkit-font-smoothing: antialiased; }
  body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--sans); font-size: 16px; line-height: 1.6; padding-block: 0 96px; padding-inline: 20px; }
  h1, h2, h3 { font-family: var(--serif); font-weight: 600; line-height: 1.15; margin: 0; text-wrap: balance; }
  p { margin: 0; }
  .frame { max-width: 1120px; margin: 0 auto; display: grid; gap: 56px; }
  .eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
  .num { font-variant-numeric: tabular-nums; }
  .muted { color: var(--ink-3); }
  .warn { color: var(--rose); font-weight: 600; }
  .bad { color: var(--rose); }
  header.mast { padding-block: 56px 8px; display: grid; gap: 18px; border-bottom: 1px solid var(--line); padding-bottom: 36px; }
  header.mast h1 { font-size: clamp(38px, 6vw, 64px); letter-spacing: -.01em; }
  header.mast h1 em { font-style: italic; font-weight: 400; color: var(--teal); }
  .thesis { font-size: 20px; line-height: 1.5; max-width: 64ch; color: var(--ink-2); }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 24px; font-size: 14px; color: var(--ink-3); }
  .meta b { color: var(--ink-2); font-weight: 500; }
  section.block { display: grid; gap: 18px; }
  section.block > h2 { font-size: 30px; }
  .lede { max-width: 70ch; color: var(--ink-2); }
  .verdict { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
  .vcard { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; display: grid; gap: 6px; align-content: start; }
  .vcard.pick { border-color: var(--teal-line); background: var(--teal-wash); }
  .vcard h3 { font-size: 20px; }
  .vcard p { color: var(--ink-2); font-size: 15px; }
  .tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  th { text-align: left; font-family: var(--mono); font-weight: 500; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); padding: 12px 14px; border-bottom: 1px solid var(--line); white-space: nowrap; vertical-align: bottom; }
  th.num, td.num { text-align: right; }
  td { padding: 11px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  tr.is-current td { background: var(--teal-wash); }
  td.strong { font-weight: 600; }
  td.rank { color: var(--ink-3); width: 1%; }
  .model { font-weight: 600; white-space: nowrap; }
  .sub { font-size: 14px; color: var(--ink-3); }
  .chip { display: inline-block; font-size: 12px; font-weight: 500; line-height: 1; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--line-strong); color: var(--ink-2); vertical-align: 2px; white-space: nowrap; }
  .chip.teal { border-color: var(--teal-line); color: var(--teal); background: var(--teal-wash); }
  .chip.amber { border-color: var(--amber-line); color: var(--amber); background: var(--amber-wash); }
  .chip.rose { border-color: var(--rose-line); color: var(--rose); background: var(--rose-wash); }
  .chip.slate { background: var(--slate-wash); color: var(--slate); }
  .note { font-size: 14px; color: var(--ink-3); max-width: 80ch; }
  .criteria { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
  .crit { border-top: 2px solid var(--line-strong); padding-top: 10px; display: grid; gap: 4px; }
  .crit b { font-size: 15px; }
  .crit span { font-size: 14px; color: var(--ink-2); }
  .crit .w { font-family: var(--mono); font-size: 12px; color: var(--teal); }
  .lchart { display: grid; gap: 10px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; }
  .lrow { display: grid; grid-template-columns: minmax(150px, 210px) 1fr auto; gap: 14px; align-items: center; font-size: 15px; }
  .ltrack { position: relative; height: 12px; border-radius: 6px; background: var(--surface-2); }
  .lp50 { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; background: var(--teal); }
  .lp90 { position: absolute; top: 3px; bottom: 3px; border-radius: 0 4px 4px 0; background: var(--teal-line); }
  .lval { min-width: 104px; text-align: right; }
  @media (max-width: 560px) { .lrow { grid-template-columns: 1fr auto; } .ltrack { grid-column: 1 / -1; order: 3; } }
  .findings { display: grid; gap: 12px; padding: 0; list-style: none; margin: 0; }
  .findings li { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; color: var(--ink-2); }
  .findings li b { color: var(--ink); }
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
  .pt { font-size: 15px; }
  .pw { font-size: 14px; color: var(--ink-2); }
  .pn { font-size: 14px; color: var(--rose); }
  .lmeta { font-size: 13px; color: var(--ink-3); margin-top: 10px; font-family: var(--mono); }
  footer { font-size: 14px; color: var(--ink-3); border-top: 1px solid var(--line); padding-top: 20px; display: grid; gap: 8px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<div class="frame">
<header class="mast">
  <span class="eyebrow">Kitab · Discover · ${new Date().toISOString().slice(0, 10)}</span>
  <h1>Which model should pick <em>your next book?</em></h1>
  <p class="thesis">${CONFIGS.length} models answered ${PROMPTS.length} of your real Discover requests, twice each, using the app’s exact prompt and your actual library. Two judges from different companies scored every list without knowing which model wrote it.</p>
  <div class="meta"><span><b>${stats.reduce((a, s) => a + s.ok, 0)}</b> model answers</span><span><b>${stats.reduce((a, s) => a + s.recs, 0)}</b> book picks checked</span><span><b>${rounds}</b> judging rounds</span><span>Bake-off spend <b>${money(totalSpend)}</b> before judging</span></div>
</header>

<section class="block">
  <h2>The short version</h2>
  <div class="verdict">
    <div class="vcard pick"><span class="eyebrow">Best overall</span><h3>${esc(top.cfg.label)}</h3><p>Highest blended score (${top.score.toFixed(0)}/100). ${esc(VERDICT_TOP)}</p></div>
    <div class="vcard"><span class="eyebrow">Best picks, cost aside</span><h3>${esc(bestQ.cfg.label)}</h3><p>Judges’ average ${f1(bestQ.quality)}/10, with ${bestQ.halluc} invented or misattributed books. ${esc(VERDICT_Q)}</p></div>
    <div class="vcard"><span class="eyebrow">What you run today</span><h3>${esc(current.cfg.label)}</h3><p>Judges’ average ${f1(current.quality)}/10, ${current.p50.toFixed(1)}s typical wait, ${current.halluc} bad picks out of ${current.recs}. ${esc(VERDICT_CUR)}</p></div>
  </div>
</section>

<section class="block">
  <h2>Scoreboard</h2>
  <p class="lede">The blended score weights what matters for how you use Discover: a handful of requests a month, on your phone, where one wrong or invented book costs trust. Cost gets a small weight because every option here costs pennies a year at your usage.</p>
  <div class="tablewrap"><table>
    <thead><tr><th class="num">#</th><th>Model</th><th class="num">Score</th><th class="num">Judges /10</th><th class="num">Usable picks</th><th class="num">Bad books</th><th class="num">Typical wait</th><th class="num">Per request</th><th class="num">Per year*</th></tr></thead>
    <tbody>${scoreboard()}</tbody>
  </table></div>
  <p class="note">*At your pace of about ${SESSIONS_PER_MONTH} Discover requests a month (39 since March). “Usable picks” is how many of the 8 books survive the app’s own checks and reach your screen. “Bad books” counts invented titles plus real titles credited to the wrong author, checked by hand. Gemini 3.8 Flash prices double on January 1, 2027. Gemini 3.1 Pro has no free tier.</p>
</section>

<section class="block">
  <h2>How each model was scored</h2>
  <div class="criteria">
    <div class="crit"><span class="w">45% · Quality</span><b>Would you actually save these?</b><span>Average of both judges’ overall score. Judges also rated fit to the request, fit to your ratings and reviews, discovery, factual accuracy, and the “why” line.</span></div>
    <div class="crit"><span class="w">20% · Trust</span><b>Real books you can add</b><span>Picks that pass the app’s Google Books check and aren’t already on your shelves, with a heavy penalty for invented books and wrong authors.</span></div>
    <div class="crit"><span class="w">20% · Speed</span><b>Time staring at a spinner</b><span>Typical (median) model response time. Full marks at 4 seconds or less, zero at 40.</span></div>
    <div class="crit"><span class="w">10% · Cost</span><b>What a request costs</b><span>Log scale from a fifth of a cent to 20 cents per request.</span></div>
    <div class="crit"><span class="w">5% · Reliability</span><b>Answers the app can read</b><span>Share of answers that came back as valid JSON. A malformed answer shows you an error.</span></div>
  </div>
</section>

<section class="block">
  <h2>Findings</h2>
  <ul class="findings">${FINDINGS}</ul>
</section>

<section class="block">
  <h2>Quality, criterion by criterion</h2>
  <p class="lede">Each judge saw all lists for a request side by side, in a random order with the model names hidden, and scored them 1 to 10 against each other. Gemini 3.1 Pro and Claude Opus 5.5 judged independently. Their rankings of the models agree with a rank correlation of ${Number.isFinite(rho) ? rho.toFixed(2) : '–'} (1.0 is identical).</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Model</th><th class="num">Overall</th><th class="num">Fits the ask</th><th class="num">Fits your taste</th><th class="num">Discovery</th><th class="num">Accuracy</th><th class="num">Why line</th><th class="num">Gemini judge</th><th class="num">Claude judge</th><th class="num">Top-rated</th></tr></thead>
    <tbody>${qualityTable()}</tbody>
  </table></div>
  <p class="note">“Top-rated” counts judging rounds where the model had the best overall score, ties included. A judge from the same company as a model might favour it, which is why the two judges are shown separately.</p>
</section>

<section class="block">
  <h2>Speed</h2>
  <p class="lede">Model response time only. The app then spends about a second checking the picks against Google Books, the same for every model. The solid bar is the typical wait. The pale extension reaches the slowest one in ten.</p>
  <div class="lchart">${speedChart()}</div>
</section>

<section class="block">
  <h2>Trust: what reaches your screen</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Model</th><th class="num">Readable</th><th class="num">Exactly 8</th><th class="num">Usable picks</th><th class="num">Invented</th><th class="num">Wrong author</th><th class="num">In library</th><th class="num">Recent repeat</th><th class="num">Check missed</th></tr></thead>
    <tbody>${trustTable()}</tbody>
  </table></div>
  <p class="note">Counts are over all picks from ${PROMPTS.length * 2} requests per model. “In library” and “recent repeat” break the prompt’s rules. The app hides library books, but it does not filter repeats from your last 10 sessions. “Check missed” means a real book the app’s Google Books check could not find, so you never saw it. Fable 5.1 has 13 answers instead of 18 because API credit ran out mid-run.</p>
</section>

<section class="block">
  <h2>Following the brief</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Model</th><th class="num">Genre mix rule met</th><th class="num">Why line 15–25 words</th><th class="num">Same picks on retry</th><th class="num">Input tokens</th><th class="num">Output tokens</th></tr></thead>
    <tbody>${rulesTable()}</tbody>
  </table></div>
  <p class="note">“Same picks on retry” is the overlap between two runs of the same request. Lower means pressing regenerate gives you genuinely new ideas. Output tokens include hidden thinking, which is billed.</p>
</section>

<section class="block">
  <h2>Read the lists yourself</h2>
  <p class="lede">The first run of every request, best-judged first. Open any model to see its eight picks, the judge’s comment, and any flags.</p>
  ${explorer()}
</section>

<footer>
  <p>Method: ${PROMPTS.length} requests from your Discover history (two are suggestion chips) × 2 runs × ${CONFIGS.length} model setups, run on ${new Date().toISOString().slice(0, 10)}. Prompt and Google Books check copied from the app. The “do not recommend” list used your 10 most recent sessions, as the app does today. Books Google Books could not match were checked by hand. Prices are list prices per million tokens as of September 2026.</p>
  <p>Regenerate: node scripts/rec-bakeoff.mjs gen | verify | judge, then node scripts/rec-bakeoff-report.mjs.</p>
</footer>
</div>
<script>
  document.querySelectorAll('.ptab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.ptab').forEach(x => x.setAttribute('aria-selected', String(x === b)))
    document.querySelectorAll('.ppanel').forEach(p => { p.hidden = p.dataset.p !== b.dataset.p })
  }))
</script>
</body>
</html>`

fs.writeFileSync(OUT, html)
console.log('wrote', OUT)
if (process.argv[2] === 'json') console.log(JSON.stringify(stats.map(s => ({ id: s.cfg.id, score: +s.score.toFixed(1), parts: Object.fromEntries(Object.entries(s.parts).map(([k, v]) => [k, +v.toFixed(0)])), q: +s.quality.toFixed(2), gpro: s.judge.gpro && +s.judge.gpro.overall.toFixed(2), claude: s.judge.claude && +s.judge.claude.overall.toFixed(2), crit: [s.fit, s.taste, s.discovery, s.accuracy, s.why].map(x => +x?.toFixed(1)), wins: s.wins, surv: +s.survivors.toFixed(2), halluc: s.halluc, lib: s.library, rep: s.repeat, gap: s.gap, p50: +s.p50.toFixed(1), p90: +s.p90.toFixed(1), cost: +s.costPer.toFixed(4), parsed: s.parsed + '/' + s.attempted, genre: s.genreOK, why: s.whyOK + '/' + s.recs, overlap: +s.overlap.toFixed(2) })), null, 0).replaceAll('},{', '},\n{'), 'rho', rho)
