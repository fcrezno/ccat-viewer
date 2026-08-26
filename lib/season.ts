import { sign, verify } from '@/lib/ticket'

/**
 * THE SEASONAL RECORD — kept in casts, not in a database.
 *
 * A cat's record is "how it did against everybody else's this season", and it
 * has to be the same number for everybody looking at it. There is no database in
 * this app, so the obvious answers are out: localStorage is per-device, and a
 * counter needs somewhere to count.
 *
 * So the CAST IS THE RECORD. It is the pattern /api/leaderboard already uses —
 * it rebuilds the whole IdleClank board by searching Farcaster — and it fits
 * what the Cradle already believes, in share()'s own words: a boast goes in the
 * open or not at all.
 *
 * THE PRICE, SAID PLAINLY: only fights somebody CAST are counted. A cat's number
 * is a floor, not a total. That is the deal the mode is built on rather than an
 * oversight, and the board says so under it.
 *
 * ── WHY THE TAG IS SIGNED ────────────────────────────────────────────────────
 *
 * A cast is just text and anyone can type one. If the tally read the words, a
 * cat's record would be worth exactly the honesty of the people casting about it
 * — and cat names are player-chosen, up to 32 characters, so two cats can share
 * one. Now that points decide a public ranking, an unsigned number would simply
 * be whatever the loudest person typed.
 *
 * Every finished run is therefore SIGNED by the server into a tag that travels
 * in the cast, reusing the HMAC in lib/ticket.ts.
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

/**
 * What a run scored, and for whom.
 *
 * ONLY A CHAMPION SCORES. Falling loses the pot — that is the other half of
 * "double or nothing", and without it doubling costs nothing and there is no
 * decision to make. So a run that ended in a fall carries points 0, and the
 * board is a list of cats that took all five.
 */
export type Score = { uid: string; points: number }

/** The signed payload. `p` is the packed run; see `pack`. */
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

export type Run = { season: number; seed: string; pairs: Pair[]; score: Score | null; runner: Runner | null }

/**
 * `season|seed|scorer=points|runner@fid|winner>loser,…`
 *
 * The seed is what makes a run distinct, so the same run cast twice still counts
 * once. Hex, because it is shorter than decimal and this is a character budget.
 * The score section is empty when nothing was banked.
 *
 * THE RUNNER AND THEIR FID ARE IN THE SIGNATURE, and that is what makes a tag
 * claimable. Without them the tag proves a run HAPPENED but not WHOSE it was —
 * so anyone who saw one in a cast could paste it into their own and claim the
 * prize. Bound this way, a copied tag names the person it was signed for and is
 * worthless to the copier.
 *
 * The fid is taken on trust when the run starts, because /api/gauntlet is not
 * behind auth. That costs nothing: signing a tag for somebody else's fid only
 * produces a tag that somebody else can claim, and the claim itself checks a
 * Quick Auth token against this value.
 */
function pack(pairs: Pair[], seed: number, score: Score | null, run: Runner | null): string {
  const body = pairs.map(p => `${p.w}>${p.l}`).join(',')
  const sc = score && score.points > 0 ? `${score.uid}=${Math.round(score.points)}` : ''
  const who = run?.uid ? `${run.uid}@${run.fid ?? 0}` : ''
  return `${SEASON}|${(seed >>> 0).toString(16)}|${sc}|${who}|${body}`
}

/** Who ran it: the cat, and the Farcaster account that will claim for it. */
export type Runner = { uid: string; fid: number }

const UID = /^[a-z0-9]+:\d+$/

function unpack(packed: string): Omit<Run, 'season'> & { season: number } | null {
  const parts = packed.split('|')

  /*
   * THREE SHAPES, because this tag has grown twice and older ones are already
   * out there in casts. Three parts is the original, four added the score, five
   * added who ran it. An older tag still counts for wins and losses — the fight
   * happened — it just cannot be CLAIMED, because it does not name anybody.
   */
  let season: string, seed: string, sc: string, who: string, body: string
  if (parts.length === 3) [season, seed, body] = parts, sc = '', who = ''
  else if (parts.length === 4) [season, seed, sc, body] = parts, who = ''
  else if (parts.length === 5) [season, seed, sc, who, body] = parts
  else return null

  if (!season || !seed || !body) return null

  const pairs: Pair[] = []
  for (const chunk of body.split(',')) {
    const [w, l] = chunk.split('>')
    // A uid is "collection:id" — anything else did not come from here.
    if (!UID.test(w ?? '') || !UID.test(l ?? '')) return null
    pairs.push({ w, l })
  }

  let score: Score | null = null
  if (sc) {
    const [uid, pts] = sc.split('=')
    const n = Number(pts)
    if (!UID.test(uid ?? '') || !Number.isFinite(n) || n < 0) return null
    score = { uid, points: Math.round(n) }
  }

  /*
   * The runner is only trusted when BOTH halves parse. A tag naming a cat with
   * no fid, or a fid that is not a number, is treated as unclaimable rather than
   * half-claimable — there is no useful middle state for a prize.
   */
  let runner: Runner | null = null
  if (who) {
    const [uid, fidRaw] = who.split('@')
    const fid = Number(fidRaw)
    if (UID.test(uid ?? '') && Number.isInteger(fid) && fid > 0) runner = { uid, fid }
  }

  return { season: Number(season), seed, pairs, score, runner }
}

