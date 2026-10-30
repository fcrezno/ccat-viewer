'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useConnect, useSwitchChain, useWriteContract, usePublicClient } from 'wagmi'
import { formatUnits, parseEventLogs } from 'viem'
import { V3, V3_ABI, V3_DEPLOYED, V3_MINT_ERRORS, RUN_DOOR } from '@/lib/mintv3'
import { robinhood } from '@/lib/chains'
import { TitleScreen } from '@/components/TitleScreen'
import { FxButton } from '@/components/FxButton'
import { useWebConnectors } from '@/lib/useWebConnectors'

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
  const { connect, error: connectError, isPending: connecting } = useConnect()
  const webConnectors = useWebConnectors()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: robinhood.id })

  const [tag,       setTag]       = useState<string | null>(null)
  const [busy,      setBusy]      = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [hasMinted, setHasMinted] = useState<boolean | null>(null)
  const [catId,     setCatId]     = useState<bigint | null>(null)
  const [burner,    setBurner]    = useState<boolean | null>(null)
  const [terms,     setTerms]     = useState<BurnTerms | null>(null)
  const [typed,     setTyped]     = useState('')
  /*
   * IS THE MINT OPEN. The voucher route signs whether or not it is, so without
   * this a BUN holder could press Claim on a closed mint and watch the wallet
   * fail it. Read once on load; opening it is a wallet transaction by the owner.
   */
  const [open,      setOpen]      = useState<boolean | null>(null)
  /* The free cat's own switch (mint() needs it as well as mintOpen; the BUN mint does not). */
  const [freeOpen,  setFreeOpen]  = useState<boolean | null>(null)

  /*
   * WALLET STATE EXISTS ONLY IN THE BROWSER. wagmi reconnects a returning wallet
   * on load, so the server drew 'Connect' while the browser drew 'Claim' and
   * React threw a hydration error (seen 2026-09-28 with Rabby). Everything that
   * depends on the wallet waits one frame, until the page is mounted.
   */
  const actionRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  /*
   * Read on the client only: the URL and the random pick would both differ
   * between server and browser, and React would throw the page away.
   * With the run door off a tag earns nothing, so it is not even read.
   */
  useEffect(() => {
    if (!RUN_DOOR) return
    // From the claim link, or else the last won run this browser kept (components/Cradle.tsx).
    let r = new URLSearchParams(window.location.search).get('r')
    if (!r) try { r = window.localStorage.getItem('ccat.v3run') } catch {}
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
    client.readContract({ address: V3, abi: V3_ABI, functionName: 'mintOpen' })
      .then(o => setOpen(o as boolean))
      .catch(() => {})
    client.readContract({ address: V3, abi: V3_ABI, functionName: 'freeMintOpen' })
      .then(o => setFreeOpen(o as boolean))
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

  /* What this wallet's next cat for BUN costs, and how many it has bought (max MAX_EXTRA). */
  const [extra, setExtra] = useState<{ price: bigint; count: number; max: number } | null>(null)
  const readExtra = useCallback(async () => {
    if (!V3_DEPLOYED || !client || !address) return
    try {
      const [price, count, max] = await Promise.all([
        client.readContract({ address: V3, abi: V3_ABI, functionName: 'extraPrice', args: [address] }),
        client.readContract({ address: V3, abi: V3_ABI, functionName: 'extraMinted', args: [address] }),
        client.readContract({ address: V3, abi: V3_ABI, functionName: 'MAX_EXTRA' }),
      ])
      setExtra({ price: price as bigint, count: Number(count), max: Number(max) })
    } catch { /* the button stays at the base price */ }
  }, [client, address])
  useEffect(() => { readExtra() }, [readExtra])

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
      : /ExtraCapReached/i.test(msg)                    ? 'This wallet has bought all its BUN cats.'
      : /MintClosed/i.test(msg)                         ? 'The BUN mint is not open yet.'
      : /SoldOut/i.test(msg)                            ? 'All cats have been claimed.'
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

  /* ── 3. a cat for BUN: approve extraPrice, then mintWithBun ─────────────── */
  const buyWithBun = useCallback(async () => {
    if (!address || !client || !terms) return
    setError(null)
    try {
      await toRobinhood()
      const cost = await client.readContract({
        address: V3, abi: V3_ABI, functionName: 'extraPrice', args: [address],
      }) as bigint
      const allowance = await client.readContract({
        address: terms.bun, abi: ERC20, functionName: 'allowance', args: [address, V3],
      }) as bigint
      if (allowance < cost) {
        setBusy('Approve BUN in your wallet… (1 of 2)')
        const approval = await writeContractAsync({
          address: terms.bun, abi: ERC20, functionName: 'approve', args: [V3, cost], chainId: robinhood.id,
        })
        setBusy('Waiting for the approval…')
        await client.waitForTransactionReceipt({ hash: approval })
      }
      setBusy('Confirm the burn in your wallet… (2 of 2)')
      const hash = await writeContractAsync({
        address: V3, abi: V3_ABI, functionName: 'mintWithBun', chainId: robinhood.id,
      })
      setBusy('Burning…')
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('reverted')
      const [minted] = parseEventLogs({ abi: V3_ABI, logs: receipt.logs, eventName: 'Minted' })
      if (minted) { setCatId(minted.args.tokenId); setBurner(true) }
      await readExtra()
    } catch (e: unknown) {
      setError(explain(e))
    } finally {
      setBusy(null)
    }
  }, [address, client, terms, toRobinhood, writeContractAsync, readExtra])

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

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span />
        <a href="/" style={s.navLink}>← the game</a>
      </div>

      {/*
        THE s&box TITLE SCREEN is the front of this page (JP, 2026-09-28): the
        game's backdrop, its two reels of cats and its rippling gold name, with
        CLAIM YOUR CAT where PRESS START blinks. Clicking it brings the claim up.
      */}
      <TitleScreen onStart={() => actionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />

      {/* Everything under the title screen in one light Windows 98 window, as on every page (JP, 2026-10-06). */}
      <section className="win98" data-title="Claim a Robinhood Cat" style={s.window}>

      {/*
        BUY A CAT WITH BUN (ClankerCatsV3.mintWithBun: 500, 750, 1,000, 1,250 BUN, up to 4 a wallet,
        separate from the free cat). Shown greyed out until it is live (JP, 2026-10-26: "build the
        burn button but grey it out"): turn it on after V3 is deployed and setMintOpen(true).
      */}
      {(() => {
        const cost = formatUnits(extra?.price ?? terms?.price ?? BigInt("500000000000000000000"), BUN_DECIMALS)
        const full = extra !== null && extra.count >= extra.max
        const live = V3_DEPLOYED && mounted && open === true && isConnected && !!terms && !full
        const label = busy ?? (full ? 'ALL YOUR BUN CATS ARE BOUGHT'
          : !V3_DEPLOYED || open !== true ? `BURN ${cost} BUN FOR A CAT · OPENS OCT 28`
          : !mounted || !isConnected ? `CONNECT TO BURN ${cost} BUN FOR A CAT`
          : `BURN ${cost} BUN FOR A CAT${extra ? ` · ${extra.count}/${extra.max}` : ''}`)
        return live
          ? <FxButton style={{ ...s.primaryBtn, maxWidth: 'none', marginBottom: 12, opacity: busy ? 0.6 : 1 }} tone="gold" onClick={buyWithBun} disabled={!!busy} label={label} />
          : <button type="button" disabled title="Opens October 28" style={{ ...s.burnSoon }}>{label}</button>
      })()}

      {/* This wallet's own cat, once it has one. */}
      {catId !== null && (
        <div style={{ ...s.heroBox, ...(burner ? s.heroBurner : {}) }}>
          <img src={`/v3/images/${String(catId)}.png`} alt={`Clanker Cat #${String(catId)}`} style={s.heroImg} />
        </div>
      )}
      {catId !== null && <div style={s.title}>#{String(catId)} is yours</div>}
      <div ref={actionRef} style={s.subtitle}>Robinhood Chain · burn BUN for a cat today · free cat Oct 30</div>

      {!V3_DEPLOYED ? (
        <>
          <div style={s.notice}>Not live yet. The cats are made, the contract isn’t deployed.</div>
          <FxButton href="/" style={s.secondaryBtn} tone="soft" label="Play the game — it’s free" />
        </>
      ) : !mounted ? (
        <div style={s.notice}>Loading…</div>
      ) : !isConnected ? (
        <>
          <div style={s.notice}>
            {freeOpen === true
              ? 'Win 3 fights in the free game for a free cat, one per wallet. Or burn BUN for one. Connect to claim.'
              : 'Burn BUN for a cat now. The free cat (win 3 fights) opens soon.'}
          </div>
          {webConnectors.map(c => (
            <FxButton key={c.uid} style={s.secondaryBtn} tone="soft" onClick={() => connect({ connector: c })} label={c.name.toUpperCase()} />
          ))}
          {/* No MetaMask in this browser (a phone, or not installed): open this page inside the MetaMask app instead. */}
          {!webConnectors.some(c => /metamask/i.test(c.name)) && (
            <FxButton href={`https://metamask.app.link/dapp/${typeof window !== 'undefined' ? window.location.host + window.location.pathname + window.location.search : 'clankercats.com/mint/v3'}`} style={s.secondaryBtn} tone="soft" label="OPEN IN METAMASK" />
          )}
          {/* A wallet that does not open (seen with MetaMask next to Phantom, 2026-10-30): say where to look. */}
          {connecting && (
            <div style={s.notice}>
              Waiting for your wallet… If nothing opened, click the wallet’s icon in your browser toolbar: the request may be waiting there.
              If you also have Phantom installed, turn off Phantom’s “default app wallet” setting and reload, or use Phantom.
            </div>
          )}
          {/* A failed connect used to do nothing visible. Say why. */}
          {connectError && !/rejected|denied/i.test(connectError.message) && (
            <div style={s.error}>Could not connect: {connectError.message.slice(0, 160)}</div>
          )}
        </>
      ) : (
        <>
          {hasMinted === false && freeOpen === false && (
            <div style={s.notice}>The free cat (win 3 fights) is not open yet. It opens soon.</div>
          )}
          {hasMinted === false && freeOpen === true && !tag && (
            <>
              <div style={s.notice}>Win 3 fights in the free game, then claim your free cat from the results screen.</div>
              <FxButton href="/" style={s.secondaryBtn} tone="soft" label="Play — win 3 fights" />
            </>
          )}
          {hasMinted === false && freeOpen === true && !!tag && (
            <FxButton style={{ ...s.primaryBtn, opacity: busy ? 0.6 : 1 }} tone="light" onClick={claim} disabled={!!busy} label={busy ?? 'Claim your cat — free'} />
          )}

          {catId !== null && (burner ? (
            <div style={s.burnerBadge}>BUNBURNER</div>
          ) : terms && burner === false && (
            <>
              <FxButton style={{ ...s.burnBtn, opacity: busy ? 0.6 : 1 }} tone="gold" onClick={becomeBurner} disabled={!!busy} label={busy ?? `Burn ${price} BUN → BunBurner`} />
              {/* Where the BUN goes, said before it is spent rather than after. */}
              <div style={s.splitNote}>
                Optional. Your cat gets the BunBurner trait for good.
                <br />40% creator · 30% agents · 30% burned
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
              <FxButton style={s.smallBtn} tone="soft" onClick={pickTyped} disabled={!typed || !!busy} label="Use" />
            </div>
          )}
        </>
      )}

      {error && <div style={s.error}>{error}</div>}

      {/* A PLAY BUTTON THAT CANNOT BE MISSED. The game is free and needs no wallet. */}
      <FxButton href="/" style={s.playBtn} tone="gold" label="PLAY THE GAME — FREE, NO WALLET" />

      {/* HOW THE CATS WORK — asked for by JP, 2026-09-28. */}
      <div style={s.how}>
        <div style={s.howHead}>HOW IT WORKS</div>
        <div style={s.howStep}><b style={s.howNum}>1</b> <span><span style={s.howLabel}>Claim.</span> Win 3 fights in the free game and claim one cat free. One per wallet.</span></div>
        <div style={s.howStep}><b style={s.howNum}>2</b> <span><span style={s.howLabel}>Play.</span> Your cat fights in Clanker Cats, right here in the browser. Its stats come from the cat itself and never change.</span></div>
        <div style={s.howStep}><b style={s.howNum}>3</b> <span><span style={s.howLabel}>Burn (optional).</span> Burn 500 BUN for a cat of your own (up to 4: 500, 750, 1,000, 1,250 BUN), or through a cat you have. It becomes a BunBurner, a trait it keeps for good. 40% goes to the creator, 30% to the agents, 30% is burned.</span></div>
      </div>

      </section>

      <div style={s.footnote}>Free · one per wallet · burning BUN is optional</div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  burnSoon: { display: 'block', width: '100%', margin: '0 0 12px', padding: '12px 16px', fontSize: 20, fontFamily: 'inherit', color: '#808080', background: '#c0c0c0', border: 0, cursor: 'not-allowed', textShadow: '1px 1px 0 #ffffff', boxShadow: 'inset -1px -1px 0 0 #0a0a0a, inset 1px 1px 0 0 #ffffff, inset -2px -2px 0 0 #808080, inset 2px 2px 0 0 #dfdfdf' },
  window:       { width: '100%', maxWidth: 440, boxSizing: 'border-box', background: '#c0c0c0', color: '#000000', border: '1px solid #c0c0c0', borderRadius: 0, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  root:         { background: 'transparent', minHeight: '100vh', color: '#000000', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  header:       { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  logo:         { fontSize: 21, fontWeight: 'bold', letterSpacing: 1 },
  navLink:      { fontSize: 17, color: '#000080', textDecoration: 'none' },
  // 1000x796 art, so 200x159 keeps its shape; nearest-neighbour keeps the pixels.
  playBtn:      { width: '100%', maxWidth: 360, boxSizing: 'border-box', marginTop: 8, padding: '11px 18px', borderRadius: 0, background: 'transparent', color: '#806000', border: '1px solid #7a5c18', fontSize: 19, letterSpacing: 1, textAlign: 'center', textDecoration: 'none' },
  how:          { width: '100%', maxWidth: 360, boxSizing: 'border-box', marginTop: 12, padding: 16, borderRadius: 0, border: 0, background: '#ffffff', boxShadow: 'inset 1px 1px 0 0 #808080, inset -1px -1px 0 0 #ffffff, inset 2px 2px 0 0 #0a0a0a, inset -2px -2px 0 0 #dfdfdf', display: 'flex', flexDirection: 'column', gap: 10 },
  howHead:      { fontSize: 16, letterSpacing: 2, color: '#000080' },
  howStep:      { display: 'flex', gap: 10, fontSize: 18, color: '#1a1a1a', lineHeight: 1.55, fontWeight: 'normal' },
  howLabel:     { color: '#000000' },
  howNum:       { color: '#806000', fontWeight: 'normal', minWidth: 14 },
  heroBox:      { width: 200, height: 159, marginTop: 20, borderRadius: 8, overflow: 'hidden', border: '4px solid #21212f', background: '#ffffff' },
  heroBurner:   { border: '4px solid #e0a72c', boxShadow: '0 0 18px rgba(224,167,44,0.35)' },
  heroImg:      { width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' },
  title:        { fontSize: 20, fontWeight: 'normal', color: '#000000' },
  subtitle:     { fontSize: 18, color: '#404040', marginBottom: 8 },
  primaryBtn:   { width: '100%', maxWidth: 360, padding: '11px 24px', borderRadius: 0, background: '#000080', color: '#000000', border: 'none', cursor: 'pointer', fontSize: 20, fontWeight: 'normal', textAlign: 'center', textDecoration: 'none' },
  burnBtn:      { width: '100%', maxWidth: 360, padding: '10px 24px', borderRadius: 0, background: 'transparent', color: '#806000', border: '1px solid #7a5c18', cursor: 'pointer', fontSize: 19, fontWeight: 'normal', textAlign: 'center' },
  secondaryBtn: { width: '100%', maxWidth: 360, padding: '10px 24px', borderRadius: 0, background: '#c0c0c0', color: '#000000', border: 'none', cursor: 'pointer', fontSize: 19, textAlign: 'center', textDecoration: 'none' },
  smallBtn:     { padding: '8px 14px', borderRadius: 0, background: '#c0c0c0', color: '#000000', border: 'none', cursor: 'pointer', fontSize: 18 },
  input:        { flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 0, background: '#ffffff', color: '#000000', border: '1px solid #808080', fontSize: 18 },
  typedRow:     { display: 'flex', gap: 8, width: '100%', maxWidth: 360 },
  notice:       { fontSize: 18, color: '#404040', textAlign: 'center', padding: '12px 0', maxWidth: 320 },
  burnerBadge:  { fontSize: 17, color: '#806000', border: '1px solid #7a5c18', background: '#ffffe1', padding: '6px 14px', borderRadius: 20, letterSpacing: 1.5, fontWeight: 'bold' },
  error:        { fontSize: 17, color: '#a01b1b', textAlign: 'center', maxWidth: 320 },
  splitNote:    { fontSize: 16, color: '#404040', textAlign: 'center', letterSpacing: 0.3, lineHeight: 1.6 },
  footnote:     { fontSize: 16, color: '#1a1a1a', marginTop: 'auto', paddingTop: 24 },
}
