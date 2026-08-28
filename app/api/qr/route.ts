import { NextRequest, NextResponse } from 'next/server'
import qr from 'qrcode-generator'

/**
 * A QR CODE FOR A CAT, OR FOR A PAGE OF THIS APP.
 *
 *   /api/qr?vs=428193   → the deep link that fills the FIGHT A FRIEND box
 *   /api/qr?path=/mint  → any page of this app
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * The codes were already there — ?vs=428193 fills the box and the other person
 * presses FIGHT. What was missing is a way to hand somebody a code without them
 * typing it, and that is the whole difference between a sticker that works and a
 * sticker that gets walked past. Nobody types a URL off a wall.
 *
 * ── IT WILL ONLY ENCODE THIS APP ─────────────────────────────────────────────
 *
 * `?d=<anything>` was the obvious shape and it is a bad idea: it turns this into
 * a QR generator hosted on our domain that points anywhere. Someone could hand
 * out a code that looks like it came from us and lands on their own page, and the
 * only thing linking it to us — the domain in the URL that produced it — would be
 * genuinely ours.
 *
 * So it takes a CODE or a PATH, and builds the URL itself. There is no input that
 * can point it at another host.
 *
 * ── SVG, NOT PNG ─────────────────────────────────────────────────────────────
 *
 * These get printed. A sticker is a physical object at a size nobody has decided
 * yet, and vector art is the same code at any of them. A PNG would have to be
 * generated at a guess and regenerated when the guess was wrong.
 *
 * ── ERROR CORRECTION ─────────────────────────────────────────────────────────
 *
 * Level Q — a quarter of the code can be unreadable and it still scans. M (15%)
 * is the usual default and is right for a screen; a sticker on a wall in New York
 * gets rained on, scuffed and drawn over, and the extra size costs nothing at
 * this data length.
 */

export const dynamic = 'force-dynamic'

/** The quiet zone the spec requires. Without it, readers fail on busy backgrounds. */
const MARGIN = 4

const origin = () =>
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://ccat-viewer.vercel.app'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const vs = q.get('vs')
  const path = q.get('path')

  let target: string
  if (vs) {
    // The same range guestId() mints, so a token id cannot be dressed as a code.
    const n = Number(vs)
    if (!Number.isInteger(n) || n < 100000 || n > 999999)
      return NextResponse.json({ error: 'a cat code is six digits' }, { status: 400 })
    target = `${origin()}/?vs=${n}`
  } else if (path !== null) {
    /*
     * A PATH, NOT A URL. It must start with a single slash — "//evil.com" is a
     * protocol-relative URL and would take the reader off this host entirely,
     * which is exactly what this route refuses to do.
     */
    if (!/^\/[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]{0,120}$/.test(path) || path.startsWith('//'))
      return NextResponse.json({ error: 'path must be a plain path on this app' }, { status: 400 })
    target = origin() + path
  } else {
    return NextResponse.json({ error: 'pass ?vs= a cat code, or ?path=' }, { status: 400 })
  }

  /*
   * Type 0 lets the encoder pick the smallest version that fits, so a short link
   * gets a coarse code with big modules — which is what scans from a distance.
   */
  const code = qr(0, 'Q')
  code.addData(target)
  code.make()

  const n = code.getModuleCount()
  const size = n + MARGIN * 2

  /*
   * One <path> of rectangles rather than one <rect> per module. A code this size
   * is ~700 modules, and 700 elements is a heavier file for every reader and
   * printer to chew on for no gain.
   */
  let d = ''
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (code.isDark(r, c)) d += `M${c + MARGIN} ${r + MARGIN}h1v1h-1z`

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<path d="${d}" fill="#000"/></svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      // The code for a given input never changes, so it can be cached hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
