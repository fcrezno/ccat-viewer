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
    ;[openNow, already, supply, cap] = await Promise.all([
      client.readContract({ address: V3, abi: V3_ABI, functionName: 'mintOpen' }),
      client.readContract({ address: V3, abi: V3_ABI, functionName: 'minted', args: [to] }),
      client.readContract({ address: V3, abi: V3_ABI, functionName: 'totalSupply' }),
      client.readContract({ address: V3, abi: V3_ABI, functionName: 'maxSupply' }),
    ]) as [boolean, boolean, bigint, bigint]
  } catch {
    /*
     * FAIL CLOSED. Robinhood's public RPC is rate-limited and its own docs say it
     * is not for production, so a read WILL fail sometimes. Signing anyway would
     * hand out vouchers during exactly the window where we cannot see whether a
     * wallet already minted.
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
