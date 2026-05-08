import { NextResponse } from 'next/server'

export const revalidate = 60

type Entry = {
  fid:      number
  username: string
  pfp:      string
  zone:     number
  kills:    number
  score:    number
  castHash: string
}

export async function GET() {
  const key = process.env.NEYNAR_API_KEY
  if (!key) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const res = await fetch(
    'https://api.neynar.com/v2/farcaster/cast/search?q=%23IdleClank&limit=100',
    { headers: { api_key: key }, next: { revalidate: 60 } }
  )
  if (!res.ok) return NextResponse.json({ error: 'neynar error' }, { status: 502 })

  const data = await res.json()
  const casts = data.result?.casts ?? []

  const seen = new Set<number>()
  const entries: Entry[] = []

  for (const cast of casts) {
    const text = cast.text ?? ''
    const zoneMatch  = text.match(/Zone\s+(\d+)/i)
    const killsMatch = text.match(/(\d+)\s+kills/i)
    if (!zoneMatch || !killsMatch) continue

    const zone  = parseInt(zoneMatch[1])
    const kills = parseInt(killsMatch[1])
    const fid   = cast.author?.fid
    if (!fid || seen.has(fid)) continue
    seen.add(fid)

    entries.push({
      fid,
      username: cast.author?.username ?? `fid:${fid}`,
      pfp:      cast.author?.pfp_url ?? '',
      zone,
      kills,
      score:    kills * 10 + (zone - 1) * 100,
      castHash: cast.hash,
    })
  }

  entries.sort((a, b) => b.score - a.score)
  return NextResponse.json(entries.slice(0, 10))
}
