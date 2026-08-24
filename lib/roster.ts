import {
  COLLECTIONS, fetchMeta, liveSupply, ownersOf, makeUid,
  type CollectionDef,
} from '@/lib/collection'
import { ownedCat, type ArenaCat } from '@/lib/arena'
import type { FoeRef } from '@/lib/gauntlet'

/**
 * FINDING FIVE CATS THAT BELONG TO SOMEBODY.
 *
 * This is the part that makes the gauntlet PVP rather than five more inventions,
 * so it is strict about what counts as an opponent:
 *
 *   - the token must EXIST. Neither contract is enumerable and there is no
 *     index, so ids are picked at random and then proven with `ownerOf`. An
 *     unminted id reverts, and reverts are dropped rather than papered over.
 *   - it must not be the player's own cat. Beating yourself is not a gauntlet.
 *   - the five should be five different PEOPLE where the collection allows it.
 *     A whale holding a run of ids would otherwise supply the whole ladder.
 *
 * Ids are picked against the LIVE supply, never the cap — see liveSupply. V2's
 * cap is 1111 and far fewer are minted, so picking against the cap would have
 * failed roughly half of every draw.
 */

/** Rolls needed before giving up. Generous: each round is one cheap multicall. */
const MAX_DRAWS = 6

export type Opponent = { cat: ArenaCat; ref: FoeRef }

type Draw = { col: CollectionDef; id: number }

/** Weighted by live supply, so the ladder reflects the collections as they are. */
function draw(pools: { col: CollectionDef; supply: number }[], want: number, taken: Set<string>): Draw[] {
  const total = pools.reduce((n, p) => n + p.supply, 0)
  const out: Draw[] = []
  let guard = 0

  while (out.length < want && guard++ < want * 40 && total > 0) {
    let roll = Math.floor(Math.random() * total)
    const pool = pools.find(p => (roll -= p.supply) < 0) ?? pools[0]
    if (pool.supply <= 0) continue
    const id = 1 + Math.floor(Math.random() * pool.supply)
    const uid = makeUid(pool.col.key, id)
    if (taken.has(uid)) continue
    taken.add(uid)
    out.push({ col: pool.col, id })
  }
  return out
}

/**
 * Five real cats, hardest last.
 *
 * `exclude` is the player's own uids; `excludeOwner` is their address, so a
 * second cat of theirs cannot walk on either.
 */
export async function pickRoster(
  want: number,
  exclude: Set<string>,
  excludeOwner: string,
): Promise<Opponent[]> {
  const supplies = await Promise.all(COLLECTIONS.map(async col => ({
    col,
    supply: await liveSupply(col),
  })))
  const pools = supplies.filter(p => p.supply > 0)
  if (!pools.length) return []

  const taken = new Set<string>(exclude)
  const mine = excludeOwner.toLowerCase()
  const owners = new Set<string>()
  const found: { col: CollectionDef; id: number; owner: string }[] = []

  for (let attempt = 0; attempt < MAX_DRAWS && found.length < want; attempt++) {
    // Over-draw: some ids will not exist, and some will belong to the player or
    // to somebody already on the ladder. Asking for extra keeps this to one
    // round trip in the common case.
    const need = want - found.length
    const picks = draw(pools, need * 3, taken)
    if (!picks.length) break

    // One multicall per collection, not per id.
    const byCol = new Map<string, Draw[]>()
    for (const p of picks) {
      const list = byCol.get(p.col.key) ?? []
      list.push(p)
      byCol.set(p.col.key, list)
    }

    const checked = await Promise.all([...byCol.values()].map(async list => {
      const who = await ownersOf(list[0].col, list.map(p => p.id))
      return list.map((p, i) => ({ ...p, owner: who[i] }))
    }))

    for (const row of checked.flat()) {
      if (found.length >= want) break
      // Does not exist, is the player's, or is a repeat holder.
      if (!row.owner) continue
      if (row.owner === mine) continue
      if (owners.has(row.owner)) continue
      owners.add(row.owner)
      found.push({ col: row.col, id: row.id, owner: row.owner })
    }
  }

  /*
   * IF DISTINCT HOLDERS RAN OUT, take repeats rather than a short ladder.
   *
   * A five-round gauntlet with four rounds is not the thing that was promised,
   * and in a small collection one holder may genuinely own a lot of it.
   */
  if (found.length < want) {
    for (let attempt = 0; attempt < MAX_DRAWS && found.length < want; attempt++) {
      const picks = draw(pools, (want - found.length) * 3, taken)
      if (!picks.length) break
      const byCol = new Map<string, Draw[]>()
      for (const p of picks) {
        const list = byCol.get(p.col.key) ?? []
        list.push(p)
        byCol.set(p.col.key, list)
      }
      const checked = await Promise.all([...byCol.values()].map(async list => {
        const who = await ownersOf(list[0].col, list.map(p => p.id))
        return list.map((p, i) => ({ ...p, owner: who[i] }))
      }))
      for (const row of checked.flat()) {
        if (found.length >= want) break
        if (!row.owner || row.owner === mine) continue
        found.push({ col: row.col, id: row.id, owner: row.owner })
      }
    }
  }

  // Names and faces. A cat whose metadata is unreachable still fights — it is a
  // real token either way — it just goes by its number.
  const metas = await Promise.all(found.map(f => fetchMeta(f.col, f.id).catch(() => null)))

  const opponents: Opponent[] = found.map((f, i) => {
    const meta = metas[i]
    const label = meta?.name || `#${f.id}`
    const cat = ownedCat(f.id, label)
    // ownedCat marks the player's cat; this one is somebody else's.
    cat.mine = false
    cat.art = meta?.image ?? ''
    return {
      cat,
      ref: {
        uid:        makeUid(f.col.key, f.id),
        collection: f.col.key,
        id:         String(f.id),
        label,
        owner:      f.owner,
        art:        cat.art,
      },
    }
  })

  /*
   * HARDEST LAST.
   *
   * Stats come from the token id and cannot be tuned, but the ORDER can be, and
   * a gauntlet that escalates tells a better story than five in a random order.
   * Sorting by raw power also means the recovery between rounds matters more as
   * the run goes on, which is the shape the mode wants.
   */
  const power = (c: ArenaCat) => c.maxHp + c.atk + c.def + c.spd
  return opponents.sort((a, b) => power(a.cat) - power(b.cat))
}
