import { NextResponse } from 'next/server'

/**
 * GET /api/hits  →  { count }
 *
 * An old-web hit counter. There is no database in this app, and a number kept in
 * memory would be worse than none: serverless resets it on every cold start and
 * each instance counts separately, so it would jump about and go DOWN.
 *
 * So the number is kept by hits.sh, which is free and needs no account.
 *
 * ── WHY THIS IS PROXIED INSTEAD OF EMBEDDED ──────────────────────────────────
 *
 * The usual way to use a counter like this is to drop its SVG straight into the
 * page. That would mean every visitor's browser talking to a third party, handing
 * over an IP and a referrer for a number on a footer. Calling it from the SERVER
 * instead means hits.sh sees this app and nothing else.
 *
 * It also buys the look: a foreign badge in somebody else's font would sit badly
 * under a page drawn in JP's own bitmap sheet. Proxying returns a NUMBER, and the
 * page draws it the way it draws everything else.
 *
 * ── HOW THE NUMBER IS READ ───────────────────────────────────────────────────
 *
 * hits.sh only answers in SVG — the `.json` form is a 404, checked rather than
 * assumed. The count is in the badge's own title and aria-label:
 *
 *     <title>hits: 42</title> … aria-label="hits: 42"
 *
 * So it is parsed out of there. That is a scrape, and scrapes rot: if hits.sh
 * changes its badge, this returns null and the footer shows nothing. It never
 * throws and never blocks the page — a counter is decoration, and decoration does
 * not get to break a game.
 */

/*
 * NEVER CACHED. A cached counter is a picture of a number: the whole point is
 * that requesting it is what counts it, so a cache would freeze the total AND
 * stop the visit registering at all.
 */
export const dynamic = 'force-dynamic'

/** The key hits.sh counts against. One counter for the whole site, as they were. */
const KEY = 'ccat-viewer.vercel.app'

export async function GET() {
  try {
    const res = await fetch(`https://hits.sh/${KEY}.svg`, {
      cache: 'no-store',
      // A counter is not worth hanging a page load on.
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return NextResponse.json({ count: null })

    const svg = await res.text()
    const m = svg.match(/aria-label="hits:\s*([\d,]+)"/i) ?? svg.match(/<title>hits:\s*([\d,]+)<\/title>/i)
    const count = m ? Number(m[1].replace(/,/g, '')) : null

    return NextResponse.json({ count: Number.isFinite(count) ? count : null })
  } catch {
    // Down, slow, or changed shape. The footer simply shows nothing.
    return NextResponse.json({ count: null })
  }
}
