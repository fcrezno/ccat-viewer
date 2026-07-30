/**
 * Adds the Mystery super rares to a HashLips build.
 *
 * Mystery is standalone full art, not a layer combination, so HashLips can't
 * produce it. Generate 1100 with HashLips, then run this: it appends 11 Mystery
 * tokens and reshuffles every id so the rares land at random positions rather
 * than in a block at the end.
 *
 *   node scripts/apply-mystery.mjs
 *
 * Expects a standard HashLips build:
 *   build/images/1.png … 1100.png
 *   build/json/1.json  … 1100.json
 *
 * Writes build/images and build/json in place, renumbered 1…1111.
 */
import sharp from 'sharp'
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from 'fs'
import { join } from 'path'
import { SUPPLY, MYSTERY_COUNT, NAME, DESC } from './traits.config.mjs'

const BUILD       = 'build'
const IMAGES      = join(BUILD, 'images')
const JSON_DIR    = join(BUILD, 'json')
const MYSTERY_ART = join('art', 'mystery', 'mystery.png')
const TMP         = join(BUILD, '.tmp')

for (const p of [IMAGES, JSON_DIR]) {
  if (!existsSync(p)) {
    console.error(`❌ ${p} not found — run the HashLips generation first.`)
    process.exit(1)
  }
}
if (!existsSync(MYSTERY_ART)) {
  console.error(`❌ ${MYSTERY_ART} not found — export the Mystery layer from Krita.`)
  process.exit(1)
}

const generated = readdirSync(IMAGES).filter(f => f.endsWith('.png')).length
const expected  = SUPPLY - MYSTERY_COUNT

if (generated !== expected) {
  console.error(`❌ Expected ${expected} generated images but found ${generated}.`)
  console.error(`   HashLips should generate ${expected}; this script adds the remaining ${MYSTERY_COUNT}.`)
  process.exit(1)
}

// Match the generated art's dimensions so the rares don't stand out by size.
const sample = await sharp(join(IMAGES, '1.png')).metadata()
const myst   = await sharp(MYSTERY_ART).metadata()
if (myst.width !== sample.width || myst.height !== sample.height) {
  console.log(`Scaling Mystery ${myst.width}x${myst.height} → ${sample.width}x${sample.height} (nearest)`)
}
const mysteryPng = await sharp(MYSTERY_ART)
  .resize(sample.width, sample.height, { kernel: 'nearest', fit: 'contain' })
  .png().toBuffer()

// Build the full running order: 1100 generated + 11 Mystery, then shuffle so the
// rares are scattered through the id space instead of sitting at the end.
const order = [
  ...Array.from({ length: expected }, (_, i) => ({ kind: 'gen', src: i + 1 })),
  ...Array.from({ length: MYSTERY_COUNT }, () => ({ kind: 'mystery' })),
]
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1))
  ;[order[i], order[j]] = [order[j], order[i]]
}

rmSync(TMP, { recursive: true, force: true })
mkdirSync(join(TMP, 'images'), { recursive: true })
mkdirSync(join(TMP, 'json'),   { recursive: true })

const mysteryIds = []

for (let i = 0; i < order.length; i++) {
  const id = i + 1
  const entry = order[i]

  if (entry.kind === 'mystery') {
    mysteryIds.push(id)
    writeFileSync(join(TMP, 'images', `${id}.png`), mysteryPng)
    writeFileSync(join(TMP, 'json', `${id}.json`), JSON.stringify({
      name:        NAME(id),
      description: DESC,
      image:       `__BASE_IMAGE_URI__/${id}.png`,
      edition:     id,
      attributes:  [{ trait_type: 'Type', value: 'Mystery' }],
    }, null, 2))
    continue
  }

  cpSync(join(IMAGES, `${entry.src}.png`), join(TMP, 'images', `${id}.png`))

  const meta = JSON.parse(readFileSync(join(JSON_DIR, `${entry.src}.json`), 'utf8'))
  meta.name    = NAME(id)
  meta.edition = id
  // Tag the ordinary cats so collectors can filter Mystery vs Standard.
  meta.attributes = [...(meta.attributes ?? []), { trait_type: 'Type', value: 'Standard' }]
  writeFileSync(join(TMP, 'json', `${id}.json`), JSON.stringify(meta, null, 2))
}

rmSync(IMAGES,   { recursive: true, force: true })
rmSync(JSON_DIR, { recursive: true, force: true })
cpSync(join(TMP, 'images'), IMAGES,   { recursive: true })
cpSync(join(TMP, 'json'),   JSON_DIR, { recursive: true })
rmSync(TMP, { recursive: true, force: true })

console.log(`✅ ${SUPPLY} tokens — ${expected} generated + ${MYSTERY_COUNT} Mystery`)
console.log(`   Mystery ids: ${mysteryIds.sort((a, b) => a - b).join(', ')}`)
console.log(`
⚠️  DELAYED REVEAL — do not publish this metadata before the mint ends.
    Token ids are assigned in mint order, so anyone who can read the metadata
    knows which position is a Mystery and can time their mint to take one.
    Point BASE_URI at a placeholder during the mint, then call setBaseURI()
    with the real folder once it's over.`)
