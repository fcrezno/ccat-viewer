import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { createClient } from '@farcaster/quick-auth'
import { publicClient } from '@/lib/collection'
import { V2, V2_ABI } from '@/lib/mint'
import { bonusAllowance, bonusFid } from '@/lib/bonus'

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
 * Minimum Neynar user score, 0–1. Zero disables the gate entirely.
 *
 * The premint ran at 0.75 — established accounts only, to keep bots out of the
 * early window. Now 0.5: still filters the obvious throwaway accounts, but opens
 * it to genuine smaller ones. Neynar's own suggested starting point is 0.55.
 *
 * One-per-FID and the 1111 cap are unaffected — both are enforced on chain.
 * MIN_NEYNAR_SCORE overrides this without a code change.
 */
const MIN_SCORE = Number(process.env.MIN_NEYNAR_SCORE ?? '0.5')

/**
 * The signer key, normalised.
 *
 * Pasting a private key into a dashboard drops the `0x` prefix often enough
 * that requiring it is a needless failure mode — and the failure is opaque,
 * since privateKeyToAccount throws at request time rather than at deploy.
 * Accept either form, and reject anything that isn't 32 bytes of hex.
 */
function signerKey(): `0x${string}` | null {
  const raw = process.env.MINT_SIGNER_KEY?.trim()
  if (!raw) return null
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw
  return /^[0-9a-fA-F]{64}$/.test(hex) ? (`0x${hex}` as `0x${string}`) : null
}

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

  // The gate fails closed, so a single flaky response would block a legitimate
  // minter. Retry briefly before giving up.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
        headers: { api_key: key, 'x-api-key': key },
      })

      if (res.ok) {
        const user = (await res.json())?.users?.[0]
        const score = user?.experimental?.neynar_user_score ?? user?.score
        if (typeof score === 'number') return score
        // A real user with no score yet — brand new accounts have none. Treat
        // that as zero rather than an outage, so the refusal names the reason.
        if (user) return 0
        return null
      }

      // 4xx other than rate limiting won't succeed on a retry.
      if (res.status !== 429 && res.status < 500) return null
    } catch {
      // network blip — fall through to retry
    }
    if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
  }
  return null
}

/**
 * Current mint phase, so the UI can say which one it's in rather than letting
 * people discover the gate by being refused. Nothing here is secret.
 */
export async function GET() {
  const raw = process.env.MINT_SIGNER_KEY
  const key = signerKey()

  // Derived address is public — it's already readable on-chain via signer().
  // Comparing the two catches the failure where a valid-looking key belongs to
  // the wrong wallet, which would otherwise revert every mint with BadSignature.
  let signerAddress: string | null = null
  let matchesChain: boolean | null = null

  if (key) {
    try {
      signerAddress = privateKeyToAccount(key).address
      const onChain = await publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'signer' })
      matchesChain = String(onChain).toLowerCase() === signerAddress.toLowerCase()
    } catch {
      matchesChain = null
    }
  }

  return NextResponse.json(
    {
      minScore: MIN_SCORE,
      phase: MIN_SCORE > 0 ? 'premint' : 'public',
      // Presence and shape only — never the key itself.
      config: {
        contract:      V2,
        signerKey:     !raw ? 'missing' : key ? 'ok' : `set but malformed (len ${raw.length})`,
        signerAddress,
        matchesChain,
        neynarKey:     process.env.NEYNAR_API_KEY ? 'ok' : 'missing',
        appDomain:     DOMAIN,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  if (!V2) return NextResponse.json({ error: 'mint not configured' }, { status: 503 })

  const key = signerKey()
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
  // mintFid is what the voucher is signed for. Normally the real fid; for someone
  // with an unused bonus it becomes a derived fid so the contract's one-per-fid
  // rule doesn't block the extra.
  let mintFid = BigInt(fid)

  try {
    const [open, minted, supply, max] = await Promise.all([
      publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'mintOpen' }),
      publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'fidMinted', args: [BigInt(fid)] }),
      publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'totalSupply' }),
      publicClient.readContract({ address: V2, abi: V2_ABI, functionName: 'maxSupply' }),
    ])

    if (!open)         return NextResponse.json({ error: 'mint_closed' }, { status: 403 })
    if (supply >= max) return NextResponse.json({ error: 'sold_out' },    { status: 410 })

    if (minted) {
      // Already used their normal mint — fall through to a bonus slot if they
      // earned one by sharing.
      const allowance = bonusAllowance(fid)
      let granted: bigint | null = null

      for (let slot = 0; slot < allowance; slot++) {
        const candidate = bonusFid(fid, slot)
        const used = await publicClient.readContract({
          address: V2, abi: V2_ABI, functionName: 'fidMinted', args: [candidate],
        })
        if (!used) { granted = candidate; break }
      }

      if (!granted) return NextResponse.json({ error: 'already_minted' }, { status: 409 })
      mintFid = granted
    }
  } catch {
    return NextResponse.json({ error: 'chain read failed' }, { status: 502 })
  }

  // ── sign the voucher ───────────────────────────────────────────────────────
  const account  = privateKeyToAccount(key)
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
    message: { to, fid: mintFid, deadline },
  })

  return NextResponse.json(
    { fid: mintFid.toString(), deadline: deadline.toString(), signature },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
