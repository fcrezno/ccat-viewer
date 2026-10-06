'use client'

import { useEffect, useState } from 'react'
import { useReadContract } from 'wagmi'
import { V3, V3_ABI, V3_DEPLOYED } from '@/lib/mintv3'
import { robinhood } from '@/lib/chains'
import { MintStage } from '@/components/MintStage'
import { FxButton } from '@/components/FxButton'
import { PageTitle } from '@/components/PageTitle'
import { useLoadingHold } from '@/lib/loading'

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
  // The loading screen waits for the count, so the hit lands in view (lib/loading.ts).
  useLoadingHold(V3_DEPLOYED && total === null)

  // A random cat takes the hit. Picked after mount, or server and browser differ.
  const [art, setArt] = useState<string | null>(null)
  useEffect(() => { setArt(`/title/cats/${POOL[Math.floor(Math.random() * POOL.length)]}.png`) }, [])

  return (
    <main style={s.page}>
      <header style={s.header}>
        <PageTitle text="CLANKER CATS" />
        <p style={s.sub}>Robinhood Chain · free for BUN holders</p>
      </header>

      <section className="win98" data-title="Robinhood Mint" style={s.block}>
        <p style={s.label}>{open === true ? 'FREE MINT' : 'PREMINT'}</p>
        <MintStage left={minted !== null && total !== null ? total - minted : null} total={total} art={art} />
        {minted !== null && total !== null && (
          <p style={s.count}><b style={s.countNum}>{minted}</b> / {total} minted</p>
        )}
      </section>

      <section className="win98" data-title="Clanker Cats" style={s.block}>
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
    // 760 on a desktop, so the cat on the stage is bigger. JP's friend, 2026-10-05: "why not use up that available width on desktop? The cats look awesome; they would look better if it were bigger" — JP: "make it bigger for desktop". A phone is narrower than any of these, so phones do not change.
    padding: '22px 18px 40px', maxWidth: 760, margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  header:   { textAlign: 'center', paddingBottom: 4 },
  title:    { fontSize: 30, letterSpacing: 1, margin: 0, lineHeight: 1.1 },
  // Dark ink on the light checker (PageChecker).
  sub:      { color: '#1a1a1a', fontSize: 20, margin: '6px 0 0' },
  // Light Windows 98 windows, as on every page (JP, 2026-10-06).
  label:    { fontSize: 22, letterSpacing: 2, color: '#000080', margin: '0 0 12px' },
  block:    { background: '#c0c0c0', color: '#000000', border: '1px solid #c0c0c0', borderRadius: 0, padding: 16 },
  count:    { color: '#1a1a1a', fontSize: 28, margin: '10px 0 0', textAlign: 'center' },
  countNum: { color: '#000080', fontWeight: 'normal' },
  modeFine: { color: '#1a1a1a', fontSize: 20, margin: '6px 0 20px', textAlign: 'center', lineHeight: 1.3, textWrap: 'balance' },
  primary:  { display: 'block', boxSizing: 'border-box', width: '100%', background: '#000080', color: '#fff', borderRadius: 0, padding: '11px 16px', fontSize: 14, letterSpacing: 1, textAlign: 'center', textDecoration: 'none' },
  ghost:    { display: 'block', boxSizing: 'border-box', width: '100%', background: '#c0c0c0', color: '#000000', border: 0, borderRadius: 0, padding: '9px 16px', fontSize: 12, letterSpacing: 1, textAlign: 'center', textDecoration: 'none' },
}
