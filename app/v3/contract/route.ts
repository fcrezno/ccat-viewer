import { NextResponse } from 'next/server'
import { APP_URL } from '@/lib/miniapp'

/**
 * COLLECTION-LEVEL METADATA — what `contractURI()` is supposed to return.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * V2 shipped with `contractURI` pointing at `/v2/metadata/1` — TOKEN NUMBER ONE.
 * Read on chain, live: "https://ccat-viewer.vercel.app/v2/metadata/1".
 *
 * A marketplace reading that gets a token, not a collection. The collection's
 * name comes out as "Clanker Cats V2 #1", its picture is whatever cat #1 happens
 * to look like, and there is no royalty block at all. It is the difference
 * between a collection page and a broken one, and it is the sort of thing that
 * makes a listing refuse to come together.
 *
 * `tokenURI` and `contractURI` are two different documents with two different
 * shapes. This is the second one.
 *
 * ── ROYALTIES ARE STATED TWICE, ON PURPOSE ───────────────────────────────────
 *
 * The contract implements ERC-2981 properly — `royaltyInfo` is there and
 * `supportsInterface` answers to 0x2a55205a — and that is what a modern
 * marketplace reads. `seller_fee_basis_points` and `fee_recipient` below are the
 * older path, still read by some. Saying it both ways costs nothing and the two
 * cannot disagree, because both come from the same deploy.
 *
 * The receiver is an env var rather than a literal: it is a public address, but
 * it is also the one thing here that changes per deployment.
 */

const BPS = Number(process.env.NEXT_PUBLIC_ROYALTY_BPS ?? '800')
const RECEIVER = process.env.NEXT_PUBLIC_ROYALTY_RECEIVER ?? ''

export async function GET() {
  return NextResponse.json(
    {
      name:        'Clanker Cats V3',
      description: 'Clanker Cats V3 — free on Robinhood Chain. Play the game, win three, keep the cat.',
      image:       `${APP_URL}/icon.png`,
      banner_image_url: `${APP_URL}/hero.png`,
      external_link: APP_URL,
      ...(RECEIVER ? { seller_fee_basis_points: BPS, fee_recipient: RECEIVER } : {}),
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Marketplaces fetch this from their own origin.
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    },
  )
}
