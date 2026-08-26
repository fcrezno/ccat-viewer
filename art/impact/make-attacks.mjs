/**
 * The attack-effect templates: physical strikes, and one spell per type.
 *
 *   node art/impact/make-attacks.mjs
 *
 * A wider companion to make-impact.mjs. That file covers the GENERIC hit, graded
 * weak / hit / crit. This one covers the named attacks JP asked for — slashes,
 * strikes, pummels, spells — where the effect says WHAT was done rather than how
 * hard.
 *
 * ── SAME CELL, SAME TIMING, ON PURPOSE ───────────────────────────────────────
 *
 * 48x48, five frames, played with steps(5) over 0.2/speed seconds. Identical to
 * the impact sheet, because these are meant to be interchangeable: one player
 * component, any sheet, no special cases. An effect that needed its own timing
 * would need its own code, and then the library stops being a library.
 *
 * ── TWO SHEETS, NOT ONE ──────────────────────────────────────────────────────
 *
 * PHYSICAL is five rows and MAGIC is eight. Kept apart because they are drawn
 * differently and finished at different times — a physical set is usable on its
 * own the day it is done, and waiting for all thirteen before anything can play
 * would be its own kind of blocked.
 *
 * ── THE EIGHT SPELLS ARE THE GAME'S OWN TYPES ────────────────────────────────
 *
 * Taken from TYPES in lib/arena.ts, and each one's look is read off its MOVES in
 * lib/moves.ts rather than invented: FORGE throws "Open Flame" and "Propain", so
 * FORGE is fire. Only the NAMES are used here. The strength table that decides
 * what beats what stays out of this repository, as it always has.
 *
 * ── THE GRAMMAR IS THE SAME AS THE IMPACT SHEET ──────────────────────────────
 *
 * Grow, peak, BREAK. Leave the body. Brightest for two frames only. Stop being
 * symmetrical as it comes apart. See make-impact.mjs for why each of those is
 * there — every one of them was learned by getting it wrong first.
 *
 * The one rule this file adds:
 *
 *   AN ATTACK EFFECT HAS A DIRECTION OR A SOURCE. A generic impact can be a
 *   symmetrical star because it only means "hit". A slash comes from somewhere,
 *   a bolt strikes from above, a flame rises, a pummel arrives repeatedly and in
 *   a DIFFERENT PLACE each frame. Take the direction away and every attack in
 *   the game looks like the same white flash.
 */
import sharp from 'sharp'

const S = 48, FRAMES = 5, OUT = 'art/impact'
const INK = { '#': '#f8f8f8', '+': '#a8a8a8' }
const C = (S - 1) / 2
/** Nothing reaches the cell edge; a clipped effect reads as a rendering fault. */
const R_MAX = 20

const svg = (w, h, body) =>
  Buffer.from('<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">' + body + '</svg>')

// ── the pixel canvas ────────────────────────────────────────────────────────
const grid = () => Array.from({ length: S }, () => new Array(S).fill(null))
const put = (g, x, y, c) => {
  const xi = Math.round(x), yi = Math.round(y)
  if (xi >= 0 && xi < S && yi >= 0 && yi < S) g[yi][xi] = c
}

/**
 * A fixed pseudo-random stream.
 *
 * Roughs must be the SAME every run. A rough that reshuffles itself cannot be
 * compared against the version JP looked at yesterday, and "it changed" becomes
 * impossible to tell from "you changed it".
 */
function rnd(seed) {
  let s = seed | 0
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) | 0
    return ((s >>> 16) & 0x7fff) / 0x7fff
  }
}

const solid = (g, r, ink, cx = C, cy = C) => {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
    if (x * x + y * y <= r * r) put(g, cx + x, cy + y, ink)
}

/** Rays from a point. Defaults to the centre; PIERCE needs them at the tip. */
function rays(g, count, r0, r1, ink, turn = 0, thick = 0, gap = 1, cx = C, cy = C) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + turn
    const dx = Math.cos(a), dy = Math.sin(a)
    for (let r = r0; r <= r1; r += gap) {
      put(g, cx + dx * r, cy + dy * r, ink)
      const t = Math.max(0, thick - Math.floor(r / 6))
      for (let k = 1; k <= t; k++) {
        put(g, cx + dx * r - dy * k, cy + dy * r + dx * k, ink)
        put(g, cx + dx * r + dy * k, cy + dy * r - dx * k, ink)
      }
    }
  }
}

