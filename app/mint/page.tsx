'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import sdk from '@farcaster/miniapp-sdk'
import { V2, V2_ABI, MINT_ERRORS, type Voucher } from '@/lib/mint'

type Phase = 'idle' | 'authorising' | 'minting' | 'confirming' | 'done' | 'error'

export default function MintPage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()

  const [ready,  setReady]  = useState(false)
  const [phase,  setPhase]  = useState<Phase>('idle')
  const [error,  setError]  = useState<string | null>(null)
  const [mintedId, setMintedId] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    try { sdk.actions.ready() } catch {}
    setReady(true)
    const fc = connectors.find(c => c.id === 'farcaster-frame')
    if (fc) connect({ connector: fc })
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
    if (isSuccess) {
      setPhase('done')
      refetchSupply()
    }
  }, [isSuccess])

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
        setError(MINT_ERRORS[data?.error] ?? 'Could not authorise the mint. Try again.')
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
    const text  = encodeURIComponent('just minted a Clanker Cat 🐱')
    const embed = encodeURIComponent('https://ccat-viewer.vercel.app')
    const url   = `https://warpcast.com/~/compose?text=${text}&embeds[]=${embed}`
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
      <div style={s.title}>Free Mint</div>
      <div style={s.subtitle}>One cat per Farcaster account.</div>

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
  root:         { fontFamily: 'monospace', background: '#0a0a14', minHeight: '100vh', color: 'white', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
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
  primaryBtn:   { width: '100%', maxWidth: 320, padding: '14px 24px', borderRadius: 12, background: '#7c3aed', color: 'white', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 'bold', fontFamily: 'monospace' },
  secondaryBtn: { width: '100%', maxWidth: 320, padding: '12px 24px', borderRadius: 12, background: '#1e1e2e', color: '#ccc', border: 'none', cursor: 'pointer', fontSize: 14, fontFamily: 'monospace', textAlign: 'center', textDecoration: 'none' },
  successBox:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', maxWidth: 320 },
  notice:       { fontSize: 13, color: '#666', textAlign: 'center', padding: '12px 0' },
  error:        { fontSize: 12, color: '#ef4444', textAlign: 'center', maxWidth: 320 },
  footnote:     { fontSize: 11, color: '#333', marginTop: 'auto', paddingTop: 24 },
}
