/**
 * Merge V1's and V2's layer art into one set.
 *
 *   node art/rh/consolidate.mjs
 *
 * Writes art/rh/layers/{Background,Body,Face}, which make-collection.mjs can then
 * be pointed at.
 *
 * ── THE TWO SETS ARE SHAPED DIFFERENTLY ──────────────────────────────────────
 *
 * V2 (ccat-viewer/layers) is Background / Body / Face, with each body carrying
 * its own black outline.
 *
 * V1 (the Mochibit folder) is 1_Background / 2_Body_Color / 3_Body_Outline /
 * 4_Face — the colour and the line are separate, with ONE shared outline painted
 * over whichever colour was drawn. That is a nicer way to author it and a
 * different number of layers, so the two cannot simply be concatenated.
 *
 * V1's bodies are therefore FLATTENED here: colour first, the shared outline over
 * it, saved as a single Body in V2's shape. The result is what V1 always looked
 * like, just baked.
 *
 * Both sets are 250x199, which is the only reason any of this is straightforward.
 *
 * ── WEIGHTS AND NAMES SURVIVE ────────────────────────────────────────────────
 *
 * The "#30" suffixes are rarity weights and they carry over untouched. Names were
 * checked for collisions and there are none — V1's "Mountains#10" and V2's
 * "Mountains Classic#10" are different traits, and no face name appears twice —
 * so nothing has to be renamed and the trait names stay the ones the art was
 * authored with.
 *
 * The typo in "Whtie#40" is V1's own and is kept. It is what the trait is called
 * on 200 minted tokens; correcting it here would make this collection disagree
 * with those.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const V2 = 'layers'
const V1 = 'C:/Users/JPDom/OneDrive/Desktop/Documents and Projects/Mochibit/layers'
const OUT = 'art/rh/layers'

const pngs = dir => fs.readdirSync(dir).filter(f => /\.png$/i.test(f))
const bare = f => f.replace(/\.png$/i, '')

for (const d of ['Background', 'Body', 'Face']) fs.mkdirSync(path.join(OUT, d), { recursive: true })

const report = { Background: [], Body: [], Face: [] }

/* V2 copies straight across — it is already the target shape. */
for (const [src, dst] of [['Background', 'Background'], ['Body', 'Body'], ['Face', 'Face']]) {
  for (const f of pngs(path.join(V2, src))) {
    fs.copyFileSync(path.join(V2, src, f), path.join(OUT, dst, f))
    report[dst].push({ name: bare(f), from: 'v2' })
  }
}

/* V1's backgrounds and faces are the same shape, so they copy too. */
for (const [src, dst] of [['1_Background', 'Background'], ['4_Face', 'Face']]) {
  for (const f of pngs(path.join(V1, src))) {
    fs.copyFileSync(path.join(V1, src, f), path.join(OUT, dst, f))
    report[dst].push({ name: bare(f), from: 'v1' })
  }
}

/*
 * V1's bodies are flattened: colour, then the one shared outline over the top.
 * That order is not a guess — the outline is the black line drawn ON the colour,
 * and reversing it would bury the line.
 */
const outlineFile = pngs(path.join(V1, '3_Body_Outline'))[0]
const outline = await sharp(path.join(V1, '3_Body_Outline', outlineFile)).png().toBuffer()

for (const f of pngs(path.join(V1, '2_Body_Color'))) {
  const colour = await sharp(path.join(V1, '2_Body_Color', f)).png().toBuffer()
  await sharp({ create: { width: 250, height: 199, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: colour }, { input: outline }])
    .png().toFile(path.join(OUT, 'Body', f))
  report.Body.push({ name: bare(f), from: 'v1' })
}

/* A name in two sets would silently overwrite one of them. Checked, not assumed. */
let clashes = 0
for (const d of Object.keys(report)) {
  const seen = new Map()
  for (const t of report[d]) {
    const key = t.name.split('#')[0]
    if (seen.has(key)) { console.error('  CLASH in ' + d + ': "' + key + '" from ' + seen.get(key) + ' and ' + t.from); clashes++ }
    seen.set(key, t.from)
  }
}

console.log('  merged into ' + OUT + ':')
let total = 1
for (const d of ['Background', 'Body', 'Face']) {
  const n = report[d].length
  const v1 = report[d].filter(t => t.from === 'v1').length
  total *= n
  console.log('    ' + d.padEnd(12) + n + '  (v2 ' + (n - v1) + ' + v1 ' + v1 + ')')
}
console.log('  name clashes: ' + clashes)
console.log('  unique combinations: ' + total + '   (was 1840 from v2 alone)')
