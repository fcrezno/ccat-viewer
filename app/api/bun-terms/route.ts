import { NextResponse } from 'next/server'
import { terms } from '@/lib/bunburn'

/**
 * GET /api/bun-terms → what a cat costs in BUN, and where to send it.
 *
 * Read only, and it says { live: false } and nothing else while the toll or the
 * amount is missing. The page shows no BUN option at all in that state, which is
 * the behaviour that matters: a half-configured payment must be invisible rather
 * than broken, because a player who sends BUN to a wrong or missing address
 * cannot be given it back.
 *
 * Cached briefly. These values change when JP edits an env var and redeploys,
 * not while anybody is looking at the page.
 */
export async function GET() {
  try {
    return NextResponse.json(await terms(), {
      headers: { 'Cache-Control': 'public, max-age=30' },
    })
  } catch {
    /*
     * The only thing here that can fail is reading decimals() off the token, and
     * failing closed is the safe direction: no offer shown beats an offer priced
     * by a guess.
     */
    return NextResponse.json({ live: false }, { status: 200 })
  }
}
