/**
 * Pack the one-frame documents back into sheets, and replay them.
 *
 *   node art/impact/pack-frames.mjs
 *
 * The other end of make-frame-ora.mjs. JP draws in art/impact/frames/*.ora, one
 * 48x48 document per effect with the frames as layers; this reads them back and
 * lays them out as the 240-wide strips the game will use, then rebuilds the GIFs
 * so the result can be watched at once.
 *
 * ── IT READS LAYERS BY NAME ──────────────────────────────────────────────────
 *
 * Only layers called "FRAME 1" to "FRAME 5" are used. Everything else in the
 * document — the guide, the card-coloured background, the dimmed references — is
 * ignored no matter how it was left, which is what makes those layers safe to
 * have. There is no "remember to hide it before exporting" step, because there is
 * no manual export.
 *
 * VISIBILITY IS IGNORED TOO, on purpose. A frame that was switched off while
 * drawing another one is still that frame's art; skipping it would silently drop
 * work and leave a hole in the middle of an animation.
 *
 * An EMPTY frame layer is reported rather than passed over, since five frames
 * that quietly became three is exactly the kind of thing that is noticed only
 * once it is in the game.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import { readOra } from './ora-read.mjs'

const S = 48, FRAMES = 5
const DIR = 'art/impact/frames'

const SHEETS = [
  ['impact', ['WEAK', 'HIT', 'CRIT']],
  ['attack-physical', ['SLASH', 'CROSS', 'STRIKE', 'PUMMEL', 'PIERCE']],
  ['attack-magic', ['ZOOMIES', 'FORGE', 'COOLANT', 'SIGNAL', 'GLITCH', 'CRYO', 'SCRAP', 'STRAY']],
]

/**
 * WORK ON A LAYER THAT WILL NEVER BE EXPORTED.
 *
 * Only "FRAME n" is packed, so drawing on the guide or the background produces
 * art that this script ignores and that therefore never reaches the game. Krita
 * opens these documents with the GUIDE layer selected — it is simply the topmost
 * — so the first stroke of a session is the one most likely to land in the wrong
 * place, and nothing about the canvas would look wrong.
 *
 * Counting lit pixels rather than comparing bytes, because Krita re-encodes every
 * PNG it saves: identical art comes back as different bytes, and a byte check
 * would cry wolf on every single save.
 *
 * The background is checked by COLOUR instead of alpha — it is opaque already, so
 * painting on it does not change how many pixels are lit, only which colour they
 * are.
 */
async function strayWork(doc, pristineGuideLit) {
  const out = []

  const guide = doc.layers.find(l => l.name.startsWith('GUIDE'))
  if (guide) {
    const { data, info } = await sharp(guide.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let lit = 0
    for (let i = 3; i < data.length; i += info.channels) if (data[i] > 0) lit++
    /*
     * FEWER PIXELS THAN THE CURRENT GUIDE MEANS A STALE DOCUMENT, NOT STRAY WORK.
     *
     * The first version of the guide lost its top and left borders to a clipped
     * SVG stroke, so documents built against it carry 260 lit pixels where the
     * fixed guide has 351. Reporting that as "you drew on the guide" sends
     * somebody hunting for a mistake they did not make.
     */
    if (lit < pristineGuideLit) {
      out.push('  !! the GUIDE layer is older than the current one (' + lit + ' lit, now ' +
        pristineGuideLit + ') — rebuild with make-frame-ora.mjs')
    } else if (lit > pristineGuideLit) {
      out.push('  !! the GUIDE layer has been drawn on (' + lit + ' lit, expected ' +
        pristineGuideLit + ') — that layer is NEVER exported')
    }
  }

  const bg = doc.layers.find(l => l.name === 'BACKGROUND')
  if (bg) {
    const { data, info } = await sharp(bg.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let odd = 0
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] !== 0x12 || data[i + 1] !== 0x12 || data[i + 2] !== 0x1c) odd++
    }
    if (odd) out.push('  !! the BACKGROUND layer has been drawn on (' + odd +
      ' pixels off the card colour) — that layer is NEVER exported')
  }

  const known = /^(FRAME [1-5]|ref [1-5]|GUIDE.*|BACKGROUND)$/
  for (const l of doc.layers) {
    if (!known.test(l.name.trim())) {
      out.push('  !! layer "' + l.name + '" is not exported — only "FRAME 1".."FRAME 5" are')
    }
  }
  return out
}

/** Whether anything was actually painted. Alpha only: colour is JP's business. */
async function drawn(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 3; i < data.length; i += info.channels) if (data[i] > 0) return true
  return false
}

/*
 * What an untouched guide looks like, taken from the generated sheet rather than
 * hard-coded — so it stays right if the guide is ever redrawn.
 */
const pristine = await (async () => {
  const { data, info } = await sharp('art/impact/impact-guide.png')
    .extract({ left: 0, top: 0, width: S, height: S })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let lit = 0
  for (let i = 3; i < data.length; i += info.channels) if (data[i] > 0) lit++
  return lit
})()

let touched = 0
for (const [sheet, rows] of SHEETS) {
  const parts = []
  const notes = []
  let any = false

  for (const [row, name] of rows.entries()) {
    const file = DIR + '/' + name.toLowerCase() + '.ora'
    if (!fs.existsSync(file)) { notes.push('  ' + name + ': no document'); continue }

    const doc = readOra(file)
    if (doc.width !== S || doc.height !== S) {
      notes.push('  ' + name + ': canvas is ' + doc.width + 'x' + doc.height + ', expected ' + S + 'x' + S)
      continue
    }

    notes.push(...(await strayWork(doc, pristine)).map(w => w.replace('  !!', '  !! ' + name + ':')))

    let empties = 0
    for (let f = 0; f < FRAMES; f++) {
      const layer = doc.layers.find(l => l.name.trim().toUpperCase() === 'FRAME ' + (f + 1))
      if (!layer) { notes.push('  ' + name + ': no layer "FRAME ' + (f + 1) + '"'); continue }
      if (!(await drawn(layer.png))) { empties++; continue }
      parts.push({ input: layer.png, left: f * S, top: row * S })
      any = true
    }
    if (empties && empties < FRAMES) notes.push('  ' + name + ': ' + empties + ' of ' + FRAMES + ' frames still empty')
    if (empties === FRAMES) notes.push('  ' + name + ': nothing drawn yet')
  }

  if (!any) {
    console.log(sheet + ': nothing drawn yet, sheet left alone')
    notes.forEach(n => console.log(n))
    continue
  }

  const out = 'art/impact/' + sheet + '-drawn.png'
  await sharp({
    create: { width: S * FRAMES, height: S * rows.length, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(parts).png().toFile(out)

  /*
   * WRITTEN BESIDE THE ROUGH, NOT OVER IT.
   *
   * "-drawn" rather than replacing "-rough": the rough is generated by a script
   * and would come back on the next run, so overwriting it would throw away real
   * art the first time anybody regenerated anything.
   */
  console.log(sheet + ': wrote ' + out + ' (' + parts.length + ' frames)')
  notes.forEach(n => console.log(n))
  touched++
}

if (!touched) console.log('\nNothing to pack yet. Draw in ' + DIR + '/*.ora and run this again.')
else console.log('\nRun `node art/impact/make-gifs.mjs` to replay them.')
