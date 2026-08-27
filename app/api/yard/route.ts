import { NextRequest, NextResponse } from 'next/server'
import { COLLECTIONS, liveSupply, ownersOf, fetchMeta, makeUid } from '@/lib/collection'
import type { Resident } from '@/lib/yard'

/**
 * WHOSE CATS ARE IN YOUR YARD — the people you follow, and nobody else.
 *
 * JP: "maybe its an open yard where u can meet other users cats that u follow."
 *
 * ── WHY THIS NEEDS NO DATABASE ───────────────────────────────────────────────
 *
 * The one thing this app has never had is shared state, and every social idea so
 * far has broken on it. This one does not, because THE FOLLOW GRAPH IS ALREADY
 * SHARED STATE and somebody else is keeping it. Farcaster knows who you follow;
 * the chain knows who owns a cat. The yard is the intersection, computed fresh
 * on every visit and stored nowhere.
 *
 * It also means everybody's yard is different without any work: two people who
 * follow different accounts meet different cats.
 *
 * ── THE DIRECTION MATTERS, AND THE OBVIOUS ONE IS BACKWARDS ──────────────────
 *
 * The naive version walks the follow list and asks "does this person own a cat?"
 * — one lookup each. Following 500 accounts costs 500 lookups to find perhaps
 * three cats, because there are only ~1300 cats across both collections and most
 * people do not have one.
 *
 * So it runs the other way. The OWNER SET IS KNOWN AND SMALL: one multicall gets
 * every owner address for both collections. Resolve those to accounts once, and
 * the yard is a set intersection rather than a search.
 *
 * ── TWO PATHS, BECAUSE ONE NEEDS A KEY ───────────────────────────────────────
 *
 * With NEYNAR_API_KEY, `following` returns whole user objects including their
 * verified addresses — one paged call gives both halves of the intersection.
 *
 * Without it, Farcaster's public API still serves `following` and `verifications`
 * unauthenticated (measured), but only one fid at a time — so the fallback caps
 * how many accounts it will check rather than making hundreds of requests. It is
 * there so the feature works in development, not as an equal path.
 */

export const dynamic = 'force-dynamic'

/** How many accounts the keyless fallback will look up. Deliberately small. */
const NO_KEY_CAP = 60

/** How many follows to consider at all. Past this, a yard is a crowd anyway. */
const FOLLOW_CAP = 500

type Owner = { fid: number; username: string; pfp: string | null }

/*
 * The owner set changes only when a cat is sold or minted, so it is worth
 * holding briefly. This is per server instance and deliberately short: a stale
 * yard that shows somebody a cat they no longer own is a small wrong, and five
 * minutes bounds it.
 */
let ownerCache: { at: number; map: Map<string, string[]> } | null = null
const OWNER_TTL = 5 * 60 * 1000

/** address (lowercase) → the uids it holds. */
async function catsByOwner(): Promise<Map<string, string[]>> {
  if (ownerCache && Date.now() - ownerCache.at < OWNER_TTL) return ownerCache.map

  const map = new Map<string, string[]>()
  for (const col of COLLECTIONS) {
    const n = await liveSupply(col)
    if (!n) continue
    const ids = Array.from({ length: n }, (_, i) => i + 1)
    const owners = await ownersOf(col, ids)
    owners.forEach((addr, i) => {
      if (!addr) return
      const uid = makeUid(col.key, ids[i])
      const cur = map.get(addr)
      if (cur) cur.push(uid)
      else map.set(addr, [uid])
    })
  }

  ownerCache = { at: Date.now(), map }
  return map
}

