import { NextRequest, NextResponse } from 'next/server'
import { pickLayers } from '@/lib/compose'
import { cast } from '@/lib/demonames'
import { localUid } from '@/lib/stable'
import type { Resident } from '@/lib/yard'

/**
 * GET /api/stable?seeds=1000001,1000002  ->  those cats, described.
 *
 * THE YARD'S POPULATION FOR THE BUILD THAT HAS NO CHAIN. See lib/appmode.ts.
 *
 * The web yard is built from a wallet and a follow graph, and the demo yard
 * reads real token metadata — both need the chain, so neither can serve the App
 * Store build. This is the third source: cats the player WON, which exist only
 * as numbers on their device.
 *
 * -- WHY THIS IS A SERVER ROUTE AT ALL ---------------------------------------
 *
 * The traits have to match the drawing, and the drawing is composed from the
 * `layers/` directory, which only the server can read. Picking a face on the
 * client would mean a second copy of the collection's contents and its rarity
 * weights, free to disagree with the art the moment a layer is added.
 *
 * So the client sends numbers and gets cats back. `pickLayers` is the same
 * function /api/cat-art draws with, walking the same seeded stream in the same
 * order, so the face named here is the face in the picture.
 *
 * -- WHAT A CAT IS, HERE -----------------------------------------------------
 *
 * Exactly what a token cat is, minus the token. It has a Face (its temperament
 * in the yard and in a fight), a Background (the ink its name is printed in) and
 * a Body Color (its coat, for the creature sheet) — the same three traits the
 * yard reads off a real cat's metadata, from the same art.
 *
 * NOTHING IS STORED. The seeds are the record and they live on the device; this
 * route only says what a number looks like. Ask twice, get the same cat.
 */

/** A guard, not a page size: a yard holds a dozen and the caller sends its whole stable. */
const MOST = 24

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('seeds') ?? ''

  const seeds = raw
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0)
    .slice(0, MOST)

  if (!seeds.length) return NextResponse.json({ residents: [] })

  /*
   * NAMED THE WAY THE DEMO YARD NAMES, and for the same reason: a cat with no
   * metadata has no name to show, and "#1000001" is not a cat you get attached
   * to. Drawn from the uid, so a cat is always called the same thing.
   *
   * The player can rename any of them — `setName` in lib/stable.ts — and that
   * wins, on the device, exactly as it does for a token cat.
   */
  const uids = seeds.map(localUid)
  const named = cast(uids)

  try {
    const residents: Resident[] = await Promise.all(
      seeds.map(async (seed, i) => {
        const { traits } = await pickLayers(seed)
        return {
          uid: uids[i],
          name: named.get(uids[i]) ?? `#${seed}`,
          face: traits.Face,
          bg: traits.Background,
          coat: traits.Body,
          art: `/api/cat-art?seed=${seed}`,
          owner: null,
        }
      }),
    )

    return NextResponse.json(
      { residents },
      /*
       * A SEED IS A CAT FOREVER, so this can be cached as hard as the art is.
       * The list of layers can only change on a deploy, and a deploy is a new
       * build.
       */
      { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    )
  } catch {
    return NextResponse.json({ error: 'could not read the stable right now' }, { status: 502 })
  }
}
