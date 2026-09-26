// Vercel serverless: follow redirects on a short URL and extract the final URL + og:title
// Used by SharePreviewModal to resolve Amazon short URLs (a.co, amzn.to) and
// Goodreads ID-only URLs so we can identify the book being shared from native apps.
//
// Locked to the hosts the share flow actually needs. Without an allowlist this
// is an open proxy: anyone could make our function fetch arbitrary URLs.

const SHORT_HOSTS = new Set(['a.co', 'amzn.to', 'amzn.com', 'amzn.eu', 'amzn.asia'])
// Explicit TLD list on purpose — a loose `amazon\.[a-z.]+$` would admit
// look-alike hosts such as amazon.evil.com.
const AMAZON_TLDS = /^(www\.)?amazon\.(com|co\.uk|ca|com\.au|de|fr|es|it|nl|in|co\.jp|ae|sa|sg|com\.br|com\.mx)$/
const GOODREADS = /^(www\.)?goodreads\.com$/
const FETCH_TIMEOUT_MS = 8000
const MAX_BODY_BYTES = 500_000 // og:title lives in <head>; this is ample

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

function hostAllowed(host) {
  const h = (host || '').toLowerCase()
  return SHORT_HOSTS.has(h) || AMAZON_TLDS.test(h) || GOODREADS.test(h)
}

function parseHttpUrl(s) {
  try {
    const u = new URL(s)
    return /^https?:$/.test(u.protocol) ? u : null
  } catch {
    return null
  }
}

// Read at most `limit` bytes of the body, then stop. Amazon product pages run
// to several MB and we only need the head.
async function readCapped(response, limit) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
    if (total >= limit) {
      try { await reader.cancel() } catch {}
      break
    }
  }
  return Buffer.concat(chunks).toString('utf8').slice(0, limit)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const input = parseHttpUrl(req.query?.url)
  if (!input) return res.status(400).json({ error: 'url param required' })
  if (!hostAllowed(input.hostname)) return res.status(400).json({ error: 'Host not supported' })

  try {
    // Follow redirects to get the final URL
    const response = await fetch(input.href, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    const finalUrl = response.url
    const finalHost = parseHttpUrl(finalUrl)?.hostname
    if (!hostAllowed(finalHost)) {
      return res.status(400).json({ error: 'Redirect target not supported' })
    }

    const html = await readCapped(response, MAX_BODY_BYTES)

    // Extract og:title
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : null

    // Also try <title> as fallback
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const pageTitle = titleTagMatch ? titleTagMatch[1].trim() : null

    return res.status(200).json({ resolvedUrl: finalUrl, ogTitle, pageTitle })
  } catch (err) {
    const status = err?.name === 'TimeoutError' ? 504 : 500
    return res.status(status).json({ error: err.message })
  }
}
