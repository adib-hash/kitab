// Vercel serverless: follow redirects on a short URL and extract the final URL + og:title
// Used by SharePreviewModal to resolve Amazon short URLs (a.co, amzn.to) and
// Goodreads ID-only URLs so we can identify the book being shared from native apps.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url param required' })

  try {
    // Follow redirects to get the final URL
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    })

    const finalUrl = response.url
    const html = await response.text()

    // Extract og:title
    const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
    const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : null

    // Also try <title> as fallback
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const pageTitle = titleTagMatch ? titleTagMatch[1].trim() : null

    return res.status(200).json({ resolvedUrl: finalUrl, ogTitle, pageTitle })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
