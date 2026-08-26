/**
 * Read an .ora back — the other half of ora.mjs.
 *
 * Writing the documents is only useful if what JP draws can be got back out. He
 * saves from Krita, and Krita DEFLATES its entries, so this cannot be the mirror
 * of the writer: the writer stores everything because it is handing over PNGs
 * that are already compressed, but a reader has to handle both.
 *
 * Node's zlib does the actual inflating. What is here is the ZIP container and
 * the ORA stack, both of which are small and neither of which is worth a
 * dependency in an app that ships to phones.
 */
import zlib from 'node:zlib'
import fs from 'node:fs'

const EOCD = 0x06054b50
const CEN = 0x02014b50

/** Every entry in a zip, by name. */
export function unzip(buf) {
  /*
   * The end-of-central-directory record is at the END and has no fixed offset,
   * because it may be followed by a comment of up to 65535 bytes. Scanning
   * backward for the signature is how the format is meant to be read.
   */
  let end = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
    if (buf.readUInt32LE(i) === EOCD) { end = i; break }
  }
  if (end < 0) throw new Error('not a zip: no end-of-central-directory record')

  const count = buf.readUInt16LE(end + 10)
  let at = buf.readUInt32LE(end + 16)
  const out = new Map()

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== CEN) throw new Error('central directory entry ' + i + ' is malformed')
    const method = buf.readUInt16LE(at + 10)
    const compSize = buf.readUInt32LE(at + 20)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen)

    /*
     * The local header's own name and extra lengths are read rather than reused
     * from the central directory. They are allowed to differ — the extra field
     * routinely does — and assuming they match lands you in the middle of the
     * data with no error, just wrong bytes.
     */
    const lNameLen = buf.readUInt16LE(local + 26)
    const lExtraLen = buf.readUInt16LE(local + 28)
    const start = local + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compSize)

    out.set(name, method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw))
    at += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const attr = (tag, key) => {
  const m = tag.match(new RegExp(key + '="([^"]*)"'))
  return m ? m[1] : null
}
const unesc = s => (s ?? '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&')

/**
 * The layers of an .ora, TOP FIRST, each with its PNG bytes.
 *
 * Krita nests layers inside <stack> elements when they are grouped. Only <layer>
 * elements are collected, in document order, which flattens any grouping — for
 * these documents there is none, and a caller that looks its layers up BY NAME
 * does not care about the tree anyway.
 */
export function readOra(file) {
  const zip = unzip(fs.readFileSync(file))

  const mime = zip.get('mimetype')?.toString('ascii')
  if (mime !== 'image/openraster') throw new Error(file + ': not an ORA (mimetype is "' + mime + '")')

  const xml = zip.get('stack.xml')?.toString('utf8')
  if (!xml) throw new Error(file + ': no stack.xml')

  const image = xml.match(/<image[^>]*>/)?.[0] ?? ''
  const layers = [...xml.matchAll(/<layer\b[^>]*\/?>/g)].map(m => {
    const tag = m[0]
    const src = attr(tag, 'src')
    return {
      name: unesc(attr(tag, 'name')),
      opacity: Number(attr(tag, 'opacity') ?? 1),
      visible: attr(tag, 'visibility') !== 'hidden',
      png: zip.get(src),
      src,
    }
  })

  const missing = layers.filter(l => !l.png)
  if (missing.length) throw new Error(file + ': stack names files that are not in the zip: ' + missing.map(l => l.src).join(', '))

  return {
    width: Number(attr(image, 'w')),
    height: Number(attr(image, 'h')),
    layers,
  }
}
