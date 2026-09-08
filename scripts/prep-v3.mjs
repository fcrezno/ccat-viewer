/**
 * Turn the generated V3 art into what the app and a marketplace can actually
 * serve — the step between `art/rh/make-collection.mjs` and a deploy.
 *
 *   node art/rh/make-collection.mjs --count 1111     46 seconds, art/rh/out/
 *   node scripts/prep-v3.mjs                         this, into public/v3/
 *
 * The generator deliberately stops short: its own comment says the image URL is
 * "filled in at deploy time, once the host is known". Four other things also had
 * to wait, and every one of them is a silent failure rather than an error.
 *
 * ── WHAT THIS FIXES, AND WHAT EACH ONE WOULD HAVE COST ───────────────────────
 *
 * 1. `"image": ""`. A collection of blank cards on every marketplace.
 *
 * 2. `"name": "#1"`. V2's is "Clanker Cats V2 #1". A wallet listing a token
 *    called "#1" next to somebody else's "#1" is unreadable.
 *
 * 3. FILENAMES END IN .json. V2's do not, and that is not a style choice —
 *    `tokenURI` is `baseURI + tokenId` with nothing appended, so the file the
 *    route serves has to be named exactly `1`, not `1.json`.
 *
 * 4. THE TRAIT IS CALLED "Body". V2 calls it "Body Color", and three things in
 *    this app read it by that name — `lib/describe.ts` matches /body.?color/i for
 *    the creature sheet's coat line, and the yard keys temperaments off Face
 *    beside it. A V3 cat would have loaded with no coat and nobody would have
 *    seen an error; the description would just have been one line shorter.
 *
 * 5. NO "Type" TRAIT. V2 carries `Type: Standard`, and it is what Mystery cats
 *    are distinguished by. Absent, V3 cats sort into a different bucket from V1
 *    and V2 on any filter that groups by it.
 *
 * ── THE HOST ─────────────────────────────────────────────────────────────────
 *
 * Passed in, because it is baked into 1111 files and into the contract's
 * baseURI. Defaults to the app's own origin, which is where V2 is served from.
 *
 *   node scripts/prep-v3.mjs --host https://ccat-viewer.vercel.app
 *
 * Re-runnable: it rewrites public/v3 from art/rh/out every time, so changing the
 * host is this command again, not a migration.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const IN = join('art', 'rh', 'out')
const OUT = join('public', 'v3')

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/* No trailing slash — every use below adds its own. */
const HOST = arg('--host', 'https://ccat-viewer.vercel.app').replace(/\/+$/, '')
const NAME = arg('--name', 'Clanker Cats V3')
const DESC = arg('--desc', 'Clanker Cats V3 — free mint on Robinhood Chain.')

if (!existsSync(IN)) {
  console.error(`\n  ${IN} is not there.\n\n  It is gitignored (21MB) and rebuilt from the tracked layers:\n    node art/rh/make-collection.mjs --count 1111\n`)
  process.exit(1)
}

const ids = readdirSync(join(IN, 'metadata'))
  .map(f => f.replace(/\.json$/, ''))
  .filter(f => /^\d+$/.test(f))
  .sort((a, b) => Number(a) - Number(b))

if (!ids.length) { console.error('no metadata in ' + IN); process.exit(1) }

/* Rewritten from scratch, so a smaller re-run cannot leave stale files behind. */
rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'images'), { recursive: true })
mkdirSync(join(OUT, 'metadata'), { recursive: true })

let renamedTrait = 0
for (const id of ids) {
  const raw = JSON.parse(readFileSync(join(IN, 'metadata', id + '.json'), 'utf8'))

  const attributes = (raw.attributes ?? []).map(a => {
    /* The one rename. See 4 above — silent, and only visible as a missing line. */
    if (a.trait_type === 'Body') { renamedTrait++; return { ...a, trait_type: 'Body Color' } }
    return a
  })
  if (!attributes.some(a => a.trait_type === 'Type')) {
    attributes.push({ trait_type: 'Type', value: 'Standard' })
  }

  const meta = {
    name: `${NAME} #${id}`,
    description: DESC,
    image: `${HOST}/v3/images/${id}.png`,
    edition: Number(id),
    attributes,
  }

  /* No extension. tokenURI is baseURI + tokenId and appends nothing. */
  writeFileSync(join(OUT, 'metadata', id), JSON.stringify(meta, null, 2))
  copyFileSync(join(IN, 'images', id + '.png'), join(OUT, 'images', id + '.png'))
}

/* The card an unminted token shows. V2 ships one; V3 borrows it until JP draws one. */
const ph = join('public', 'v2', 'placeholder.png')
if (existsSync(ph)) copyFileSync(ph, join(OUT, 'placeholder.png'))

console.log(`\n  ${ids.length} cats -> ${OUT}`)
console.log(`  host      ${HOST}`)
console.log(`  name      ${NAME} #<id>`)
console.log(`  renamed   ${renamedTrait} "Body" -> "Body Color"`)
console.log(`  baseURI   ${HOST}/v3/cat/    (trailing slash matters)\n`)