/** Who this account follows, with their addresses when the key allows it. */
async function following(fid: number, key: string | undefined) {
  const out: { fid: number; username: string; pfp: string | null; addresses: string[] }[] = []

  if (key) {
    let cursor: string | null = null
    do {
      const url = new URL('https://api.neynar.com/v2/farcaster/following')
      url.searchParams.set('fid', String(fid))
      url.searchParams.set('limit', '100')
      if (cursor) url.searchParams.set('cursor', cursor)

      const res = await fetch(url, { headers: { api_key: key, 'x-api-key': key }, cache: 'no-store' })
      if (!res.ok) break
      const json = await res.json()

      for (const row of json?.users ?? []) {
        // Neynar nests the followed account under `user`.
        const u = row?.user ?? row
        if (!u?.fid) continue
        out.push({
          fid: u.fid,
          username: u.username ?? String(u.fid),
          pfp: u.pfp_url ?? null,
          addresses: (u.verified_addresses?.eth_addresses ?? [])
            .concat(u.custody_address ? [u.custody_address] : [])
            .map((a: string) => a.toLowerCase()),
        })
      }
      cursor = json?.next?.cursor ?? null
    } while (cursor && out.length < FOLLOW_CAP)
    return out
  }

  /*
   * KEYLESS FALLBACK. The public API gives the follow list in bulk but addresses
   * only one account at a time, so this is capped hard — it exists so the yard
   * can be developed against, not so it can serve anybody.
   */
  /*
   * FIFTY IS THE MAXIMUM THE PUBLIC API ACCEPTS.
   *
   * Asking for 100 is rejected outright — "must be <= 50" with a 400 — and the
   * first version of this asked for 100, so every keyless yard came back empty
   * while looking perfectly healthy. The limit is not a suggestion.
   */
  const res = await fetch(
    `https://api.farcaster.xyz/v2/following?fid=${fid}&limit=50`, { cache: 'no-store' })
  /*
   * A FAILED LOOKUP IS NOT AN EMPTY YARD. Returning [] here made a broken request
   * indistinguishable from following nobody, which is exactly how the limit bug
   * hid. The caller turns this into an error the page can show.
   */
  if (!res.ok) throw new Error('follow lookup failed: ' + res.status)
  const users = (await res.json())?.result?.users ?? []

  for (const u of users.slice(0, NO_KEY_CAP)) {
    let addresses: string[] = []
    try {
      const v = await fetch(`https://api.farcaster.xyz/v2/verifications?fid=${u.fid}`, { cache: 'no-store' })
      if (v.ok) {
        addresses = ((await v.json())?.result?.verifications ?? [])
          .map((x: { address?: string }) => (x.address ?? '').toLowerCase())
          // Farcaster verifications include Solana addresses; only EVM can hold a cat.
          .filter((a: string) => /^0x[0-9a-f]{40}$/.test(a))
      }
    } catch { /* one account failing to resolve must not empty the yard */ }
    out.push({ fid: u.fid, username: u.username ?? String(u.fid), pfp: u.pfp?.url ?? null, addresses })
  }
  return out
}

export async function GET(req: NextRequest) {
  const fid = Number(req.nextUrl.searchParams.get('fid'))
  if (!Number.isInteger(fid) || fid <= 0)
    return NextResponse.json({ error: 'which account? pass ?fid=' }, { status: 400 })

  const key = process.env.NEYNAR_API_KEY

  try {
    const [owned, follows] = await Promise.all([catsByOwner(), following(fid, key)])

    /*
     * THE INTERSECTION. One pass over the follow list, each step a Map lookup
     * against a set that is already in memory — no request per account, which is
     * the whole reason for doing it in this direction.
     */
    const found: { uid: string; owner: Owner }[] = []
    for (const f of follows) {
      for (const addr of f.addresses) {
        for (const uid of owned.get(addr) ?? []) {
          found.push({ uid, owner: { fid: f.fid, username: f.username, pfp: f.pfp } })
        }
      }
    }

    /*
     * A cat's NAME and FACE come from its metadata, which is what the yard's
     * temperaments are keyed on. Fetched only for the cats that are actually
     * here, which is why the intersection happens first.
     */
    const residents: (Resident & { owner: Owner; art: string })[] = []
    for (const { uid, owner } of found.slice(0, 24)) {
      const [colKey, id] = uid.split(':')
      const col = COLLECTIONS.find(c => c.key === colKey)
      if (!col) continue
      const meta = await fetchMeta(col, id)
      residents.push({
        uid,
        name: meta?.name ?? `#${id}`,
        face: meta?.attributes?.find(a => /face/i.test(a.trait_type ?? ''))?.value ?? null,
        owner,
        art: meta?.image ?? '',
      })
    }

    return NextResponse.json({
      residents,
      followed: follows.length,
      /* Said plainly so the page can explain an empty yard rather than look broken. */
      cats: found.length,
      limited: !key,
    })
  } catch {
    return NextResponse.json({ error: 'could not read the yard right now' }, { status: 502 })
  }
}
