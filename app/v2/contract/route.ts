import { NextResponse } from 'next/server'
import { APP_URL } from '@/lib/miniapp'

/**
 * COLLECTION-LEVEL METADATA FOR V2 — which is live, and currently wrong.
 *
 * Read from Base, today: V2's on-chain `contractURI` is
 * "https://ccat-viewer.vercel.app/v2/metadata/1", which is token number one.
 * So the collection reads as "Clanker Cats V2 #1", wearing one cat's picture.
 *
 * This route is the document it should have been pointed at. Fixing the live
 * collection is ONE transaction and no redeploy — `setContractURI` is onlyOwner:
 *
 *   setContractURI("https://ccat-viewer.vercel.app/v2/contract")
 *
 * Nothing about the tokens changes. `tokenURI` is untouched, every minted cat
 * keeps its metadata and its art, and only the collection header moves.
 */

const BPS = Number(process.env.NEXT_PUBLIC_ROYALTY_BPS ?? '800')
const RECEIVER = process.env.NEXT_PUBLIC_ROYALTY_RECEIVER ?? ''

export async function GET() {
  return NextResponse.json(
    {
      name:        'Clanker Cats V2',
      description: 'Clanker Cats V2 — free mint on Base.',
      image:       `${APP_URL}/icon.png`,
      banner_image_url: `${APP_URL}/hero.png`,
      external_link: APP_URL,
      ...(RECEIVER ? { seller_fee_basis_points: BPS, fee_recipient: RECEIVER } : {}),
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    },
  )
}
