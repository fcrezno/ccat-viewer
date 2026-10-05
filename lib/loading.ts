'use client'

import { useEffect } from 'react'

/**
 * WHAT THE LOADING SCREEN IS STILL WAITING ON, besides fonts and pictures.
 *
 * JP, 2026-10-05: "loading is a bit akward as not everthing is loading; so i
 * would like to add a loading screen first". Fonts and the pictures on screen
 * the loading screen can see for itself (components/LoadingScreen). What it
 * cannot see is a page's own data — the yard's residents, a wallet's cats, the
 * mint count — so a page that is fetching says so here, and the screen stays up
 * until every hold is let go (or its 8-second ceiling passes).
 */
let holds = 0
const subs = new Set<() => void>()

export const loadingHolds = () => holds

export function onHoldsChange(f: () => void): () => void {
  subs.add(f)
  return () => { subs.delete(f) }
}

/** Keep the loading screen up while `active` is true. */
export function useLoadingHold(active: boolean) {
  useEffect(() => {
    if (!active) return
    holds++
    subs.forEach(f => f())
    return () => {
      holds--
      subs.forEach(f => f())
    }
  }, [active])
}
