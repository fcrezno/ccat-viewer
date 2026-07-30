/**
 * Builds the HashLips Art Engine `layers/` folder for Clanker Cats V2.
 *
 * HashLips composes PNG files — it has no palette remapping and no flat-colour
 * fills. This produces those PNGs so the trait table can be widened by config
 * rather than by drawing: 16 body colours out of one `Base Body`, 16 backgrounds
 * out of hex values.
 *
 *   node scripts/prep-layers.mjs --inspect    print the base body's palette
 *   node scripts/prep-layers.mjs              write layers/
 *
 * Input  (export these from Krita as flat PNGs, all the same canvas size):
 *   art/faces/<name>.png          one per face
 *   art/body/base.png             the uncoloured body
 *   art/backgrounds/<name>.png    illustrated backgrounds (the 4 OG + Farcaster gate)
 *   art/mystery/mystery.png       the super rare — NOT a layer, used by apply-mystery.mjs
 *
 * Output (point HashLips at this):
 *   layers/Background/<name>#<weight>.png
 *   layers/Body/<name>#<weight>.png
 *   layers/Face/<name>#<weight>.png
 */
import sharp from 'sharp'
import { mkdirSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, basename, extname } from 'path'
import {
  BODY_COLOURS, BG_COLOURS, BG_TINTS, WEIGHTS, DEFAULT_WEIGHT, SUPPLY, MYSTERY_COUNT,
} from './traits.config.mjs'

const ART_DIR    = 'art'
const LAYERS_DIR = 'layers'

// ── colour helpers ──────────────────────────────────────────────────────────

const hexToRgb = h => {
  const v = h.replace('#', '')
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]
}
const rgbToHex = (r, g, b) => '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')

/** Distinct opaque colours in a PNG, most frequent first. */
async function coloursOf(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const counts = new Map()
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue
    const hex = rgbToHex(data[i], data[i + 1], data[i + 2])
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

/**
 * Replace exact colours per `map`. Pixels not in the map are untouched, which is
 * what keeps outlines and eyes intact — a hue rotation would smear them along
 * with the fur.
 */
async function remap(path, map) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const lut = new Map(Object.entries(map ?? {}).map(([from, to]) => [from.toLowerCase(), hexToRgb(to)]))
  let hits = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue
    const to = lut.get(rgbToHex(data[i], data[i + 1], data[i + 2]))
    if (to) { data[i] = to[0]; data[i + 1] = to[1]; data[i + 2] = to[2]; hits++ }
  }
  const buf = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png().toBuffer()
  return { buf, hits }
}

async function tint(path, spec) {
  if (!spec) return sharp(path).png().toBuffer()
  const [r, g, b] = hexToRgb(spec.multiply)
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue
    data[i]     = Math.round((data[i]     * r) / 255)
    data[i + 1] = Math.round((data[i + 1] * g) / 255)
    data[i + 2] = Math.round((data[i + 2] * b) / 255)
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png().toBuffer()
}

const weightOf = name => WEIGHTS[name] ?? DEFAULT_WEIGHT
const layerFile = (dir, name) => join(LAYERS_DIR, dir, `${name}#${weightOf(name)}.png`)

/**
 * Krita's Export Layers prefixes filenames with the document name and an index —
 * `mochibit_003_uwu.png` rather than `uwu.png`. The trait name is what ends up in
 * the metadata, so strip that back off. Anything without the pattern is left alone.
 */
export function traitNameFrom(filename) {
  const stem = basename(filename, extname(filename))
  const m = stem.match(/^.+?[_-]\d{1,4}[_-](.+)$/)
  return (m ? m[1] : stem).trim()
}

/** `[{ file, name }]` for a layer directory, with Krita's export prefix removed. */
const listPngs = dir => {
  const p = join(ART_DIR, dir)
  if (!existsSync(p)) return []
  return readdirSync(p)
    .filter(f => extname(f).toLowerCase() === '.png')
    .map(f => ({ file: join(p, f), name: traitNameFrom(f) }))
}

/**
 * Every layer must sit on the same canvas or the composite misaligns. Krita can
 * trim exports to each layer's bounding box, which silently breaks this — so check.
 */
