/**
 * Wrap every template as a layered .ora, ready to open in Krita and draw on.
 *
 *   node art/impact/make-ora.mjs
 *
 * JP: "add those templates to krita so i can draw it myself."
 *
 * A loose PNG makes him rebuild the same document every time: import the guide,
 * put it on its own layer, add a layer under it, remember to hide the guide
 * before exporting. This is that document, already assembled.
 *
 * ── THE LAYER ORDER IS THE INSTRUCTION ───────────────────────────────────────
 *
 * Top to bottom, which is how they appear in Krita's docker:
 *
 *   GUIDE - HIDE BEFORE EXPORT   cells, centre lines, and the body circle
 *   DRAW HERE                    empty, and selected: the one to paint on
 *   ROUGH - REPLACE ME           faint, at 35%, purely as a reference
 *
 * The rough sits at the BOTTOM and dimmed rather than being left out, because a
 * blank cell does not say where a frame's shape is supposed to reach by frame
 * three. It is a target to beat, and hiding it is one click.
 *
 * The names carry their own instructions, since a file opened three weeks from
 * now has no other way to explain itself.
 */
import sharp from 'sharp'
import fs from 'node:fs'
import { ora } from './ora.mjs'

const OUT = 'art/impact'
const ICONS = 'art/icons'

/*
 * Each entry: the base name, where its parts live, and what the file is for.
 * The mode icons come along too — they are the same job, drawn at a different
 * size, and there is no reason to make him assemble that one by hand either.
 */
const DOCS = [
  { name: 'impact',          dir: OUT,   about: 'generic hit: weak / hit / crit' },
  { name: 'attack-physical', dir: OUT,   about: 'slash, cross, strike, pummel, pierce' },
  { name: 'attack-magic',    dir: OUT,   about: 'one spell per type' },
  { name: 'icons',           dir: ICONS, about: 'mode icons' },
]

const empty = (w, h) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png().toBuffer()

for (const { name, dir, about } of DOCS) {
  const guidePath = dir + '/' + name + '-guide.png'
  const roughPath = dir + '/' + name + '-rough.png'
  if (!fs.existsSync(guidePath)) { console.log('skip ' + name + ': no guide'); continue }

  const meta = await sharp(guidePath).metadata()
  const { width, height } = meta

  const guide = fs.readFileSync(guidePath)
  const rough = fs.existsSync(roughPath) ? fs.readFileSync(roughPath) : await empty(width, height)
  const draw = await empty(width, height)

  /*
   * The merged image is what a viewer that cannot read layers shows, and it is
   * ALSO what Krita puts in the file browser's thumbnail. Guide over rough on the
   * card colour, so the tile is recognisable rather than a transparent square.
   */
  const merged = await sharp({
    create: { width, height, channels: 4, background: { r: 0x12, g: 0x12, b: 0x1c, alpha: 1 } },
  }).composite([{ input: rough }, { input: guide }]).png().toBuffer()

  const file = dir + '/' + name + '.ora'
  fs.writeFileSync(file, ora({
    width, height, merged,
    layers: [
      { name: 'GUIDE - HIDE BEFORE EXPORT', png: guide, opacity: 1 },
      { name: 'DRAW HERE', png: draw, opacity: 1 },
      { name: 'ROUGH - REPLACE ME', png: rough, opacity: 0.35 },
    ],
  }))

  console.log('wrote ' + file + ' — ' + width + 'x' + height + ', 3 layers (' + about + ')')
}
