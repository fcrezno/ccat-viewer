import { NextRequest, NextResponse } from 'next/server'
import { clientForChain, robinhood } from '@/lib/chains'
import { V3, V3_DEPLOYED } from '@/lib/mintv3'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { APP_URL } from '@/lib/miniapp'

/**
 * Progressive reveal, V3 — the same rule V2 arrived at, on Robinhood Chain.
 *
 * A token reveals the moment it exists. Everything else is the "Unrevealed"
 * card, so nobody can read ahead of the mint and time a transaction onto a
 * particular cat.
 *
 * ── WHY EXISTENCE AND NOT totalSupply ────────────────────────────────────────
 *
 * V2 learned this the hard way and the comment there is worth repeating: a
 * marketplace fetches metadata the instant it sees the Transfer event, and an
 * RPC one block behind reported a supply that did not include the token yet — so
 * a freshly minted cat was served, and permanently CACHED, as unrevealed.
 * `ownerOf` reverting is the property actually being asked about, and it cannot
 * read as "not yet" for a token that has already moved.
 *
 * The retry matters more here than it did on Base. Robinhood's public RPC is
 * rate-limited and its own docs say it is not for production (see lib/chains.ts),
 * so a miss is likelier to be the endpoint than the chain.
 *
 * ── BEFORE THE DEPLOY ────────────────────────────────────────────────────────
 *
 * With no address set there is no contract to ask, and every id is unrevealed.
 * That is the honest answer rather than a crash, and it means this route can be
 * live and correct before anything is deployed.
 */

const REVEAL_CACHE = 'public, max-age=31536000, immutable'
// Never cache a miss: a cached "?" would freeze a minted cat as a blank card.
const UNREVEALED_CACHE = 'no-store, max-age=0, must-revalidate'

const OWNER_OF = [{
  name: 'ownerOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }],
}] as const

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!/^\d+$/.test(id))
    return NextResponse.json({ error: 'invalid token id' }, { status: 400 })

  const tokenId = Number(id)
  if (tokenId < 1 || !V3_DEPLOYED) return unrevealed(tokenId)

  let exists = false
  for (let attempt = 0; attempt < 3 && !exists; attempt++) {
    try {
      await clientForChain(robinhood).readContract({
        address: V3, abi: OWNER_OF, functionName: 'ownerOf', args: [BigInt(tokenId)],
      })
      exists = true
    } catch (e) {
      const msg = String((e as Error)?.message ?? '')
      if (/NonexistentToken|reverted|execution reverted/i.test(msg) && attempt > 0) break
      if (attempt < 2) await new Promise(r => setTimeout(r, 350 * (attempt + 1)))
    }
  }

  if (!exists) return unrevealed(tokenId)

  try {
    const file = await readFile(join(process.cwd(), 'public', 'v3', 'metadata', String(tokenId)), 'utf8')
    return new NextResponse(file, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': REVEAL_CACHE,
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return unrevealed(tokenId)
  }
}

function unrevealed(tokenId: number) {
  return NextResponse.json(
    {
      name:        `Clanker Cats V3 #${tokenId}`,
      description: 'Unrevealed. Each cat reveals the moment it is minted.',
      image:       `${APP_URL}/v3/placeholder.png`,
      edition:     tokenId,
      attributes:  [{ trait_type: 'Type', value: 'Unrevealed' }],
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': UNREVEALED_CACHE,
        'Access-Control-Allow-Origin': '*',
      },
    },
  )
}
