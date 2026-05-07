import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const seed = req.nextUrl.searchParams.get('seed')
  if (!id || !seed) return new NextResponse('Missing params', { status: 400 })

  const imageUrl = `https://ccat-viewer.vercel.app/api/cat?id=${id}&seed=${seed}`

  const frame = JSON.stringify({
    version: '1',
    imageUrl: imageUrl,
    button: {
      title: 'View My CCats',
      action: {
        type: 'launch_frame',
        url: 'https://ccat-viewer.vercel.app',
        name: 'ClankerCats',
        splashImageUrl: 'https://ccat-viewer.vercel.app/splash.png',
        splashBackgroundColor: '#0a0a14',
      }
    }
  })

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ClankerCat #${id}</title>
  <meta property="og:title" content="ClankerCat #${id}" />
  <meta property="og:description" content="A unique on-chain ClankerCat · clankercats.com" />
  <meta property="og:image" content="${imageUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${imageUrl}" />
  <meta name="fc:frame" content='${frame}' />
</head>
<body></body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
