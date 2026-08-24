import { sign, verify } from '@/lib/ticket'

/**
 * THE SEASONAL RECORD — kept in casts, not in a database.
 *
 * A cat's record is "how many cats it beat this season", and it has to be the
 * same number for everybody looking at it. There is no database in this app, so
 * the obvious answers are out: localStorage is per-device, and a counter needs
 * somewhere to count.
 *
 * So the CAST IS THE RECORD. It is the pattern /api/leaderboard already uses —
 * it rebuilds the whole IdleClank board by searching Farcaster — and it fits
 * what the Cradle already believes, in share()'s own words: a boast goes in the
 * open or not at all.
 *
 * THE PRICE, SAID PLAINLY: only fights somebody CAST are counted. A cat's number
 * is a floor, not a total. That is the deal the mode is built on rather than an
 * oversight, and the viewer says so next to the number.
 *
 * ── WHY THE TAG IS SIGNED ────────────────────────────────────────────────────
 *
 * A cast is just text and anyone can type one. If the tally read the words, a
 * cat's record would be worth exactly the honesty of the people casting about it
 * — and the names in that sentence are player-chosen, up to 32 characters, so
 * two cats can share one.
 *
 * Every finished fight is therefore SIGNED by the server into a tag that travels
 * in the cast. Only a fight the server actually ran can produce one, so a
 * hand-typed boast counts for nothing. It reuses the HMAC in lib/ticket.ts.
 *
 * ── WHY ONE TAG CARRIES A WHOLE RUN ──────────────────────────────────────────
 *
 * A gauntlet is five fights. Five separate tags is about 350 characters, which
 * does not fit in a cast alongside anything worth reading. So a tag carries a
 * LIST of pairs, and the packing is a plain string rather than JSON because JSON
 * spends its budget on punctuation.
 */

/**
 * The season being played.
 *
 * Bumped by hand when a season ends, at the same time the totals are frozen into
 * the metadata. A tag from an older season still verifies — it was a real fight —
 * but it does not count towards this one.
 */
export const SEASON = 1

/** What the tag looks like in a cast, so it can be found and parsed back out. */
const PREFIX = 'CC'

/** One decided fight: who won, who lost. Both are uids like "v2:65". */
export type Pair = { w: string; l: string }

/** The signed payload. `p` is the packed pairs; see `pack`. */
type Payload = {
  p: string
  /**
   * Never set, and that is the point.
   *
   * `verify` drops a payload past its `exp`, which is right for a half-finished
   * run — nobody should resume one an hour later. A RESULT is the opposite: the
   * fight happened, and it should still count at the end of the season. Leaving
   * this undefined skips the expiry check.
   */
  exp?: number
}

/**
 * `season|seed|winner>loser,winner>loser,…`
 *
 * The seed is what makes a run distinct, so the same win cast twice still counts
 * once. Hex, because it is shorter than decimal and this is a character budget.
 */
function pack(pairs: Pair[], seed: number): string {
  const body = pairs.map(p => `${p.w}>${p.l}`).join(',')
  return `${SEASON}|${(seed >>> 0).toString(16)}|${body}`
}

function unpack(packed: string): { season: number; seed: string; pairs: Pair[] } | null {
  const [season, seed, body] = packed.split('|')
  if (!season || !seed || !body) return null

  const pairs: Pair[] = []
  for (const chunk of body.split(',')) {
    const [w, l] = chunk.split('>')
    // A uid is "collection:id" — anything else did not come from here.
    if (!/^[a-z0-9]+:\d+$/.test(w ?? '') || !/^[a-z0-9]+:\d+$/.test(l ?? '')) return null
    pairs.push({ w, l })
  }
  return { season: Number(season), seed, pairs }
}

/**
 * A cast tag for one or more decided fights, or null if none of them can count.
 *
 * A pair with a blank uid on either side is DROPPED, not signed: that is a demo
 * cat, which is invented per request and belongs to nobody, so there is no record
 * for it to go on. If that leaves nothing, there is no tag.
 */
export function tagFor(pairs: Pair[], seed: number): string | null {
  const real = pairs.filter(p => p.w && p.l)
  if (!real.length) return null
  return `${PREFIX}${SEASON}.${sign<Payload>({ p: pack(real, seed) })}`
}

/** Every valid tag's pairs, from a piece of text. Unsigned or altered ones are dropped. */
export function readTags(text: string): { seed: string; season: number; pairs: Pair[] }[] {
  const out: { seed: string; season: number; pairs: Pair[] }[] = []
  // The signed part is base64url plus one dot, so a tag ends at whitespace.
  const re = new RegExp(`${PREFIX}(\\d+)\\.([A-Za-z0-9_\\-]+\\.[A-Za-z0-9_\\-]+)`, 'g')

  for (const m of text.matchAll(re)) {
    const parsed = verify<Payload>(m[2])
    if (!parsed?.p) continue

    const un = unpack(parsed.p)
    if (!un) continue
    // The season in the readable part must agree with the signed one, so the
    // visible tag cannot say one thing while the signature says another.
    if (un.season !== Number(m[1])) continue

    out.push(un)
  }
  return out
}

export type Tally = { wins: number; losses: number }

/**
 * Fold verified results into a per-cat tally for ONE season.
 *
 * Deduplicated on the SEED, because the same run can be cast more than once — by
 * the person who ran it, and by anybody quoting them.
 */
export function tally(
  found: { seed: string; season: number; pairs: Pair[] }[],
  season = SEASON,
): Map<string, Tally> {
  const seen = new Set<string>()
  const out = new Map<string, Tally>()

  const bump = (uid: string, key: keyof Tally) => {
    const cur = out.get(uid) ?? { wins: 0, losses: 0 }
    cur[key]++
    out.set(uid, cur)
  }

  for (const r of found) {
    if (r.season !== season) continue
    if (seen.has(r.seed)) continue
    seen.add(r.seed)

    for (const p of r.pairs) {
      bump(p.w, 'wins')
      bump(p.l, 'losses')
    }
  }
  return out
}
