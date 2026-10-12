import { NextRequest, NextResponse } from 'next/server'
import { drawCard } from '@/lib/catCard'
import { ownedCat } from '@/lib/arena'
import { fetchMeta, getCollection, parseUid } from '@/lib/collection'

/**
 * GET /api/card?…  →  the cat card, a 1200x630 PNG (lib/catCard).
 *
 *   u   a real cat's uid (v2:146)        — its stats and picture are looked up here
 *   g   a guest cat's six-digit code     — the same
 *   s   a demo fight's seed              — picture only; a demo cat has no numbers
 *   n   the name the player gave it      — the names log is on their device
 *   w l wins and losses                  — the record is on their device too
 *   o   the other cat, t the turf, v 1 if won
 *
 * The record and the name come from the player's own device (there is no
 * database), so the card shows what their game says. The NUMBERS and the PICTURE
 * are never taken from the link: they are rebuilt here from the cat itself.
 */
export const runtime = 'nodejs'

const clean = (s: string | null, max: number) =>
  (s ?? '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
const count = (s: string | null) => s === null ? undefined : Math.max(0, Math.min(99999, Math.floor(Number(s) || 0)))

/** ownedCat's ranges (lib/arena), onto 0.2..1 so the shortest bar is still a bar. */
const norm = (v: number, lo: number, hi: number) => 0.2 + 0.8 * Math.max(0, Math.min(1, (v - lo) / (hi - lo)))

async function picture(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const origin = req.nextUrl.origin
  const uid = clean(q.get('u'), 24)
  const guest = /^\d{6}$/.test(q.get('g') ?? '') ? q.get('g')! : null
  const seed = /^\d{1,10}$/.test(q.get('s') ?? '') ? q.get('s')! : null

  let artUrl: string | null = null
  let id: string | null = null
  let fallbackName = 'DEMO CAT'
  if (uid && /^[a-z0-9]+:\d{1,6}$|^\d{1,6}$/i.test(uid)) {
    const p = parseUid(uid)
    id = p.id
    fallbackName = `#${p.id}`
    const meta = await fetchMeta(getCollection(p.collection), p.id)
    if (meta?.image) artUrl = meta.image.startsWith('/') ? origin + meta.image : meta.image
  } else if (guest) {
    id = guest
    artUrl = `${origin}/api/cat-art?seed=${guest}`
  } else if (seed) {
    artUrl = `${origin}/api/cat-art?seed=${seed}`
  }
  if (artUrl && !/^https:\/\//.test(artUrl) && !artUrl.startsWith(origin)) artUrl = null

  const cat = id ? ownedCat(id, '') : null
  const foe = clean(q.get('o'), 32)
  const turf = clean(q.get('t'), 24)
  const won = q.get('v') === '1'

  const png = await drawCard({
    name: clean(q.get('n'), 32) || fallbackName,
    type: cat?.type,
    wins: count(q.get('w')),
    losses: count(q.get('l')),
    won,
    line: foe ? (won ? `BEAT ${foe}` : `FELL TO ${foe}`) + (turf ? ` IN ${turf}` : '') : undefined,
    stats: cat ? {
      hp: norm(cat.maxHp, 100, 145),
      atk: norm(cat.atk, 50, 85),
      def: norm(cat.def, 45, 80),
      spd: norm(cat.spd, 45, 90),
    } : undefined,
    art: artUrl ? await picture(artUrl) : null,
  })

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // The same link is always the same card: cache it hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
