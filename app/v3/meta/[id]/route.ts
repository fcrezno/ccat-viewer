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

/*
 * A revealed cat can still CHANGE once: burning BUN through it adds the
 * BunBurner trait (ClankerCatsV3.burnBun). So only a BunBurner — whose mark is
 * permanent — is cached forever; any other cat is cached briefly so the trait
 * shows up within minutes of the burn. The contract also emits ERC-4906
 * MetadataUpdate, which is what makes a marketplace re-fetch.
 */
const REVEAL_CACHE = 'public, max-age=31536000, immutable'
const CAN_CHANGE_CACHE = 'public, max-age=300'
// Never cache a miss: a cached "?" would freeze a minted cat as a blank card.
const UNREVEALED_CACHE = 'no-store, max-age=0, must-revalidate'

const OWNER_OF = [{
  name: 'ownerOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }],
}] as const

const BUN_BURNER = [{
  name: 'bunBurner', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'bool' }],
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

  let meta: { attributes?: { trait_type: string; value: string }[] } & Record<string, unknown>
  try {
    meta = JSON.parse(await readFile(join(process.cwd(), 'public', 'v3', 'metadata', String(tokenId)), 'utf8'))
  } catch {
    return unrevealed(tokenId)
  }

  // Unknown (the read failed) is not "no": serve it uncached so the next look retries.
  let burner: boolean | null = null
  for (let attempt = 0; attempt < 3 && burner === null; attempt++) {
    try {
      burner = await clientForChain(robinhood).readContract({
        address: V3, abi: BUN_BURNER, functionName: 'bunBurner', args: [BigInt(tokenId)],
      }) as boolean
    } catch {
      if (attempt < 2) await new Promise(r => setTimeout(r, 350 * (attempt + 1)))
    }
  }

  if (burner) meta.attributes = [...(meta.attributes ?? []), { trait_type: 'BunBurner', value: 'Yes' }]

  return new NextResponse(JSON.stringify(meta, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': burner ? REVEAL_CACHE : burner === false ? CAN_CHANGE_CACHE : UNREVEALED_CACHE,
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function unrevealed(tokenId: number) {
  return NextResponse.json(
    {
      name:        `Clanker Cat #${tokenId}`,
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
