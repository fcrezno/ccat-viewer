'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useConnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { V3, V3_ABI, V3_DEPLOYED, V3_MINT_ERRORS, RUN_DOOR } from '@/lib/mintv3'
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

type Phase = 'idle' | 'switching' | 'paying' | 'settling' | 'authorising' | 'minting' | 'confirming' | 'done' | 'error'

/** What /api/bun-terms answers. `live: false` means show no BUN option at all. */
type Terms =
  | { live: false }
  | { live: true; token: `0x${string}`; toll: `0x${string}`; amount: string; amountWei: string; chainId: number }

/**
 * Just transfer(). A player pays the toll with an ordinary token send.
 *
 * BUN has no permit(), so a pull-payment would cost two transactions and the
 * first would do nothing a player can see. One transfer is the whole payment,
 * and the server reads its Transfer log as the receipt.
 */
const ERC20_TRANSFER = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ type: 'bool' }],
}] as const

/**
 * BUN's own burn(), for when the whole payment is burned rather than split
 * (BUN_BURN_ALL, lib/bunburn.ts). It emits Transfer to the zero address, which is
 * what the server counts. Checked on chain 2026-09-21: burn(uint256) works.
 */
const ERC20_BURN = [{
  name: 'burn', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'value', type: 'uint256' }],
  outputs: [],
}] as const

const ZERO = '0x0000000000000000000000000000000000000000'

/** How many V3 cats exist, and so how many pictures the hero can pick from. */
const V3_COUNT = 1111

/**
 * One line for each way a payment can be refused.
 *
 * These matter more than the run refusals do. A rejected run costs a player
 * nothing and they can go and play again; by the time any of these can happen
 * the BUN has already left their wallet, so "something went wrong" is not an
 * acceptable answer. Each one names the single thing that was wrong with it.
 */
