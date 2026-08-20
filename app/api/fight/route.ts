import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { fetchCats } from '@/lib/collection'
import { fight, ownedCat, randomCat, seeded } from '@/lib/arena'

/**
 * POST /api/fight  { wallet, uid }  →  the whole fight, already decided.
 *
 * WHY THIS IS ON THE SERVER AND NOT IN THE PAGE.
 *
 * Two reasons, and the first one matters most:
 *
 * 1. The main game's strength and weakness tables are not public. Nothing that
 *    reads them may ever run in a browser, so the preview keeps the whole fight
 *    behind this route. The client is handed a finished log — words, not rules.
 *    (The preview does not use those tables at all; the habit is the point.)
 *
 * 2. THE SERVER PICKS THE SEED. If the page rolled it, a loss could be undone by
 *    refreshing, and a run of fights would mean nothing.
 *
 * Ownership is checked ON CHAIN: you fight with a cat you actually hold. Note the
 * wallet is taken from the request, so this proves the CAT is owned by that
 * wallet, not that the caller is that wallet. For a preview that is the right
 * amount — there is nothing here worth stealing, and the worst case is somebody
 * watching a fight with a cat that is not theirs. If this ever gates something
 * real, move it behind Quick Auth the way the mint voucher does.
 */
/** Where a made-up cat's face comes from. Same seed, same cat, cached forever. */
const art = (seed: number) => `/api/cat-art?seed=${seed >>> 0}`

export async function POST(req: NextRequest) {
  let body: { wallet?: string; uid?: string; demo?: boolean }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 })
  }

  const { wallet, uid, demo } = body

  /*
   * A DEMO FIGHT, FOR SOMEBODY WHO DOES NOT OWN A CAT YET.
   *
   * The whole point of the preview is to show people what the game is, and
   * "connect a wallet first" is a bad answer to "what is this?". So both cats are
   * invented and no wallet is involved at all.
   *
   * It is a real fight, not a canned recording — the same code, the same seeded
   * roll. The only thing missing is that the cat is not yours.
   */
  if (demo) {
    const seed = (Math.random() * 0xffffffff) >>> 0
    const r = seeded(seed)
    const you = randomCat(r)
    you.label = 'Demo Cat'
    you.mine = true
    you.art = art(seed)
    const foe = randomCat(r)
    foe.art = art((seed ^ 0x5bf03635) >>> 0)
    return NextResponse.json(fight(you, foe, seed))
  }

  if (!wallet || !isAddress(wallet))
    return NextResponse.json({ error: 'invalid wallet address' }, { status: 400 })

  if (!uid)
    return NextResponse.json({ error: 'which cat? pass a uid like "v2:412"' }, { status: 400 })

  let owned
  try {
    owned = await fetchCats(wallet)
  } catch {
    return NextResponse.json({ error: 'could not read the collection' }, { status: 502 })
  }

  // NO CAT, NO FIGHT. This is the gate: holding one is what gets you in.
  if (!owned.length)
    return NextResponse.json(
      { error: 'no Clanker Cat in that wallet', needsCat: true },
      { status: 403 },
    )

  const cat = owned.find(c => c.uid === uid)
  if (!cat)
    return NextResponse.json({ error: 'that wallet does not hold that cat' }, { status: 403 })

  const seed = (Math.random() * 0xffffffff) >>> 0

  // The opponent is invented here and belongs to nobody, so a preview fight can
  // never put somebody else's cat on the losing end of a public result. Its own
  // stream, so rolling an opponent cannot disturb the fight's rolls.
  const you = ownedCat(cat.id, cat.meta?.name ?? `#${cat.id}`)
  // A real cat already has a picture; the made-up one gets composed.
  you.art = cat.meta?.image ?? ''
  const foe = randomCat(seeded((seed ^ 0x9e3779b9) >>> 0))
  foe.art = art((seed ^ 0x5bf03635) >>> 0)

  return NextResponse.json(fight(you, foe, seed))
}
