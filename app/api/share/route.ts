import { NextRequest, NextResponse } from 'next/server'
import { fetchMeta, getCollection } from '@/lib/collection'

const APP = 'https://ccat-viewer.vercel.app'

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// GET /api/share?id=46&c=v1 → HTML with frame + og tags
export async function GET(req: NextRequest) {
  const id  = req.nextUrl.searchParams.get('id')
  const col = getCollection(req.nextUrl.searchParams.get('c'))

  if (!id || !/^\d+$/.test(id)) return new NextResponse('Missing or invalid id', { status: 400 })

  const imageUrl = `${APP}/api/cat?id=${id}&c=${col.key}`
  const meta     = await fetchMeta(col, id)
  const title    = meta?.name ?? `Clanker Cat #${id}`

  const frame = JSON.stringify({
    version: '1',
    imageUrl,
    button: {
      title: 'View My Cats',
      action: {
        type: 'launch_frame',
        url: APP,
        name: 'Clanker Cats',
        splashImageUrl: `${APP}/splash.png`,
        splashBackgroundColor: '#0a0a14',
      },
    },
  })

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="A Clanker Cat on Base · clankercats.com" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="800" />
  <meta property="og:image:height" content="800" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${imageUrl}" />
  <meta name="fc:frame" content='${frame}' />
</head>
<body></body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type':  'text/html',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
