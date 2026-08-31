/**
 * Generate a cat collection from the layer art.
 *
 *   node art/rh/make-collection.mjs                 1111 cats
 *   node art/rh/make-collection.mjs --count 500
 *   node art/rh/make-collection.mjs --seed 7        a different draw
 *
 * Writes art/rh/out/images/<id>.png and art/rh/out/metadata/<id>.json.
 *
 * ── THE WEIGHTS ARE ALREADY IN THE FILENAMES ─────────────────────────────────
 *
 * "Aliem#300", "Blue#100", "Gmod#28" — the number after the hash is the trait's
 * weight, the HashLips convention the art was authored under. Picking uniformly
 * would quietly throw that away and make a Gmod background as common as a plain
 * blue one, which is not what the art says.
 *
 * ── EVERY CAT IS UNIQUE ──────────────────────────────────────────────────────
 *
 * 23 backgrounds x 8 bodies x 10 faces is 1840 combinations, so a collection
 * larger than that is impossible and one close to it gets slow to fill by
 * rejection. The generator refuses anything over the maximum rather than looping
 * forever, and gives up with a clear message if the draw stalls.
 *
 * ── DETERMINISTIC ────────────────────────────────────────────────────────────
 *
 * Seeded, so the same seed gives the same collection. A generator that produced
 * different art every run could not be re-run after a mistake without minting a
 * different set than the one that was reviewed.
 *
 * ── SIZE MATCHES THE EXISTING COLLECTION ─────────────────────────────────────
 *
 * Layers are 250x199 and V2's minted images are 1000x796 — exactly four times,
 * no rounding. Upscaled with nearest neighbour so the flat colour and the black
 * line stay hard-edged; anything smoother would blur the outline that carries
 * the whole style.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const LAYERS = 'layers'
const ORDER = ['Background', 'Body', 'Face']   // painted back to front
const OUT = 'art/rh/out'
const SCALE = 4                                 // 250x199 -> 1000x796

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name)
  return i > -1 ? process.argv[i + 1] : fallback
}
const COUNT = Number(arg('count', 1111))
const SEED = Number(arg('seed', 1))

/** mulberry32 — same family the fight sim uses, so a seed means something here too. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const r = rng(SEED)

/** "Aliem#300.png" -> { name: 'Aliem', weight: 300, file }. No hash means weight 100. */
function readLayer(dir) {
  return fs.readdirSync(path.join(LAYERS, dir))
    .filter(f => /\.png$/i.test(f))
    .map(f => {
      const bare = f.replace(/\.png$/i, '')
      const hash = bare.lastIndexOf('#')
      return {
        file: path.join(LAYERS, dir, f),
        name: hash > -1 ? bare.slice(0, hash) : bare,
        weight: hash > -1 ? Number(bare.slice(hash + 1)) || 100 : 100,
      }
    })
}

const sets = Object.fromEntries(ORDER.map(d => [d, readLayer(d)]))
const total = ORDER.reduce((n, d) => n * sets[d].length, 1)

console.log('  layers: ' + ORDER.map(d => d + ' ' + sets[d].length).join(', '))
console.log('  unique combinations possible: ' + total)

if (COUNT > total) {
  console.error('  cannot make ' + COUNT + ' unique cats from ' + total + ' combinations')
  process.exit(1)
}

/** Weighted pick, so the numbers in the filenames actually mean something. */
function pick(list) {
  const sum = list.reduce((n, t) => n + t.weight, 0)
  let roll = r() * sum
  for (const t of list) {
    roll -= t.weight
    if (roll <= 0) return t
  }
  return list[list.length - 1]
}

fs.mkdirSync(OUT + '/images', { recursive: true })
fs.mkdirSync(OUT + '/metadata', { recursive: true })

const seen = new Set()
const cats = []
let tries = 0
const CEILING = COUNT * 200

while (cats.length < COUNT) {
  if (++tries > CEILING) {
    console.error('  gave up after ' + tries + ' draws with ' + cats.length + ' cats — the pool is too small')
    process.exit(1)
  }
  const traits = Object.fromEntries(ORDER.map(d => [d, pick(sets[d])]))
  const key = ORDER.map(d => traits[d].name).join('|')
  if (seen.has(key)) continue
  seen.add(key)
  cats.push(traits)
}

console.log('  drew ' + cats.length + ' unique cats in ' + tries + ' tries')

const W = 250 * SCALE, H = 199 * SCALE
for (const [i, traits] of cats.entries()) {
  const id = i + 1

  const layers = []
  for (const d of ORDER) {
    layers.push({
      input: await sharp(traits[d].file).resize(W, H, { kernel: 'nearest' }).png().toBuffer(),
    })
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).png().toFile(OUT + '/images/' + id + '.png')

  /*
   * Shaped like the existing collection's metadata so the viewer, the fight and
   * the yard all read it without a special case — `CatMeta` in lib/collection.ts
   * is { name, image, attributes:[{trait_type,value}] }, and lib/yard.ts keys its
   * temperaments off the Face trait by name.
   */
  fs.writeFileSync(OUT + '/metadata/' + id + '.json', JSON.stringify({
    name: '#' + id,
    image: '',              // filled in at deploy time, once the host is known
    attributes: ORDER.map(d => ({ trait_type: d, value: traits[d].name })),
  }, null, 2))

  if (id % 100 === 0) console.log('    ' + id + ' / ' + cats.length)
}

/* What actually came out, so the weights can be checked rather than trusted. */
console.log('\n  trait counts:')
for (const d of ORDER) {
  const tally = new Map()
  for (const c of cats) tally.set(c[d].name, (tally.get(c[d].name) ?? 0) + 1)
  const rows = [...tally.entries()].sort((a, b) => b[1] - a[1])
    .map(([n, c]) => n + ' ' + (c / cats.length * 100).toFixed(1) + '%')
  console.log('    ' + d + ': ' + rows.join(', '))
}
console.log('\n  wrote ' + OUT + '/images and ' + OUT + '/metadata at ' + W + 'x' + H)
