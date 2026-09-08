import { NextRequest, NextResponse } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'
import { isAddress, getAddress } from 'viem'
import { clientForChain, robinhood } from '@/lib/chains'
import { V3, V3_ABI, V3_DEPLOYED } from '@/lib/mintv3'
import { readTags, catsFor, winsFor } from '@/lib/season'

/**
 * POST /api/v3-voucher  { tag, wallet }  →  { deadline, signature }
 *
 * PLAY THE GAME, MINT THE CAT. This is the whole rule, and it is the one thing
 * that genuinely differs from V2.
 *
 * ── WHY THE RUN TAG IS THE PROOF ─────────────────────────────────────────────
 *
 * The gauntlet already hands back a SIGNED tag when a run ends, because a run
 * decides a public ranking and an unsigned result would just be a number the
 * player typed. That signature is made with a server key the client never sees,
 * over a run whose seed the SERVER picked and revealed one round at a time.
 *
 * So the proof already exists and does not need inventing. Nothing here trusts a
 * claim of having played; it verifies a signature over what was actually played.
 *
 * ── THE THRESHOLD IS ALREADY WRITTEN DOWN ────────────────────────────────────
 *
 * `catsFor(run)` in lib/season.ts is the reward rule the game already uses:
 * two cats for taking all five without continuing, one for three wins or more,
 * none below that. Its own comment says "the rule lives with the tag that proves
 * it" — so this endpoint asks that function rather than inventing a second
 * threshold that could drift away from the one players are shown.
 *
 * Requiring >= 1 means the gate is THREE WINS, not five. Five would be a nicer
 * story and would let almost nobody mint.
 *
 * ── WHAT STOPS FARMING ───────────────────────────────────────────────────────
 *
 * Not much, honestly, and that is deliberate — see ClankerCatsV3.sol. V2 gated
 * on a Farcaster id, so farming needed real accounts. Robinhood Chain has no
 * Farcaster, so this gates on the wallet, and wallets are free.
 *
 * What it costs instead is TIME: five server-paced rounds that cannot be
 * fast-forwarded, per wallet, with at least three of them won. Plus gas, once
 * Robinhood Chain stops subsidising it.
 *
 * Replay is handled on chain rather than here. `minted(wallet)` is permanent, so
 * the same tag used twice produces a voucher the contract refuses — which is the
 * spent-ticket store lib/ticket.ts says is needed before a run pays out.
 */

/** Long enough to confirm in a wallet, short enough that a leaked voucher dies. */
/**
 * Three tries before giving up on a read.
 *
 * Robinhood's public RPC throttles rather than fails, so the difference between
 * a rejection and a success is often just a few hundred milliseconds. The same
 * shape the Neynar gate uses in the V2 voucher, and for the same reason.
 */
async function read<T>(go: () => Promise<T>): Promise<T> {
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await go() } catch (e) {
      last = e
      if (attempt < 2) await new Promise(r => setTimeout(r, 250 * (attempt + 1)))
    }
  }
  throw last
}

/**
 * A read that does not have to happen again for a while.
 *
 * Module scope, so it lives as long as the serverless instance does and is
 * naturally per-region. That is the right granularity here: it is a cache of
 * something the CHAIN says, not of anything about a person.
 */
const held = new Map<string, { at: number; value: unknown }>()

async function cached<T>(key: string, ttlMs: number, go: () => Promise<T>): Promise<T> {
  const had = held.get(key)
  if (had && Date.now() - had.at < ttlMs) return had.value as T
  const value = await read(go)
  held.set(key, { at: Date.now(), value })
  return value
}

/** How long `mintOpen` may be stale. Closing a mint takes this long to bite. */
const OPEN_TTL = 5_000

const TTL = 10 * 60

