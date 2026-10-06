/**
 * Assets for the s&box title screen, rebuilt on the web (components/TitleScreen).
 *
 *   node scripts/make-title-assets.mjs
 *
 * JP, 2026-09-28: "use the title screen as the mint page" — "the title screen
 * from the sandbox game". This takes its pieces from the s&box project:
 *
 *   BACKDROPS  At 60 fps, from the renderer's own loops: clanker-arena
 *              assets/bg/zones/<Zone>/f00000..f01199.png — 10 s at 120 frames a
 *              second (30 fps footage, each frame held 4, with a ripple that
 *              moves every frame). Every 2nd frame, so 600 at 60 fps. They used
 *              to come from the s&box set (f000..f149, BgFps 15 in
 *              BattleScreen.razor), and at 15 fps the whole arena stepped —
 *              JP, 2026-10-05: "its still choppy / why is it choppy". The same
 *              pictures, measured; the files came out no bigger.
 *              Encoded to one small looping MP4 per zone, so the page streams a
 *              video instead of hundreds of images.
 *
 *   PORTRAITS  The game's own portraits are res<id>.png, 168x168: a 4px paper
 *              ring, an 8px ink edge, the cat inside. Those are V1/V2 cats; the
 *              mint page shows ROBINHOOD cats, so the same frame is built here
 *              around V3 art, with the game's recipe (see below).
 */
import sharp from 'sharp'
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

const SBOX = process.env.SBOX_ARENA ?? 'C:/Users/JPDom/sbox-projects/clanker_arena'
const BG   = join(SBOX, 'Assets', 'art', 'bg')
const ARENA = process.env.CLANKER_ARENA ?? 'C:/Users/JPDom/OneDrive/Desktop/clanker-arena'
const LOOPS = join(ARENA, 'assets', 'bg', 'zones')
const OUT  = join('public', 'title')
/** The loops' own rate, and the rate the page plays them at. */
const SRC_FPS = 120
const FPS  = 60
const PORTRAITS = 64

mkdirSync(join(OUT, 'cats'), { recursive: true })

// ── backdrops ────────────────────────────────────────────────────────────────
const zones = readdirSync(BG).filter(z => existsSync(join(BG, z, 'f000.png')))
for (const z of zones) {
  // The loops' folders are capitalised (Forest); the s&box set's are not (forest).
  const loop = join(LOOPS, z.charAt(0).toUpperCase() + z.slice(1))
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-framerate', String(SRC_FPS), '-i', join(loop, 'f%05d.png'),
    '-vf', `fps=${FPS}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'slow', '-tune', 'animation',
    '-movflags', '+faststart', '-an',
    join(OUT, `${z}.mp4`),
  ])
  console.log(`backdrop ${z}.mp4`)
}

// ── portraits ────────────────────────────────────────────────────────────────
/*
 * THE GAME'S OWN RECIPE, copied from clanker-arena/tools/gen-fighters.mjs (which
 * builds Assets/art/cats/res<id>.png). The first version here cropped a square
 * out of the middle and the cats came out too big for the frame (JP: "the cat
 * pfps are not the right size"). The game does not crop — it fits the WHOLE
 * picture into the square, anchored at the top, where a cat's face is:
 *
 *   S = 2, DARK = 4*S, RING = 2*S, inner = 84*S - 2*(DARK + RING) = 144
 *   lanczos3, cover, position top; then TWO separate extends, dark then ring
 */
const S = 2, DARK = 4 * S, RING = 2 * S
const INNER = 84 * S - 2 * (DARK + RING)

// Spread across the collection rather than the first few, so the reel mixes.
const all = readdirSync(join('public', 'v3', 'images')).map(f => Number(f.replace('.png', ''))).filter(Boolean).sort((a, b) => a - b)
const step = Math.floor(all.length / PORTRAITS)
const ids = Array.from({ length: PORTRAITS }, (_, i) => all[i * step])

for (const id of ids) {
  const src = join('public', 'v3', 'images', `${id}.png`)
  const withDark = await sharp(src)
    .resize(INNER, INNER, { kernel: 'lanczos3', fit: 'cover', position: 'top' })
    .extend({ top: DARK, bottom: DARK, left: DARK, right: DARK, background: '#1a1a1a' })
    .png().toBuffer()
  await sharp(withDark)
    .extend({ top: RING, bottom: RING, left: RING, right: RING, background: '#fdfdf8' })
    .png().toFile(join(OUT, 'cats', `${id}.png`))
}

// ── poster frames: shown while a backdrop video loads, and blurred behind the page ──
for (const z of zones) {
  await sharp(join(BG, z, 'f000.png')).jpeg({ quality: 82 }).toFile(join(OUT, `${z}.jpg`))
}
console.log(`${ids.length} portraits -> ${OUT}/cats  (ids ${ids[0]}..${ids.at(-1)})`)
console.log(`zones: ${zones.join(', ')}`)
