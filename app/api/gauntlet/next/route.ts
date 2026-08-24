import { NextRequest, NextResponse } from 'next/server'
import {
  ROUNDS, afterRound, applyChoice, isChampion, playRound, runPairs,
  type Choice, type RunState,
} from '@/lib/gauntlet'
import { TICKET_TTL_MS, sign, verify } from '@/lib/ticket'
import { tagFor } from '@/lib/season'

/**
 * POST /api/gauntlet/next  { ticket, choice }  →  the next round.
 *
 * `choice` is what they did with the round they just won:
 *
 *   double   the pot doubles, and they walk in as hurt as they are
 *   heal     the bar goes back to full, and the pot does not grow
 *
 * The ticket is the run so far, signed by /api/gauntlet. It is verified before
 * anything is read out of it — unsigned, it would let a player pick their own
 * seed and their own health. lib/ticket.ts sets out the one thing signing does
 * NOT prevent, which is replaying a ticket for a second try at a round.
 */
const CHOICES: Choice[] = ['double', 'heal']

export async function POST(req: NextRequest) {
  let body: { ticket?: string; choice?: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'expected a JSON body' }, { status: 400 })
  }

  const { ticket, choice } = body

  if (!ticket)
    return NextResponse.json({ error: 'no run in progress' }, { status: 400 })

  if (!choice || !CHOICES.includes(choice as Choice))
    return NextResponse.json({ error: 'choose "double" or "heal"' }, { status: 400 })

  const state = verify<RunState>(ticket)
  /*
   * ONE MESSAGE for a forged ticket and for an expired one. Which of the two it
   * was is not the player's business, and a run left sitting for half an hour is
   * over either way.
   */
  if (!state || state.v !== 1)
    return NextResponse.json({ error: 'that run has expired — start a new one' }, { status: 400 })

  if (state.round >= ROUNDS || state.you.hp <= 0)
    return NextResponse.json({ error: 'that run is already finished' }, { status: 400 })

  // The choice lands FIRST: it decides the health this round is walked into with.
  const chosen = applyChoice(state, choice as Choice)
  const out = playRound(chosen)
  const next = afterRound(chosen, out)
  const champion = isChampion(next)

  return NextResponse.json({
    recorded: next.recorded,
    you: next.you,
    foes: next.foes,
    round: out,
    /*
     * ONE TAG FOR THE WHOLE RUN, signed only when the run ends — either they
     * fell here or they took all five. Keyed on the RUN's seed, so a run cast
     * twice still counts once. A demo runner has no uid and signs nothing.
     */
    tag: !out.won || champion
      ? tagFor(runPairs(next, out.won ? null : out.foe), next.seed)
      : null,
    pot: next.pot,
    choices: next.choices,
    champion,
    over: !out.won || champion,
    ticket: out.won && !champion
      ? sign({ ...next, exp: Date.now() + TICKET_TTL_MS })
      : null,
  })
}
