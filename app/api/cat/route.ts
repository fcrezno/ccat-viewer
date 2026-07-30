import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { fetchMeta, getCollection, kernelFor } from '@/lib/collection'

// GET /api/cat?id=46&c=v1 → 800x800 PNG, for share embeds and og:image.
// `seed` is accepted and ignored — it was only meaningful for the old on-chain renderer.
export async function GET(req: NextRequest) {
  const id  = req.nextUrl.searchParams.get('id')
  const col = getCollection(req.nextUrl.searchParams.get('c'))

  if (!id || !/^\d+$/.test(id)) return new NextResponse('Missing or invalid id', { status: 400 })

  try {
    const meta = await fetchMeta(col, id)
    if (!meta?.image) return new NextResponse('Cat not found', { status: 404 })

    const res = await fetch(meta.image)
    if (!res.ok) return new NextResponse('Image unavailable', { status: 502 })
    const src = Buffer.from(await res.arrayBuffer())

    // nearest-neighbour keeps pixel art crisp instead of smearing it
    const png = await sharp(src)
      .resize(800, 800, { kernel: kernelFor(col), fit: 'contain', background: { r: 10, g: 10, b: 20, alpha: 1 } })
      .png()
      .toBuffer()

    return new NextResponse(png, {
      headers: {
        'Content-Type':  'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse('Error rendering cat', { status: 500 })
  }
}
