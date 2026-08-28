'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import sdk from '@farcaster/miniapp-sdk'
import { V2, V2_ABI, MINT_ERRORS, type Voucher } from '@/lib/mint'
import { APP_URL } from '@/lib/miniapp'

type Phase = 'idle' | 'authorising' | 'minting' | 'confirming' | 'done' | 'error'

export default function MintPage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()

  const [ready,  setReady]  = useState(false)
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
    address: V2 as `0x${string}`, abi: V2_ABI, functionName: 'totalSupply',
    query: { enabled },
  })
  const { data: max } = useReadContract({
    address: V2 as `0x${string}`, abi: V2_ABI, functionName: 'maxSupply',
    query: { enabled },
  })
  const { data: open } = useReadContract({
    address: V2 as `0x${string}`, abi: V2_ABI, functionName: 'mintOpen',
    query: { enabled },
  })

  const minted = supply !== undefined ? Number(supply) : null
  const total  = max    !== undefined ? Number(max)    : null

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
      const { token } = await sdk.quickAuth.getToken()

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
      setError(/user rejected|denied/i.test(msg) ? 'Transaction cancelled.' : 'Mint failed. Try again.')
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

  const pct = minted !== null && total ? Math.round((minted / total) * 100) : 0
  const busy = phase === 'authorising' || phase === 'minting' || phase === 'confirming' || isConfirming

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.logo}>Clanker Cats</div>
        <a href="/cats" style={s.navLink}>My cats →</a>
      </div>

      <div style={s.hero}>🐱</div>
      <div style={s.title}>{gate?.phase === 'premint' ? 'Premint' : 'Free Mint'}</div>

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
              <div style={s.bar}>
                <div style={{ ...s.barFill, width: `${pct}%` }} />
              </div>
            </div>
          )}

          {phase === 'done' ? (
            <div style={s.successBox}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 'bold' }}>Your cat is minted</div>
              <button style={s.primaryBtn} onClick={share}>Cast it 🐱</button>
              <a href="/cats" style={s.secondaryBtn}>View my cats</a>
            </div>
          ) : !isConnected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <div style={s.notice}>Open in Farcaster to mint, or connect a wallet.</div>
              {connectors.filter(c => c.id !== 'farcaster-frame').map(c => (
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

      <div style={s.footnote}>Free — you only pay Base gas.</div>
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
  supplyBox:    { width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 6 },
  supplyRow:    { display: 'flex', gap: 6, fontSize: 13, justifyContent: 'center' },
  bar:          { background: '#12122a', borderRadius: 6, height: 8, overflow: 'hidden', border: '1px solid #1e1e2e' },
  barFill:      { height: '100%', background: '#7c3aed', borderRadius: 6, transition: 'width 0.4s ease' },
  primaryBtn:   { width: '100%', maxWidth: 320, padding: '14px 24px', borderRadius: 12, background: '#7c3aed', color: 'white', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 'bold', fontFamily: "'MyFont', monospace" },
  secondaryBtn: { width: '100%', maxWidth: 320, padding: '12px 24px', borderRadius: 12, background: '#1e1e2e', color: '#ccc', border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: "'MyFont', monospace", textAlign: 'center', textDecoration: 'none' },
  successBox:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', maxWidth: 320 },
  notice:       { fontSize: 13, color: '#666', textAlign: 'center', padding: '12px 0' },
  gateBadge:    { fontSize: 11, color: '#7c3aed', border: '1px solid #2a2a4e', background: '#12122a', padding: '5px 12px', borderRadius: 20, letterSpacing: 0.4, marginTop: -4 },
  error:        { fontSize: 12, color: '#ef4444', textAlign: 'center', maxWidth: 320 },
  footnote:     { fontSize: 11, color: '#333', marginTop: 'auto', paddingTop: 24 },
}
