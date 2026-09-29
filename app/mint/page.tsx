'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import sdk from '@farcaster/miniapp-sdk'
import { V2, V2_ABI, MINT_ERRORS, type Voucher } from '@/lib/mint'
import { APP_URL } from '@/lib/miniapp'
import { useWebConnectors } from '@/lib/useWebConnectors'
import { V3, V3_ABI, V3_DEPLOYED } from '@/lib/mintv3'
import { robinhood } from '@/lib/chains'
import { base } from 'wagmi/chains'
import { GameBar } from '@/components/GameBar'
import { Floater } from '@/components/Floater'

type Phase = 'idle' | 'authorising' | 'minting' | 'confirming' | 'done' | 'error'

export default function MintPage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const webConnectors = useWebConnectors()

  const [ready,  setReady]  = useState(false)
  /*
   * INSIDE FARCASTER OR NOT. A V2 cat is tied to a Farcaster account: the voucher
   * is signed for an FID that only Quick Auth can prove. In a plain browser tab
   * sdk.quickAuth.getToken() posts to a host that is not there and NEVER returns,
   * so "Mint my cat" sat on "Checking your account…" for good (JP, 2026-09-28:
   * "this mint page does not work"). On the web this page now says where the
   * mint lives instead of offering wallet buttons that cannot mint.
   */
  const [inApp,  setInApp]  = useState<boolean | null>(null)
  const [phase,  setPhase]  = useState<Phase>('idle')
  const [error,  setError]  = useState<string | null>(null)
  const [gate,   setGate]   = useState<{ minScore: number; phase: string } | null>(null)

  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [mintedId, setMintedId] = useState<string | null>(null)
  const { data: receipt, isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    try { sdk.actions.ready() } catch {}
    setReady(true)
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false))
    const fc = connectors.find(c => c.id === 'farcaster-frame')
    if (fc) connect({ connector: fc })

    // Which phase are we in — premint or open to all?
    fetch('/api/mint-voucher')
      .then(r => r.ok ? r.json() : null)
      .then(g => setGate(g))
      .catch(() => {})
  }, [])

  const enabled = !!V2
  const { data: supply, refetch: refetchSupply } = useReadContract({
    address: V2 as `0x${string}`, abi: V2_ABI, functionName: 'totalSupply', chainId: base.id,
    query: { enabled },
  })
  const { data: max } = useReadContract({
    address: V2 as `0x${string}`, abi: V2_ABI, functionName: 'maxSupply', chainId: base.id,
    query: { enabled },
  })
  const { data: open } = useReadContract({
    address: V2 as `0x${string}`, abi: V2_ABI, functionName: 'mintOpen', chainId: base.id,
    query: { enabled },
  })

  /*
   * ON THE WEB THIS PAGE COUNTS ROBINHOOD CATS. JP, 2026-09-28, looking at
   * "574 / 1111 minted": "fix this; none are minted yet". 574 was true — it is
   * the Base (V2) count — but on the web the only mint this page offers is the
   * Robinhood one, so that is the one it counts. Inside Farcaster it is still the
   * Base mint and still counts Base cats.
   */
  const web = inApp === false
  const onWeb = { query: { enabled: web && V3_DEPLOYED } }
  const { data: v3Supply } = useReadContract({ address: V3, abi: V3_ABI, functionName: 'totalSupply', chainId: robinhood.id, ...onWeb })
  const { data: v3Max }    = useReadContract({ address: V3, abi: V3_ABI, functionName: 'maxSupply',   chainId: robinhood.id, ...onWeb })
  const { data: v3Open }   = useReadContract({ address: V3, abi: V3_ABI, functionName: 'mintOpen',    chainId: robinhood.id, ...onWeb })

  const shownSupply = web ? v3Supply : supply
  const shownMax    = web ? v3Max    : max
  const minted = shownSupply !== undefined ? Number(shownSupply) : null
  const total  = shownMax    !== undefined ? Number(shownMax)    : null

  /*
   * THE HP BAR COUNTS CATS LEFT. A progress bar of cats minted would be empty at
   * zero and read as broken; as health it starts full and green and drains
   * toward red as the collection goes. The previous value is the bar's ghost, so
   * a mint landing plays the fight's red trail.
   */
  //
  // Nothing counts until `inApp` is known: before that the page reads Base, and
  // switching to Robinhood half way would land a hit of the wrong size.
  const left = inApp !== null && minted !== null && total !== null ? total - minted : null

  /*
   * THE BAR TAKES A HIT ON ARRIVAL. JP, 2026-09-28: "when you get to that page;
   * make it so the hp bar gets hit and appoxmate how much damage (mints) there
   * are". It shows full, then every mint lands as one blow: the health snaps
   * down, the red trail drains on the fight's clock (GameBar: a big hit takes
   * up to 3 s), the bar jolts, and the damage floats up. With nothing minted
   * the blow is a MISS. A later change, a mint landing, hits for the difference.
   *
   * `ghost` is the health BEFORE the blow and stays put until the next one.
   * GameBar times its drain from ghost - hp, so a ghost that caught up at once
   * would cut a 3 s drain to its 0.25 s floor.
   */
  const [bar, setBar] = useState<{ hp: number; ghost: number } | null>(null)
  const [hit, setHit] = useState<{ n: number; seq: number } | null>(null)
  useEffect(() => {
    if (left === null || total === null) return
    if (bar === null) {
      setBar({ hp: total, ghost: total })
      // Long enough to see it whole before it is hit.
      const t = setTimeout(() => {
        setBar({ hp: left, ghost: total })
        setHit({ n: total - left, seq: 1 })
      }, 700)
      return () => clearTimeout(t)
    }
    if (left !== bar.hp) {
      setHit(h => ({ n: bar.hp - left, seq: (h?.seq ?? 0) + 1 }))
      setBar({ hp: left, ghost: bar.hp })
    }
  }, [left, total])

  useEffect(() => {
    if (!isSuccess) return
    setPhase('done')
    refetchSupply()

    // Pull the token id out of the mint's Transfer(from,to,tokenId) log so the
    // share can show the actual cat rather than a generic link. tokenId is the
    // third indexed topic; from is the zero address on a mint.
    const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    const log = receipt?.logs?.find(l =>
      l.address.toLowerCase() === (V2 as string).toLowerCase() &&
      l.topics[0] === TRANSFER &&
      l.topics.length === 4 &&
      /^0x0+$/.test(l.topics[1] ?? ''),
    )
    if (log?.topics[3]) setMintedId(BigInt(log.topics[3]).toString())
  }, [isSuccess, receipt])

  const mint = useCallback(async () => {
    if (!address) return
    setError(null)

    try {
      // 1. Prove who this Farcaster user is. The FID never comes from the client.
      setPhase('authorising')
      // A host that never answers must not hang the button forever.
      const { token } = await Promise.race([
        sdk.quickAuth.getToken(),
        new Promise<never>((_, no) => setTimeout(() => no(new Error('quickauth_timeout')), 30_000)),
      ])

      // 2. Exchange it for a voucher signed by the backend.
      const res = await fetch('/api/mint-voucher', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ address }),
      })
      const data = await res.json()

      if (!res.ok) {
        // The score refusal is worth being specific about — a vague failure
        // reads as a bug, and people retry it forever.
        const msg = data?.error === 'low_score' && typeof data.score === 'number'
          ? `Your Neynar score is ${data.score} — this mint needs ${data.required}.`
          : MINT_ERRORS[data?.error] ?? 'Could not authorise the mint. Try again.'
        setError(msg)
        setPhase('error')
        return
      }

      // 3. Mint. The contract re-checks the FID, so the voucher can't be reused.
      setPhase('minting')
      const voucher = data as Voucher
      const hash = await writeContractAsync({
        address: V2 as `0x${string}`,
        abi: V2_ABI,
        functionName: 'mint',
        args: [BigInt(voucher.fid), BigInt(voucher.deadline), voucher.signature],
      })

      setTxHash(hash)
      setPhase('confirming')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      setError(/user rejected|denied/i.test(msg) ? 'Transaction cancelled.'
        : msg === 'quickauth_timeout' ? 'Farcaster did not answer the sign-in. Try again.'
        : 'Mint failed. Try again.')
      setPhase('error')
    }
  }, [address, writeContractAsync])

  async function share() {
    // $CLKCAT renders as a token chip in the cast, so every share surfaces the
    // ticker alongside the cat.
    const label = mintedId ? ` Clanker Cats V2 #${mintedId}` : ''
    const text  = encodeURIComponent(`I just clanked my cat 🐱${label}\nby @crezno\n$CLKCAT`)

    // Share the cat itself when we know which one — /api/share renders its image
    // as the embed. Falls back to the mint page if the token id wasn't readable.
    const target = mintedId
      ? `${APP_URL}/api/share?id=${mintedId}&c=v2`
      : `${APP_URL}/mint`

    const url = `https://warpcast.com/~/compose?text=${text}&embeds[]=${encodeURIComponent(target)}`
    try { await sdk.actions.openUrl(url) } catch { window.open(url, '_blank') }
  }

  if (!ready) return null

  const busy = phase === 'authorising' || phase === 'minting' || phase === 'confirming' || isConfirming

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.logo}>Clanker Cats</div>
        <a href="/cats" style={s.navLink}>My cats →</a>
      </div>

      <div style={s.hero}>🐱</div>
      <div style={s.title}>{(web ? v3Open === true : gate?.phase !== 'premint') ? 'Free Mint' : 'Premint'}</div>

      {!enabled ? (
        <div style={s.notice}>Mint opens soon. Follow @crezno for the drop.</div>
      ) : (
        <>
          {minted !== null && total !== null && (
            <div style={s.supplyBox}>
              <div style={s.supplyRow}>
                <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>{minted}</span>
                <span style={{ color: '#555' }}>/ {total} minted</span>
              </div>
              {bar && (
                <div style={{
                  ...s.hpBar,
                  // The fight's crit jolt. Alternating the NAME replays it for each new blow.
                  animation: hit && hit.n > 0 ? `cradle-shake${hit.seq % 2 ? '' : '-b'} 0.3s ease-out` : undefined,
                }}>
                  <GameBar hp={bar.hp} ghost={bar.ghost} max={total} side="right" />
                  {hit && (
                    <div style={s.floater}>
                      {/* Crit red for damage; a miss is the weak grey and wobbles. */}
                      <Floater
                        key={hit.seq}
                        text={hit.n > 0 ? `-${hit.n}` : 'MISS'}
                        color={hit.n > 0 ? '#e04a3a' : '#6a6a6a'}
                        wavy={hit.n === 0}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {inApp === null ? null : !inApp ? (
            <div style={s.webBox}>
              <a href="/mint/v3" style={s.primaryLink}>Claim a Robinhood cat, free for BUN holders</a>
              <a href="/" style={s.secondaryBtn}>Play the game, free, no wallet</a>
              <div style={s.notice}>
                Base cats are tied to a Farcaster account, so they mint inside Farcaster.
              </div>
            </div>
          ) : phase === 'done' ? (
            <div style={s.successBox}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 'bold' }}>Your cat is minted</div>
              <button style={s.primaryBtn} onClick={share}>Cast it 🐱</button>
              <a href="/cats" style={s.secondaryBtn}>View my cats</a>
            </div>
          ) : !isConnected ? (
            <div style={s.webBox}>
              <div style={s.notice}>Connect a wallet to mint.</div>
              {webConnectors.map(c => (
                <button key={c.id} style={s.secondaryBtn} onClick={() => connect({ connector: c })}>{c.name}</button>
              ))}
            </div>
          ) : open === false ? (
            <div style={s.notice}>Minting hasn’t opened yet.</div>
          ) : (
            <button style={{ ...s.primaryBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={mint}>
              {phase === 'authorising' ? 'Checking your account…'
                : phase === 'minting'  ? 'Confirm in wallet…'
                : busy                 ? 'Minting…'
                : 'Mint my cat'}
            </button>
          )}

          {error && <div style={s.error}>{error}</div>}
        </>
      )}

      <div style={s.footnote}>{web ? 'Free for BUN holders · one per wallet · Robinhood Chain' : 'Free — you only pay Base gas.'}</div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { background: '#0a0a14', minHeight: '100vh', color: 'white', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  header:       { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  logo:         { fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  navLink:      { fontSize: 12, color: '#7c3aed', textDecoration: 'none' },
  hero:         { fontSize: 64, marginTop: 20 },
  title:        { fontSize: 24, fontWeight: 'bold' },
  subtitle:     { fontSize: 13, color: '#666', marginBottom: 8 },
  supplyBox:    { width: '100%', maxWidth: 344, display: 'flex', flexDirection: 'column', gap: 6 },
  supplyRow:    { display: 'flex', gap: 6, fontSize: 13, justifyContent: 'center' },
  hpBar:        { position: 'relative', width: 344, maxWidth: '100%', alignSelf: 'center' },
  // A scale-2 glyph row is 48px; this centres it on the 26px bar, and it rises from there.
  floater:      { position: 'absolute', left: 0, right: 0, top: -11, height: 48 },
  primaryBtn:   { width: '100%', maxWidth: 320, padding: '14px 24px', borderRadius: 12, background: '#7c3aed', color: 'white', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 'bold' },
  secondaryBtn: { width: '100%', maxWidth: 320, padding: '12px 24px', borderRadius: 12, background: '#1e1e2e', color: '#ccc', border: 'none', cursor: 'pointer', fontSize: 14, textAlign: 'center', textDecoration: 'none' },
  primaryLink:  { width: '100%', maxWidth: 320, boxSizing: 'border-box', padding: '14px 24px', borderRadius: 12, background: '#7c3aed', color: 'white', fontSize: 15, textAlign: 'center', textDecoration: 'none' },
  // Centred: the column was full width with no alignItems, so its 320px buttons hugged the left edge.
  webBox:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' },
  successBox:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', maxWidth: 320 },
  notice:       { fontSize: 13, color: '#666', textAlign: 'center', padding: '12px 0' },
  gateBadge:    { fontSize: 11, color: '#7c3aed', border: '1px solid #2a2a4e', background: '#12122a', padding: '5px 12px', borderRadius: 20, letterSpacing: 0.4, marginTop: -4 },
  error:        { fontSize: 12, color: '#ef4444', textAlign: 'center', maxWidth: 320 },
  footnote:     { fontSize: 11, color: '#333', marginTop: 'auto', paddingTop: 24 },
}
