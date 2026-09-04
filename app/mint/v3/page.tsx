'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useConnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { V3, V3_ABI, V3_DEPLOYED, V3_MINT_ERRORS } from '@/lib/mintv3'
import { robinhood } from '@/lib/chains'

/**
 * Claim the cat a run earned. Robinhood Chain.
 *
 * ── THE RUN ARRIVES IN THE URL ───────────────────────────────────────────────
 *
 * `?r=<tag>`, which is the convention the app already writes: the share flow in
 * Cradle.tsx embeds `${APP_URL}/cradle?r=${tag}` so a cast carries the run it is
 * bragging about. Nothing consumed it until now.
 *
 * Reusing it means a claim link is just a share link with a different path, and
 * the tag stays the ONE thing that proves a run happened — signed by the server,
 * over a run whose seed the server picked.
 *
 * ── NO WALLET UNTIL THE LAST MOMENT ──────────────────────────────────────────
 *
 * The whole game plays with no wallet, and that is the pitch. So this page shows
 * what the run earned BEFORE asking for anything: connect and switch chain are
 * the last step, not the first gate.
 *
 * ── THE CHAIN SWITCH IS NOT OPTIONAL ─────────────────────────────────────────
 *
 * wagmi lists Base first because everything else lives there, so a wallet lands
 * on Base and this contract is not on Base. Minting without switching fails deep
 * in the wallet with a message nobody can act on, so it is switched explicitly
 * and the failure is named.
 */

type Phase = 'idle' | 'switching' | 'authorising' | 'minting' | 'confirming' | 'done' | 'error'

