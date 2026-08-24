import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { fetchCats } from '@/lib/collection'
import { fight, ownedCat, randomCat, seeded, type ArenaCat } from '@/lib/arena'
import { pickRoster } from '@/lib/roster'
import { tagFor } from '@/lib/season'

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

/**
 * AN EXHIBITION — one real cat, and nothing written down.
 *
 * The ordinary fight invents its opponent. An exhibition draws ONE cat from the
 * same pool the gauntlet uses, so it is a real player's cat, but the result goes
 * nowhere: no record, no ladder, no title. It is the warm-up for the gauntlet and
 * the answer to "I want to try that without it counting."
 *
 * Null if the collection could not be read, so the caller can say so rather than
 * quietly falling back to an invented cat — which would look identical and be a
 * lie about who was fought.
 */
async function realFoe(
  exclude: Set<string>,
  excludeOwner: string,
): Promise<{ cat: ArenaCat; uid: string } | null> {
  const picked = await pickRoster(1, exclude, excludeOwner)
  if (!picked.length) return null
  const { cat, ref } = picked[0]
  cat.art = ref.art
  // The uid travels with it: a fight between two REAL cats is the only kind that
  // can go on a seasonal record, and the record is kept by uid.
  return { cat, uid: ref.uid }
}

export async function POST(req: NextRequest) {
  let body: { wallet?: string; uid?: string; demo?: boolean; name?: string; exhibition?: boolean }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 })
  }

  const { wallet, uid, demo, name, exhibition } = body

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

    // A demo runner may ask for an exhibition too. Nothing about a demo is
    // recorded anyway, so the only difference is who is on the other side.
    let foe: ArenaCat | null = null
    if (exhibition) {
      let drawn = null
      try {
        drawn = await realFoe(new Set(), '')
      } catch {
        drawn = null
      }
      if (!drawn)
        return NextResponse.json(
          { error: 'could not find a cat to fight right now — try again in a moment' },
          { status: 503 },
        )
      foe = drawn.cat
    } else {
      foe = randomCat(r)
      foe.art = art((seed ^ 0x5bf03635) >>> 0)
    }

    // No tag: a demo cat has no uid, so nothing here can go on a record.
    return NextResponse.json({ ...fight(you, foe, seed), recorded: false, tag: null })
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
  /*
   * A NAME THE HOLDER CHOSE, cleaned HERE as well as in the browser.
   *
   * It goes straight into the battle log and into a cast, so it is never taken on
   * trust. Whitespace is collapsed, because a newline would split a log line in
   * half, and it is cut to 32 — the limit the main game uses, which it took from
   * Steam so a cat named here still fits when the full game gets hold of it.
   *
   * THE NUMBER IS THE FALLBACK, never a blank and never the collection's name
   * for it: V1's metadata names do not match its token ids, so "Clanker Cats
   * #100" is token v1:195 and putting that on screen names the wrong cat.
   */
  const given = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 32)
  const you = ownedCat(cat.id, given || `#${cat.id}`)
  // A real cat already has a picture; the made-up one gets composed.
  you.art = cat.meta?.image ?? ''

  let foe: ArenaCat | null = null
  let foeUid = ''
  if (exhibition) {
    // Their whole shelf is excluded, not just the cat they entered — an
    // exhibition against your own second cat is not an exhibition.
    let drawn = null
    try {
      drawn = await realFoe(new Set(owned.map(c => c.uid)), wallet)
    } catch {
      drawn = null
    }
    if (!drawn)
      return NextResponse.json(
        { error: 'could not find a cat to fight right now — try again in a moment' },
        { status: 503 },
      )
    foe = drawn.cat
    foeUid = drawn.uid
  } else {
    foe = randomCat(seeded((seed ^ 0x9e3779b9) >>> 0))
    foe.art = art((seed ^ 0x5bf03635) >>> 0)
  }

  const decided = fight(you, foe, seed)

  /*
   * `recorded` IS THE PAGE'S INSTRUCTION, not a hint. An exhibition is a real
   * fight against a real cat and looks exactly like a quick fight on screen, so
   * the only thing keeping it out of the record is this flag being read.
   *
   * `tag` is the signed line for a cast. Only a fight between two REAL cats gets
   * one — the ordinary quick fight's opponent is invented and belongs to nobody,
   * so there is no record for the result to go on and no way to farm one.
   */
  return NextResponse.json({
    ...decided,
    recorded: !exhibition,
    tag: foeUid
      ? tagFor(
          [decided.youWon ? { w: cat.uid, l: foeUid } : { w: foeUid, l: cat.uid }],
          seed,
        )
      : null,
  })
}
