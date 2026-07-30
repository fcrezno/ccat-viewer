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
