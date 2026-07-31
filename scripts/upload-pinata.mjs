/**
 * Uploads a folder to Pinata as a single IPFS directory.
 *
 * NFT.Storage Classic (and NFTUp) were decommissioned in June 2024, so this
 * replaces that step. The whole folder goes up in one request because the
 * metadata needs ONE directory CID — tokenURI is BASE_URI + tokenId, so
 * <cid>/1, <cid>/2, … must all resolve under the same root.
 *
 * Your token stays in your environment and is never printed.
 *
 *   $env:PINATA_JWT="eyJ..."                        (PowerShell)
 *   node scripts/upload-pinata.mjs out/images
 *   node scripts/upload-pinata.mjs out/metadata
 *   node scripts/upload-pinata.mjs out/images --dry-run
 *
 * Get a JWT at app.pinata.cloud → API Keys → New Key (needs pinFileToIPFS).
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'

const ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS'
const GATEWAY  = 'https://gateway.pinata.cloud/ipfs'

/**
 * Read a key from .env.local if it isn't already in the environment.
 * .env* is gitignored, so the token can live in a file you edit directly rather
 * than being typed into a terminal or pasted into a chat.
 */
function fromEnvFile(key) {
  if (process.env[key]) return process.env[key]
  if (!existsSync('.env.local')) return undefined
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
    if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

const dir = process.argv[2]
const dry = process.argv.includes('--dry-run')

if (!dir || dir.startsWith('--')) {
  console.error('Usage: node scripts/upload-pinata.mjs <folder> [--dry-run]')
  process.exit(1)
}

const jwt = fromEnvFile('PINATA_JWT')
if (!jwt && !dry) {
  console.error('❌ PINATA_JWT not found.')
  console.error('   Add this line to .env.local (gitignored, never committed):')
  console.error('     PINATA_JWT=eyJ...')
  console.error('   Or set it in the shell:  $env:PINATA_JWT="eyJ..."')
  console.error('   Get one at app.pinata.cloud → API Keys → New Key')
  process.exit(1)
}
if (jwt && !/^eyJ/.test(jwt)) {
  console.error('❌ That doesn\'t look like a JWT — it should start with "eyJ".')
  console.error('   Pinata shows three values; you want the long JWT, not the API Key.')
  process.exit(1)
}

let names
try {
  names = readdirSync(dir).filter(f => statSync(join(dir, f)).isFile())
} catch {
  console.error(`❌ ${dir} not found.`)
  process.exit(1)
}
if (!names.length) {
  console.error(`❌ ${dir} is empty.`)
  process.exit(1)
}

// Sort numerically so progress reads sensibly; upload order doesn't affect the CID.
const numeric = n => parseInt(basename(n).replace(/\D/g, ''), 10) || 0
names.sort((a, b) => numeric(a) - numeric(b))

const root  = basename(dir)
const bytes = names.reduce((n, f) => n + statSync(join(dir, f)).size, 0)
const mb    = (bytes / 1024 / 1024).toFixed(1)

console.log(`${dir}: ${names.length} files, ${mb} MB`)
console.log(`  first: ${names[0]}   last: ${names[names.length - 1]}`)

if (dry) {
  console.log('\n(dry run — nothing uploaded)')
  process.exit(0)
}

// One multipart request: Pinata assembles the directory from the path prefixes.
const form = new FormData()
for (const name of names) {
  const buf = readFileSync(join(dir, name))
  form.append('file', new Blob([buf]), `${root}/${name}`)
}
form.append('pinataMetadata', JSON.stringify({ name: `clanker-cats-v2-${root}` }))
form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

console.log(`\nUploading… (${mb} MB — this is the slow part)`)
const started = Date.now()

let res
try {
  res = await fetch(ENDPOINT, {
    method:  'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body:    form,
  })
} catch (e) {
  console.error(`❌ Upload failed: ${e.message}`)
  process.exit(1)
}

if (!res.ok) {
  const body = await res.text().catch(() => '')
  console.error(`❌ Pinata returned ${res.status}`)
  if (res.status === 401) console.error('   Token rejected — check PINATA_JWT is the full JWT.')
  else if (res.status === 403) console.error('   Key lacks pinFileToIPFS permission, or plan limit reached.')
  else if (res.status === 413) console.error('   Payload too large for this plan.')
  console.error(`   ${body.slice(0, 300)}`)
  process.exit(1)
}

const { IpfsHash: cid, PinSize } = await res.json()
const secs = ((Date.now() - started) / 1000).toFixed(0)

console.log(`\n✅ ${cid}`)
console.log(`   ${(PinSize / 1024 / 1024).toFixed(1)} MB pinned in ${secs}s`)

// Verify the directory actually resolves before you rely on it.
const probe = names[0]
console.log(`\nVerifying ${GATEWAY}/${cid}/${probe} …`)
try {
  const check = await fetch(`${GATEWAY}/${cid}/${probe}`, { method: 'HEAD' })
  console.log(check.ok
    ? `   ✅ resolves (${check.headers.get('content-type') ?? 'unknown type'})`
    : `   ⚠️  gateway returned ${check.status} — may just be cold, retry in a minute`)
} catch {
  console.log('   ⚠️  gateway probe failed — content is pinned, the gateway is just slow')
}

console.log(`
Next:`)
if (root === 'images') {
  console.log(`  node scripts/set-image-uri.mjs ${cid}`)
  console.log(`  then upload out/metadata`)
} else {
  console.log(`  Keep this CID PRIVATE until the mint ends.`)
  console.log(`  Deploy with BASE_URI set to a placeholder, then after the mint:`)
  console.log(`    setBaseURI("ipfs://${cid}/")     ← note the trailing slash`)
}
