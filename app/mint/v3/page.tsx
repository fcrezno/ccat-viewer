'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useConnect, useSwitchChain, useWriteContract, usePublicClient } from 'wagmi'
import { formatUnits, parseEventLogs } from 'viem'
import { V3, V3_ABI, V3_DEPLOYED, V3_MINT_ERRORS, RUN_DOOR } from '@/lib/mintv3'
import { robinhood } from '@/lib/chains'

/**
 * Claim a V3 cat, Robinhood Chain. Rebuilt 2026-09-28 for the rules JP set:
 *
 *   1. THE MINT IS FREE. One per wallet. The voucher route decides who may claim
 *      (anyone, or BUN holders — V3_MIN_BUN) and signs it; nothing is paid here.
 *   2. BURNING IS OPTIONAL, and comes after: "they dont have to; but if they do
 *      they get something special". The owner burns BUN THROUGH THE CAT
 *      (ClankerCatsV3.burnBun) and it becomes a BunBurner for good — a trait on
 *      the cat, and probably the whitelist for the BUN Cat collection after this.
 *
 * The burn price, the token and the toll are all read FROM THE CONTRACT, where
 * they are immutable. Nothing in a browser or on our server can reprice it.
 *
 * ── TWO WALLET STEPS FOR THE BURN, AND WHY ───────────────────────────────────
 *
 * BUN has no permit() (checked 2026-09-21), so the contract can only pull BUN
 * after an approve(). Approve is skipped when the allowance already covers it.
 *
 * ── NO WALLET UNTIL THE LAST MOMENT ──────────────────────────────────────────
 *
 * The game plays with no wallet, and that is the pitch. Connecting is the last
 * step here, not a gate in front of the page.
 */

