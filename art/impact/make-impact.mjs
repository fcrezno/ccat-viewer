/**
 * The impact-effect template, its guide, and a rough of the set.
 *
 *   node art/impact/make-impact.mjs
 *
 * ── WHAT AN IMPACT EFFECT IS FOR ─────────────────────────────────────────────
 *
 * From the preview feedback: "clearer hits, stronger impact". The fight already
 * has the two halves that carry a blow — the attacker lunges (cradle-lunge) and
 * the defender shakes (cradle-recoil) — but nothing is drawn AT the point of
 * contact, so the eye has to infer the hit from two pieces of motion.
 *
 * A hit effect is the third half: a bright shape, drawn over the struck cat, that
 * lives for a fifth of a second. It is the oldest trick in the genre and it is
 * why an 8-bit RPG can make a menu command feel like a punch.
 *
 * ── WHY THREE ROWS ───────────────────────────────────────────────────────────
 *
 * The fight ALREADY grades every blow as weak, hit or crit — cradle-recoil-weak
 * shakes 1px, -hit 3px, -crit 6px with a drop. The effect set mirrors those three
 * exactly, so the drawn impact and the shake always agree about how hard it was.
 * A big burst over a 1px shake would read as a bug.
 *
 * ── THE TIMING IS NOT FREE, IT IS FITTED ─────────────────────────────────────
 *
 * The recoil runs 0.6/speed seconds. The impact must START on the same frame and
 * FINISH well before it: the flash is the contact, the shake is the aftermath. So
 * five frames at 0.04/speed each = 0.2/speed, exactly a third of the recoil.
 *
 * Play it with steps(5), never a smooth animation. A cross-fade between two pixel
 * frames invents grey pixels that are in neither, which is the one thing that
 * makes pixel art look cheap.
 *
 * ── WHY THIS IS DRAWN AND NOT SOURCED ────────────────────────────────────────
 *
 * JP asked about a Game Boy RPG's hit effects. Those sprites belong to their
 * publisher and are not ours to ship. Nothing is lost: what makes them work is
 * the SHAPE GRAMMAR below, which is common to the whole era and is written out
 * here rather than copied.
 *
 *   GROW, PEAK, BREAK. A hit effect is never a fade. It appears small and solid,
 *   reaches its widest on frame two, then BREAKS INTO PIECES rather than dimming.
 *   Breaking reads as force; dimming reads as a light being turned down.
 *
 *   IT LEAVES THE BODY. Every frame is wider than the last, so the shape moves
 *   outward past the cat's outline. An effect that stays inside the silhouette
 *   looks like part of the cat.
 *
 *   IT IS THE BRIGHTEST THING ON SCREEN, for two frames only. Contrast sells the
 *   hit, and it has to end before the eye adjusts to it.
 *
 *   NOTHING STAYS SYMMETRICAL. Frame one may be a clean star; by frame four the
 *   pieces must be uneven, or it reads as a logo rather than an impact.
 */
import sharp from 'sharp'

const S = 48, FRAMES = 5, OUT = 'art/impact'
const ROWS = ['weak', 'hit', 'crit']
const W = S * FRAMES, H = S * ROWS.length

/** Two shades only, the same rule the mode icons follow: it sits on a dark card. */
const INK = { '#': '#f8f8f8', '+': '#a8a8a8' }

const svg = (w, h, body) =>
  Buffer.from('<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' + body + '</svg>')

// ── a tiny pixel canvas ─────────────────────────────────────────────────────
const grid = () => Array.from({ length: S }, () => new Array(S).fill(null))
const put = (g, x, y, c) => {
  const xi = Math.round(x), yi = Math.round(y)
  if (xi >= 0 && xi < S && yi >= 0 && yi < S) g[yi][xi] = c
}
const C = (S - 1) / 2

