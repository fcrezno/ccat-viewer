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
  /**
   * Where metadata lives, so a token's JSON can be fetched without an RPC call.
   * This mirrors the contract's baseURI. Reading tokenURI per token meant one
   * chain call per cat, which is the first thing to fail under rate limiting —
   * and it failed silently, leaving the viewer with nameless blank cards.
   */
  metaBase: string
  /**
   * THE MINT CAP — the highest id that can EVER exist, not how many do.
   *
   * These are fixed by the contracts, so the cap cannot drift out of step with
   * the chain. What CAN drift is the count: V1 is capped at 200 and sold out, so
   * for V1 the two numbers agree, but V2 is capped at 1111 with far fewer minted.
   *
   * So never pick a random id from this. `ownerOf` reverts on an unminted id, and
   * discovery code that drops failures then quietly returns a short list. Use
   * `liveSupply(col)` for anything that picks ids.
   */
  supply: number
}

export const COLLECTIONS: CollectionDef[] = [
  {
    key:      'v1',
    address:  '0xbE76Ce3cE0966fedA606fCF70884dae8FBaa7FCF',
    label:    'Clanker Cats',
    opensea:  'https://opensea.io/collection/clanker-cats',
    pixelArt: true,
    metaBase: 'https://arweave.net/aHi9QWrwohsE6nArKZAz0btSUTno5YG50i7AgMV7_6E/',
    supply:   200,
  },
  {
    key:      'v2',
    address:  '0x5C5b928f937F63656BE62d0A45f4Db756b79934B',
    label:    'Clanker Cats V2',
    opensea:  'https://opensea.io/assets/base/0x5C5b928f937F63656BE62d0A45f4Db756b79934B',
    pixelArt: true,
    /*
     * PINNED. THIS ONE IS NOT SAFE TO MOVE WITH THE APP.
     *
     * It is where a V2 cat's metadata is served from, and the CONTRACT points
     * here — every marketplace, wallet and explorer reads a token's art and
     * traits through this address. Repointing the app does not repoint them.
     *
     * Moving domain therefore means EITHER keeping this host serving metadata
     * forever, OR changing the contract's baseURI, which is a chain transaction
     * and only possible if the contract allows it. Until one of those is done,
     * this string stays exactly as it is.
     */
    metaBase: 'https://ccat-viewer.vercel.app/v2/metadata/',
    supply:   1111,
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

// Ordered by what actually stayed up under load: llamarpc returns 521s and
// mainnet.base.org rate-limits hard enough to fail a 200-call multicall.
export const publicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base-rpc.publicnode.com'),
    http('https://1rpc.io/base'),
    http('https://mainnet.base.org'),
    http('https://base.llamarpc.com'),
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
  const target = owner.toLowerCase()

  // Cheap pre-check: if the wallet holds nothing here, skip the whole scan.
  const balance = Number(await retry(() => publicClient.readContract({
    address: col.address, abi: COLLECTION_ABI, functionName: 'balanceOf', args: [owner as `0x${string}`],
  })))
  if (balance === 0) return []

  const supply = Number(await retry(() => publicClient.readContract({
    address: col.address, abi: COLLECTION_ABI, functionName: 'totalSupply',
  })))
  const ids = Array.from({ length: Math.min(supply, SCAN_LIMIT) }, (_, i) => i + 1)
  if (!ids.length) return []

  /**
   * Scan in chunks and retry. A single multicall over the whole supply was one
   * failure away from returning nothing — and because allowFailure swallows the
   * errors, a rate-limited RPC produced an empty result that looked exactly like
   * "this wallet owns no cats". That silently hid V1 holdings in the viewer.
   *
   * Stops early once `balance` matches, so a wallet holding a few low ids does
   * not scan the whole collection.
   */
  const found: number[] = []
  const CHUNK = 100

  for (let start = 0; start < ids.length && found.length < balance; start += CHUNK) {
    const slice = ids.slice(start, start + CHUNK)
    const owners = await retry(() => publicClient.multicall({
      contracts: slice.map(id => ({
        address: col.address, abi: COLLECTION_ABI, functionName: 'ownerOf', args: [BigInt(id)],
      })),
      allowFailure: true,
      batchSize: 2048,
    }))

    slice.forEach((id, i) => {
      const r = owners[i]
      if (r.status === 'success' && String(r.result).toLowerCase() === target) found.push(id)
    })
  }

  return found
}

/** Public Base RPCs throttle; a transient failure shouldn't read as "owns nothing". */
async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e) {
      last = e
      await new Promise(r => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw last
}

/**
 * HOW MANY TOKENS ACTUALLY EXIST RIGHT NOW.
 *
 * `col.supply` is the CAP, not the count. V1 sold out, so for V1 the two are the
 * same number — but V2's cap is 1111 and far fewer are minted, so treating the
 * cap as the count means picking ids that do not exist yet. `ownerOf` reverts on
 * those, and code that drops failures quietly then looks like a thin result
 * rather than a bug.
 *
 * Cached briefly in the process: a mint moves this number, but not between two
 * calls a second apart, and the alternative is a chain read per pick.
 */
const supplyCache = new Map<CollectionKey, { n: number; at: number }>()
const SUPPLY_TTL = 60_000

export async function liveSupply(col: CollectionDef): Promise<number> {
  const hit = supplyCache.get(col.key)
  if (hit && Date.now() - hit.at < SUPPLY_TTL) return hit.n

  const n = Number(await retry(() => publicClient.readContract({
    address: col.address, abi: COLLECTION_ABI, functionName: 'totalSupply',
  })))
  // Never trust it past the cap the contract was deployed with.
  const capped = Math.max(0, Math.min(n, col.supply))
  supplyCache.set(col.key, { n: capped, at: Date.now() })
  return capped
}

/** Who holds each id, in one call. Null where the token does not exist. */
export async function ownersOf(col: CollectionDef, ids: number[]): Promise<(string | null)[]> {
  if (!ids.length) return []
  const res = await retry(() => publicClient.multicall({
    contracts: ids.map(id => ({
      address: col.address, abi: COLLECTION_ABI, functionName: 'ownerOf', args: [BigInt(id)],
    })),
    allowFailure: true,
    batchSize: 2048,
  }))
  return res.map(r => (r.status === 'success' ? String(r.result).toLowerCase() : null))
}

/** tokenURI → hosted JSON. Null if the token doesn't exist or metadata is unreachable. */
export async function fetchMeta(col: CollectionDef, id: number | string): Promise<CatMeta | null> {
  // Built from metaBase rather than read per token from the chain. The RPC read
  // was one call per cat and the first thing to fail under rate limiting — and it
  // failed to null, so the viewer showed nameless blank cards.
  const url = `${col.metaBase}${id}`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Not cached: V2 metadata can change (unrevealed → revealed), and the
      // upstream route already sets the right headers for each case.
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) return await res.json()
      if (res.status === 404) return null   // genuinely absent, retrying won't help
    } catch {
      // network blip — retry
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 250 * (attempt + 1)))
  }
  return null
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
