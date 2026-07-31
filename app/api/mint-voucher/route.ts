import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { createClient } from '@farcaster/quick-auth'
import { publicClient } from '@/lib/collection'
import { V2, V2_ABI } from '@/lib/mint'

/**
 * Issues an EIP-712 voucher authorising one mint for one Farcaster ID.
 *
 * The FID comes from a Quick Auth token verified against Farcaster's JWKS — it is
 * never taken from the request body, so a caller can't mint on behalf of another
 * account. The contract independently enforces one-mint-per-FID, so a leaked or
 * replayed voucher still can't mint twice.
 */

const quickAuth = createClient()

const DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'ccat-viewer.vercel.app'
const TTL    = 15 * 60 // voucher lifetime, seconds

/**
 * Minimum Neynar user score, 0–1. Set MIN_NEYNAR_SCORE to change it without a
 * redeploy; set it to 0 to disable the gate entirely if the mint stalls.
 *
 * For reference, Neynar's own suggested starting point is 0.55. Higher numbers
 * cut deep: only a low five-figure count of accounts network-wide clear 0.7.
 */
const MIN_SCORE = Number(process.env.MIN_NEYNAR_SCORE ?? '0.75')

/**
 * Neynar's quality score for an account, 0–1. Lives at
 * `experimental.neynar_user_score`; `score` is checked too in case it graduates
 * out of experimental.
 *
 * Returns null when the score can't be determined — the caller decides what to
 * do with that rather than a lookup failure silently reading as "eligible".
 */
async function neynarScore(fid: number): Promise<number | null> {
  const key = process.env.NEYNAR_API_KEY
  if (!key) return null

  try {
    const res = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
      headers: { api_key: key, 'x-api-key': key },
    })
    if (!res.ok) return null

    const user = (await res.json())?.users?.[0]
    const score = user?.experimental?.neynar_user_score ?? user?.score
    return typeof score === 'number' ? score : null
  } catch {
    return null
  }
}

/**
 * Current mint phase, so the UI can say which one it's in rather than letting
 * people discover the gate by being refused. Nothing here is secret.
 */
export async function GET() {
  const signer = process.env.MINT_SIGNER_KEY

  return NextResponse.json(
    {
      minScore: MIN_SCORE,
      phase: MIN_SCORE > 0 ? 'premint' : 'public',
      // Presence and shape only — never the values. Launch-day diagnostics:
      // tells apart "not set", "set but empty", and "set but not a key".
      config: {
        contract:   V2,
        signerKey:  signer ? (/^0x[0-9a-fA-F]{64}$/.test(signer) ? 'ok' : `set but malformed (len ${signer.length})`) : 'missing',
        neynarKey:  process.env.NEYNAR_API_KEY ? 'ok' : 'missing',
        appDomain:  DOMAIN,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  if (!V2) return NextResponse.json({ error: 'mint not configured' }, { status: 503 })

  const key = process.env.MINT_SIGNER_KEY
  if (!key) return NextResponse.json({ error: 'signer not configured' }, { status: 503 })

  // ── authenticate the Farcaster user ────────────────────────────────────────
  const auth  = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return NextResponse.json({ error: 'missing auth token' }, { status: 401 })

  let fid: number
  try {
    const payload = await quickAuth.verifyJwt({ token, domain: DOMAIN })
    fid = payload.sub
  } catch {
    return NextResponse.json({ error: 'invalid auth token' }, { status: 401 })
  }

  // ── quality gate ───────────────────────────────────────────────────────────
  // Checked against the Quick Auth fid, so it can't be spoofed by the client.
  if (MIN_SCORE > 0) {
    const score = await neynarScore(fid)

    if (score === null)
      // Fail closed: an outage or a missing key must not become an open door.
      return NextResponse.json({ error: 'score_unavailable' }, { status: 503 })

    if (score < MIN_SCORE)
      return NextResponse.json(
        { error: 'low_score', score: Number(score.toFixed(2)), required: MIN_SCORE },
        { status: 403 },
      )
  }

  // ── the wallet that will call mint() ───────────────────────────────────────
  const body = await req.json().catch(() => ({}))
  const to   = body?.address
  if (!to || !isAddress(to))
    return NextResponse.json({ error: 'invalid address' }, { status: 400 })

  // ── check mint state on-chain before spending a signature ──────────────────
  try {
    const [open, minted, supply, max] = await Promise.all([
      publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'mintOpen' }),
      publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'fidMinted', args: [BigInt(fid)] }),
      publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'totalSupply' }),
      publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'maxSupply' }),
    ])

    if (!open)                return NextResponse.json({ error: 'mint_closed' },   { status: 403 })
    if (minted)               return NextResponse.json({ error: 'already_minted' }, { status: 409 })
    if (supply >= max)        return NextResponse.json({ error: 'sold_out' },      { status: 410 })
  } catch {
    return NextResponse.json({ error: 'chain read failed' }, { status: 502 })
  }

  // ── sign the voucher ───────────────────────────────────────────────────────
  const account  = privateKeyToAccount(key as `0x${string}`)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + TTL)

  const signature = await account.signTypedData({
    domain: {
      name:              'ClankerCatsV2',
      version:           '1',
      chainId:           base.id,
      verifyingContract: V2,
    },
    types: {
      Mint: [
        { name: 'to',       type: 'address' },
        { name: 'fid',      type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Mint',
    message: { to, fid: BigInt(fid), deadline },
  })

  return NextResponse.json(
    { fid, deadline: deadline.toString(), signature },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