/** Rays from the centre, between two radii. `thick` widens them near the core. */
function rays(g, count, r0, r1, ink, turn = 0, thick = 0, gap = 1) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + turn
    const dx = Math.cos(a), dy = Math.sin(a)
    for (let r = r0; r <= r1; r += gap) {
      put(g, C + dx * r, C + dy * r, ink)
      // Thickness falls off with distance, so a ray tapers to a point.
      const t = Math.max(0, thick - Math.floor(r / 6))
      for (let k = 1; k <= t; k++) {
        put(g, C + dx * r - dy * k, C + dy * r + dx * k, ink)
        put(g, C + dx * r + dy * k, C + dy * r - dx * k, ink)
      }
    }
  }
}

/**
 * An arc between two angles.
 *
 * This was one ring with pixels SKIPPED to fake a break, and the skipping landed
 * on the axes, so the leftovers read as a crosshair — a piece of UI, not an
 * impact. Drawing the arcs you want is both simpler and correct.
 */
function arc(g, r, ink, a0, a1) {
  const steps = Math.max(8, Math.round((a1 - a0) * r * 1.6))
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    put(g, C + Math.cos(a) * r, C + Math.sin(a) * r, ink)
  }
}

/**
 * A broken-off piece, at a polar position.
 *
 * Late frames were single scattered pixels, which read as dirt on the screen
 * rather than as something coming apart. A fragment has to have SIZE to read as
 * a piece of the thing that just broke.
 */
function blob(g, r, angle, half, ink) {
  const x = C + Math.cos(angle) * r, y = C + Math.sin(angle) * r
  for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++)
    put(g, x + dx, y + dy, ink)
}

/** A slash: a thick stroke running down-left to up-right across the body. */
function slash(g, from, to, half, ink) {
  const len = Math.round(to - from)
  for (let i = 0; i <= len; i++) {
    const t = from + i
    const x = t, y = S - 1 - t
    for (let k = -half; k <= half; k++) put(g, x + k, y + k * 0.2, ink)
  }
}

const solid = (g, r, ink) => {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    if (x * x + y * y <= r * r) put(g, C + x, C + y, ink)
}

// ── the three effects ───────────────────────────────────────────────────────
/*
 * NOTHING REACHES THE CELL EDGE. Radius is capped at 20 in a 48px cell, so every
 * frame keeps about 3px of clear air. A shape that touches the edge gets clipped
 * the moment the sheet is scaled or nudged, and a clipped impact reads as a
 * rendering fault rather than as force.
 */
const R_MAX = 20
const TURN = Math.PI / 4

/* WEAK — a nick. Four short rays, gone by frame five. Small enough that the 1px
 * shake beside it does not look under-powered. */
const weak = [
  g => { solid(g, 2, '#'); rays(g, 4, 3, 6, '#', TURN) },
  g => { rays(g, 4, 3, 10, '#', TURN, 1) },
  g => { for (let i = 0; i < 4; i++) blob(g, 11, TURN + (i / 4) * Math.PI * 2, 1, '+') },
  g => { for (let i = 0; i < 4; i++) blob(g, 14, TURN + (i / 4) * Math.PI * 2, 0, '+') },
  () => {},
]

/* HIT — a slash. The everyday blow, so it is a stroke rather than a star: it has
 * a DIRECTION, which stops every normal hit reading as a small crit. It breaks
 * into two clean pieces rather than dissolving. */
const hit = [
  g => { slash(g, 18, 30, 2, '#') },
  g => { slash(g, 8, 40, 2, '#') },
  g => { slash(g, 5, 43, 1, '#') },
  g => { slash(g, 4, 15, 1, '+'); slash(g, 33, 44, 1, '+') },
  g => { slash(g, 4, 10, 0, '+'); slash(g, 38, 44, 0, '+') },
]

/* CRIT — a burst with a ring. The ring makes it read as BIGGER rather than
 * merely brighter, and it comes apart into arcs and then into pieces. */
