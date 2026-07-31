import { NextRequest, NextResponse } from 'next/server'

/**
 * Pre-reveal metadata. Every token id returns the same unrevealed card.
 *
 * The contract is deployed with BASE_URI pointing here, then flipped to
 * /v2/metadata/ with setBaseURI once the mint sells out. That delay matters:
 * token ids are assigned in mint order and the Mystery ids are fixed at
 * generation, so exposing the real metadata during the mint would let anyone
 * read which position is a Mystery and time their transaction to take it.
 *
 * Serving a deliberate "unrevealed" card also beats a 404, which wallets and
 * marketplaces render as a broken image.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!/^\d+$/.test(id))
    return NextResponse.json({ error: 'invalid token id' }, { status: 400 })

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ccat-viewer.vercel.app'

  return NextResponse.json(
    {
      name:        `Clanker Cats V2 #${id}`,
      description: 'Unrevealed. All 1111 cats reveal once the mint closes.',
      image:       `${origin}/v2/placeholder.png`,
      edition:     Number(id),
      attributes:  [{ trait_type: 'Type', value: 'Unrevealed' }],
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Deliberately short: marketplaces must re-fetch promptly after the
        // reveal, so this must not be cached the way revealed metadata is.
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}