export default function MintV3Page() {
  const { address, isConnected, chainId } = useAccount()
  const { connectors, connect } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()

  const [tag,      setTag]      = useState<string | null>(null)
  const [phase,    setPhase]    = useState<Phase>('idle')
  const [error,    setError]    = useState<string | null>(null)
  const [txHash,   setTxHash]   = useState<`0x${string}` | undefined>()
  const [mintedId, setMintedId] = useState<string | null>(null)

  /*
   * Read on the client only. The server has no idea which run this is, so
   * rendering it during SSR would mismatch — the same reason guestId() is read
   * in an effect over in Cradle.
   */
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get('r')
    setTag(r && r.length < 8192 ? r : null)
  }, [])

  const { data: receipt, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (!isSuccess || !receipt) return
    setPhase('done')

    // Same Transfer(from,to,tokenId) read as the V2 page: tokenId is the third
    // indexed topic and `from` is the zero address on a mint.
    const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    const log = receipt.logs?.find(l =>
      l.address.toLowerCase() === (V3 as string).toLowerCase() &&
      l.topics[0] === TRANSFER &&
      l.topics.length === 4 &&
      /^0x0+$/.test(l.topics[1] ?? ''),
    )
    if (log?.topics[3]) setMintedId(BigInt(log.topics[3]).toString())
  }, [isSuccess, receipt])

  const claim = useCallback(async () => {
    if (!address || !tag) return
    setError(null)

    try {
      if (chainId !== robinhood.id) {
        setPhase('switching')
        await switchChainAsync({ chainId: robinhood.id })
      }

      // The run is verified server-side. Nothing here is trusted to be true.
      setPhase('authorising')
      const res = await fetch('/api/v3-voucher', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tag, wallet: address }),
      })
      const data = await res.json()

      if (!res.ok) {
        /*
         * Be specific about the run refusal. "Could not authorise" reads as a
         * bug and people retry it forever; naming the wins tells them what to do
         * about it, which is play again.
         */
        const msg = data?.error === 'no_run' && typeof data.wins === 'number'
          ? `That run won ${data.wins} of 5. Three wins earns a cat.`
          : V3_MINT_ERRORS[data?.error] ?? 'Could not authorise the claim. Try again.'
        setError(msg)
        setPhase('error')
        return
      }

      setPhase('minting')
      const hash = await writeContractAsync({
        address: V3,
        abi: V3_ABI,
        functionName: 'mint',
        args: [BigInt(data.deadline), data.signature as `0x${string}`],
        chainId: robinhood.id,
      })

      setTxHash(hash)
      setPhase('confirming')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      setError(
        /user rejected|denied/i.test(msg) ? 'Cancelled.'
        : /chain|network|switch/i.test(msg) ? 'Could not switch to Robinhood Chain. Add it in your wallet and try again.'
        : 'Claim failed. Try again.',
      )
      setPhase('error')
    }
  }, [address, tag, chainId, switchChainAsync, writeContractAsync])

  const busy = phase === 'switching' || phase === 'authorising' || phase === 'minting' || phase === 'confirming'
  const label =
    phase === 'switching'   ? 'Switching chain…'
    : phase === 'authorising' ? 'Checking your run…'
    : phase === 'minting'     ? 'Confirm in your wallet…'
    : phase === 'confirming'  ? 'Minting…'
    : 'Claim your cat'

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.logo}>CLANKER CATS</span>
        <a href="/" style={s.navLink}>← the game</a>
      </div>

      <div style={s.hero}>🐱</div>
      <div style={s.title}>Play the game, mint the cat</div>
      <div style={s.subtitle}>Robinhood Chain · free</div>

      {!V3_DEPLOYED ? (
        <>
          <div style={s.notice}>Not live yet. The cats are made, the contract isn’t deployed.</div>
          <a href="/" style={s.secondaryBtn}>Play in the meantime</a>
        </>
      ) : !tag ? (
        <>
          {/* No run in the URL. Say what earns one rather than just refusing. */}
          <div style={s.notice}>
            Finish a gauntlet run first. Three wins out of five earns a cat —
            all five, without continuing, earns two.
          </div>
          <a href="/" style={s.primaryBtn as React.CSSProperties}>Play the gauntlet</a>
        </>
      ) : phase === 'done' ? (
        <div style={s.successBox}>
          <div style={s.title}>{mintedId ? `#${mintedId} is yours` : 'Claimed'}</div>
          <a href="/" style={s.secondaryBtn}>Back to the game</a>
        </div>
      ) : !isConnected ? (
        <>
          <div style={s.gateBadge}>RUN VERIFIED</div>
          <div style={s.notice}>Connect a wallet to claim it. Nothing else needs one.</div>
          {connectors.map(c => (
            <button key={c.uid} style={s.secondaryBtn} onClick={() => connect({ connector: c })}>
              {c.name.toUpperCase()}
            </button>
          ))}
        </>
      ) : (
        <>
          <div style={s.gateBadge}>RUN VERIFIED</div>
          <button style={{ ...s.primaryBtn, opacity: busy ? 0.6 : 1 }} onClick={claim} disabled={busy}>
            {label}
          </button>
        </>
      )}

      {error && <div style={s.error}>{error}</div>}

      <div style={s.footnote}>One per wallet. The run is checked on the server.</div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { fontFamily: "'MyFont', monospace", background: '#0a0a14', minHeight: '100vh', color: 'white', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  header:       { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  logo:         { fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  navLink:      { fontSize: 12, color: '#7c3aed', textDecoration: 'none' },
  hero:         { fontSize: 64, marginTop: 20 },
  title:        { fontSize: 24, fontWeight: 'bold' },
  subtitle:     { fontSize: 13, color: '#666', marginBottom: 8 },
  primaryBtn:   { width: '100%', maxWidth: 320, padding: '14px 24px', borderRadius: 12, background: '#7c3aed', color: 'white', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 'bold', fontFamily: "'MyFont', monospace", textAlign: 'center', textDecoration: 'none' },
  secondaryBtn: { width: '100%', maxWidth: 320, padding: '12px 24px', borderRadius: 12, background: '#1e1e2e', color: '#ccc', border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: "'MyFont', monospace", textAlign: 'center', textDecoration: 'none' },
  successBox:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', maxWidth: 320 },
  notice:       { fontSize: 13, color: '#666', textAlign: 'center', padding: '12px 0', maxWidth: 320 },
  gateBadge:    { fontSize: 11, color: '#7c3aed', border: '1px solid #2a2a4e', background: '#12122a', padding: '5px 12px', borderRadius: 20, letterSpacing: 0.4 },
  error:        { fontSize: 12, color: '#ef4444', textAlign: 'center', maxWidth: 320 },
  footnote:     { fontSize: 11, color: '#333', marginTop: 'auto', paddingTop: 24 },
}