const BURN_REFUSALS: Record<string, string> = {
  off:        'BUN payment is not switched on yet.',
  bad_hash:   'That does not look like a transaction.',
  unknown_tx: 'That payment has not appeared on chain yet. Wait a moment, then try again.',
  reverted:   'That payment failed on chain, so no BUN left your wallet.',
  too_old:    'That payment is from before this offer opened.',
  not_paid:   'No BUN was paid in that transaction.',
  too_small:  'That payment was under the price of a cat.',
}

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
  const [terms,    setTerms]    = useState<Terms>({ live: false })
  const [payHash,  setPayHash]  = useState<`0x${string}` | undefined>()

  /*
   * Which door is being used right now.
   *
   * Needed because 'switching' happens on both paths, so the phase alone cannot
   * say which button should be showing the progress. Without this the claim
   * button announces "Switching chain…" while somebody is paying in BUN.
   */
  const [door, setDoor] = useState<'run' | 'bun' | null>(null)

  /*
   * The page cannot know the price or the toll on its own — both are server
   * settings, so that nothing in a browser can point a payment somewhere else.
   * Until this answers, the BUN option simply is not rendered.
   */
  useEffect(() => {
    let alive = true
    fetch('/api/bun-terms')
      .then(r => r.json())
      .then(t => { if (alive) setTerms(t) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  /*
   * Read on the client only. The server has no idea which run this is, so
   * rendering it during SSR would mismatch — the same reason guestId() is read
   * in an effect over in Cradle.
   */
  useEffect(() => {
    // With the run door off a tag earns nothing, so it is not even read — every
    // piece of run UI below keys off `tag` and stays hidden with it.
    if (!RUN_DOOR) return
    const r = new URLSearchParams(window.location.search).get('r')
    setTag(r && r.length < 8192 ? r : null)
  }, [])

  /*
   * A RANDOM V3 CAT where the emoji was (JP, 2026-09-28). Picked on the client:
   * picking during render would differ between server and browser and React
   * would throw the page away. The box is sized up front so nothing jumps.
   */
  const [heroId, setHeroId] = useState<number | null>(null)
  useEffect(() => { setHeroId(1 + Math.floor(Math.random() * V3_COUNT)) }, [])

  const { data: receipt, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const { data: payReceipt, isSuccess: paid } = useWaitForTransactionReceipt({ hash: payHash })

  /*
   * The payment landed, so now the server can see it.
   *
   * Guarded on phase === 'settling' because authoriseAndMint moves the phase on
   * immediately, and without that guard this effect would fire a second voucher
   * request every time the receipt object changed identity.
   */
  useEffect(() => {
    if (!paid || !payReceipt || phase !== 'settling') return
    authoriseAndMint({ burnTx: payReceipt.transactionHash }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : ''
      setError(/user rejected|denied/i.test(msg) ? 'Cancelled.' : 'Claim failed. Your payment went through — try the claim again.')
      setPhase('error')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, payReceipt, phase])

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

  /*
   * THE HALF BOTH DOORS SHARE.
   *
   * A finished run and a paid toll prove different things, but everything after
   * the proof is identical: ask the server for a voucher, then mint with it.
   * Keeping that in one function is what stops two ways in becoming two subtly
   * different mints.
   */
  const authoriseAndMint = useCallback(async (proof: { tag: string } | { burnTx: string }) => {
    setPhase('authorising')
    const res = await fetch('/api/v3-voucher', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...proof, wallet: address }),
    })
    const data = await res.json()

    if (!res.ok) {
      /*
       * Be specific about the run refusal. "Could not authorise" reads as a bug
       * and people retry it forever; naming the wins tells them what to do about
       * it, which is play again.
       */
      const msg =
        data?.error === 'no_run' && typeof data.wins === 'number'
          ? `That run won ${data.wins} of 5. Three wins earns a cat.`
        : data?.error === 'bad_burn'
          ? BURN_REFUSALS[data?.reason as string] ?? 'That payment could not be verified.'
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
  }, [address, writeContractAsync])

  /** Turn a thrown wallet error into something a person can act on. */
  const explain = (e: unknown) => {
    const msg = e instanceof Error ? e.message : ''
    return /user rejected|denied/i.test(msg) ? 'Cancelled.'
      : /chain|network|switch/i.test(msg)    ? 'Could not switch to Robinhood Chain. Add it in your wallet and try again.'
      : /insufficient|exceeds balance/i.test(msg) ? 'Not enough BUN in that wallet.'
      : 'Claim failed. Try again.'
  }

  const toRobinhood = useCallback(async () => {
    if (chainId !== robinhood.id) {
      setPhase('switching')
      await switchChainAsync({ chainId: robinhood.id })
    }
  }, [chainId, switchChainAsync])

  const claim = useCallback(async () => {
    if (!address || !tag) return
    setError(null)
    setDoor('run')
    try {
      await toRobinhood()
      // The run is verified server-side. Nothing here is trusted to be true.
      await authoriseAndMint({ tag })
    } catch (e: unknown) {
      setError(explain(e))
      setPhase('error')
    }
  }, [address, tag, toRobinhood, authoriseAndMint])

  /*
   * THE OTHER DOOR — one transfer, then wait.
   *
   * The voucher is deliberately NOT requested here. A payment has to be mined
   * before the server can see it at all, so asking now would be refused as an
   * unknown transaction while the BUN had already gone. The effect below fires
   * the request once the receipt lands.
   */
  const payWithBun = useCallback(async () => {
    if (!address || !terms.live) return
    setError(null)
    setDoor('bun')
    try {
      await toRobinhood()
      setPhase('paying')
      // A toll means pay it (the contract splits); none means burn the lot.
      const hash = terms.toll.toLowerCase() === ZERO
        ? await writeContractAsync({
            address: terms.token,
            abi: ERC20_BURN,
            functionName: 'burn',
            args: [BigInt(terms.amountWei)],
            chainId: robinhood.id,
          })
        : await writeContractAsync({
            address: terms.token,
            abi: ERC20_TRANSFER,
            functionName: 'transfer',
            args: [terms.toll, BigInt(terms.amountWei)],
            chainId: robinhood.id,
          })
      setPayHash(hash)
      setPhase('settling')
    } catch (e: unknown) {
      setError(explain(e))
      setPhase('error')
    }
  }, [address, terms, toRobinhood, writeContractAsync])

  const busy = phase === 'switching' || phase === 'paying' || phase === 'settling'
    || phase === 'authorising' || phase === 'minting' || phase === 'confirming'
  const label =
    phase === 'switching'   ? 'Switching chain…'
    : phase === 'paying'      ? 'Confirm the payment…'
    : phase === 'settling'    ? 'Waiting for the payment…'
    : phase === 'authorising' ? (door === 'bun' ? 'Checking your payment…' : 'Checking your run…')
    : phase === 'minting'     ? 'Confirm in your wallet…'
    : phase === 'confirming'  ? 'Minting…'
    : 'Claim your cat'

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.logo}>CLANKER CATS</span>
        <a href="/" style={s.navLink}>← the game</a>
      </div>

      <div style={s.heroBox}>
        {heroId && <img src={`/v3/images/${heroId}.png`} alt={`Clanker Cats V3 #${heroId}`} style={s.heroImg} />}
      </div>
      <div style={s.title}>{RUN_DOOR ? 'Play the game, mint the cat' : 'Clanker Cats V3'}</div>
      <div style={s.subtitle}>{RUN_DOOR ? 'Robinhood Chain · free' : 'Robinhood Chain · for BUN holders'}</div>

      {!V3_DEPLOYED ? (
        <>
          <div style={s.notice}>Not live yet. The cats are made, the contract isn’t deployed.</div>
          <a href="/" style={s.secondaryBtn}>{RUN_DOOR ? 'Play in the meantime' : 'Play the game — it’s free'}</a>
        </>
      ) : !tag && !terms.live ? (
        <>
          {/* No run in the URL and no BUN door open. Say what earns one rather than just refusing. */}
          <div style={s.notice}>
            {RUN_DOOR
              ? 'Finish a gauntlet run first. Three wins out of five earns a cat — all five, without continuing, earns two.'
              : 'Minting opens soon. It takes BUN.'}
          </div>
          <a href="/" style={s.primaryBtn as React.CSSProperties}>{RUN_DOOR ? 'Play the gauntlet' : 'Play the game — it’s free'}</a>
        </>
      ) : phase === 'done' ? (
        <div style={s.successBox}>
          <div style={s.title}>{mintedId ? `#${mintedId} is yours` : 'Claimed'}</div>
          <a href="/" style={s.secondaryBtn}>Back to the game</a>
        </div>
      ) : !isConnected ? (
        <>
          {tag && <div style={s.gateBadge}>RUN VERIFIED</div>}
          <div style={s.notice}>
            {tag
              ? 'Connect a wallet to claim it. Nothing else needs one.'
              : `Connect a wallet to mint a cat for ${terms.live ? terms.amount : ''} BUN.${RUN_DOOR ? ' Playing earns one for nothing.' : ''}`}
          </div>
          {connectors.map(c => (
            <button key={c.uid} style={s.secondaryBtn} onClick={() => connect({ connector: c })}>
              {c.name.toUpperCase()}
            </button>
          ))}
          {!tag && RUN_DOOR && <a href="/" style={s.secondaryBtn}>Play the gauntlet instead</a>}
        </>
      ) : (
        <>
          {tag && <div style={s.gateBadge}>RUN VERIFIED</div>}

          {tag && (
            <button style={{ ...s.primaryBtn, opacity: busy ? 0.6 : 1 }} onClick={claim} disabled={busy}>
              {door === 'run' && busy ? label : 'Claim your cat'}
            </button>
          )}

          {/*
            * The BUN door. Secondary when a run already earned the cat, because
            * paying for something you have already won is the wrong default.
            */}
          {terms.live && (
            <>
              <button
                style={{ ...(tag ? s.secondaryBtn : s.primaryBtn), opacity: busy ? 0.6 : 1 }}
                onClick={payWithBun}
                disabled={busy}
              >
                {door === 'bun' && busy
                  ? label
                  : terms.toll.toLowerCase() === ZERO ? `Burn ${terms.amount} BUN` : `Pay ${terms.amount} BUN`}
              </button>
              {/* Where the money goes, said before it is spent rather than after. */}
              <div style={s.splitNote}>
                {terms.toll.toLowerCase() === ZERO ? 'All of it is burned.' : '30% agents · 30% creator · 40% burned'}
              </div>
            </>
          )}

          {!tag && RUN_DOOR && <a href="/" style={s.secondaryBtn}>Play the gauntlet instead</a>}
        </>
      )}

      {error && <div style={s.error}>{error}</div>}

      <div style={s.footnote}>{RUN_DOOR ? 'One per wallet. The run is checked on the server.' : 'One per wallet.'}</div>
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
  heroImg:      { width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' },
  title:        { fontSize: 24, fontWeight: 'bold' },
  subtitle:     { fontSize: 13, color: '#666', marginBottom: 8 },
  primaryBtn:   { width: '100%', maxWidth: 320, padding: '14px 24px', borderRadius: 12, background: '#7c3aed', color: 'white', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 'bold', textAlign: 'center', textDecoration: 'none' },
  secondaryBtn: { width: '100%', maxWidth: 320, padding: '12px 24px', borderRadius: 12, background: '#1e1e2e', color: '#ccc', border: 'none', cursor: 'pointer', fontSize: 14, textAlign: 'center', textDecoration: 'none' },
  successBox:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', maxWidth: 320 },
  notice:       { fontSize: 13, color: '#666', textAlign: 'center', padding: '12px 0', maxWidth: 320 },
  gateBadge:    { fontSize: 11, color: '#7c3aed', border: '1px solid #2a2a4e', background: '#12122a', padding: '5px 12px', borderRadius: 20, letterSpacing: 0.4 },
  error:        { fontSize: 12, color: '#ef4444', textAlign: 'center', maxWidth: 320 },
  splitNote:    { fontSize: 11, color: '#555', textAlign: 'center', letterSpacing: 0.3 },
  footnote:     { fontSize: 11, color: '#333', marginTop: 'auto', paddingTop: 24 },
}
