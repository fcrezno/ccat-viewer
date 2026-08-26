/**
 * A small animated-GIF writer.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * sharp is already a dependency and can READ animated GIFs, but the version this
 * project is on (0.33.5) cannot WRITE them: `pageHeight` on a raw toilet-roll
 * buffer comes back out as a single page, and the `join` option that would do it
 * properly arrived in 0.34. Measured, not assumed — four different forms were
 * tried and every one produced pages=1.
 *
 * The alternative was adding an encoder package to the app's dependencies for the
 * sake of a build-time art preview. That is a bad trade: this runs on a
 * developer's machine to make a picture, and it should not be able to affect what
 * the app ships.
 *
 * It is also a small job HERE specifically. These frames are pixel art in three
 * or four colours, so the palette is tiny and the compression has an easy time.
 * A general-purpose encoder this is not.
 *
 * GIF89a, LZW as the format requires, one global palette, per-frame delays.
 */

/** Packs codes of a changing bit width, least-significant bit first. */
class Bits {
  constructor() { this.bytes = []; this.acc = 0; this.n = 0 }
  write(code, width) {
    this.acc |= code << this.n
    this.n += width
    while (this.n >= 8) {
      this.bytes.push(this.acc & 0xff)
      this.acc >>= 8
      this.n -= 8
    }
  }
  flush() { if (this.n > 0) { this.bytes.push(this.acc & 0xff); this.acc = 0; this.n = 0 } }
}

/**
 * LZW, as GIF defines it.
 *
 * The dictionary is reset with a CLEAR code when it fills at 4095, which is not
 * an optimisation — a decoder that meets a code above 4095 has no way to read it,
 * so leaving this out produces a file that looks fine until a frame is busy
 * enough to need it.
 */
function lzw(indices, minCodeSize) {
  const CLEAR = 1 << minCodeSize
  const EOI = CLEAR + 1
  const bits = new Bits()

  let dict = new Map()
  let next = EOI + 1
  let width = minCodeSize + 1

  bits.write(CLEAR, width)

  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = (prefix << 8) | k
    const found = dict.get(key)
    if (found !== undefined) { prefix = found; continue }

    bits.write(prefix, width)
    dict.set(key, next)
    next++

    if (next > 4095) {
      bits.write(CLEAR, width)
      dict = new Map()
      next = EOI + 1
      width = minCodeSize + 1
    } else if (next > (1 << width) && width < 12) {
      width++
    }
    prefix = k
  }

  bits.write(prefix, width)
  bits.write(EOI, width)
  bits.flush()
  return bits.bytes
}

/** GIF carries pixel data in blocks of at most 255 bytes, each length-prefixed. */
function subBlocks(bytes) {
  const out = []
  for (let i = 0; i < bytes.length; i += 255) {
    const run = bytes.slice(i, i + 255)
    out.push(run.length, ...run)
  }
  out.push(0)
  return out
}

const u16 = n => [n & 0xff, (n >> 8) & 0xff]

/**
 * Write an animated GIF.
 *
 * `frames` are RGBA buffers, all the same size. `delays` are in MILLISECONDS and
 * are converted to the hundredths of a second the format actually stores — so a
 * delay is rounded, and anything under 10ms becomes 10ms because the format
 * cannot express it. Saying so here rather than silently producing a file that
 * runs at a different speed than asked for.
 */
export function animatedGif({ width, height, frames, delays, loop = 0 }) {
  // ── one palette for every frame ───────────────────────────────────────────
  const index = new Map()
  const palette = []
  const framesIdx = []

  for (const rgba of frames) {
    const idx = new Uint8Array(width * height)
    for (let i = 0; i < width * height; i++) {
      const o = i * 4
      const key = (rgba[o] << 16) | (rgba[o + 1] << 8) | rgba[o + 2]
      let at = index.get(key)
      if (at === undefined) {
        if (palette.length >= 256) {
          throw new Error('more than 256 colours; this writer is for pixel art, not photographs')
        }
        at = palette.length
        index.set(key, at)
        palette.push([rgba[o], rgba[o + 1], rgba[o + 2]])
      }
      idx[i] = at
    }
    framesIdx.push(idx)
  }

  // The colour table must be a power of two, padded out.
  let bitsPer = 1
  while ((1 << bitsPer) < palette.length) bitsPer++
  const tableSize = 1 << bitsPer
  const table = []
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] ?? [0, 0, 0]
    table.push(c[0], c[1], c[2])
  }

  const out = []
  const push = (...xs) => out.push(...xs.flat())

  push([...'GIF89a'].map(c => c.charCodeAt(0)))
  push(u16(width), u16(height), 0xf0 | (bitsPer - 1), 0, 0)
  push(table)

  // Loop forever, which lives in an application extension rather than the header.
  push(0x21, 0xff, 0x0b, [...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 0x03, 0x01, u16(loop), 0x00)

  framesIdx.forEach((idx, f) => {
    const cs = Math.max(1, Math.round((delays[f] ?? 100) / 10))
    // Disposal 1: leave the frame in place. Every frame here is fully painted,
    // so nothing needs restoring and this is the cheapest correct choice.
    push(0x21, 0xf9, 0x04, 0x04, u16(cs), 0x00, 0x00)
    push(0x2c, u16(0), u16(0), u16(width), u16(height), 0x00)

    const min = Math.max(2, bitsPer)
    push(min)
    push(subBlocks(lzw(Array.from(idx), min)))
  })

  push(0x3b)
  return Buffer.from(out)
}
