'use client'

import { useEffect, useState } from 'react'
import { useReadContract } from 'wagmi'
import { V3, V3_ABI, V3_DEPLOYED } from '@/lib/mintv3'
import { robinhood } from '@/lib/chains'
import { MintStage } from '@/components/MintStage'
import { FxButton } from '@/components/FxButton'
import { PageBackdrop } from '@/components/PageBackdrop'

/**
 * THE ROBINHOOD MINT, on the web. app/mint/page.tsx renders this everywhere
 * except inside a Farcaster client, which gets the Base mint instead.
 *
 * JP, 2026-09-29: "seperate the farcaster stuff from the robin hood" — so no
 * Base and no Farcaster here — and "make the backgrounbd similar to the front
 * page": the Cradle's own column, header and panels (s.page / s.block in
 * components/Cradle.tsx), with the stage in the first panel.
 *
 * The count is Robinhood's: totalSupply, maxSupply and mintOpen on chain 4663.
 * The claim itself happens on /mint/v3.
 */

/** The 64 framed Robinhood portraits make-title-assets.mjs builds: every 17th cat. */
const POOL = Array.from({ length: 64 }, (_, i) => 1 + i * 17)

export function RobinhoodMint() {
  const read = { chainId: robinhood.id, query: { enabled: V3_DEPLOYED } }
  const { data: supply } = useReadContract({ address: V3, abi: V3_ABI, functionName: 'totalSupply', ...read })
  const { data: max }    = useReadContract({ address: V3, abi: V3_ABI, functionName: 'maxSupply',   ...read })
  const { data: open }   = useReadContract({ address: V3, abi: V3_ABI, functionName: 'mintOpen',    ...read })

  const minted = supply !== undefined ? Number(supply) : null
  const total  = max    !== undefined ? Number(max)    : null

  // A random cat takes the hit. Picked after mount, or server and browser differ.
  const [art, setArt] = useState<string | null>(null)
  useEffect(() => { setArt(`/title/cats/${POOL[Math.floor(Math.random() * POOL.length)]}.png`) }, [])

  return (
    <main style={s.page}>
      <PageBackdrop />
      <header style={s.header}>
        <h1 style={s.title}>CLANKER CATS</h1>
        <p style={s.sub}>Robinhood Chain · free for BUN holders</p>
      </header>

      <section style={s.block}>
        <p style={s.label}>{open === true ? 'FREE MINT' : 'PREMINT'}</p>
        <MintStage left={minted !== null && total !== null ? total - minted : null} total={total} art={art} />
        {minted !== null && total !== null && (
          <p style={s.count}><b style={s.countNum}>{minted}</b> / {total} minted</p>
        )}
      </section>

      <section style={s.block}>
        <FxButton href="/mint/v3" style={s.primary} tone="light" label="CLAIM A ROBINHOOD CAT" />
        <p style={s.modeFine}>free for BUN holders · one per wallet</p>
        <FxButton href="/" style={s.ghost} tone="grey" label="PLAY THE GAME" />
        <p style={{ ...s.modeFine, marginBottom: 0 }}>free · no wallet needed</p>
      </section>
    </main>
  )
}

/* The front page's own values, from components/Cradle.tsx. */
const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh', color: '#f0f0f5',
    padding: '22px 18px 40px', maxWidth: 520, margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  header:   { textAlign: 'center', paddingBottom: 4 },
  title:    { fontSize: 30, letterSpacing: 1, margin: 0, lineHeight: 1.1 },
  sub:      { color: '#7a7a95', fontSize: 13, margin: '4px 0 0' },
  label:    { fontSize: 10, letterSpacing: 2, color: '#7a7a95', margin: '0 0 10px' },
  block:    { background: '#12121c', border: '1px solid #21212f', borderRadius: 14, padding: 16 },
  count:    { color: '#7a7a95', fontSize: 13, margin: '10px 0 0', textAlign: 'center' },
  countNum: { color: '#f0f0f5', fontWeight: 'normal' },
  modeFine: { color: '#63637d', fontSize: 11, margin: '6px 0 14px', textAlign: 'center', lineHeight: 1.5 },
  primary:  { display: 'block', boxSizing: 'border-box', width: '100%', background: '#8b5cf6', color: '#fff', borderRadius: 10, padding: '11px 16px', fontSize: 14, letterSpacing: 1, textAlign: 'center', textDecoration: 'none' },
  ghost:    { display: 'block', boxSizing: 'border-box', width: '100%', background: 'transparent', color: '#7a7a95', border: '1px solid #21212f', borderRadius: 10, padding: '9px 16px', fontSize: 12, letterSpacing: 1, textAlign: 'center', textDecoration: 'none' },
}
