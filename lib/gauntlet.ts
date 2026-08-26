import { fight, ownedCat, type ArenaCat, type FightResult } from '@/lib/arena'

/**
 * THE GAUNTLET — five real cats, one bar of health, and a choice between them.
 *
 * The preview's ordinary fight invents its opponent, and the note in
 * app/api/fight/route.ts says why: a made-up cat "belongs to nobody, so a
 * preview fight can never put somebody else's cat on the losing end of a public
 * result."
 *
 * The gauntlet DELIBERATELY BREAKS THAT RULE, because that is the point of it.
 * Every opponent is a token somebody actually holds. That is what makes the mode
 * PVP, and it is why the mode is hard — see below.
 *
 * ── WHY IT NEEDED A CHOICE ───────────────────────────────────────────────────
 *
 * A gauntlet round is a FAIR fight and the ordinary preview fight is not. Both
 * cats here are built by ownedCat, which rolls better numbers than the invented
 * randomCat the normal fight puts up: measured over 8000 fights, a player beats
 * an invented cat 70.3% of the time and a real one 49.4% of the time.
 *
 * Five fair coin flips is about 2.9% even at full health every round. Carrying
 * the damage with only a small recovery measured at 0.06% — one run in 1818 —
 * which is not a game mode, it is a lottery.
 *
 * So the difficulty is handed to the player instead. After every round they won,
 * they choose:
 *
 *   DOUBLE   the pot doubles, and they walk into the next cat as hurt as they are
 *   HEAL     the bar goes back to full, and the pot does not grow
 *
 * Healing every time is the safe line and makes a champion genuinely reachable.
 * Doubling every time is worth a great deal and will almost certainly kill them.
 * Neither is the right answer, which is what makes it a choice.
 *
 * FALLING LOSES THE POT. That is the "or nothing" half — without it, doubling
 * costs nothing and there is no decision to make.
 *
 * ── ONE ROUND AT A TIME ──────────────────────────────────────────────────────
 *
 * The run cannot be decided in one answer any more, because a choice made while
 * already knowing the next round is not a choice. The server plays one round,
 * hands back a signed ticket (lib/ticket.ts), and waits. The seed still comes
 * from the server, so no round can be re-rolled by refreshing.
 */

/** Five cats. The number is the prize, so it is not tuned casually. */
export const ROUNDS = 5

/** What the player may do after surviving a round. */
export type Choice = 'double' | 'heal' | 'continue'

/** Who the player fought — enough to name them and link to them. */
export type FoeRef = {
  uid:        string
  collection: string
  id:         string
  label:      string
  /** The holder. Shown truncated; it is public chain data. */
  owner:      string
  art:        string
}

/** The player's cat as the run carries it. Stats come back from the token id. */
export type Runner = {
  uid:   string
  /*
   * The Farcaster account a won run is signed for, or 0 for nobody.
   *
   * Carried in the RUN STATE rather than resent on each round, so it is fixed
   * when the run starts and cannot be swapped for somebody else's on the last
   * step — the step that decides who gets the prize.
   */
  fid?:  number
  id:    string
  label: string
  art:   string
  maxHp: number
  hp:    number
}

/** Everything needed to play the next round. This is what gets signed. */
export type RunState = {
  v:        1
  seed:     number
  you:      Runner
  foes:     FoeRef[]
  /** Rounds already played and won. */
  round:    number
  pot:      number
  choices:  Choice[]
  /** False for a demo run: played in full, never banked. */
  recorded: boolean
  /*
   * WHETHER THE CONTINUE HAS BEEN SPENT.
   *
   * One per run, and its cost is the PRIZE CEILING: a continued run can earn one
   * cat however deep it goes, never two. It lives in the SIGNED state so the
   * ceiling travels with the run and the page cannot quietly drop it.
   */
  continued: boolean
  exp:      number
}

export type RoundOutcome = {
  round:   number
  foe:     FoeRef
  startHp: number
  endHp:   number
  fight:   FightResult
  won:     boolean
  /** The pot after this round's score went in, before any doubling. */
  pot:     number
}

/**
 * One seed per round, derived from the run's single seed.
 *
 * NOT mixed with the player's choices, deliberately. The round then plays the
 * same way whichever choice led into it, so the choice changes how much health
 * is carried in and nothing else — which is the bargain the player was offered.
 * It also means a run replays from its seed alone, so a champion can be checked.
 */
export function roundSeed(seed: number, round: number): number {
  let a = (seed ^ Math.imul(round + 1, 0x9e3779b9)) >>> 0
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b) >>> 0
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35) >>> 0
  return (a ^ (a >>> 16)) >>> 0
}