async function assertCanvas(entries, canvas, label) {
  const bad = []
  for (const e of entries) {
    const m = await sharp(e.file).metadata()
    if (m.width !== canvas.width || m.height !== canvas.height)
      bad.push(`${e.name} (${m.width}x${m.height})`)
  }
  if (bad.length) {
    console.error(`\n❌ ${label} layers don't match the ${canvas.width}x${canvas.height} canvas:`)
    bad.forEach(b => console.error(`     ${b}`))
    console.error(`
   Krita trimmed these to their bounding box. Re-export with the full canvas:
   File → Export Layers, and make sure the export is NOT cropping to layer bounds.
   Every layer has to be full-canvas or the cat won't line up with its background.`)
    process.exit(1)
  }
}

// ── inspect mode ────────────────────────────────────────────────────────────

const BASE_BODY = join(ART_DIR, 'body', 'base.png')

if (process.argv.includes('--inspect')) {
  if (!existsSync(BASE_BODY)) {
    console.error(`❌ ${BASE_BODY} not found — export the layers from Krita first.`)
    process.exit(1)
  }
  const canvas = await sharp(BASE_BODY).metadata()
  console.log(`Canvas ${canvas.width}x${canvas.height}`)
  console.log(`\nColours in ${BASE_BODY} — use these as the keys in BODY_COLOURS:\n`)
  const cols = await coloursOf(BASE_BODY)
  for (const [hex, count] of cols) console.log(`  ${hex}   ${count} px`)
  if (cols.length === 0)
    console.warn('\n⚠️  base.png has no opaque pixels — wrong layer exported?')
  else if (cols.length > 24)
    console.warn(`\n⚠️  ${cols.length} distinct colours. If base.png is anti-aliased or`
      + ' shaded, exact-colour remapping will only catch the flat areas.')

  for (const [label, dir] of [['Faces', 'faces'], ['Backgrounds', 'backgrounds']]) {
    const items = listPngs(dir)
    console.log(`\n${label} (${items.length}) — filename → trait name:`)
    for (const i of items) console.log(`   ${basename(i.file).padEnd(34)} → ${i.name}`)
  }
  console.log('\nMystery    :', existsSync(join(ART_DIR, 'mystery', 'mystery.png')) ? 'found' : 'MISSING')
  process.exit(0)
}

// ── build ───────────────────────────────────────────────────────────────────

const faces = listPngs('faces')
if (!faces.length) {
  console.error('❌ No faces in art/faces/.')
  process.exit(1)
}

// Body colours come from two additive sources:
//   1. the already-coloured PNGs in art/body/  (hand-drawn, always used)
//   2. palette remaps of base.png, for any BODY_COLOURS entry not already exported
// Adding base.png therefore extends the set rather than replacing it.
const HAS_BASE = existsSync(BASE_BODY)
const bodyPngs = listPngs('body').filter(b => b.name.toLowerCase() !== 'base')

if (!HAS_BASE && !bodyPngs.length) {
  console.error('❌ No bodies in art/body/ and no base.png to remap.')
  process.exit(1)
}