const crit = [
  g => { solid(g, 4, '#'); rays(g, 8, 5, 10, '#') },
  g => { solid(g, 3, '#'); rays(g, 8, 4, 16, '#', 0, 2); arc(g, 10, '#', 0, Math.PI * 2) },
  g => {
    rays(g, 8, 8, 18, '#')
    /*
     * UNEVEN ON PURPOSE. Four equal arcs on the quarters, crossed by eight equal
     * rays, drew a compass rose — symmetrical, tidy, and completely still. The
     * grammar at the top of this file says a shape must stop being symmetrical
     * as it comes apart, and this is the frame where that starts.
     */
    arc(g, 15, '#', 0.15, 1.5)
    arc(g, 15, '#', 2.30, 3.1)
    arc(g, 15, '#', 4.10, 5.9)
  },
  g => {
    for (let i = 0; i < 8; i++) blob(g, 18, (i / 8) * Math.PI * 2, 1, '+')
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * Math.PI * 2 + 0.6
      arc(g, R_MAX, '+', a0, a0 + 0.7)
    }
  },
  g => { for (let i = 0; i < 5; i++) blob(g, R_MAX, (i / 5) * Math.PI * 2 + 0.9, 1, '+') },
]

const SETS = { weak, hit, crit }

// ── paint the sheet ─────────────────────────────────────────────────────────
let rough = ''
ROWS.forEach((name, row) => {
  SETS[name].forEach((draw, f) => {
    const g = grid()
    draw(g)
    const ox = f * S, oy = row * S
    g.forEach((line, y) => line.forEach((ch, x) => {
      if (ch) rough += '<rect x="' + (ox + x) + '" y="' + (oy + y) + '" width="1" height="1" fill="' + INK[ch] + '"/>'
    }))
  })
})
await sharp(svg(W, H, rough)).png().toFile(OUT + '/impact-rough.png')
await sharp(svg(W, H, rough)).resize(W * 4, H * 4, { kernel: 'nearest' }).png().toFile(OUT + '/impact-rough-x4.png')

// ── the same sheet on the card colour ────────────────────────────────────────
/*
 * The only honest way to judge it. The set is white on transparent, so on a white
 * page it is invisible and every frame looks fine.
 */
const dark = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#12121c"/>'
await sharp(svg(W, H, dark + rough)).resize(W * 4, H * 4, { kernel: 'nearest' })
  .png().toFile(OUT + '/impact-rough-dark.png')

// ── the guide ───────────────────────────────────────────────────────────────
let gd = ''
for (let r = 0; r < ROWS.length; r++) for (let f = 0; f < FRAMES; f++) {
  const x = f * S, y = r * S
  gd += '<rect x="' + x + '" y="' + y + '" width="' + S + '" height="' + S + '" fill="none" stroke="#00a0ff" stroke-opacity="0.55" stroke-width="1"/>'
  // The contact point. Every frame is built outward from here.
  gd += '<line x1="' + (x + S / 2) + '" y1="' + y + '" x2="' + (x + S / 2) + '" y2="' + (y + S) + '" stroke="#ff00a0" stroke-opacity="0.4" stroke-width="1"/>'
  gd += '<line x1="' + x + '" y1="' + (y + S / 2) + '" x2="' + (x + S) + '" y2="' + (y + S / 2) + '" stroke="#ff00a0" stroke-opacity="0.4" stroke-width="1"/>'
  // The cat's body, roughly. The effect must break OUT of this by frame three.
  gd += '<circle cx="' + (x + S / 2) + '" cy="' + (y + S / 2) + '" r="12" fill="none" stroke="#ffb000" stroke-opacity="0.6" stroke-width="1"/>'
}
await sharp(svg(W, H, gd)).png().toFile(OUT + '/impact-guide.png')
await sharp(svg(W, H, gd)).resize(W * 4, H * 4, { kernel: 'nearest' }).png().toFile(OUT + '/impact-guide-x4.png')

// ── the empty sheet ─────────────────────────────────────────────────────────
await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .png().toFile(OUT + '/impact-template.png')

console.log('wrote ' + OUT + ': ' + FRAMES + ' frames x ' + ROWS.length + ' rows, ' + S + 'x' + S + ' each (sheet ' + W + 'x' + H + ')')
