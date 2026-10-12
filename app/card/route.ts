import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /card?…  →  the page a shared cat card points at.
 *
 * X, Discord and Telegram read its tags and show /api/card (the same query) as a
 * large picture. A person who clicks it is sent straight into the game.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const origin = req.nextUrl.origin
  const image = `${origin}/api/card?${q.toString()}`
  const name = (q.get('n') ?? '').replace(/[^\x20-\x7e]/g, '').slice(0, 32) || 'A Clanker Cat'
  const title = `${name} on Clanker Cats`
  const desc = 'A browser game. No wallet, no download. Pick a cat and fight.'

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <meta http-equiv="refresh" content="0; url=/" />
</head>
<body><a href="/">Play Clanker Cats</a></body>
</html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
