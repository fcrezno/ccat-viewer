import { createPublicClient, http, fallback } from 'viem'
import { base } from 'viem/chains'

/**
 * Clanker Cats collections on Base.
 *
 * V1 — the original 200-piece drop (Highlight ERC721, sold out, limitSupply 200).
 * V2 — the free-mint follow-up. Add its address here once deployed; everything
 *      downstream (viewer, share embeds, frames) picks it up automatically.
 *
 * Metadata is hosted (Arweave JSON → highlight.xyz PNG), not on-chain SVG.
 * Neither collection is enumerable, so ownership is resolved by scanning ownerOf().
 */
export type CollectionKey = 'v1' | 'v2'

export type CollectionDef = {
  key:     CollectionKey
  address: `0x${string}`
  label:   string
  opensea: string
  /** Pixel art is upscaled nearest-neighbour; anything else gets smooth resampling. */
  pixelArt: boolean
}

export const COLLECTIONS: CollectionDef[] = [
  {
    key:      'v1',
    address:  '0xbE76Ce3cE0966fedA606fCF70884dae8FBaa7FCF',
    label:    'Clanker Cats',
    opensea:  'https://opensea.io/collection/clanker-cats',
    pixelArt: true,
  },
  {
    key:      'v2',
    address:  '0x5C5b928f937F63656BE62d0A45f4Db756b79934B',
    label:    'Clanker Cats V2',
    opensea:  'https://opensea.io/assets/base/0x5C5b928f937F63656BE62d0A45f4Db756b79934B',
    pixelArt: true,
  },
]

/** sharp resize kernel appropriate to a collection's art style. */
export function kernelFor(col: CollectionDef): 'nearest' | 'lanczos3' {
  return col.pixelArt ? 'nearest' : 'lanczos3'
}

export const DEFAULT_COLLECTION: CollectionKey = 'v1'

export function getCollection(key?: string | null): CollectionDef {
  return COLLECTIONS.find(c => c.key === key) ?? COLLECTIONS[0]
}

/** Safety bound on the ownerOf() scan only — not the collection size. Supply is read live. */
export const SCAN_LIMIT = 5000

export const COLLECTION_ABI = [
  { name: 'name',        type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string'  }] },
  { name: 'symbol',      type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string'  }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'limitSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
  {
    name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }],
  },
  {
    name: 'tokenURI', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }],
  },
  {
    name: 'safeTransferFrom', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'from',    type: 'address' },
      { name: 'to',      type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

export type Trait   = { trait_type: string; value: string }
export type CatMeta = { name: string; image: string; description?: string; attributes?: Trait[] }

/** A cat is identified by collection + token id — ids repeat across collections. */
export type Cat = {
  collection: CollectionKey
  id:         string
  /** Stable cross-collection key, e.g. "v1:46". Used for routing and Tamagotchi state. */
  uid:        string
  meta:       CatMeta | null
}

export const publicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base.llamarpc.com'),
    http('https://mainnet.base.org'),
    http('https://rpc.ankr.com/base'),
  ]),
})

export function makeUid(collection: CollectionKey, id: string | number) {
  return `${collection}:${id}`
}

export function parseUid(uid: string): { collection: CollectionKey; id: string } {
  const [key, id] = uid.includes(':') ? uid.split(':') : [DEFAULT_COLLECTION, uid]
  return { collection: getCollection(key).key, id }
}

/** Token ids in `col` held by `owner`, found by scanning the collection via multicall. */
export async function fetchOwnedIds(col: CollectionDef, owner: string): Promise<number[]> {
  const supply = Number(await publicClient.readContract({
    address: col.address, abi: COLLECTION_ABI, functionName: 'totalSupply',
  }))
  const ids = Array.from({ length: Math.min(supply, SCAN_LIMIT) }, (_, i) => i + 1)
  if (ids.length === 0) return []

  const owners = await publicClient.multicall({
    contracts: ids.map(id => ({
      address: col.address, abi: COLLECTION_ABI, functionName: 'ownerOf', args: [BigInt(id)],
    })),
    allowFailure: true,
    batchSize: 4096,
  })

  const target = owner.toLowerCase()
  return ids.filter((_, i) => {
    const r = owners[i]
    return r.status === 'success' && String(r.result).toLowerCase() === target
  })
}

/** tokenURI → hosted JSON. Null if the token doesn't exist or metadata is unreachable. */
export async function fetchMeta(col: CollectionDef, id: number | string): Promise<CatMeta | null> {
  try {
    const uri = await publicClient.readContract({
      address: col.address, abi: COLLECTION_ABI, functionName: 'tokenURI', args: [BigInt(id)],
    }) as string

    if (uri.startsWith('data:'))
      return JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'))

    const res = await fetch(uri, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Every cat `owner` holds, across every configured collection. */
export async function fetchCats(owner: string): Promise<Cat[]> {
  const perCollection = await Promise.all(COLLECTIONS.map(async col => {
    const ids   = await fetchOwnedIds(col, owner)
    const metas = await Promise.all(ids.map(id => fetchMeta(col, id)))
    return ids.map((id, i): Cat => ({
      collection: col.key,
      id:         String(id),
      uid:        makeUid(col.key, id),
      meta:       metas[i],
    }))
  }))
  return perCollection.flat()
}
