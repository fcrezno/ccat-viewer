/**
 * Clanker Cats V2 generator — a drop-in for the HashLips Art Engine.
 *
 * Reads the HashLips-format `layers/` folder that prep-layers.mjs writes, samples
 * unique trait combinations against the `#weight` suffixes, composites them, and
 * emits images plus metadata. Mystery is inserted directly — it's standalone art
 * rather than a layer combination, so it can't come from the layer system.
 *
 *   node scripts/prep-layers.mjs      build layers/ from art/
 *   node scripts/generate-v2.mjs      generate the collection
 *
 * Output:
 *   out/images/<id>.png
 *   out/metadata/<id>            (no extension — matches tokenURI = BASE_URI + id)
 *
 * If you'd rather use the HashLips GUI, point it at layers/, generate
 * SUPPLY - MYSTERY_COUNT, then run apply-mystery.mjs instead of this.
 */
import sharp from 'sharp'
import { mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, basename, extname } from 'path'
import { SUPPLY, MYSTERY_COUNT, NAME, DESC } from './traits.config.mjs'

const LAYERS_DIR  = 'layers'
const OUT_DIR     = 'out'
const MYSTERY_ART = join('art', 'mystery', 'mystery.png')
const SCALE       = 8    // nearest-neighbour upscale of the final PNG

// Layer order is render order: background first, face last.
const AXES = [
  { dir: 'Background', trait: 'Background' },
  { dir: 'Body',       trait: 'Body Color' },
  { dir: 'Face',       trait: 'Face' },
]

// ── load layers ─────────────────────────────────────────────────────────────

/** `name#weight.png` → { name, weight, file } */
function loadAxis(dir) {
  const p = join(LAYERS_DIR, dir)
  if (!existsSync(p)) return []
  return readdirSync(p)
    .filter(f => extname(f).toLowerCase() === '.png')
    .map(f => {
      const stem = basename(f, extname(f))
      const [name, w] = stem.split('#')
      return { name: name.trim(), weight: Number(w) || 1, file: join(p, f) }
    })
}

const axes = AXES.map(a => ({ ...a, values: loadAxis(a.dir) }))

for (const a of axes) {
  if (!a.values.length) {
    console.error(`❌ No layers in ${join(LAYERS_DIR, a.dir)} — run prep-layers.mjs first.`)
    process.exit(1)
  }
}

const hasMystery = existsSync(MYSTERY_ART)
const mysteryN   = hasMystery ? MYSTERY_COUNT : 0
if (!hasMystery && MYSTERY_COUNT > 0)
  console.warn(`⚠️  ${MYSTERY_ART} missing — generating without the super rare.\n`)

const needed = SUPPLY - mysteryN
const space  = axes.reduce((n, a) => n * a.values.length, 1)

console.log('Layers:')
for (const a of axes) console.log(`  ${a.dir.padEnd(11)} ${String(a.values.length).padStart(3)}`)
console.log(`  ${'space'.padEnd(11)} ${space}`)

if (space < needed) {
  console.error(`\n❌ Only ${space} combinations but ${needed} are needed.`)
  process.exit(1)
}
console.log(`  ${(space / needed).toFixed(1)}x headroom for ${needed} layered cats\n`)

// ── weighted unique sampling ────────────────────────────────────────────────

function weightedPick(values) {
  const total = values.reduce((s, v) => s + v.weight, 0)
  let r = Math.random() * total
  for (const v of values) { r -= v.weight; if (r <= 0) return v }
  return values[values.length - 1]
}

/** Distinct combinations only — rolling independently would produce visible twins. */
function sampleUnique(n) {
  const seen = new Set()
  const out  = []
  let guard  = 0
  while (out.length < n) {
    if (++guard > n * 2000) { console.error('❌ Sampling stalled.'); process.exit(1) }
    const pick = axes.map(a => weightedPick(a.values))
    const key  = pick.map(p => p.name).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pick)
  }
  return out
}

const picks = sampleUnique(needed)

// Reserve random ids for the super rares so they're scattered through the supply.
const mysteryIds = new Set()
while (mysteryIds.size < mysteryN) mysteryIds.add(1 + Math.floor(Math.random() * SUPPLY))

// ── render ──────────────────────────────────────────────────────────────────

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(join(OUT_DIR, 'images'),   { recursive: true })
mkdirSync(join(OUT_DIR, 'metadata'), { recursive: true })

const base = await sharp(axes[0].values[0].file).metadata()
const W = base.width * SCALE
const H = base.height * SCALE

let pickIdx = 0
const tally = { Type: { Mystery: mysteryN, Standard: needed } }

for (let id = 1; id <= SUPPLY; id++) {
  let attributes

  if (mysteryIds.has(id)) {
    await sharp(MYSTERY_ART).resize(W, H, { kernel: 'nearest' }).png()
      .toFile(join(OUT_DIR, 'images', `${id}.png`))
    attributes = [{ trait_type: 'Type', value: 'Mystery' }]
  } else {
    const pick = picks[pickIdx++]
    const flat = await sharp(pick[0].file)
      .composite(pick.slice(1).map(p => ({ input: p.file })))
      .png().toBuffer()
    await sharp(flat).resize(W, H, { kernel: 'nearest' }).png()
      .toFile(join(OUT_DIR, 'images', `${id}.png`))

    attributes = axes.map((a, i) => ({ trait_type: a.trait, value: pick[i].name }))
    attributes.push({ trait_type: 'Type', value: 'Standard' })

    for (const [i, a] of axes.entries()) {
      tally[a.trait] ??= {}
      tally[a.trait][pick[i].name] = (tally[a.trait][pick[i].name] ?? 0) + 1
    }
  }

  writeFileSync(join(OUT_DIR, 'metadata', String(id)), JSON.stringify({
    name:        NAME(id),
    description: DESC,
    image:       `__BASE_IMAGE_URI__/${id}.png`,
    edition:     id,
    attributes,
  }, null, 2))

  if (id % 100 === 0) console.log(`  …${id}/${SUPPLY}`)
}

// ── rarity report ───────────────────────────────────────────────────────────

console.log('\nRarity:')
for (const [trait, values] of Object.entries(tally)) {
  console.log(`\n  ${trait}`)
  for (const [v, n] of Object.entries(values).sort((a, b) => b[1] - a[1]))
    console.log(`    ${String(n).padStart(4)}  ${((n / SUPPLY) * 100).toFixed(1).padStart(5)}%  ${v}`)
}

console.log(`\n✅ ${SUPPLY} images and metadata in ${OUT_DIR}/  (${W}x${H})`)
if (mysteryN) console.log(`   Mystery ids: ${[...mysteryIds].sort((a, b) => a - b).join(', ')}`)
console.log(`
⚠️  DELAYED REVEAL — do not publish this metadata before the mint ends.
    Token ids are assigned in mint order, so anyone who can read the metadata
    knows which position is a Mystery and can time their mint to take one.
    Point BASE_URI at a placeholder during the mint, then call setBaseURI()
    with the real folder once it's over.`)