/** A fresh copy to hand to `fight`, which mutates what it is given. */
function clone(cat: ArenaCat, hp: number): ArenaCat {
  return { ...cat, moves: [...cat.moves], hp }
}

/** The player's cat rebuilt from its token id, at the health the run has left. */
export function runnerCat(you: Runner): ArenaCat {
  const cat = ownedCat(you.id || 0, you.label)
  cat.art = you.art
  cat.mine = true
  // A demo runner has no token id, so its numbers come from the seed instead and
  // maxHp is carried in the state rather than re-rolled.
  cat.maxHp = you.maxHp
  return clone(cat, you.hp)
}

/** An opponent rebuilt from its token id. Same id, same fighter, every time. */
export function foeCat(ref: FoeRef): ArenaCat {
  const cat = ownedCat(ref.id, ref.label)
  cat.mine = false
  cat.art = ref.art
  return cat
}

/**
 * Play one round.
 *
 * `state.round` is how many are already behind them, so this plays the next one.
 */
export function playRound(state: RunState): RoundOutcome {
  const ref = state.foes[state.round]
  const me = runnerCat(state.you)
  const foe = foeCat(ref)

  const startHp = me.hp
  const result = fight(me, clone(foe, foe.maxHp), roundSeed(state.seed, state.round))
  const endHp = Math.max(0, result.you.hp)

  return {
    round: state.round + 1,
    foe: ref,
    startHp,
    endHp,
    fight: result,
    won: result.youWon,
    // A lost round pays nothing, and the pot is gone with it.
    pot: result.youWon ? state.pot + result.total : 0,
  }
}

/** The state after a round, before the player has chosen. */
export function afterRound(state: RunState, out: RoundOutcome): RunState {
  return {
    ...state,
    round: out.won ? state.round + 1 : state.round,
    pot: out.pot,
    you: { ...state.you, hp: out.endHp },
  }
}

/** The state after the player chooses. Doubling is capped only by the run ending. */
export function applyChoice(state: RunState, choice: Choice): RunState {
  /*
   * A CONTINUE RE-ROLLS THE RUN'S SEED, and that is not decoration.
   *
   * Every round plays from `roundSeed( seed, round )`, so resuming the round they
   * just lost — same seed, same health — replays the BYTE-IDENTICAL fight. The
   * player would watch the same death twice and the continue would do nothing.
   * Measured over 40,000 runs before the re-roll it moved the outcome by 0.1%,
   * which is the noise floor; with it, the share of players who finish holding a
   * cat goes from 30.4% to 38.8%.
   *
   * Health returns to full because the price of a continue is the PRIZE, not the
   * difficulty — sending somebody back in on one hit point is not a second
   * chance, it is a longer way to lose.
   */
  if (choice === 'continue') {
    return {
      ...state,
      seed: (Math.random() * 0xffffffff) >>> 0,
      continued: true,
      you: { ...state.you, hp: state.you.maxHp },
      choices: [...state.choices, choice],
    }
  }

  return {
    ...state,
    pot: choice === 'double' ? state.pot * 2 : state.pot,
    you: { ...state.you, hp: choice === 'heal' ? state.you.maxHp : state.you.hp },
    choices: [...state.choices, choice],
  }
}

/**
 * Whether a fall can still be bought back.
 *
 * One per run: the price is a repost, and a recast can only be spent once on a
 * given cast, so the platform enforces the limit as much as this does.
 */
export function canContinue( state: RunState ): boolean {
  return !state.continued && state.you.hp <= 0 && state.round < ROUNDS
}

/** A run is finished when the player has fallen or has beaten all five. */
export function isChampion(state: RunState): boolean {
  return state.round >= ROUNDS && state.you.hp > 0
}

/**
 * EVERY DECIDED FIGHT IN THE RUN, for the seasonal record.
 *
 * One tag carries the whole run rather than one per round, because five separate
 * tags is about 350 characters and does not fit in a cast beside anything worth
 * reading. So this is called ONCE, when the run ends.
 *
 * `state` must be the state AFTER the last round was folded in, so `state.round`
 * is how many were beaten. `lost` is the cat that put them down, if one did.
 *
 * A demo runner has no uid; the empty strings are filtered out further down, in
 * tagFor, so a demo run signs nothing.
 */
export function runPairs(state: RunState, lost: FoeRef | null): { w: string; l: string }[] {
  const pairs = state.foes
    .slice(0, state.round)
    .map(foe => ({ w: state.you.uid, l: foe.uid }))

  if (lost) pairs.push({ w: lost.uid, l: state.you.uid })
  return pairs
}