/**
 * A cast tag for a finished run, or null if none of it can count.
 *
 * A pair with a blank uid on either side is DROPPED, not signed: that is a demo
 * cat, which is invented per request and belongs to nobody, so there is no record
 * for it to go on. If that leaves nothing, there is no tag.
 */
export function tagFor(
  pairs: Pair[],
  seed: number,
  score: Score | null = null,
  runner: Runner | null = null,
): string | null {
  const real = pairs.filter(p => p.w && p.l)
  if (!real.length) return null
  const banked = score && score.uid && score.points > 0 ? score : null
  // A runner with no uid is a demo cat: it can be shown, never claimed.
  const who = runner?.uid && runner.fid > 0 ? runner : null
  return `${PREFIX}${SEASON}.${sign<Payload>({ p: pack(real, seed, banked, who) })}`
}

/**
 * HOW MANY ROUNDS THE RUNNER WON, read off the pairs.
 *
 * The prize is scaled by depth — three wins earns one cat, five earns two — so
 * this is the number the claim is decided on. Counted rather than carried, so a
 * tag cannot claim more wins than the pairs it actually lists.
 */
export function winsFor(run: Run): number {
  if (!run.runner) return 0
  return run.pairs.filter(p => p.w === run.runner!.uid).length
}

/** Every valid tag's run, from a piece of text. Unsigned or altered ones are dropped. */
export function readTags(text: string): Run[] {
  const out: Run[] = []
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

export type Tally = { wins: number; losses: number; points: number; runs: number }

const BLANK: Tally = { wins: 0, losses: 0, points: 0, runs: 0 }

/**
 * Fold verified runs into a per-cat tally for ONE season.
 *
 * Deduplicated on the SEED, because the same run can be cast more than once — by
 * the person who ran it, and by anybody quoting them.
 */
export function tally(found: Run[], season = SEASON): Map<string, Tally> {
  const seen = new Set<string>()
  const out = new Map<string, Tally>()

  const get = (uid: string) => {
    const cur = out.get(uid) ?? { ...BLANK }
    out.set(uid, cur)
    return cur
  }

  for (const r of found) {
    if (r.season !== season) continue
    if (seen.has(r.seed)) continue
    seen.add(r.seed)

    for (const p of r.pairs) {
      get(p.w).wins++
      get(p.l).losses++
    }

    if (r.score && r.score.points > 0) {
      const s = get(r.score.uid)
      s.points += r.score.points
      // Only a finished run banks anything, so this counts championships.
      s.runs++
    }
  }
  return out
}

export type BoardRow = { uid: string; rank: number } & Tally

/**
 * THE BOARD — every cat that has banked points, best first.
 *
 * Ranked on POINTS, which only a champion earns. Ties break on fewer runs, so a
 * cat that got there in one go stands above one that needed three; then on wins,
 * then on uid so the order never wobbles between two identical rows.
 *
 * Cats with no points are left off entirely rather than listed at zero — a board
 * of a thousand cats on nil is not a ranking, it is the collection.
 */
/** A guest cat is not a token. "guest:1234" never sits on the collection board. */
export const isGuest = (uid: string) => uid.startsWith('guest:')

export function board(t: Map<string, Tally>): BoardRow[] {
  return [...t.entries()]
    /*
     * GUESTS ARE LEFT OFF, deliberately. This board ranks the COLLECTION — it is
     * what a Title is awarded from and what the champion prize reads. A guest cat
     * is a seed on somebody's phone, not a token, so it cannot hold either. They
     * get their own ranking; they do not dilute this one.
     */
    .filter(([uid, v]) => v.points > 0 && !isGuest(uid))
    .sort(([ua, a], [ub, b]) =>
      b.points - a.points ||
      a.runs - b.runs ||
      b.wins - a.wins ||
      ua.localeCompare(ub))
    .map(([uid, v], i) => ({ uid, rank: i + 1, ...v }))
}