const ERC20 = [
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const

/** How many V3 cats exist, and so how many pictures the hero can pick from. */
const V3_COUNT = 1111

/** BUN's decimals. deploy-v3.mjs refuses to deploy if the live token disagrees. */
const BUN_DECIMALS = 18

/**
 * The block V3 was deployed at, so looking up "which cat did this wallet mint"
 * does not ask the RPC to search the whole chain. Set it after the deploy.
 */
const FROM_BLOCK = BigInt(process.env.NEXT_PUBLIC_V3_FROM_BLOCK || '0')

type BurnTerms = { price: bigint; bun: `0x${string}` }

export default function MintV3Page() {
  const { address, isConnected, chainId } = useAccount()
  const { connectors, connect } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: robinhood.id })

  const [tag,       setTag]       = useState<string | null>(null)
  const [heroId,    setHeroId]    = useState<number | null>(null)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [hasMinted, setHasMinted] = useState<boolean | null>(null)
  const [catId,     setCatId]     = useState<bigint | null>(null)
  const [burner,    setBurner]    = useState<boolean | null>(null)
  const [terms,     setTerms]     = useState<BurnTerms | null>(null)
  const [typed,     setTyped]     = useState('')

  /*
   * Read on the client only: the URL and the random pick would both differ
   * between server and browser, and React would throw the page away.
   * With the run door off a tag earns nothing, so it is not even read.
   */
  useEffect(() => {
    setHeroId(1 + Math.floor(Math.random() * V3_COUNT))
    if (!RUN_DOOR) return
    const r = new URLSearchParams(window.location.search).get('r')
    setTag(r && r.length < 8192 ? r : null)
  }, [])

  /* The burn terms, once. Immutable in the contract, so never re-read. */
  useEffect(() => {
    if (!V3_DEPLOYED || !client) return
    Promise.all([
      client.readContract({ address: V3, abi: V3_ABI, functionName: 'bunBurnPrice' }),
      client.readContract({ address: V3, abi: V3_ABI, functionName: 'bun' }),
    ])
      .then(([price, bun]) => setTerms({ price: price as bigint, bun: bun as `0x${string}` }))
      .catch(() => {})
  }, [client])

  /* Has this wallet claimed, and if so which cat is it. */
  useEffect(() => {
    if (!V3_DEPLOYED || !client || !address) return
    let alive = true
    ;(async () => {
      try {
        const m = await client.readContract({
          address: V3, abi: V3_ABI, functionName: 'minted', args: [address],
        }) as boolean
        if (!alive) return
        setHasMinted(m)
        if (!m) return
        const logs = await client.getContractEvents({
          address: V3, abi: V3_ABI, eventName: 'Minted', args: { to: address }, fromBlock: FROM_BLOCK,
        })
        const id = logs[logs.length - 1]?.args.tokenId
        if (alive && id !== undefined) setCatId(id)
      } catch { /* the typed-number fallback below still works */ }
    })()
    return () => { alive = false }
  }, [client, address])

  /* Is that cat a BunBurner already. */
  useEffect(() => {
    if (!client || catId === null) return
    client.readContract({ address: V3, abi: V3_ABI, functionName: 'bunBurner', args: [catId] })
      .then(b => setBurner(b as boolean))
      .catch(() => {})
  }, [client, catId])

  /** Turn a thrown wallet error into something a person can act on. */
  const explain = (e: unknown) => {
    const msg = e instanceof Error ? e.message : ''
    return /user rejected|denied/i.test(msg)            ? 'Cancelled.'
      : /chain|network|switch/i.test(msg)               ? 'Could not switch to Robinhood Chain. Add it in your wallet and try again.'
      : /insufficient|exceeds balance/i.test(msg)       ? 'Not enough BUN in that wallet.'
      : /AlreadyBunBurner/i.test(msg)                   ? 'That cat is already a BunBurner.'
      : 'Something went wrong. Try again.'
  }

  const toRobinhood = useCallback(async () => {
    if (chainId !== robinhood.id) {
      setBusy('Switching chain…')
      await switchChainAsync({ chainId: robinhood.id })
    }
  }, [chainId, switchChainAsync])

  /* ── 1. the free mint ─────────────────────────────────────────────────────── */
  const claim = useCallback(async () => {
    if (!address || !client) return
    setError(null)
    try {
      await toRobinhood()
      setBusy('Checking…')
      const res = await fetch('/api/v3-voucher', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wallet: address, ...(tag ? { tag } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(
          data?.error === 'need_bun' && data.min ? `This drop is for BUN holders: hold at least ${data.min} BUN in this wallet.`
          : data?.error === 'no_run' && typeof data.wins === 'number' ? `That run won ${data.wins} of 5. Three wins earns a cat.`
          : V3_MINT_ERRORS[data?.error] ?? 'Could not authorise the claim. Try again.',
        )
        return
      }

      setBusy('Confirm in your wallet…')
      const hash = await writeContractAsync({
        address: V3, abi: V3_ABI, functionName: 'mint',
        args: [BigInt(data.deadline), data.signature as `0x${string}`],
        chainId: robinhood.id,
      })
      setBusy('Minting…')
      const receipt = await client.waitForTransactionReceipt({ hash })
      const [minted] = parseEventLogs({ abi: V3_ABI, logs: receipt.logs, eventName: 'Minted' })
      setHasMinted(true)
      setBurner(false)
      if (minted) setCatId(minted.args.tokenId)
    } catch (e: unknown) {
      setError(explain(e))
    } finally {
      setBusy(null)
    }
  }, [address, client, tag, toRobinhood, writeContractAsync])

  /* ── 2. the optional burn, through the cat ───────────────────────────────── */
  const becomeBurner = useCallback(async () => {
    if (!address || !client || !terms || catId === null) return
    setError(null)
    try {
      await toRobinhood()
      const allowance = await client.readContract({
        address: terms.bun, abi: ERC20, functionName: 'allowance', args: [address, V3],
      }) as bigint
      if (allowance < terms.price) {
        setBusy('Approve BUN in your wallet… (1 of 2)')
        const approval = await writeContractAsync({
          address: terms.bun, abi: ERC20, functionName: 'approve', args: [V3, terms.price], chainId: robinhood.id,
        })
        setBusy('Waiting for the approval…')
        await client.waitForTransactionReceipt({ hash: approval })
      }
      setBusy('Confirm the burn in your wallet… (2 of 2)')
      const hash = await writeContractAsync({
        address: V3, abi: V3_ABI, functionName: 'burnBun', args: [catId], chainId: robinhood.id,
      })
      setBusy('Burning…')
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('reverted')
      setBurner(true)
    } catch (e: unknown) {
      setError(explain(e))
    } finally {
      setBusy(null)
    }
  }, [address, client, terms, catId, toRobinhood, writeContractAsync])

  /* A cat bought rather than minted: let its owner name it. ownerOf decides. */
  const pickTyped = useCallback(async () => {
    if (!client || !address || !/^\d+$/.test(typed)) return
    setError(null)
    try {
      const owner = await client.readContract({
        address: V3, abi: V3_ABI, functionName: 'ownerOf', args: [BigInt(typed)],
      }) as string
      if (owner.toLowerCase() !== address.toLowerCase()) { setError(`This wallet does not own #${typed}.`); return }
      setBurner(null)
      setCatId(BigInt(typed))
    } catch {
      setError(`#${typed} has not been minted.`)
    }
  }, [client, address, typed])

  const price = terms ? formatUnits(terms.price, BUN_DECIMALS) : null
  const shownId = catId !== null ? Number(catId) : heroId

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.logo}>CLANKER CATS</span>
        <a href="/" style={s.navLink}>← the game</a>
      </div>

      {/* A random V3 cat, or this wallet's own once it has one. */}
      <div style={{ ...s.heroBox, ...(burner ? s.heroBurner : {}) }}>
        {shownId && <img src={`/v3/images/${shownId}.png`} alt={`Clanker Cats V3 #${shownId}`} style={s.heroImg} />}
      </div>
      <div style={s.title}>{catId !== null ? `#${catId} is yours` : 'Clanker Cats V3'}</div>
      <div style={s.subtitle}>Robinhood Chain · for BUN holders</div>

      {!V3_DEPLOYED ? (
        <>
          <div style={s.notice}>Not live yet. The cats are made, the contract isn’t deployed.</div>
          <a href="/" style={s.secondaryBtn}>Play the game — it’s free</a>
        </>
      ) : !isConnected ? (
        <>
          <div style={s.notice}>Free to mint, one per wallet. Connect to claim yours.</div>
          {connectors.map(c => (
            <button key={c.uid} style={s.secondaryBtn} onClick={() => connect({ connector: c })}>
              {c.name.toUpperCase()}
            </button>
          ))}
        </>
      ) : (
        <>
          {hasMinted === false && catId === null && (
            <button style={{ ...s.primaryBtn, opacity: busy ? 0.6 : 1 }} onClick={claim} disabled={!!busy}>
              {busy ?? 'Claim your cat — free'}
            </button>
          )}

          {catId !== null && (burner ? (
            <div style={s.burnerBadge}>BUNBURNER</div>
          ) : terms && burner === false && (
            <>
              <button style={{ ...s.burnBtn, opacity: busy ? 0.6 : 1 }} onClick={becomeBurner} disabled={!!busy}>
                {busy ?? `Burn ${price} BUN → BunBurner`}
              </button>
              {/* Where the BUN goes, said before it is spent rather than after. */}
              <div style={s.splitNote}>
                Optional. Your cat gets the BunBurner trait for good.
                <br />30% agents · 30% creator · 40% burned
              </div>
            </>
          ))}

          {hasMinted && (
            <div style={s.typedRow}>
              <input
                style={s.input}
                inputMode="numeric"
                placeholder={catId === null ? 'Your cat’s number' : 'Another cat you own'}
                value={typed}
                onChange={e => setTyped(e.target.value.replace(/\D/g, ''))}
              />
              <button style={s.smallBtn} onClick={pickTyped} disabled={!typed || !!busy}>Use</button>
            </div>
          )}
        </>
      )}

      {error && <div style={s.error}>{error}</div>}

      <div style={s.footnote}>Free · one per wallet · burning BUN is optional</div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { background: '#0a0a14', minHeight: '100vh', color: 'white', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  header:       { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  logo:         { fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
  navLink:      { fontSize: 12, color: '#7c3aed', textDecoration: 'none' },
  // 1000x796 art, so 200x159 keeps its shape; nearest-neighbour keeps the pixels.
  heroBox:      { width: 200, height: 159, marginTop: 20, borderRadius: 8, overflow: 'hidden', border: '4px solid #21212f', background: '#12121c' },
  heroBurner:   { border: '4px solid #e0a72c', boxShadow: '0 0 18px rgba(224,167,44,0.35)' },
  heroImg:      { width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' },
  title:        { fontSize: 24, fontWeight: 'bold' },
  subtitle:     { fontSize: 13, color: '#666', marginBottom: 8 },
  primaryBtn:   { width: '100%', maxWidth: 320, padding: '14px 24px', borderRadius: 12, background: '#7c3aed', color: 'white', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 'bold', textAlign: 'center', textDecoration: 'none' },
  burnBtn:      { width: '100%', maxWidth: 320, padding: '13px 24px', borderRadius: 12, background: 'transparent', color: '#e0a72c', border: '1px solid #7a5c18', cursor: 'pointer', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  secondaryBtn: { width: '100%', maxWidth: 320, padding: '12px 24px', borderRadius: 12, background: '#1e1e2e', color: '#ccc', border: 'none', cursor: 'pointer', fontSize: 14, textAlign: 'center', textDecoration: 'none' },
  smallBtn:     { padding: '10px 16px', borderRadius: 10, background: '#1e1e2e', color: '#ccc', border: 'none', cursor: 'pointer', fontSize: 13 },
  input:        { flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, background: '#12121c', color: 'white', border: '1px solid #2a2a4e', fontSize: 13 },
  typedRow:     { display: 'flex', gap: 8, width: '100%', maxWidth: 320 },
  notice:       { fontSize: 13, color: '#666', textAlign: 'center', padding: '12px 0', maxWidth: 320 },
  burnerBadge:  { fontSize: 12, color: '#e0a72c', border: '1px solid #7a5c18', background: '#1a1408', padding: '6px 14px', borderRadius: 20, letterSpacing: 1.5, fontWeight: 'bold' },
  error:        { fontSize: 12, color: '#ef4444', textAlign: 'center', maxWidth: 320 },
  splitNote:    { fontSize: 11, color: '#555', textAlign: 'center', letterSpacing: 0.3, lineHeight: 1.6 },
  footnote:     { fontSize: 11, color: '#333', marginTop: 'auto', paddingTop: 24 },
}
