'use client'

import { useEffect, useState } from 'react'
import { NO_CHAIN } from '@/lib/appmode'
import { BANNER_TOKENS, bannerFile, pickTokens } from '@/lib/banners'

/**
 * THE AD COLUMNS — old-web banners down both sides of every page. JP,
 * 2026-10-12: "put it on the sides". The way a 1999 homepage had a column of
 * squares and buttons in each margin: a random mix per visit, a new one every
 * ROTATE_MS, each banner a link to its own token's site.
 *
 * Only where the margins are empty (globals.css .side-ads, wide screens), so it
 * never sits over the game on a phone or in a Farcaster frame. Not in the App
 * Store build at all: token ads have no place there (NO_CHAIN, Guideline 3.1.1).
 * Drawn after mount, so the server and the browser agree on the first paint.
 */
const ROTATE_MS = 20000

function Ad({ token, suffix, w, h }: { token: number; suffix: string; w: number; h: number }) {
  const t = BANNER_TOKENS[token]
  return (
    <a href={t.href} target="_blank" rel="noopener" title={t.name} style={{ display: 'block', lineHeight: 0 }}>
      <img src={bannerFile(token, suffix)} alt={t.name} width={w} height={h} style={{ imageRendering: 'pixelated', display: 'block' }} />
    </a>
  )
}

export function SideAds() {
  // [left square, two small squares, two buttons] and [pop-up, two buttons].
  const [mix, setMix] = useState<{ left: number[]; right: number[]; slimL: number[]; slimR: number[] } | null>(null)
  useEffect(() => {
    if (NO_CHAIN) return
    const roll = () => setMix({ left: pickTokens(5), right: pickTokens(3), slimL: pickTokens(3), slimR: pickTokens(3) })
    roll()
    const t = setInterval(roll, ROTATE_MS)
    return () => clearInterval(t)
  }, [])
  if (!mix) return null

  const label = <div style={st.label}>ADVERTISEMENT</div>
  return (
    <>
      <aside className="side-ads side-ads-left" aria-label="Banners">
        {label}
        <Ad token={mix.left[0]} suffix="-250" w={250} h={250} />
        <div style={st.pair}>
          <Ad token={mix.left[1]} suffix="-125" w={122} h={122} />
          <Ad token={mix.left[2]} suffix="-125" w={122} h={122} />
        </div>
        <div style={st.pair}>
          <Ad token={mix.left[3]} suffix="-88x31" w={88} h={31} />
          <Ad token={mix.left[4]} suffix="-88x31" w={88} h={31} />
        </div>
      </aside>
      {/* The slim columns, for medium screens: 125 wide (globals.css .side-ads-slim). */}
      <aside className="side-ads-slim side-ads-left" aria-label="Banners">
        {label}
        <Ad token={mix.slimL[0]} suffix="-125" w={125} h={125} />
        <Ad token={mix.slimL[1]} suffix="-88x31" w={88} h={31} />
        <Ad token={mix.slimL[2]} suffix="-88x31" w={88} h={31} />
      </aside>
      <aside className="side-ads-slim side-ads-right" aria-label="Banners">
        {label}
        <Ad token={mix.slimR[0]} suffix="-popup" w={125} h={156} />
        <Ad token={mix.slimR[1]} suffix="-125" w={125} h={125} />
        <Ad token={mix.slimR[2]} suffix="-88x31" w={88} h={31} />
      </aside>
      <aside className="side-ads side-ads-right" aria-label="Banners">
        {label}
        <Ad token={mix.right[0]} suffix="-popup" w={250} h={312} />
        <div style={st.pair}>
          <Ad token={mix.right[1]} suffix="-88x31" w={88} h={31} />
          <Ad token={mix.right[2]} suffix="-88x31" w={88} h={31} />
        </div>
      </aside>
    </>
  )
}

const st: Record<string, React.CSSProperties> = {
  label: { fontSize: 11, letterSpacing: 1, color: '#000080', textAlign: 'center' },
  pair:  { display: 'flex', justifyContent: 'space-between', gap: 6 },
}
