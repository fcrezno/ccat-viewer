import { NextRequest } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import { seeded } from '@/lib/arena'

/**
 * GET /api/cat-art?seed=123  →  a PNG of a cat that does not exist.
 *
 * A made-up opponent had no face, so the fight was two names and two bars. The
 * layer art for the drop is already in this repo, so a cat can be COMPOSED
 * instead: one background, one body, one face, chosen from the seed.
 *
 * 23 x 8 x 10 = 1,840 combinations, which is plenty for an endless supply of
 * opponents.
 *
 * IT IS NOT A REAL TOKEN, deliberately. Drawing a random cat from the collection
 * would put somebody's actual property on the losing end of a public result. A
 * composed cat belongs to nobody.
 *
 * The filenames carry the drop's rarity weights as a `#NN` suffix — "Aliem#300"
 * — and those are honoured, so a preview opponent looks like it came out of the
 * same bag as a real one.
 */

const LAYERS = join(process.cwd(), 'layers')
const ORDER = ['Background', 'Body', 'Face'] as const

type Choice = { file: string; weight: number }

/** Cached per process: reading three directories on every fight is wasteful. */
let cache: Record<string, Choice[]> | null = null

async function inventory(): Promise<Record<string, Choice[]>> {
  if (cache) return cache

  const out: Record<string, Choice[]> = {}
  for (const dir of ORDER) {
    const files = (await readdir(join(LAYERS, dir))).filter(f => f.toLowerCase().endsWith('.png'))
    out[dir] = files.map(file => {
      // "Beach Classic#10.png" -> weight 10. No suffix means an even chance.
      const m = file.match(/#(\d+)\.png$/i)
      return { file, weight: m ? Number(m[1]) : 1 }
    })
  }
  cache = out
  return out
}

/** Weighted pick, so the rare traits stay rare. */
function weighted(r: () => number, xs: Choice[]): Choice {
  const total = xs.reduce((n, x) => n + x.weight, 0)
  let t = r() * total
  for (const x of xs) {
    t -= x.weight
    if (t <= 0) return x
  }
  return xs[xs.length - 1]
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('seed') ?? '0'
  const seed = Number(raw)

  if (!Number.isFinite(seed))
    return new Response('bad seed', { status: 400 })

  try {
    const inv = await inventory()
    const r = seeded(seed >>> 0)

    const picks = ORDER.map(dir => join(LAYERS, dir, weighted(r, inv[dir]).file))
    const [base, ...rest] = await Promise.all(picks.map(p => readFile(p)))

    const png = await sharp(base)
      .composite(rest.map(input => ({ input })))
      .png()
      .toBuffer()

    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        // The same seed always draws the same cat, so this can be cached hard.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('could not draw a cat', { status: 500 })
  }
}