function arc(g, r, ink, a0, a1, cx = C, cy = C) {
  const steps = Math.max(8, Math.round((a1 - a0) * r * 1.6))
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    put(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, ink)
  }
}

/**
 * A broken-off piece at a polar position.
 *
 * SQUARE, not a circle. This drew a filled circle, and a circle of radius 1 is a
 * PLUS SIGN — five pixels in a cross. Every spark, ember and droplet in the
 * library came out as a twinkle, which made fire, water and electricity all read
 * as the same sparkle. A square of any size reads as a solid piece.
 */
function blob(g, r, angle, half, ink) {
  const x = C + Math.cos(angle) * r, y = C + Math.sin(angle) * r
  for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++)
    put(g, x + dx, y + dy, ink)
}

/** A stroke down-left to up-right. `half` is its half-thickness. */
function slash(g, from, to, half, ink) {
  for (let t = Math.round(from); t <= Math.round(to); t++)
    for (let k = -half; k <= half; k++) put(g, t + k, S - 1 - t + k * 0.2, ink)
}

/** The same stroke mirrored, for a cross. */
function backslash(g, from, to, half, ink) {
  for (let t = Math.round(from); t <= Math.round(to); t++)
    for (let k = -half; k <= half; k++) put(g, t + k, t + k * 0.2, ink)
}

/** A zigzag falling down the cell. Lightning, and anything that strikes from above. */
function bolt(g, x0, y0, y1, spread, ink, r, wide = 1) {
  let x = x0
  for (let y = y0; y <= y1; y++) {
    x += (r() - 0.5) * spread
    for (let k = 0; k < wide; k++) put(g, x + k, y, ink)
  }
  return x
}

/**
 * Fire.
 *
 * This was a symmetrical taper and it drew a TRIANGLE — a mountain, not a flame.
 * A flame is not symmetrical for a single row: the two edges wander
 * independently, and only the TAPER is shared. That is the whole difference
 * between fire and a pyramid.
 */
function flame(g, h, ink, r, cx = C, base = C + 10) {
  let l = 2, rt = 2
  for (let i = 0; i < h; i++) {
    const taper = (h - i) / h
    l = Math.max(0.5, Math.min(9, l + (r() - 0.45) * 2.4))
    rt = Math.max(0.5, Math.min(9, rt + (r() - 0.45) * 2.4))
    const lw = Math.round(l * taper * 1.7), rw = Math.round(rt * taper * 1.7)
    for (let x = -lw; x <= rw; x++) put(g, cx + x, base - i, ink)
  }
}

/** A thin diamond pointing outward. Ice, glass, anything that comes apart sharp. */
function shard(g, r, angle, len, ink) {
  const dx = Math.cos(angle), dy = Math.sin(angle)
  for (let i = 0; i < len; i++) {
    const w = Math.max(0, Math.round((len - i) / 3))
    for (let k = -w; k <= w; k++)
      put(g, C + dx * (r + i) - dy * k, C + dy * (r + i) + dx * k, ink)
  }
}

/** Horizontal runs, displaced sideways. Corruption, tearing, bad video. */
function scan(g, rowsAt, ink, r, len = 18) {
  for (const y of rowsAt) {
    const off = Math.round((r() - 0.5) * 16)
    const w = Math.round(len * (0.5 + r()))
    for (let x = -w / 2; x <= w / 2; x++) put(g, C + x + off, y, ink)
  }
}

/**
 * Irregular lumps thrown outward.
 *
 * Sizes were 1 to 3 pixels, which reads as dust or as dirt on the screen. Junk
 * has to have MASS — 2 to 5, and never square, or it looks like noise.
 */
