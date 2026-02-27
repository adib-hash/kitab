// Vercel Edge Function — proxies Claude API call server-side
// so ANTHROPIC_API_KEY is never exposed to the client

export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { prompt } = await req.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Anthropic API error: ${err}`)
    }

    const data = await response.json()
    const text = data.content[0]?.text || '[]'

    // Clean potential markdown fences
    const clean = text.replace(/```json|```/g, '').trim()
    const recommendations = JSON.parse(clean)

    return new Response(
      JSON.stringify({ recommendations }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Recommendations error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