// Placeholder keys never match a real pixel — catch them before they produce
// a pile of identical bodies.
const configured = Object.entries(BODY_COLOURS)
  .filter(([, map]) => !Object.keys(map).some(k => /^#RRGGBB$/i.test(k)))
const placeholders = Object.keys(BODY_COLOURS).length - configured.length

const canvasSrc = HAS_BASE ? BASE_BODY : bodyPngs[0].file
const canvas    = await sharp(canvasSrc).metadata()
console.log(`Canvas ${canvas.width}x${canvas.height}`)
console.log(`Body: ${bodyPngs.length} exported`
  + (HAS_BASE ? ` + up to ${configured.length} remapped from base.png` : ' (no base.png — no remapping)'))
if (HAS_BASE && placeholders)
  console.log(`      ${placeholders} BODY_COLOURS entries still have '#RRGGBB' placeholders — run --inspect`)
console.log()

const illustrated = listPngs('backgrounds')
await assertCanvas(faces, canvas, 'Face')
await assertCanvas(illustrated, canvas, 'Background')
await assertCanvas(bodyPngs, canvas, 'Body')

rmSync(LAYERS_DIR, { recursive: true, force: true })
for (const d of ['Background', 'Body', 'Face']) mkdirSync(join(LAYERS_DIR, d), { recursive: true })

// Faces — copied through as-is, only renamed with the weight suffix.
for (const f of faces)
  await sharp(f.file).png().toFile(layerFile('Face', f.name))
console.log(`Face        ${faces.length}  (${faces.map(f => f.name).join(', ')})`)

// Bodies — the hand-drawn exports, plus any remapped colours that don't clash.
const unmapped  = []
const bodyNames = []

for (const b of bodyPngs) {
  await sharp(b.file).png().toFile(layerFile('Body', b.name))
  bodyNames.push(b.name)
}

if (HAS_BASE) {
  const drawn = new Set(bodyPngs.map(b => b.name.toLowerCase()))
  for (const [name, map] of configured) {
    if (drawn.has(name.toLowerCase())) continue   // your hand-drawn version wins
    const { buf, hits } = await remap(BASE_BODY, map)
    if (hits === 0) { unmapped.push(name); continue }
    await sharp(buf).png().toFile(layerFile('Body', name))
    bodyNames.push(name)
  }
}
console.log(`Body        ${bodyNames.length}  (${bodyNames.join(', ')})`)

// Backgrounds — illustrated (optionally tinted) plus flat colour fills.
let bgCount = 0

for (const bg of illustrated) {
  for (const [tintName, spec] of Object.entries(BG_TINTS)) {
    const only = Object.keys(BG_TINTS).length === 1
    const name = only ? bg.name : `${bg.name} ${tintName}`
    await sharp(await tint(bg.file, spec)).png().toFile(layerFile('Background', name))
    bgCount++
  }
}

// Skip any flat colour whose name is already an exported background — two layers
// with the same trait name would collapse into one file.
const exported = new Set(illustrated.map(b => b.name.toLowerCase()))
const skipped  = []

for (const [name, hex] of Object.entries(BG_COLOURS)) {
  if (exported.has(name.toLowerCase())) { skipped.push(name); continue }
  const [r, g, b] = hexToRgb(hex)
  await sharp({ create: { width: canvas.width, height: canvas.height, channels: 4, background: { r, g, b, alpha: 1 } } })
    .png().toFile(layerFile('Background', name))
  bgCount++
}
if (skipped.length)
  console.log(`            (skipped flat colours already exported as art: ${skipped.join(', ')})`)
console.log(`Background  ${bgCount}  (${illustrated.length} illustrated x ${Object.keys(BG_TINTS).length} tint, ${Object.keys(BG_COLOURS).length} flat)`)

// ── report ──────────────────────────────────────────────────────────────────

const space = faces.length * bodyNames.length * bgCount
console.log(`\nCombination space: ${faces.length} x ${bodyNames.length} x ${bgCount} = ${space}`)

const needed = SUPPLY - MYSTERY_COUNT
if (space < needed) {
  console.error(`\n❌ Only ${space} combinations but ${needed} layered cats are needed.`)
  console.error('   Add flat colours to BG_COLOURS, or export Base Body so bodies can be recoloured.')
} else if (space < needed * 1.3) {
  console.warn(`\n⚠️  ${space} combinations for ${needed} cats is tight — rare traits get crowded out.`)
} else {
  console.log(`   ${(space / needed).toFixed(1)}x headroom for ${needed} layered cats.`)
}

if (unmapped.length) {
  console.warn(`\n⚠️  Skipped — these BODY_COLOURS keys match no colour in base.png,`)
  console.warn(`   so remapping would have produced identical copies. Run --inspect`)
  console.warn(`   for the real hex values: ${unmapped.join(', ')}`)
}

console.log(`
✅ Wrote ${LAYERS_DIR}/

Next:
  1. Open the HashLips app and point it at this folder.
     Layer order: Background, Body, Face.
  2. Generate — but only 1100, not 1111. The remaining 11 are the Mystery cats.
  3. node scripts/apply-mystery.mjs   adds the 11 super rares to the build
  4. Upload with NFT UP, then set BASE_URI on the contract.`)