function chunks(g, n, r0, r1, ink, r) {
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const rad = r0 + r() * (r1 - r0)
    const w = 2 + Math.round(r() * 3), h = 2 + Math.round(r() * 3)
    const x = C + Math.cos(a) * rad, y = C + Math.sin(a) * rad
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(g, x + dx, y + dy, ink)
  }
}

// ── PHYSICAL ────────────────────────────────────────────────────────────────
/*
 * SLASH — one clean cut. The everyday blow. It breaks into two pieces rather
 * than dissolving, because a cut has two ends.
 */
const slashSet = [
  g => slash(g, 18, 30, 2, '#'),
  g => slash(g, 8, 40, 2, '#'),
  g => slash(g, 5, 43, 1, '#'),
  g => { slash(g, 4, 15, 1, '+'); slash(g, 33, 44, 1, '+') },
  g => { slash(g, 4, 10, 0, '+'); slash(g, 38, 44, 0, '+') },
]

/*
 * CROSS — two cuts. THE SECOND ARRIVES LATE, on frame two, so the eye reads two
 * separate events. Drawing both on frame one makes an X, which is one shape.
 */
const crossSet = [
  g => slash(g, 14, 34, 2, '#'),
  g => { slash(g, 8, 40, 1, '#'); backslash(g, 14, 34, 2, '#') },
  g => { slash(g, 5, 43, 1, '+'); backslash(g, 6, 42, 1, '#') },
  g => { backslash(g, 4, 16, 1, '+'); backslash(g, 32, 44, 1, '+'); slash(g, 20, 28, 0, '+') },
  g => { backslash(g, 4, 11, 0, '+'); backslash(g, 37, 44, 0, '+') },
]

/*
 * STRIKE — blunt. A solid core and a SHOCKWAVE that outlives it: the core is
 * gone by frame three and the ring keeps going, which is what makes it read as
 * force passing through rather than a light switching off.
 */
const strikeSet = [
  g => solid(g, 5, '#'),
  g => { solid(g, 7, '#'); arc(g, 11, '#', 0, Math.PI * 2) },
  g => { solid(g, 3, '+'); arc(g, 15, '#', 0, Math.PI * 2); rays(g, 6, 8, 13, '#') },
  g => { arc(g, R_MAX, '+', 0.2, 2.4); arc(g, R_MAX, '+', 3.0, 5.2) },
  g => { arc(g, R_MAX, '+', 0.6, 1.5); arc(g, R_MAX, '+', 3.6, 4.3) },
]

/*
 * PUMMEL — a flurry. THE POSITION MOVES EVERY FRAME, and that is the effect: a
 * pummel is many blows, so a fixed centre makes it one blow that pulses. Each
 * frame lands a new one and leaves the last behind, dimmed.
 *
 * Each blow is a CORE WITH SPOKES rather than a dot. Dots at these sizes read as
 * sparkles, which made the whole row look like a twinkle instead of a beating.
 */
const pummelSet = (() => {
  const spots = [[-11, -8], [9, -10], [-6, 9], [12, 6], [0, -2]]
  const blow = (g, i, ink, size) => {
    const [ox, oy] = spots[i]
    solid(g, size, ink, C + ox, C + oy)
    for (let k = size + 2; k <= size + 5; k++) {
      put(g, C + ox - k, C + oy, ink); put(g, C + ox + k, C + oy, ink)
      put(g, C + ox, C + oy - k, ink); put(g, C + ox, C + oy + k, ink)
    }
  }
  return [
    g => blow(g, 0, '#', 4),
    g => { blow(g, 0, '+', 2); blow(g, 1, '#', 4) },
    g => { blow(g, 1, '+', 2); blow(g, 2, '#', 4) },
    g => { blow(g, 2, '+', 2); blow(g, 3, '#', 4) },
    g => { blow(g, 3, '+', 2); blow(g, 4, '+', 3) },
  ]
})()

/*
 * PIERCE — a thrust. Narrow, and it goes THROUGH: the spike crosses the cell by
 * frame two and the burst happens at the FAR TIP.
 *
 * The burst was at the centre, which is where every other effect in the library
 * bursts — and that made a thrust read as a stab that stopped halfway. A pierce
 * is defined by coming out the other side.
 */
