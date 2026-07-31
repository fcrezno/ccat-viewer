import { NextRequest, NextResponse } from 'next/server'
import { publicClient } from '@/lib/collection'
import { V2, V2_ABI } from '@/lib/mint'
import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * Progressive reveal.
 *
 * Returns the real cat for any token that has already been minted, and the
 * "Unrevealed" card for anything beyond the current supply.
 *
 * Why not just reveal everything: token ids are handed out in mint order and the
 * Mystery ids are fixed at generation, so publishing all 1,111 while the mint is
 * open would let anyone watch the supply counter and time their transaction onto
 * a Mystery. Gating on totalSupply closes that — an unminted id is unreadable, so
 * there is nothing ahead to aim at — while still letting every minter see their
 * cat the moment they get it.
 *
 * The contract's baseURI points here.
 */

const REVEAL_CACHE = 'public, max-age=31536000, immutable'  // minted: never changes
// Never cache "unrevealed". Marketplaces fetch metadata the moment they see the
// Transfer event, and a cached miss would freeze a minted cat as a "?" card.
const UNREVEALED_CACHE = 'no-store, max-age=0, must-revalidate'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!/^\d+$/.test(id))
    return NextResponse.json({ error: 'invalid token id' }, { status: 400 })

  const tokenId = Number(id)
  const origin  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ccat-viewer.vercel.app'

  if (tokenId < 1) return unrevealed(tokenId, origin)

  /**
   * Reveal iff the token exists — ownerOf reverts for an unminted id.
   *
   * This used to compare against totalSupply, which raced: marketplaces fetch
   * metadata the instant they see the Transfer event, and an RPC lagging one
   * block behind reported a supply that didn't include the token yet, so a
   * freshly minted cat was served (and cached) as unrevealed.
   *
   * Existence is the property we actually care about, and it can't be read as
   * "not yet" for a token that has already been transferred. The retry covers
   * an RPC that is simply behind.
   */
  let exists = false
  for (let attempt = 0; attempt < 3 && !exists; attempt++) {
    try {
      await publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'ownerOf', args: [BigInt(tokenId)] })
      exists = true
    } catch (e) {
      // A revert means unminted; anything else is an RPC problem worth retrying.
      const msg = String((e as Error)?.message ?? '')
      if (/NonexistentToken|reverted|execution reverted/i.test(msg) && attempt > 0) break
      if (attempt < 2) await new Promise(r => setTimeout(r, 350 * (attempt + 1)))
    }
  }

  if (!exists) return unrevealed(tokenId, origin)

  // Minted — serve the real metadata from the generated set.
  try {
    const file = await readFile(join(process.cwd(), 'public', 'v2', 'metadata', String(tokenId)), 'utf8')
    return new NextResponse(file, {
      headers: {
        'Content-Type':  'application/json; charset=utf-8',
        'Cache-Control': REVEAL_CACHE,
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return unrevealed(tokenId, origin)
  }
}

function unrevealed(tokenId: number, origin: string) {
  return NextResponse.json(
    {
      name:        `Clanker Cats V2 #${tokenId}`,
      description: 'Unrevealed. Each cat reveals the moment it is minted.',
      image:       `${origin}/v2/placeholder.png`,
      edition:     tokenId,
      attributes:  [{ trait_type: 'Type', value: 'Unrevealed' }],
    },
    {
      headers: {
        'Content-Type':  'application/json; charset=utf-8',
        'Cache-Control': UNREVEALED_CACHE,
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}
