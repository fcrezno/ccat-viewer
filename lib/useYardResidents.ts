'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import sdk from '@farcaster/miniapp-sdk'
import type { Cat } from '@/lib/collection'
import type { YardCat } from '@/components/Yard'
import { residents, DEMO_KEY } from '@/lib/yardstore'
import { NO_CHAIN } from '@/lib/appmode'
import { myRoster } from '@/lib/mycats'
import { firstCat, nameFor } from '@/lib/stable'

/**
 * WHO LIVES IN THIS VISITOR'S YARD.
 *
 * JP, 2026-09-29: "remove the yard and just make it its own page". The yard
 * was built on the front page, which saved it for /yard to read — so with the
 * panel gone, /yard has to build it itself. This is that code, MOVED out of
 * components/Cradle.tsx rather than copied, so there is still one place that
 * does the hardest lookup in the app: wallet + won cats + follow graph, with a
 * demo yard when that comes to fewer than two.
 */
export function useYardResidents(): { cats: YardCat[]; busy: boolean } {
  const { address } = useAccount()

  /*
   * THE FARCASTER FID, when there is one. Outside a Farcaster client the context
   * never answers, and the yard is your own cats (or the demo).
   */
  const [fcFid, setFcFid] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    sdk.context
      .then(c => { if (live) setFcFid(c?.user?.fid ?? null) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  /* The cats this wallet holds, from the same endpoint the front page uses. */
  const [owned, setOwned] = useState<Cat[] | null>(null)
  useEffect(() => {
    if (!address) { setOwned(null); return }
    let live = true
    fetch(`/api/owned?wallet=${address}`)
      .then(r => r.json())
      .then(d => { if (live) setOwned(Array.isArray(d) ? d : []) })
      .catch(() => { if (live) setOwned([]) })
    return () => { live = false }
  }, [address])

  const [cats, setCats] = useState<YardCat[]>([])
  const [busy, setBusy] = useState(false)

  const faceOf = (c: Cat) =>
    c.meta?.attributes?.find(a => /face/i.test(a.trait_type ?? ''))?.value ?? null

  /*
   * THE CATS YOU WON, WHETHER OR NOT YOU HOLD A TOKEN.
   *
   * JP, 2026-09-10: "if you have the NFT, it probably just gives you, like, a
   * ticket to go play the game. That's it. I don't think it needs to cost
   * anything. I just want it to be more open."
   *
   * So every visitor gets a stable — the cat they arrived with, plus whatever
   * they have won — and a token is an extra on top rather than the price of
   * admission. The same `firstCat()` and `myRoster()` the App Store build uses.
   */
  const [roster, setRoster] = useState<YardCat[]>([])
  useEffect(() => {
    firstCat()
    let live = true
    myRoster()
      .then(got => { if (live) setRoster(got.map(c => ({ ...c, mine: true }))) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const held: YardCat[] = useMemo(() => (owned ?? []).map(c => ({
    uid: c.uid,
    name: nameFor(c.uid) ?? c.meta?.name ?? `#${c.id}`,
    face: faceOf(c),
    art: c.meta?.image ?? '',
    mine: true,
  })), [owned])

  /*
   * TOKENS FIRST, so a holder's own cats lead the list and a yard that has to be
   * trimmed keeps them. Both halves are `mine`; the yard cannot tell them apart
   * and should not — a cat is a cat.
   */
  const mine: YardCat[] = useMemo(() => [...held, ...roster], [held, roster])

  useEffect(() => {
    /*
     * ?fid= STANDS IN FOR THE FARCASTER CONTEXT, so any yard can be looked at in
     * a browser. It reads nothing private: a follow list and who owns which cat
     * are both public, and the same call serves them to anybody already.
     */
    const asked = Number(new URLSearchParams(window.location.search).get('fid'))
    const who = fcFid ?? (Number.isInteger(asked) && asked > 0 ? asked : null)

    let live = true
    setBusy(true)

    /*
     * THE APP BUILD STOPS HERE, because everything below needs the chain: the
     * neighbours come from a follow graph and the demo yard reads token
     * metadata. `mine` already holds this player's own cats, won rather than
     * held, so there is nothing left to fetch. See lib/appmode.ts.
     */
    if (NO_CHAIN) {
      setCats(mine)
      setBusy(false)
      return () => { live = false }
    }

    /*
     * THE DEMO YARD, when there is nobody to show.
     *
     * JP: "maybe have a demo yard… that features random holder's cats."
     * ?demo=1 answers with real minted cats belonging to real holders, one per
     * address, and lib/yardstore keeps it under its own key so it can never be
     * written over somebody's real yard.
     *
     * A DEMO YARD KEEPS THE CAST IT STARTED WITH. The endpoint rotates its holders
     * every ten minutes, and a different eight cats made reconcile() drop every
     * memory naming a cat who had gone — 314 ticks and ZERO memories. Once a demo
     * yard exists, its own residents are the cast.
     */
    const demo = () => {
      const already = residents(DEMO_KEY) as YardCat[]
      if (already.length > 1) {
        setCats(already)
        return Promise.resolve()
      }
      return fetch('/api/yard?demo=1&n=8')
        .then(r => r.json())
        .then(d => {
          if (!live) return
          const got: YardCat[] = (d?.residents ?? []).map((r: YardCat) => ({ ...r, mine: false, demo: true }))
          setCats(got.length > 1 ? got : mine)
        })
        .catch(() => { if (live) setCats(mine) })
    }

    if (!who) {
      // Your own cats are a shelf, not a yard — under two there is nothing to watch.
      if (mine.length > 1) {
        setCats(mine)
        setBusy(false)
      } else {
        demo().finally(() => { if (live) setBusy(false) })
      }
      return () => { live = false }
    }

    fetch(`/api/yard?fid=${who}`)
      .then(r => r.json())
      .then(d => {
        if (!live) return
        const theirs: YardCat[] = (d?.residents ?? []).map((r: YardCat) => ({ ...r, mine: false }))
        const all = [...mine, ...theirs]
        // Followed nobody who owns one, and hold fewer than two yourself.
        if (all.length > 1) setCats(all)
        else return demo()
      })
      // A yard that cannot reach its neighbours still has your own cats in it.
      .catch(() => { if (live) setCats(mine) })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [fcFid, mine])

  return { cats, busy }
}