const TIP = 40
const pierceSet = [
  g => { for (let x = 4; x < 20; x++) { put(g, x, C, '#'); put(g, x, C + 1, '#') } },
  g => {
    for (let x = 4; x <= TIP; x++) { put(g, x, C, '#'); put(g, x, C + 1, '#') }
    solid(g, 3, '#', TIP, C)
  },
  g => {
    for (let x = 12; x <= TIP; x++) put(g, x, C, '#')
    rays(g, 6, 4, 12, '#', 0.3, 0, 1, TIP, C)
  },
  g => {
    for (let x = 30; x < 38; x++) put(g, x, C, '+')
    rays(g, 5, 8, 15, '+', 0.5, 0, 2, TIP, C)
  },
  g => { solid(g, 1, '+', TIP - 4, C - 7); solid(g, 1, '+', TIP - 2, C + 6); solid(g, 0, '+', TIP + 3, C) },
]

// ── MAGIC, one per type ─────────────────────────────────────────────────────
/* ZOOMIES — electric. "Zoom", "Taze", "Live Wire". Strikes from above and
 * branches; the sparks outlive the bolt. */
const zoomies = (() => {
  const r = rnd(11)
  return [
    g => { const q = rnd(11); bolt(g, C, 4, 20, 3, '#', q, 2) },
    g => { const q = rnd(11); bolt(g, C, 4, 44, 4, '#', q, 2); bolt(g, C + 6, 22, 40, 5, '#', rnd(7)) },
    g => { const q = rnd(11); bolt(g, C, 4, 44, 4, '+', q); rays(g, 6, 6, 14, '#', 0.3) },
    g => { for (let i = 0; i < 5; i++) blob(g, 12 + i, i * 1.3, 1, '#') },
    g => { for (let i = 0; i < 3; i++) blob(g, R_MAX - 2, 0.5 + i * 2, 0, '+') },
  ]
})()

/* FORGE — fire. "Lighter Spark", "Open Flame", "Propain". Rises, then leaves
 * embers going UP rather than outward. */
const forge = [
  g => flame(g, 10, '#', rnd(3)),
  g => { flame(g, 22, '#', rnd(3)); flame(g, 12, '+', rnd(9), C - 8); flame(g, 12, '+', rnd(5), C + 8) },
  g => { flame(g, 26, '+', rnd(3)); flame(g, 14, '#', rnd(9), C - 7); flame(g, 14, '#', rnd(5), C + 7) },
  g => { for (let i = 0; i < 6; i++) blob(g, 12 + (i % 3) * 3, -0.9 - i * 0.35, 1, '#') },
  g => { for (let i = 0; i < 3; i++) blob(g, R_MAX - 3, -1.1 - i * 0.5, 0, '+') },
]

/* COOLANT — water. "Spritz Mist", "Water Hose", "Hang-Ten". A splash crown: a
 * BOWL opening upward, with droplets thrown off its rim that then fall outward.
 *
 * The bowl was drawn as the top half and came out as a dome — an umbrella, not a
 * splash. Water collects and throws upward; the opening has to face the sky. */
const UP = [-0.4, -0.9, -1.4, -1.9, -2.4, -2.8]
const coolant = [
  g => { solid(g, 4, '#', C, C + 6); arc(g, 8, '#', 0, Math.PI, C, C + 2) },
  g => {
    arc(g, 12, '#', 0, Math.PI, C, C + 2)
    for (let i = 0; i < 4; i++) blob(g, 12, UP[i], 1, '#')
  },
  g => {
    arc(g, 16, '+', 0, Math.PI, C, C + 2)
    for (let i = 0; i < 6; i++) blob(g, 15, UP[i], 1, '#')
  },
  g => { for (let i = 0; i < 6; i++) blob(g, R_MAX - 2, UP[i], 1, '+') },
  g => { for (let i = 0; i < 3; i++) blob(g, R_MAX, UP[i * 2], 1, '+') },
]

