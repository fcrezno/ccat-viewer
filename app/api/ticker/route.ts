import { NextRequest, NextResponse } from 'next/server'
import { SEASON, board, readTags, tally, type Run } from '@/lib/season'

/**
 * GET /api/ticker            →  every cat's season record
 * GET /api/ticker?uid=v2:65  →  just that cat's
 *
 * A cat's seasonal record, rebuilt from Farcaster. lib/season.ts explains why it
 * lives there: this app has no database, and a record that only exists on one
 * person's device is not a record anybody can compare against.
 *
 * The whole map comes back by default so the viewer can show a shelf of cats
 * with ONE request instead of one per cat.
 *
 * ── WHAT THIS NUMBER IS ──────────────────────────────────────────────────────
 *
 * A FLOOR, NOT A TOTAL. Two things hold it down, and both are stated in the
 * answer rather than hidden:
 *
 *   - only fights somebody cast are in here at all
 *   - only the most recent PAGES of casts are read, because a search endpoint
 *     is paged and this runs on a request
 *
 * `partial` is therefore always true today. If it ever needs to be exact, that
 * is the point at which this wants a database rather than a search.
 */
/*
 * NOT a route-level `revalidate`. This handler reads a query parameter, which
 * makes it dynamic, so a segment-level revalidate would sit there looking like
 * caching that never happens. The caching that DOES happen is on the Neynar
 * calls below, where it belongs — several viewers asking at once share one
 * search rather than each spending a request.
 */

/** How many pages of 100 to walk. Five is a second or so and covers a busy day. */
const PAGES = 5

/**
 * What the search asks for.
 *
 * Casts are found by HASHTAG, not by the signed code — the code is base64 and
 * search engines do not index a blob. The tag is what makes the cast findable;
 * the signature is what makes it count.
 */
const QUERY = '#ClankerCats'

export async function GET(req: NextRequest) {
  const key = process.env.NEYNAR_API_KEY
  if (!key) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const uid = req.nextUrl.searchParams.get('uid')
  const results: Run[] = []
  let cursor: string | null = null

  try {
    for (let page = 0; page < PAGES; page++) {
      const url = new URL('https://api.neynar.com/v2/farcaster/cast/search')
      url.searchParams.set('q', QUERY)
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)

      const res: Response = await fetch(url, {
        headers: { api_key: key },
        next: { revalidate: 60 },
      })
      if (!res.ok) break

      const data = await res.json()
      const casts = data.result?.casts ?? []

      /*
       * TEXT AND EMBEDS BOTH.
       *
       * The tag normally rides in the cast's LINK rather than its words — it is
       * 138 characters of base64 and a boast should read like a boast. The link
       * is already there, so the tag costs the reader nothing.
       *
       * The text is scanned as well, because a quote-cast or a hand-edited one
       * may carry the tag inline instead, and a real fight should count either
       * way. Signing is what makes it safe to read from anywhere.
       */
      for (const cast of casts) {
        const embedded = (cast.embeds ?? [])
          .map((e: { url?: string }) => e?.url ?? '')
          .join(' ')
        results.push(...readTags(`${cast.text ?? ''} ${embedded}`))
      }

      cursor = data.result?.next?.cursor ?? null
      if (!cursor || casts.length === 0) break
    }
  } catch {
    // A search that fell over should read as "nothing known yet", not a 500 —
    // the viewer draws a dash and the page still works.
  }

  const map = tally(results, SEASON)
  /*
   * THE BOARD is ranked on POINTS, which only a champion banks — falling loses
   * the pot. So this is a list of cats that took all five, not the collection.
   */
  const ranked = board(map)

  if (uid) {
    const t = map.get(uid) ?? { wins: 0, losses: 0, points: 0, runs: 0 }
    const row = ranked.find(r => r.uid === uid) ?? null
    return NextResponse.json({
      season: SEASON,
      uid,
      ...t,
      // Where this cat stands, and out of how many. Null when it has never
      // banked anything, which is not the same as being last.
      rank: row?.rank ?? null,
      of: ranked.length,
      partial: true,
    })
  }

  return NextResponse.json({
    season: SEASON,
    board: ranked,
    cats: Object.fromEntries(map),
    partial: true,
  })
}
