/**
 * The game's HP chrome for the mint page (components/MintStage).
 *
 *   node scripts/make-mint-hud.mjs
 *
 * JP, 2026-09-29: "make the hp bar more like the game". In the game the bar is
 * not only its fill: battlescreen.png draws a hand-drawn outline round each bar,
 * with the KO box between them, and the fill shows through it. The mint page has
 * one cat, so it takes the KO box and the RIGHT bar, whose fill drains toward
 * the box — so a sold-out collection empties into KO.
 *
 * The left bar's outline runs into the KO box and no column between them is
 * clear. x 208 is the narrowest cut (it drops the left bar's tip and pip), and
 * everything to the right of it is the KO box, the right bar and its two pips.
 *
 * Output stays 1x game pixels; the stage scales it with image-rendering: pixelated.
 */
import sharp from 'sharp'

const SBOX = process.env.SBOX_ARENA ?? 'C:/Users/JPDom/sbox-projects/clanker_arena'
export const CROP = { left: 208, top: 8, width: 244, height: 52 }

await sharp(`${SBOX}/Assets/art/battlescreen.png`)
  .extract(CROP)
  .png()
  .toFile('public/game/hud-ko-right.png')

console.log('public/game/hud-ko-right.png', CROP)