/* SIGNAL — broadcast. "Ping", "DDOS", "ALT-F4". Concentric rings leaving a
 * point. The only effect here that IS allowed to stay symmetrical, because a
 * broadcast is symmetrical — but it thins out rather than fading. */
const signal = [
  g => solid(g, 3, '#'),
  g => { solid(g, 2, '#'); arc(g, 8, '#', 0, Math.PI * 2) },
  g => { arc(g, 8, '+', 0, Math.PI * 2); arc(g, 14, '#', 0, Math.PI * 2) },
  g => { arc(g, 14, '+', 0, Math.PI * 2); arc(g, R_MAX, '#', 0, Math.PI * 2) },
  g => { arc(g, R_MAX, '+', 0.3, 2.2); arc(g, R_MAX, '+', 3.4, 5.6) },
]

/* GLITCH — corruption. "Lag_switch", "File_Corruption", "Null_Pointer". Rows
 * displaced sideways. It does not grow outward like the others; it TEARS, which
 * is what makes it feel wrong beside them. */
const glitch = [
  g => scan(g, [22, 24], '#', rnd(21), 14),
  g => { scan(g, [16, 18, 22, 24, 30], '#', rnd(21), 20); solid(g, 2, '#') },
  g => { scan(g, [12, 16, 18, 22, 24, 28, 30, 34], '#', rnd(33), 24) },
  g => { scan(g, [14, 20, 26, 32], '+', rnd(41), 22) },
  g => { scan(g, [18, 28], '+', rnd(55), 12) },
]

/* CRYO — ice. "Chill", "Frostbite", "Brain Freeze". Grows as a crystal, then
 * SHATTERS: the shards keep their sharp shape all the way out. */
const cryo = [
  g => { solid(g, 3, '#'); for (let i = 0; i < 6; i++) shard(g, 3, (i / 6) * Math.PI * 2, 4, '#') },
  g => { solid(g, 2, '#'); for (let i = 0; i < 6; i++) shard(g, 3, (i / 6) * Math.PI * 2, 10, '#') },
  g => { for (let i = 0; i < 6; i++) shard(g, 7, (i / 6) * Math.PI * 2 + 0.1, 10, '#') },
  g => { for (let i = 0; i < 5; i++) shard(g, 13, (i / 5) * Math.PI * 2 + 0.5, 6, '+') },
  g => { for (let i = 0; i < 3; i++) shard(g, 17, (i / 3) * Math.PI * 2 + 1.1, 4, '+') },
]

/* SCRAP — junk. "Swipe", "Junk Throw", "a Steel Chair". Irregular lumps, and
 * deliberately the untidiest set here. */
const scrap = [
  g => { solid(g, 4, '#'); chunks(g, 4, 5, 8, '#', rnd(2)) },
  g => { solid(g, 2, '+'); chunks(g, 9, 4, 14, '#', rnd(2)) },
  g => chunks(g, 10, 8, 18, '#', rnd(4)),
  g => chunks(g, 7, 13, R_MAX, '+', rnd(6)),
  g => chunks(g, 4, 16, R_MAX, '+', rnd(8)),
]

/* STRAY — street. "Shiv", "Body Check", "Say Uncle." Blunt and OFF-CENTRE: it
 * lands where it lands, which is what tells it apart from STRIKE. What follows
 * it is DUST kicked up from below, not a clean shockwave — this is the scruffy
 * one.
 *
 * It was two arcs facing each other and read as a bowl with a smile in it. */
const OX = -6, OY = -4
const stray = [
  g => solid(g, 5, '#', C + OX, C + OY),
  g => { solid(g, 7, '#', C + OX, C + OY); rays(g, 5, 9, 14, '#', 0.9, 0, 1, C + OX, C + OY) },
  g => {
    solid(g, 3, '+', C + OX, C + OY)
    rays(g, 4, 10, 17, '#', 1.4, 0, 1, C + OX, C + OY)
    arc(g, 13, '#', 0.35, 2.8, C - 2, C + 4)
  },
  g => {
    arc(g, 18, '+', 0.5, 2.6, C - 2, C + 4)
    solid(g, 1, '+', C + 12, C - 8); solid(g, 1, '+', C - 13, C - 6)
  },
  g => { solid(g, 1, '+', C + 15, C - 10); solid(g, 0, '+', C - 16, C - 7) },
]

