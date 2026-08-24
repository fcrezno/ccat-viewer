import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { fetchCats } from '@/lib/collection'
import { ownedCat } from '@/lib/arena'
import {
  ROUNDS, afterRound, isChampion, playRound, runPairs,
  type RunState, type Runner,
} from '@/lib/gauntlet'
import { pickRoster } from '@/lib/roster'
import { tagFor } from '@/lib/season'
import { TICKET_TTL_MS, sign } from '@/lib/ticket'

/**
 * POST /api/gauntlet  { wallet, uid, name } or { demo: true }  →  round one.
 *
 * Five cats that belong to real people, one bar of health, and a choice after
 * every round: double the pot, or heal. lib/gauntlet.ts explains why the mode
 * needed that choice — in short, a gauntlet round is a FAIR fight where the
 * ordinary preview fight is not, and five fair fights on one bar is a lottery
 * rather than a game.
 *
 * ── WHO MAY ENTER, AND WHAT IT COUNTS FOR ────────────────────────────────────
 *
 * Anybody, including somebody on the demo without a wallet — the point of the
 * preview is to show people what the game is, and "connect a wallet first" is a
 * bad answer to "what is this?".
 *
 * But A DEMO RUN IS NOT RECORDED. A demo cat is invented per request and belongs
 * to nobody, so a demo champion would be a champion who never owned anything.
 * The answer says which kind of run it is in `recorded`, and the page must read
 * that rather than guess — the same rule the single fight already follows, where
 * noteFight is skipped for the demo cat.
 *
 * A demo runner still faces the REAL ladder. A demo that plays by different
 * rules is not showing anybody the mode.
 *
 * ── THE ROUND IS PLAYED HERE, NOT IN THE PAGE ────────────────────────────────
 *
 * The server picks the seed, so no round can be re-rolled with a refresh, and it
 * reveals ONE ROUND AT A TIME so the choice is made without knowing what is
 * coming. The half-finished run travels back to the player as a signed ticket,
 * because there is no database to keep it in. lib/ticket.ts sets out what that
 * does and does not protect against.
 *
 * Ownership is checked ON CHAIN, exactly as /api/fight does, with the same
 * caveat: the wallet comes from the request, so this proves the CAT is held by
 * that wallet, not that the caller is that wallet. Before the pot pays anything,
 * move this behind Quick Auth the way the mint voucher does.
 */
export async function POST(req: NextRequest) {
  let body: { wallet?: string; uid?: string; name?: string; demo?: boolean }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 })
  }

  const { wallet, uid, name, demo } = body
  const seed = (Math.random() * 0xffffffff) >>> 0

  let you: Runner
  let excludeUids = new Set<string>()
  let excludeOwner = ''

  if (demo) {
    /*
     * The demo cat gets its numbers from ownedCat, not randomCat, so it meets
     * the ladder on the same terms a real cat would. Its id is made from the
     * seed: there is no token behind it, but the run still needs a stable number
     * to roll from, and this keeps every rebuild of the cat identical.
     */
    const id = String(1 + (seed % 999983))
    const cat = ownedCat(id, 'Demo Cat')
    you = {
      uid: '',
      id,
      // The label the rest of the app already recognises, so every existing
      // "is this the demo?" check keeps working.
      label: 'Demo Cat',
      art: `/api/cat-art?seed=${seed >>> 0}`,
      maxHp: cat.maxHp,
      hp: cat.maxHp,
    }
  } else {
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

    if (!owned.length)
      return NextResponse.json(
        { error: 'no Clanker Cat in that wallet', needsCat: true },
        { status: 403 },
      )

    const cat = owned.find(c => c.uid === uid)
    if (!cat)
      return NextResponse.json({ error: 'that wallet does not hold that cat' }, { status: 403 })

    // Cleaned here as well as in the browser, for the reason /api/fight gives:
    // it goes into the log and into a cast, so it is never taken on trust.
    const given = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 32)
    const label = given || `#${cat.id}`
    const built = ownedCat(cat.id, label)

    you = {
      uid: cat.uid,
      id: cat.id,
      label,
      art: cat.meta?.image ?? '',
      maxHp: built.maxHp,
      hp: built.maxHp,
    }

    // Their whole shelf is excluded, not just the cat they entered — a gauntlet
    // against your own second cat is not a gauntlet.
    excludeUids = new Set(owned.map(c => c.uid))
    excludeOwner = wallet
  }

  let roster
  try {
    roster = await pickRoster(ROUNDS, excludeUids, excludeOwner)
  } catch {
    return NextResponse.json({ error: 'could not read the collection' }, { status: 502 })
  }

  /*
   * A SHORT LADDER IS NOT THE MODE. Better to say so than to hand somebody a
   * three-round "five-round gauntlet" and call them a champion at the end of it.
   */
  if (roster.length < ROUNDS)
    return NextResponse.json(
      { error: 'could not find five cats to fight right now — try again in a moment' },
      { status: 503 },
    )

  const state: RunState = {
    v: 1,
    seed,
    you,
    foes: roster.map(r => r.ref),
    round: 0,
    pot: 0,
    choices: [],
    recorded: !demo,
    exp: Date.now() + TICKET_TTL_MS,
  }

  const out = playRound(state)
  const next = afterRound(state, out)

  return NextResponse.json({
    recorded: state.recorded,
    you: next.you,
    // The whole ladder up front: it says what they are in for without saying how
    // any of it goes.
    foes: state.foes,
    round: out,
    /*
     * ONE TAG FOR THE WHOLE RUN, and only once the run is over — so nothing
     * here unless they fell at the first cat. A demo runner has no uid and
     * signs nothing.
     */
    // A run cannot be won at round one, so nothing is ever banked here.
    tag: out.won ? null : tagFor(runPairs(next, out.foe), seed, null),
    pot: next.pot,
    choices: next.choices,
    champion: isChampion(next),
    over: !out.won,
    // Nothing to carry once the run is finished either way.
    ticket: out.won ? sign(next) : null,
  })
}