export async function POST(req: NextRequest) {
  if (!V3_DEPLOYED)
    return NextResponse.json({ error: 'not_deployed' }, { status: 503 })

  const key = process.env.MINT_SIGNER_KEY?.trim()
  if (!key) {
    // Loud on the server, vague to the caller: a missing key is our problem.
    console.error('[v3-voucher] MINT_SIGNER_KEY is not set')
    return NextResponse.json({ error: 'signer_unavailable' }, { status: 503 })
  }

  let body: { tag?: unknown; wallet?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  // ── the wallet ─────────────────────────────────────────────────────────────
  const raw = typeof body.wallet === 'string' ? body.wallet.trim() : ''
  if (!isAddress(raw)) return NextResponse.json({ error: 'bad_wallet' }, { status: 400 })
  const to = getAddress(raw)   // checksummed, so the signature covers the canonical form

  // ── the run ────────────────────────────────────────────────────────────────
  const tag = typeof body.tag === 'string' ? body.tag : ''
  if (!tag || tag.length > 8192)
    return NextResponse.json({ error: 'bad_run' }, { status: 400 })

  /*
   * readTags VERIFIES. It drops anything unsigned or altered, and it also checks
   * that the season in the readable part agrees with the signed one — so a tag
   * cannot display one thing while its signature says another.
   */
  const runs = readTags(tag)
  if (!runs.length) return NextResponse.json({ error: 'bad_run' }, { status: 400 })

  const run = runs[0]
  const earned = catsFor(run)
  if (earned < 1) {
    return NextResponse.json(
      { error: 'no_run', wins: winsFor(run), needed: 3 },
      { status: 403 },
    )
  }

  // ── the chain ──────────────────────────────────────────────────────────────
  const client = clientForChain(robinhood)
  let openNow: boolean, already: boolean, supply: bigint, cap: bigint

  try {
    /*
     * FOUR READS PER ATTEMPT WAS TOO MANY FOR THIS ENDPOINT.
     *
     * Every one of these checks is ALSO enforced by the contract — mint() reverts
     * on MintClosed, SoldOut and AlreadyMinted. They are here to save somebody a
     * failed transaction, not to protect the supply. That is what makes caching
     * the two that cannot go stale a free win rather than a loosened guard.
     *
     *   maxSupply   `immutable` in the contract. Read once, ever.
     *   mintOpen    owner-only, and flipped roughly twice in a collection's life.
     *   totalSupply moves with every mint — never cached, it is the sold-out edge.
     *   minted[to]  per wallet and the whole point — never cached.
     *
     * Under a crowd that is four requests per person becoming two, against an
     * endpoint Robinhood's own docs say is not for production.
     */
    ;[openNow, already, supply, cap] = await Promise.all([
      cached('mintOpen', OPEN_TTL, () =>
        client.readContract({ address: V3, abi: V3_ABI, functionName: 'mintOpen' }) as Promise<boolean>),
      read(() =>
        client.readContract({ address: V3, abi: V3_ABI, functionName: 'minted', args: [to] }) as Promise<boolean>),
      read(() =>
        client.readContract({ address: V3, abi: V3_ABI, functionName: 'totalSupply' }) as Promise<bigint>),
      cached('maxSupply', Infinity, () =>
        client.readContract({ address: V3, abi: V3_ABI, functionName: 'maxSupply' }) as Promise<bigint>),
    ])
  } catch {
    /*
     * STILL FAILS CLOSED, after three tries.
     *
     * The retry is the fix for a throttled endpoint; the refusal is the fix for
     * a broken one. Signing without having read the chain would hand somebody a
     * voucher that reverts and costs them gas — a worse answer than "try again",
     * because it looks like the game took something from them.
     */
    return NextResponse.json({ error: 'chain_read_failed' }, { status: 502 })
  }

  if (!openNow)        return NextResponse.json({ error: 'mint_closed' },    { status: 403 })
  if (already)         return NextResponse.json({ error: 'already_minted' }, { status: 403 })
  if (supply >= cap)   return NextResponse.json({ error: 'sold_out' },       { status: 403 })

  // ── sign ───────────────────────────────────────────────────────────────────
  const account  = privateKeyToAccount(key as `0x${string}`)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + TTL)

  const signature = await account.signTypedData({
    domain: {
      name:              'ClankerCatsV3',
      version:           '1',
      chainId:           robinhood.id,
      verifyingContract: V3,
    },
    types: {
      Mint: [
        { name: 'to',       type: 'address' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Mint',
    message: { to, deadline },
  })

  return NextResponse.json(
    { deadline: deadline.toString(), signature, earned },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
