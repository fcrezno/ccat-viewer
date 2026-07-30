/**
 * Rewrites the image URI in every generated metadata file.
 *
 * generate-v2.mjs writes `__BASE_IMAGE_URI__/<id>.png` as a placeholder, because
 * the images have to be uploaded before their CID exists. Once NFT UP gives you
 * the images CID, run this to point the metadata at them.
 *
 *   node scripts/set-image-uri.mjs ipfs://bafy…              (CID or full base URI)
 *   node scripts/set-image-uri.mjs ipfs://bafy… --dry-run    (preview only)
 *
 * A bare CID is prefixed with ipfs:// automatically. Trailing slashes are fine.
 * Safe to re-run: it replaces whatever base is currently there, so a wrong CID
 * can be corrected without regenerating.
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const META_DIR = join('out', 'metadata')

const raw = process.argv[2]
const dry = process.argv.includes('--dry-run')

if (!raw || raw.startsWith('--')) {
  console.error('Usage: node scripts/set-image-uri.mjs <cid-or-base-uri> [--dry-run]')
  process.exit(1)
}

// Accept a bare CID, an ipfs:// URI, or an https gateway URL.
let base = raw.trim().replace(/\/+$/, '')
if (!/^[a-z]+:\/\//i.test(base)) base = `ipfs://${base}`

if (!/^(ipfs|https?):\/\/.+/i.test(base)) {
  console.error(`❌ "${raw}" doesn't look like a CID or URI.`)
  process.exit(1)
}

let files
try {
  files = readdirSync(META_DIR)
} catch {
  console.error(`❌ ${META_DIR} not found — run generate-v2.mjs first.`)
  process.exit(1)
}

let changed = 0
let already = 0
const problems = []

for (const f of files) {
  const path = join(META_DIR, f)
  let meta
  try {
    meta = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    problems.push(`${f}: not valid JSON`)
    continue
  }

  if (typeof meta.image !== 'string') {
    problems.push(`${f}: no image field`)
    continue
  }

  // Keep only the filename, swap whatever base preceded it.
  const filename = meta.image.split('/').pop()
  if (!/^\d+\.png$/.test(filename)) {
    problems.push(`${f}: unexpected image filename "${filename}"`)
    continue
  }

  const next = `${base}/${filename}`
  if (next === meta.image) { already++; continue }

  if (!dry) {
    meta.image = next
    writeFileSync(path, JSON.stringify(meta, null, 2))
  }
  changed++
}

console.log(`${dry ? 'Would rewrite' : 'Rewrote'} ${changed} of ${files.length} files`)
if (already)  console.log(`${already} already pointed at this base`)

if (problems.length) {
  console.error(`\n❌ ${problems.length} problem file(s):`)
  problems.slice(0, 10).forEach(p => console.error(`   ${p}`))
  if (problems.length > 10) console.error(`   …and ${problems.length - 10} more`)
  process.exit(1)
}

if (!dry) {
  // Verify no placeholder survived — a stray one means broken art on OpenSea.
  const left = readdirSync(META_DIR).filter(f =>
    readFileSync(join(META_DIR, f), 'utf8').includes('__BASE_IMAGE_URI__'))
  if (left.length) {
    console.error(`\n❌ ${left.length} file(s) still contain __BASE_IMAGE_URI__: ${left.slice(0, 5).join(', ')}`)
    process.exit(1)
  }
  console.log('✅ No placeholders remain')
  console.log(`   Sample: ${JSON.parse(readFileSync(join(META_DIR, '1'), 'utf8')).image}`)
}
