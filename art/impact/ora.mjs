/**
 * A small OpenRaster (.ora) writer, so the templates arrive as LAYERED files.
 *
 * ── WHY ORA AND NOT .kra ─────────────────────────────────────────────────────
 *
 * Krita opens both. A .kra is Krita's own format and its internal document XML is
 * not something to reproduce from the outside — it would work until a Krita
 * release changed it. ORA is an open, stable, documented format that Krita reads
 * and writes as a first-class citizen, and it is a ZIP holding plain PNGs. If
 * this ever breaks, it breaks somewhere legible.
 *
 * ── WHY WRITE THE ZIP BY HAND ────────────────────────────────────────────────
 *
 * There is no zip library in this project, and this is a build-time art tool. It
 * has no business adding a dependency to the app that ships. Every entry is
 * STORED rather than deflated — the payload is PNGs, which are already
 * compressed, so deflating them again would cost time to save nothing.
 *
 * ORA also REQUIRES the mimetype entry to be first and uncompressed, which storing
 * everything satisfies for free.
 */

let TABLE = null
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      TABLE[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ TABLE[(c ^ buf[i]) & 0xff]
  return (c ^ -1) >>> 0
}

const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff); return b }
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }

/** A ZIP with every entry stored. `entries` is [{ name, data }] in order. */
export function zipStored(entries) {
  const locals = []
  const central = []
  let offset = 0

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    // A fixed timestamp, so building twice gives byte-identical files and a
    // diff shows only what actually changed.
    const time = u16(0), date = u16(0x2821) // 2000-01-01

    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), time, date,
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBuf.length), u16(0), nameBuf, data,
    ])
    locals.push(local)

    central.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), time, date,
      u32(crc), u32(data.length), u32(data.length),
      u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(offset), nameBuf,
    ]))

    offset += local.length
  }

  const dir = Buffer.concat(central)
  return Buffer.concat([
    ...locals, dir,
    Buffer.concat([
      u32(0x06054b50), u16(0), u16(0),
      u16(entries.length), u16(entries.length),
      u32(dir.length), u32(offset), u16(0),
    ]),
  ])
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/**
 * Build an .ora.
 *
 * `layers` are listed TOP FIRST, which is the order ORA's stack uses and the
 * order they appear in Krita's docker. Each is { name, png, opacity, visible }.
 *
 * `merged` is what a viewer that cannot read layers will show. The spec requires
 * it, and leaving it out produces a file that opens fine in Krita and appears
 * blank everywhere else.
 */
export function ora({ width, height, layers, merged, thumb }) {
  const entries = [{ name: 'mimetype', data: Buffer.from('image/openraster', 'ascii') }]

  const rows = layers.map((l, i) => {
    const src = 'data/layer' + i + '.png'
    entries.push({ name: src, data: l.png })
    return '  <layer name="' + esc(l.name) + '" src="' + src + '"' +
      ' x="0" y="0" opacity="' + (l.opacity ?? 1) + '"' +
      ' visibility="' + (l.visible === false ? 'hidden' : 'visible') + '"/>'
  })

  const stack =
    '<?xml version=\'1.0\' encoding=\'UTF-8\'?>\n' +
    '<image version="0.0.3" w="' + width + '" h="' + height + '" xres="72" yres="72">\n' +
    ' <stack>\n' + rows.join('\n') + '\n </stack>\n</image>\n'

  entries.push({ name: 'stack.xml', data: Buffer.from(stack, 'utf8') })
  entries.push({ name: 'mergedimage.png', data: merged })
  entries.push({ name: 'Thumbnails/thumbnail.png', data: thumb ?? merged })

  return zipStored(entries)
}
