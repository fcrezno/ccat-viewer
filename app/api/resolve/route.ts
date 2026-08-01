import { NextRequest, NextResponse } from 'next/server'

/**
 * Resolves a Farcaster handle to an address, so cats can be sent to @someone
 * rather than a pasted 0x string. Nobody has their friend's address to hand.
 *
 * GET /api/resolve?handle=crezno
 *   → { username, address, pfp, verified }
 *
 * Prefers a verified address over the custody address: custody wallets are often
 * inaccessible to the user in practice, so sending there can strand the cat.
 * `verified: false` tells the UI to warn rather than silently do something odd.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('handle')?.trim().replace(/^@/, '')

  if (!raw || !/^[a-z0-9][a-z0-9._-]{0,32}$/i.test(raw))
    return NextResponse.json({ error: 'invalid handle' }, { status: 400 })

  const key = process.env.NEYNAR_API_KEY
  if (!key) return NextResponse.json({ error: 'lookup unavailable' }, { status: 503 })

  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(raw)}`,
      { headers: { api_key: key, 'x-api-key': key }, cache: 'no-store' },
    )

    // The handle is regex-validated above, so any 4xx from Neynar means the user
    // doesn't exist — not a malformed request. Neynar answers a missing username
    // with 400 rather than 404, and reporting that as "lookup failed" sends
    // people chasing an outage when they've simply mistyped a name.
    if (res.status >= 400 && res.status < 500)
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (!res.ok)
      return NextResponse.json({ error: 'lookup failed' }, { status: 502 })

    const user = (await res.json())?.user
    const verified = user?.verified_addresses?.eth_addresses?.[0]
    const address  = verified ?? user?.custody_address

    if (!address) return NextResponse.json({ error: 'no_address' }, { status: 404 })

    return NextResponse.json(
      {
        username: user?.username ?? raw,
        address,
        pfp:      user?.pfp_url ?? null,
        verified: Boolean(verified),
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    )
  } catch {
    return NextResponse.json({ error: 'lookup failed' }, { status: 502 })
  }
}
