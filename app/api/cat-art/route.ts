import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import sharp from 'sharp'
import { namedLayers, pickLayers } from '@/lib/compose'

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

/*
 * THE PICKING MOVED TO lib/compose.ts, because it is needed twice now.
 *
 * This route draws the cat; /api/stable describes it. If each kept its own copy
 * of the weighted pick, a cat could be drawn with one face and described as
 * having another — and the drift would be invisible until somebody noticed a
 * "smug" cat behaving sweetly in the yard.
 */

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams

  /*
   * TWO WAYS TO ASK FOR A CAT, because there are two kinds of cat.
   *
   *   ?seed=N                     a cat that was DRAWN. The seed is what drew it.
   *   ?bg=&body=&face=            a cat that was INHERITED. Its three layers came
   *                               from two parents one at a time, so there is no
   *                               seed that would produce them — see lib/breed.ts.
   *
   * A kitten must be asked for by name or it cannot be drawn at all.
   */
  const named = q.has('bg') || q.has('body') || q.has('face')

  const raw = q.get('seed') ?? '0'
  const seed = Number(raw)

  if (!named && !Number.isFinite(seed))
    return new Response('bad seed', { status: 400 })

  try {
    const { files } = named
      ? await namedLayers({ Background: q.get('bg'), Body: q.get('body'), Face: q.get('face') }, seed)
      : await pickLayers(seed)
    const [base, ...rest] = await Promise.all(files.map(f => readFile(f)))

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
