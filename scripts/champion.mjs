/**
 * Award a title to a token by editing the metadata this app serves.
 *
 *   node scripts/champion.mjs 296 "Season 1 Champion"     # dry run
 *   node scripts/champion.mjs 296 "Season 1 Champion" --apply
 *
 * The contract's baseURI points at this app, so a title costs no gas and needs
 * no contract call — it is a file edit plus a deploy. That is also the reason
 * to be careful: it is trivially reversible by whoever runs this, so a title
 * only means something if the event that awarded it was fair.
 *
 * Titles go in their own trait_type rather than overwriting `Type`, which
 * belongs to the artwork. A title is earned after mint; the art is not.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DIR = resolve(process.cwd(), 'public/v2/metadata')
const TRAIT = 'Title'

const [idArg, title] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const apply = process.argv.includes('--apply')

if (!idArg || !title) {
  console.error('usage: node scripts/champion.mjs <tokenId> "<title>" [--apply]')
  process.exit(1)
}

const id = Number(idArg)
if (!Number.isInteger(id) || id < 1 || id > 1111) {
  console.error(`token ${idArg} is outside the 1..1111 supply`)
  process.exit(1)
}

const file = `${DIR}/${id}`
let meta
try {
  meta = JSON.parse(readFileSync(file, 'utf8'))
} catch {
  console.error(`no metadata at ${file}`)
  process.exit(1)
}

const existing = meta.attributes.find(a => a.trait_type === TRAIT)
if (existing?.value === title) {
  console.log(`#${id} already holds "${title}" — nothing to do`)
  process.exit(0)
}
if (existing) {
  console.log(`#${id} currently holds "${existing.value}" — it will be replaced`)
  existing.value = title
} else {
  meta.attributes.push({ trait_type: TRAIT, value: title })
}

const out = JSON.stringify(meta, null, 2) + '\n'

console.log(`\n#${id}  ${meta.name}`)
for (const a of meta.attributes) {
  const mark = a.trait_type === TRAIT ? '  <-- new' : ''
  console.log(`  ${a.trait_type.padEnd(12)} ${a.value}${mark}`)
}

if (!apply) {
  console.log('\ndry run — nothing written. re-run with --apply')
  process.exit(0)
}

writeFileSync(file, out)
console.log(`\nwrote ${file}`)
console.log('commit, push, and let Vercel redeploy, then refresh metadata on the marketplace.')
