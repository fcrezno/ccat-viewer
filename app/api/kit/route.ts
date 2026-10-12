import { NextRequest, NextResponse } from 'next/server'
import { ANNOUNCERS } from '@/lib/announcers'
import { drawLogo, drawMeme, drawWords } from '@/lib/kitArt'

/**
 * GET /api/kit  →  the meme kit's pictures (lib/kitArt), all PNG.
 *
 *   ?k=logo                      CLANKER CATS in gold, on transparency
 *   ?k=cta                       PLAY FREE / CLANKERCATS.COM, for the foot of a clip
 *   ?k=line&i=3                  announcer line 3, on transparency
 *   ?k=meme&i=3&a=101&b=202      the template: line 3, cats from seeds a and b
 *
 * Only the announcer's own lines are drawn — the kit is not a free text-to-image
 * service on the brand's domain.
 */
export const runtime = 'nodejs'

const seedOf = (s: string | null) => (/^\d{1,10}$/.test(s ?? '') ? s! : String(Math.floor(Math.random() * 1e9)))

async function art(origin: string, seed: string) {
  try {
    const r = await fetch(`${origin}/api/cat-art?seed=${seed}`, { signal: AbortSignal.timeout(6000) })
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const kind = q.get('k')
  const i = Math.abs(Math.floor(Number(q.get('i')) || 0)) % ANNOUNCERS.length
  const lines = ANNOUNCERS[i]

  let png: Buffer
  if (kind === 'logo') png = await drawLogo()
  else if (kind === 'cta') png = await drawWords(['PLAY FREE', 'CLANKERCATS.COM'])
  else if (kind === 'line') png = await drawWords(lines)
  else if (kind === 'meme') {
    const o = req.nextUrl.origin
    png = await drawMeme(lines, [await art(o, seedOf(q.get('a'))), await art(o, seedOf(q.get('b')))])
  } else return new NextResponse('k must be logo, cta, line or meme', { status: 400 })

  const name = kind === 'logo' || kind === 'cta' ? `clanker-cats-${kind}` : `clanker-cats-${kind}-${i}`
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="${name}.png"`,
      'Cache-Control': q.get('a') || kind !== 'meme' ? 'public, max-age=86400' : 'no-store',
    },
  })
}
