export default async function handler(req, res) {
  // Vercel automatically sets CRON_SECRET and sends it as Authorization: Bearer <secret>
  // on cron-triggered requests. Reject anything else.
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase env vars not configured' })
  }

  // A HEAD request to the REST root is the lightest possible ping — no rows returned,
  // but it opens a DB connection which resets Supabase's inactivity timer.
  const response = await fetch(`${supabaseUrl}/rest/v1/books?select=id&limit=1`, {
    method: 'HEAD',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  })

  return res.status(200).json({
    ok: true,
    supabaseStatus: response.status,
    timestamp: new Date().toISOString(),
  })
}