// ── the two sheets ──────────────────────────────────────────────────────────
const SHEETS = {
  'attack-physical': [
    ['SLASH', slashSet], ['CROSS', crossSet], ['STRIKE', strikeSet],
    ['PUMMEL', pummelSet], ['PIERCE', pierceSet],
  ],
  'attack-magic': [
    ['ZOOMIES', zoomies], ['FORGE', forge], ['COOLANT', coolant], ['SIGNAL', signal],
    ['GLITCH', glitch], ['CRYO', cryo], ['SCRAP', scrap], ['STRAY', stray],
  ],
}

const W = S * FRAMES

for (const [name, rows] of Object.entries(SHEETS)) {
  const H = S * rows.length
  let art = '', guide = ''

  rows.forEach(([, set], row) => {
    set.forEach((draw, f) => {
      const g = grid()
      draw(g)
      const ox = f * S, oy = row * S
      g.forEach((line, y) => line.forEach((ch, x) => {
        if (ch) art += '<rect x="' + (ox + x) + '" y="' + (oy + y) + '" width="1" height="1" fill="' + INK[ch] + '"/>'
      }))
    })
  })

  for (let r = 0; r < rows.length; r++) for (let f = 0; f < FRAMES; f++) {
    const x = f * S, y = r * S
    guide += '<rect x="' + x + '" y="' + y + '" width="' + S + '" height="' + S + '" fill="none" stroke="#00a0ff" stroke-opacity="0.55" stroke-width="1"/>'
    guide += '<line x1="' + (x + S / 2) + '" y1="' + y + '" x2="' + (x + S / 2) + '" y2="' + (y + S) + '" stroke="#ff00a0" stroke-opacity="0.35" stroke-width="1"/>'
    guide += '<line x1="' + x + '" y1="' + (y + S / 2) + '" x2="' + (x + S) + '" y2="' + (y + S / 2) + '" stroke="#ff00a0" stroke-opacity="0.35" stroke-width="1"/>'
    guide += '<circle cx="' + (x + S / 2) + '" cy="' + (y + S / 2) + '" r="12" fill="none" stroke="#ffb000" stroke-opacity="0.55" stroke-width="1"/>'
  }

  await sharp(svg(W, H, art)).png().toFile(OUT + '/' + name + '-rough.png')
  await sharp(svg(W, H, guide)).png().toFile(OUT + '/' + name + '-guide.png')
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png().toFile(OUT + '/' + name + '-template.png')

  /*
   * THE KEY: the rough on the card colour, at 4x, with the row names beside it.
   *
   * A separate file rather than a wider template, because the template and the
   * guide have to stay EXACTLY the same size to be layered over each other. A
   * label gutter in the template would end up exported into the game.
   */
  const P = 4, LAB = 88
  let key = '<rect x="0" y="0" width="' + (W * P + LAB) + '" height="' + (H * P) + '" fill="#12121c"/>'
  rows.forEach(([label], r) => {
    key += '<text x="10" y="' + (r * S * P + S * P / 2 + 5) + '" fill="#7a7a95" font-family="monospace" font-size="15">' + label + '</text>'
    key += '<line x1="0" y1="' + (r * S * P) + '" x2="' + (W * P + LAB) + '" y2="' + (r * S * P) + '" stroke="#21212f" stroke-width="1"/>'
  })
  const big = await sharp(svg(W, H, art)).resize(W * P, H * P, { kernel: 'nearest' }).png().toBuffer()
  await sharp(Buffer.from('<svg width="' + (W * P + LAB) + '" height="' + (H * P) + '" xmlns="http://www.w3.org/2000/svg">' + key + '</svg>'))
    .composite([{ input: big, left: LAB, top: 0 }])
    .png().toFile(OUT + '/' + name + '-key.png')

  console.log('wrote ' + name + ': ' + rows.length + ' rows x ' + FRAMES + ' frames (' + W + 'x' + H + ')')
}
