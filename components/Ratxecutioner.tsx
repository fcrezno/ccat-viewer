'use client'

import { useEffect, useRef, useState } from 'react'
import { CELL_H, TRACKING, cell, glyph } from '@/lib/font'
import { BANNER_TOKENS, MEME_ADS, bannerFile } from '@/lib/banners'
import { ANNOUNCERS, voiceFile } from '@/lib/announcers'
import { VOICE_MS } from '@/lib/announcerVoice'
import { CURTAIN_H, CURTAIN_INKS, CURTAIN_MS, CURTAIN_W, CurtainHalves } from '@/components/MapDive'
import { MAP as SIM_MAP, TICK_S } from '@/lib/ratxSim'
import { RatxNet, keyBits } from '@/lib/ratxNet'
import { RatxSticks } from '@/components/RatxSticks'
import { babble } from '@/lib/babble'
/** One game loop at a time, ever (the phone flicker: two loops drawing over each other). */
let LOOP_ID = 0

/**
 * RATXECUTIONER — the first-person rat hunt, as a Doom mod with cats.
 *
 * JP, 2026-10-13: "remember that rat mini game that was a first-person shooter
 * based on Doom? ... could we do something along the lines of like a
 * first-person Doom mod? ... Call it RATXCUTIONER". It is Rat King's Lair from
 * the 7-Eleven game (Usagi editor, Lua: fp_raycast_wall in runtime.js) rebuilt
 * for the browser — the same DDA raycast, and JP's own art from that game: the
 * green bricks (lit and shaded halves, the Wolfenstein way), the rat, the
 * explosion and the gold nuggets.
 *
 * Single player first: waves of rats, nuggets for ammo and health, a Doom-style
 * status bar whose face is the player's own cat, flashing red when bitten. Multiplayer
 * (peer-to-peer room codes) comes after — see memory clanker-cats-ratxcutioner.
 *
 * IN CLANKER CATS' COLOURS (JP: "make the colors fit more of the clanker cat
 * style"): the paper-blue checker on the floor, the Windows 98 title-bar navy for
 * the sky, JP's bricks re-inked into the site's blues, a grey 98 status bar. And
 * THE ADS AS POSTERS on the walls ("add the ads on the walls as if they were
 * posters"): the banner squares and YOU WON pop-ups, pinned to the brick.
 *
 * Drawn into a 320x200 canvas and scaled up with no smoothing.
 */

/*
 * SHARPER (JP: "make the poster gifs way more sharper and readable, as with the
 * text as well and pfp"): the view renders at S times the old 320x200, so the
 * posters, the face and the lettering get S*S the pixels. The overlays (gun, HUD,
 * words) keep the 320 layout and are drawn through a S-times transform, which puts
 * the bitmap font at its native size for crisp letters.
 */
const S = 2
const LW = 320, LH = 200, LBAR = 32, LVIEW = LH - LBAR          // the layout, in old pixels
const W = LW * S, H = LH * S, BAR = LBAR * S, VIEW_H = H - BAR  // the canvas, in real pixels
const FOV = 0.66                         // camera plane length: ~66 degrees, Wolfenstein's
const MOVE = 2.6, TURN = 2.4, MOUSE = 0.0026
const RAT_SPEED = 1.15, RAT_HP = 2, BITE_DPS = 9
const START_AMMO = 40, MAX_AMMO = 99

/*
 * A COLOUR PER WAVE (JP: "change the colors for each wave"): the five arena
 * inks in turn — Town blue, Temple purple, Caves olive, Mountain orange, Forest
 * green — on the bricks, the sky, the floor, and the curtain's lettering.
 */
const hexRGB = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mixRGB = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
/** Where the words of "Wave N!" end in each file (ms), so GO! follows the words, not the echo. */
const WAVE_SAID_MS = [1032, 1042, 1149, 1089, 1227, 1046, 1196, 961, 1050, 1106, 1306, 1170, 1479, 1490, 1443, 1395, 1451, 1369, 1386, 1286, 1535, 1556, 1625, 1560, 1553]
export const waveInk = (wave: number) => CURTAIN_INKS[(wave - 1) % CURTAIN_INKS.length]
function waveTheme(wave: number) {
  const c = hexRGB(waveInk(wave)), black = [10, 10, 24], white = [255, 255, 255]
  return {
    ramp: [mixRGB(c, black, 0.85), mixRGB(c, black, 0.55), c, mixRGB(c, white, 0.45), mixRGB(c, white, 0.8)],
    skyTop: mixRGB(c, black, 0.7), skyLow: c,
    checkA: mixRGB(c, white, 0.82), checkB: mixRGB(c, white, 0.68),
  }
}

/*
 * THE LAIR, NEW EVERY GAME (JP, 2026-10-13: "randomize the map so its not the same
 * one twice"). # brick, . floor, P the player, R a rat's den, N a nugget.
 *
 * A maze is carved on the odd squares (the recursive backtracker), then walls are
 * knocked through for loops and a few rooms are cleared, so the rats can come at
 * you from two sides and you can circle away. The dens go far from the start; the
 * nuggets go anywhere but on top of you. A layout the same as the last one is
 * thrown away and drawn again.
 */
const MW = 20, MH = 20
let MAP: string[] = []
let lastMap = ''
function makeMap(): string[] {
  for (;;) {
    const g = Array.from({ length: MH }, () => Array<string>(MW).fill('#'))
    const inside = (x: number, y: number) => x > 0 && y > 0 && x < MW - 1 && y < MH - 1
    // The maze, on the odd squares 1..17.
    const stack: [number, number][] = [[1, 1]]
    g[1][1] = '.'
    while (stack.length) {
      const [x, y] = stack[stack.length - 1]
      const next = ([[2, 0], [-2, 0], [0, 2], [0, -2]] as const)
        .map(([ax, ay]) => [x + ax, y + ay, ax, ay] as const)
        .filter(([nx, ny]) => nx < MW - 2 && ny < MH - 2 && inside(nx, ny) && g[ny][nx] === '#')
      if (!next.length) { stack.pop(); continue }
      const [nx, ny, ax, ay] = next[Math.floor(Math.random() * next.length)]
      g[y + ay / 2][x + ax / 2] = '.'; g[ny][nx] = '.'
      stack.push([nx, ny])
    }
    // The last row and column (18) are not maze squares: open some of them into the maze.
    for (let i = 1; i < MW - 2; i += 2) {
      if (Math.random() < 0.5) g[i][MW - 2] = '.'
      if (Math.random() < 0.5) g[MH - 2][i] = '.'
    }
    // Loops: a wall with floor on both sides is knocked through about a third of the time.
    for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
      if (g[y][x] !== '#') continue
      const ew = g[y][x - 1] === '.' && g[y][x + 1] === '.', ns = g[y - 1][x] === '.' && g[y + 1][x] === '.'
      if ((ew || ns) && Math.random() < 0.3) g[y][x] = '.'
    }
    // A few rooms, so the fights are not all in corridors.
    for (let r = 0; r < 4; r++) {
      const w = 2 + Math.floor(Math.random() * 3), h = 2 + Math.floor(Math.random() * 3)
      const x0 = 1 + Math.floor(Math.random() * (MW - 2 - w)), y0 = 1 + Math.floor(Math.random() * (MH - 2 - h))
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) g[y][x] = '.'
    }
    // How far each square is from the start, walking.
    const dist = new Map<string, number>([['1,1', 0]])
    const q: [number, number][] = [[1, 1]]
    while (q.length) {
      const [x, y] = q.shift()!
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ax, ny = y + ay, k = nx + ',' + ny
        if (g[ny]?.[nx] === '.' && !dist.has(k)) { dist.set(k, dist.get(x + ',' + y)! + 1); q.push([nx, ny]) }
      }
    }
    const floor = [...dist.entries()].map(([k, d]) => { const [x, y] = k.split(',').map(Number); return { x, y, d } })
    const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
    // Eight dens, far from you and apart from each other.
    const dens: { x: number; y: number }[] = []
    for (const c of shuffle(floor.filter(c => c.d >= 8))) {
      if (dens.length < 8 && dens.every(o => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) >= 5)) { dens.push(c); g[c.y][c.x] = 'R' }
    }
    for (const c of shuffle(floor.filter(c => c.d >= 3 && g[c.y][c.x] === '.')).slice(0, 8)) g[c.y][c.x] = 'N'
    g[1][1] = 'P'
    const out = g.map(r => r.join(''))
    if (dens.length < 5 || out.join('') === lastMap) continue    // too few dens, or the same lair: again
    lastMap = out.join('')
    return out
  }
}
const solid = (x: number, y: number) => MAP[Math.floor(y)]?.[Math.floor(x)] === '#' || MAP[Math.floor(y)]?.[Math.floor(x)] === undefined

/*
 * THE RATS (JP, 2026-10-14: "we do need like a giant boss rat or a stronger rats"):
 *   rat    the old one: 2 hits, quick
 *   brute  from wave 2: big, slow, 6 hits, bites hard
 *   king   THE RAT KING, every 5th wave: huge, a health bar, 40 hits
 */
type RatKind = 'rat' | 'brute' | 'king'
type Rat = { x: number; y: number; hp: number; hurt: number; dead: number; kind?: RatKind; max?: number }
const RAT_KIND: Record<RatKind, { hp: number; speed: number; bite: number; scale: number; filter: string; pts: number }> = {
  rat:   { hp: 2,  speed: 1.15, bite: 9,  scale: 0.42, filter: 'none', pts: 100 },
  brute: { hp: 6,  speed: 0.85, bite: 16, scale: 0.62, filter: 'brightness(0.75) saturate(1.6) hue-rotate(-20deg)', pts: 300 },
  king:  { hp: 40, speed: 0.7,  bite: 28, scale: 1.15, filter: 'hue-rotate(250deg) saturate(2.2) brightness(0.9)', pts: 3000 },
}
const kindOf = (r: Rat) => RAT_KIND[r.kind ?? 'rat']

/*
 * THE WEAPONS (JP: "add three more weapons: a melee weapon, a repeater type weapon,
 * and ... a bazooka or like a BFG ... borrow from Doom ... loadouts"). Keys 1-4 or
 * the mouse wheel, Doom's way.
 *   1 CLAW          melee: free, short reach, 2 damage, a swipe
 *   2 CAN CANNON    the old gun: 1 can, 1 damage
 *   3 REPEATER      hold to fire: 1 can a shot, half damage, fast
 *   4 B.F.G.        Big Furball Gun: 10 cans, 6 damage to every rat in sight
 */
const WEAPONS = [
  { name: 'CLAW', cost: 0, cool: 0.38, dmg: 2, auto: false },
  { name: 'CAN CANNON', cost: 1, cool: 0.22, dmg: 1, auto: false },
  { name: 'REPEATER', cost: 1, cool: 0.085, dmg: 0.5, auto: true },
  { name: 'B.F.G.', cost: 10, cool: 1.2, dmg: 6, auto: false },
] as const
type Nug = { x: number; y: number; taken: boolean }
type Boom = { x: number; y: number; t: number }

const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src
})

/**
 * `room` set: ONLINE, the timed deathmatch in that room (lib/ratxNet, ratx-server).
 * The renderer is the same; the server owns the rats, the nuggets, the hits and the
 * clock, and the other players are drawn as their framed cat pictures.
 */
export function Ratxecutioner({ face, room, name }: { face: string; room?: string; name?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [locked, setLocked] = useState(false)
  /** The how-to line, only until the game starts: it sat over the game-over text. */
  const [hint, setHint] = useState(true)
  const [touch, setTouch] = useState(false)
  const fire = useRef(false)
  /*
   * LOCKED IN, ESC TO GET OUT (JP: "the screen and mouse to lock to each other, but
   * you can pretty much get out of there if you just press escape ... a little menu,
   * and then move the mouse around and like alt tab"). Click locks the mouse to the
   * game; Esc (the browser's own key for it) lets go and PAUSES, with a 98 menu.
   */
  const [paused, setPaused] = useState(false)
  const menu = useRef<{ resume: () => void; restart: () => void }>({ resume: () => {}, restart: () => {} })
  const stick = useRef<{ mx: number; my: number; turn: number }>({ mx: 0, my: 0, turn: 0 })
  /*
   * THE CURTAIN, as the battles have it (JP: "the same intro we have for our
   * battles ... the curtains shut, have the introduction, and then ... wave one,
   * wave two, wave three"). The paper-blue checker shuts over the view, the
   * announcer's line slams in on it, voiced, then WAVE N with "FIGHT!", and the
   * curtain parts. Every new wave: shut, WAVE N, FIGHT!, open. The game holds
   * still while the curtain is down (hold).
   */
  const [curtain, setCurtain] = useState<{ lines: readonly string[]; up: number; phase: 'close' | 'open'; quiet: boolean; ink: string } | null>(null)
  const hold = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const intro = useRef<(wave: number, announce: boolean) => void>(() => {})
  intro.current = (wave, announce) => {
    hold.current = true
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
    const say = (src: string) => { try { const a = new Audio(src); a.volume = 0.8; void a.play().catch(() => {}) } catch {} }
    const slam = () => say('/game/sfx/slam.mp3')
    const ink = waveInk(wave)
    void (async () => {
      // It shuts the fight's way: the view fades to white, the checker fades in over it.
      setCurtain({ lines: [], up: 0, phase: 'close', quiet: false, ink })
      await sleep(CURTAIN_MS.white + CURTAIN_MS.checks)
      if (announce) {
        const line = Math.floor(Math.random() * ANNOUNCERS.length)
        const halves = ANNOUNCERS[line]
        for (let h = 0; h < halves.length; h++) {
          setCurtain({ lines: halves, up: h + 1, phase: 'close', quiet: true, ink })
          slam(); say(voiceFile(line, h))
          await sleep(Math.max(500, (VOICE_MS[line]?.[h] ?? 600) + 60))
        }
        await sleep(120)
      }
      setCurtain({ lines: [`WAVE ${wave}`], up: 1, phase: 'close', quiet: true, ink })
      // The announcer calls it: "Wave N!", then "FIGHT!" the moment that ends (JP: "i dont hear them say
      // WAVE (whatever number) FIGHT!"). Waves past the recorded 25 get the FIGHT! alone.
      slam()
      if (wave <= 25) {
        await new Promise<void>(done => {
          try {
            // GO! comes in as the WORDS end, not the reverb after them (that tail was the pause):
            // WAVE_SAID_MS, measured off each file (silence after the words, -28 dB).
            const a = new Audio(`/game/announcer/wave-${wave}.mp3`); a.volume = 0.8
            a.onerror = () => done()
            a.onplaying = () => setTimeout(done, WAVE_SAID_MS[wave - 1] ?? 1300)
            void a.play().catch(() => done())
            setTimeout(done, 2200)                                        // never hang on a sound
          } catch { done() }
        })
      }
      say('/game/announcer/go.mp3')                                // "GO!" (JP: "instead of fight; make them say GO!")
      await sleep(450)
      setCurtain(c => c && { ...c, phase: 'open' })                // it parts
      await sleep(CURTAIN_MS.split + 40)
      setCurtain(null)
      hold.current = false
    })()
  }
  /*
   * OPTIONS (JP: "add a option for mouse sensitivity and music"): remembered on
   * this device. The game loop reads them through a ref, so a change is live.
   */
  const [sens, setSens] = useState(1)
  const [vol, setVol] = useState(0.4)
  const opts = useRef({ sens: 1, vol: 0.4 })
  const musicRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem('ratx.options.v1') ?? 'null')
      if (o) { setSens(o.sens ?? 1); setVol(o.vol ?? 0.4) }
    } catch {}
  }, [])
  useEffect(() => {
    opts.current = { sens, vol }
    if (musicRef.current) musicRef.current.volume = vol
    try { localStorage.setItem('ratx.options.v1', JSON.stringify({ sens, vol })) } catch {}
  }, [sens, vol])

  useEffect(() => {
    setTouch(matchMedia('(pointer: coarse)').matches)
    const cv = canvas.current!
    // Solid, not see-through: Android Chrome flickered blending a transparent canvas every frame (JP, 2026-10-17: "flickering ... all the time").
    const ctx = cv.getContext('2d', { alpha: false })!
    ctx.imageSmoothingEnabled = false
    let raf = 0, alive = true
    const myLoop = ++LOOP_ID
    const COARSE = matchMedia('(pointer: coarse)').matches

    // ── state ──
    const keys = new Set<string>()
    let px = 1.5, py = 1.5, dx = 1, dy = 0, plx = 0, ply = FOV
    // Nothing moves until the player clicks in: the rats wait for you.
    let started = false
    let paused = false
    const begin = (_why = '') => { if (!started) { started = true; setHint(false); if (!room) { intro.current(1, true); babble('get ready to xecute some rats', { pitch: 0.8 }) } } musicOn(true); cursor() }
    /** No arrow over the game while you play; it comes back for the start, the menu and game over. */
    const cursor = () => { cv.style.cursor = started && !paused && !over ? 'none' : 'default' }
    /** Looking up and down, Doom's way: the horizon slides; the world never tilts. */
    let pitch = 0
    const PITCH_MAX = 50 * S
    let hp = 100, ammo = START_AMMO, kills = 0, wave = 1, flash = 0, hurt = 0, over = false, banner = 2.2
    /*
     * A WAVE IS A RACE (JP: "it times you on how long it takes for you to kill all
     * the mice ... a ticker of how many mice are left ... nuggets ... give you a bonus
     * score"): the clock runs from GO! to the last rat, and the results screen adds
     * it all up, Melee's bonus-points way.
     */
    let score = 0, waveTime = 0, waveShots = 0, waveHits = 0, waveHurt = 0, waveNugs = 0, waveClawOnly = true, waveKing = false
    let results: null | { t: number; lines: { label: string; pts: number }[]; total: number; time: number } = null
    let weapon = 1, cool = 0, swing = 0, bfgFlash = 0
    let fireHeld = false
    let rats: Rat[] = [], nugs: Nug[] = [], booms: Boom[] = []
    let dens: [number, number][] = []
    let spawnX = 1.5, spawnY = 1.5
    /** A new lair: the walls, the dens, the nuggets, where you stand, and the posters. */
    const newMap = () => {
      MAP = room ? [...SIM_MAP] : makeMap()     // online, everyone plays the server's lair
      dens = []; nugs = []
      MAP.forEach((row, y) => [...row].forEach((c, x) => {
        if (c === 'P') { spawnX = x + 0.5; spawnY = y + 0.5 }
        if (c === 'R') dens.push([x + 0.5, y + 0.5])
        if (c === 'N') nugs.push({ x: x + 0.5, y: y + 0.5, taken: false })
      }))
      px = spawnX; py = spawnY
      // Face down the longer open way from the start.
      const east = !solid(spawnX + 1, spawnY) ? 1 : 0, south = !solid(spawnX, spawnY + 1) ? 1 : 0
      if (!east && south) { dx = 0; dy = 1; plx = -FOV; ply = 0 } else { dx = 1; dy = 0; plx = 0; ply = FOV }
    }
    /** Re-ink the bricks with the current wave's ramp. */
    function inkWall() {
      if (!wall || !wallLum) return
      const R = theme.ramp
      for (let i = 0; i < wallLum.length; i++) {
        const k = Math.min(R.length - 1.001, wallLum[i] * (R.length - 1) * 1.15)
        const a = R[Math.floor(k)], b = R[Math.ceil(k)], u = k - Math.floor(k)
        wall.data[i * 4] = a[0] + (b[0] - a[0]) * u; wall.data[i * 4 + 1] = a[1] + (b[1] - a[1]) * u; wall.data[i * 4 + 2] = a[2] + (b[2] - a[2]) * u
      }
    }
    const spawnWave = () => {
      theme = waveTheme(wave); inkWall()
      const n = 4 + wave * 2
      const brutes = wave >= 2 ? Math.min(n - 2, Math.floor(wave / 2)) : 0
      rats = Array.from({ length: n }, (_, i) => {
        const [x, y] = dens[(i + wave) % dens.length]
        const kind: RatKind = i < brutes ? 'brute' : 'rat'
        const hp = RAT_KIND[kind].hp + Math.floor(wave / 3)
        return { x: x + (Math.random() - 0.5) * 0.4, y: y + (Math.random() - 0.5) * 0.4, hp, max: hp, hurt: 0, dead: 0, kind }
      })
      if (wave % 5 === 0) {
        // The Rat King comes out of the den furthest from you.
        const far = [...dens].sort((a, b) => Math.hypot(b[0] - px, b[1] - py) - Math.hypot(a[0] - px, a[1] - py))[0]
        const hp = RAT_KIND.king.hp + wave * 2
        rats.push({ x: far[0], y: far[1], hp, max: hp, hurt: 0, dead: 0, kind: 'king' })
      }
      waveTime = 0; waveShots = 0; waveHits = 0; waveHurt = 0; waveNugs = 0; waveClawOnly = true; waveKing = false
      nugs.forEach(n => (n.taken = false))
      banner = 2.2
    }
    const restart = () => { musicOn(true); cleared = 0; results = null; score = 0; hp = 100; ammo = START_AMMO; kills = 0; wave = 1; over = false; booms = []; newMap(); hangPosters(); spawnWave(); cursor(); intro.current(1, true) }

    // ── sound: plain elements, a small pool each ──
    const pool = (src: string, n = 4, vol = 0.5) => {
      const a = Array.from({ length: n }, () => { const e = new Audio(src); e.volume = vol; return e })
      let i = 0
      return () => { const e = a[i++ % n]; try { e.currentTime = 0; void e.play().catch(() => {}) } catch {} }
    }
    const sShot = pool('/game/sfx/blast.mp3', 4, 0.35)
    const sBoom = pool('/ratx/explosion.wav', 4, 0.45)
    const sBite = pool('/game/sfx/scratch.mp3', 3, 0.5)
    const sPick = pool('/game/sfx/confirm.mp3', 2, 0.5)
    /*
     * THE MUSIC: JP's own track, "OH FUCK IM LATE" (Ableton, The Sandy Plains
     * Project; the copy in clanker-arena/assets/music). JP, 2026-10-13: "find this
     * mp3 and add it to this game". Loops while you play; stops on pause or death.
     */
    const music = new Audio('/ratx/music.mp3')
    music.loop = true; music.volume = opts.current.vol
    musicRef.current = music
    const musicOn = (on: boolean) => { try { if (on) void music.play().catch(() => {}); else music.pause() } catch {} }

    // ── art ──
    /** Each poster: its frames, and how long each one shows (ms). */
    let posters: { frames: ImageData[]; ms: number[]; total: number }[] = []
    /** The bricks' brightness, kept, so each wave can re-ink them. */
    let wallLum: Float32Array | null = null
    let theme = waveTheme(1)
    let wall: ImageData | null = null, ratImg: HTMLImageElement | null = null, boomImg: HTMLImageElement | null = null
    // The first wave, now that the walls it re-inks exist (it ran before them once: a crash on load).
    newMap()                                   // the lair first: the dens are in it
    spawnWave()
    let nugImg: HTMLImageElement | null = null, faceImg: HTMLImageElement | null = null, fontImg: HTMLImageElement | null = null
    const tinted = new Map<string, HTMLCanvasElement>()
    Promise.all([load('/ratx/wall.png'), load('/ratx/rat.png'), load('/ratx/explode.png'), load('/ratx/nugget.png'), load(face).catch(() => null), load('/game/font.png')])
      .then(([w, r, b, n, f, fo]) => {
        const c = document.createElement('canvas'); c.width = w.width; c.height = w.height
        const x = c.getContext('2d')!; x.drawImage(w, 0, 0); wall = x.getImageData(0, 0, w.width, w.height)
        // JP's green bricks: keep each pixel's brightness, and ink them in the wave's colour.
        wallLum = new Float32Array(wall.width * wall.height)
        for (let i = 0; i < wallLum.length; i++)
          wallLum[i] = (wall.data[i * 4] * 0.3 + wall.data[i * 4 + 1] * 0.55 + wall.data[i * 4 + 2] * 0.15) / 255
        inkWall()
        ratImg = r; boomImg = b; nugImg = n; faceImg = f; fontImg = fo
      })
    /*
     * THE POSTERS, ANIMATED (JP: "make the posters look better; they are also
     * mirrored and not animated"). A canvas only ever gets a GIF's first frame, so
     * each GIF is decoded frame by frame with the browser's ImageDecoder and the
     * walls play them. Where there is no ImageDecoder, the first frame stands still.
     *
     * Each frame is mounted like a real poster: a paper margin, a black edge, a
     * pin, the banner's own shape kept. PW x PH matches the face it hangs in
     * (60% of the wall wide, 76% tall), so nothing is stretched. Banners keep every
     * second frame, to hold the memory down; the pop-ups keep them all.
     */
    const PW = 224, PH = 283                    // sharper up close (JP: "make the posters look better")
    const mount = (src: CanvasImageSource, sw: number, sh: number) => {
      const c = document.createElement('canvas'); c.width = PW; c.height = PH
      const x = c.getContext('2d')!
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'
      x.fillStyle = '#101018'; x.fillRect(0, 0, PW, PH)                       // the edge
      x.fillStyle = '#f4f1e8'; x.fillRect(3, 3, PW - 6, PH - 6)               // the paper
      const k = Math.min((PW - 16) / sw, (PH - 22) / sh)
      const w = sw * k, h = sh * k
      x.drawImage(src, (PW - w) / 2, (PH - h) / 2 + 3, w, h)
      x.fillStyle = '#d81e1e'; x.beginPath(); x.arc(PW / 2, 9, 4, 0, 7); x.fill()   // a red pin
      x.fillStyle = '#ff8080'; x.fillRect(PW / 2 - 2, 7, 2, 2)
      return x.getImageData(0, 0, PW, PH)
    }
    type Decoder = { tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } }; decode(o: { frameIndex: number }): Promise<{ image: CanvasImageSource & { displayWidth: number; displayHeight: number; duration: number | null; close(): void } }>; close(): void }
    const Dec = (window as unknown as { ImageDecoder?: new (o: { data: ArrayBuffer; type: string }) => Decoder }).ImageDecoder
    async function posterOf(url: string, step: number) {
      if (!Dec) {
        const im = await load(url)
        return { frames: [mount(im, im.width, im.height)], ms: [1000], total: 1000 }
      }
      const dec = new Dec({ data: await (await fetch(url)).arrayBuffer(), type: url.endsWith('.webp') ? 'image/webp' : 'image/gif' })
      await dec.tracks.ready
      const n = dec.tracks.selectedTrack.frameCount
      const frames: ImageData[] = [], ms: number[] = []
      for (let i = 0; i < n; i++) {
        const { image } = await dec.decode({ frameIndex: i })
        if (i % step === 0) { frames.push(mount(image, image.displayWidth, image.displayHeight)); ms.push(((image.duration ?? 100000) / 1000) * step) }
        image.close()
      }
      dec.close()
      return { frames, ms, total: ms.reduce((a, b) => a + b, 0) }
    }
    Promise.all(BANNER_TOKENS.flatMap((_, i) => [['-sq', 3], ['-won', 2]].map(([sfx, step]) =>
      posterOf(bannerFile(i, sfx as string), step as number).catch(() => null)))
      // ... and the Bundle Cat meme ads (JP: "put them on the website and in the game").
      .concat([...MEME_ADS.square, ...MEME_ADS.tall].map(a => posterOf(a.file, 4).catch(() => null))))   // every 4th of 8 frames: the blink, not 8x the memory
      .then(list => { posters = list.filter((p): p is NonNullable<typeof p> => !!p) })
    /*
     * THE MEMES (JP: "get the memes from here and add them as posters in the game",
     * memedepot.com/d/bundle-cat -> public/ratx/memes). Still pictures, mounted like
     * the ads. Only the ones on this lair's walls are loaded, so 48 memes do not cost
     * 48 decodes. JP's picks (his "make these ads", 2026-10-13) hang in every lair.
     */
    const MEME_PICKS = [7, 11, 24, 36, 37, 39]
    // 48 Bundle Cat memes, then King Bork's (public/ratx/memes/list.json: kbNN.jpg; "do the same for king bork").
    const MEME_COUNT = 90
    let memeFiles: string[] = []
    const memes = new Map<number, { frames: ImageData[]; ms: number[]; total: number } | null>()
    const memeList = fetch('/ratx/memes/list.json').then(r => r.json() as Promise<string[]>).then(l => { memeFiles = l }).catch(() => {})
    const memeOf = (n: number) => {
      if (memes.has(n)) return
      memes.set(n, null)
      void memeList.then(() => memeFiles[n - 1] ? load('/ratx/memes/' + memeFiles[n - 1]) : null)
        .then(im => { if (im) memes.set(n, { frames: [mount(im, im.width, im.height)], ms: [1000], total: 1000 }) })
        .catch(() => {})
    }
    /** The frame of poster `p` showing now. */
    const posterNow = (p: (typeof posters)[number]) => {
      let k = (performance.now() % p.total)
      for (let i = 0; i < p.frames.length; i++) { if (k < p.ms[i]) return p.frames[i]; k -= p.ms[i] }
      return p.frames[0]
    }
    /*
     * Which wall faces carry a poster, chosen again for each lair: brick that faces
     * open floor. The three nearest the start go up first, so the first look already
     * has posters in it. About one in three is a Mosh ad; the rest are memes, JP's
     * picks first. A value >= 0 is an ad (index into posters); < 0 is meme number -v.
     */
    const posterAt = new Map<string, number>()
    function hangPosters() {
      posterAt.clear()
      const faces: { k: string; d: number }[] = []
      const add = (x: number, y: number, side: number) => faces.push({ k: x + ',' + y + ',' + side, d: Math.hypot(x + 0.5 - spawnX, y + 0.5 - spawnY) })
      MAP.forEach((row, y) => [...row].forEach((c, x) => {
        if (c !== '#') return
        if (MAP[y]?.[x + 1] && MAP[y][x + 1] !== '#') add(x, y, 0)
        if (MAP[y]?.[x - 1] && MAP[y][x - 1] !== '#') add(x, y, 0)
        if (MAP[y + 1]?.[x] && MAP[y + 1][x] !== '#') add(x, y, 1)
        if (MAP[y - 1]?.[x] && MAP[y - 1][x] !== '#') add(x, y, 1)
      }))
      const near = faces.filter(f => f.d < 3.5).sort(() => Math.random() - 0.5).slice(0, 3)
      const rest = faces.filter(f => !near.includes(f)).sort(() => Math.random() - 0.5)
      const others = Array.from({ length: MEME_COUNT }, (_, i) => i + 1).filter(n => !MEME_PICKS.includes(n)).sort(() => Math.random() - 0.5)
      const memeDeck = [...[...MEME_PICKS].sort(() => Math.random() - 0.5), ...others]
      let ad = Math.floor(Math.random() * 1000), mi = 0          // a random start in the whole ad list
      ;[...near, ...rest].slice(0, 40).forEach((f, i) => {
        if (posterAt.has(f.k)) return
        if (i % 2 === 1) posterAt.set(f.k, ad++)     // every other poster is an ad
        else { const n = memeDeck[mi++ % memeDeck.length]; posterAt.set(f.k, -n); memeOf(n) }
      })
    }
    hangPosters()
    // ?demo: a read-only look at the game for the demo-video bot (clanker-clips/ratx-demo.js). Changes nothing.
    if (new URLSearchParams(location.search).has('demo'))
      (window as unknown as { __ratx?: () => unknown }).__ratx = () => ({ px, py, dx, dy, hp, kills, wave, map: MAP, rats: rats.filter(r => !r.dead).map(r => [r.x, r.y]), net: net && { id: net.id, status: net.status, mine: net.mine, phase: net.latest?.phase, others: net.view().players } })
    /** The game's bitmap font, tinted once per colour. */
    const sheetFor = (color: string) => {
      let sheet = tinted.get(color)
      if (!sheet && fontImg) {
        sheet = document.createElement('canvas'); sheet.width = fontImg.width; sheet.height = fontImg.height
        const t = sheet.getContext('2d')!
        t.drawImage(fontImg, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, sheet.width, sheet.height)
        tinted.set(color, sheet)
      }
      return sheet
    }
    /**
     * The game's bitmap font. `look`: 'outline' = an ink ring and a hard drop shadow
     * (the big words over the view); 'emboss' = a white shadow down-right, Windows
     * 98 lettering pressed into the grey bar. Offsets are in real pixels (1/S).
     */
    const text = (s: string, x: number, y: number, color: string, scale = 1, center = false, look: 'outline' | 'emboss' | null = null) => {
      if (!fontImg) return
      const width = [...s].reduce((n, ch) => n + glyph(ch)[1] + TRACKING, 0) * scale
      const x0 = center ? x - width / 2 : x
      const pass = (ink: string, ox: number, oy: number) => {
        const sheet = sheetFor(ink)!
        let pen = x0
        for (const ch of s) {
          const [left, gw] = glyph(ch); const { x: cx, y: cy } = cell(ch)
          ctx.drawImage(sheet, cx + left, cy, gw, CELL_H, Math.round(pen * S) / S + ox, y + oy, gw * scale, CELL_H * scale)
          pen += (gw + TRACKING) * scale
        }
      }
      const px = 1 / S
      if (look === 'outline') {
        const r = Math.max(px, scale * px * 1.5)
        pass('#101018', 2 * r, 2 * r)                                   // the shadow
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) pass('#101018', dx * r, dy * r)
      } else if (look === 'emboss') {
        pass('#ffffff', px * 2, px * 2)
      }
      pass(color, 0, 0)
    }

    // ── input ──
    const down = (e: KeyboardEvent) => {
      // Only a game key starts it: stray keys (a browser's own, a tab switch) must not.
      if (/^(Key[WASDQE]|Arrow|Space)/.test(e.code)) begin('key ' + e.code)
      keys.add(e.code)
      if (e.code === 'Space') { fire.current = true; e.preventDefault() }
      if (e.code === 'Tab' && room) e.preventDefault()
      // Without a lock the browser does not pause for us: Esc toggles it here.
      if (e.code === 'Escape' && free && started && !over) {
        paused = !paused; setPaused(paused); letGo(); musicOn(!paused); cursor()
      }
      if (over && e.code === 'KeyR') restart()
      if (!room && /^Digit[1-4]$/.test(e.code)) weapon = +e.code.slice(5) - 1
      if (e.code === 'Space') fireHeld = true
      if (results && results.t > resultsDone(results) && /^(Space|Enter|KeyE)$/.test(e.code)) nextWave()
    }
    const up = (e: KeyboardEvent) => { keys.delete(e.code); if (e.code === 'Space') fireHeld = false }
    const wheel = (e: WheelEvent) => { if (!room && started && !paused) { weapon = (weapon + (e.deltaY > 0 ? 1 : 3)) % 4 } }
    const mouseUp = () => { fireHeld = false }
    /** The results screen is done adding up once every line and the total are in. */
    const resultsDone = (r: { lines: unknown[] }) => 0.8 + r.lines.length * 0.45 + 0.6
    /** CONTINUE: into the next wave, through the curtain. */
    const nextWave = () => { results = null; wave++; spawnWave(); intro.current(wave, false) }
    // A key-up missed (the window lost focus mid-press) must not leave the cat walking on its own.
    const letGo = () => { keys.clear(); stick.current.mx = 0; stick.current.my = 0; stick.current.turn = 0 }
    const hidden = () => { if (document.hidden) letGo() }
    // THE VIEW FOLLOWS THE MOUSE (JP: "make the view follow the mouse"): any movement
    // over the screen turns and tilts it, no click needed. Locked (click the screen),
    // the mouse can keep turning past the edge of the window.
    /*
     * EDGE TURNING, for free mode (no lock): a pointer stops at the edge of the
     * screen, so held near the left or right edge the view keeps turning, faster
     * the nearer the edge — the old PC-game way. `edge` is -1..1, 0 in the middle.
     */
    let edge = 0
    /*
     * WHERE THE GUN POINTS (JP: "make the gun hit where the cursor is pointing; so
     * it doesnt miss"). Locked, the pointer is the centre of the screen. In free
     * mode the crosshair follows the pointer and the shot goes exactly there.
     * In real canvas pixels.
     */
    let aimX = W / 2, aimY = VIEW_H / 2
    let hitMark = 0
    /** WAVE CLEARED!, on screen and said, before the curtain brings the next wave. */
    let cleared = 0
    const CLEARED_S = 2
    const edgeOf = (e: MouseEvent) => {
      const r = cv.getBoundingClientRect()
      const u = (e.clientX - r.left) / r.width
      edge = u < 0.15 ? -(0.15 - Math.max(0, u)) / 0.15 : u > 0.85 ? (Math.min(1, u) - 0.85) / 0.15 : 0
    }
    const leave = () => { edge = 0 }
    const look = (e: MouseEvent) => {
      if (free && started && e.target === cv) {
        edgeOf(e)
        const r = cv.getBoundingClientRect()
        aimX = Math.max(0, Math.min(W - 1, ((e.clientX - r.left) / r.width) * W))
        aimY = Math.max(0, Math.min(VIEW_H - 1, ((e.clientY - r.top) / r.height) * H))
      }
      // Locked: the mouse is the view. Free mode (lock refused): only over the screen.
      if (document.pointerLockElement !== cv && !(free && started && e.target === cv)) return
      // Chrome on Windows sometimes reports a huge jump under pointer lock: a spike, not a hand. Drop it.
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return
      begin('look')
      const k = opts.current.sens
      turn(e.movementX * MOUSE * k)
      pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, pitch - e.movementY * 0.35 * S * k))
    }
    const coarse = matchMedia('(pointer: coarse)').matches
    /** The mouse lock was refused here: play without it. */
    let free = false
    const lock = () => {
      try {
        const p = cv.requestPointerLock?.() as unknown as Promise<void> | undefined
        void p?.catch?.(() => { free = true })
      } catch { free = true }
    }
    addEventListener('error', e => { if (/pointer lock/i.test(String(e.message))) free = true })
    document.addEventListener('pointerlockerror', () => { free = true })
    const lockChange = () => {
      const on = document.pointerLockElement === cv
      if (on) { aimX = W / 2; aimY = VIEW_H / 2 }
      setLocked(on)
      // Losing the lock (Esc, Alt-Tab) pauses a game in progress, with the menu up.
      paused = started && !on && !over && !coarse && !free
      setPaused(paused)
      cursor()
      if (paused) letGo()
      musicOn(!paused && started && !over)
    }
    // Clicking a free mouse locks it in (and starts or resumes); a locked click shoots.
    const click = () => {
      if (results) { if (results.t > resultsDone(results)) nextWave(); return }
      fireHeld = true
      if (over) { restart(); if (!coarse) lock(); return }
      if (!coarse && !free && document.pointerLockElement !== cv) { begin('click'); lock(); return }
      begin('click')
      fire.current = true
    }
    menu.current = {
      resume: () => { if (free || coarse) { paused = false; setPaused(false); musicOn(true); cursor() } else lock() },
      restart: () => { restart(); lock() },
    }
    const startTouch = () => begin('touch')
    // PAUSE on a phone (JP, 2026-10-17: "needs a pause screen"): the button above the sticks.
    const touchPause = () => { if (!started || over) return; paused = !paused; setPaused(paused); letGo(); musicOn(!paused); cursor() }
    addEventListener('ratx-pause', touchPause)
    addEventListener('ratx-start', startTouch)
    addEventListener('blur', letGo); document.addEventListener('visibilitychange', hidden)
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('mousemove', look); addEventListener('mouseup', mouseUp); cv.addEventListener('wheel', wheel, { passive: true })
    document.addEventListener('pointerlockchange', lockChange); cv.addEventListener('mousedown', click); cv.addEventListener('mouseleave', leave)

    function turn(a: number) {
      const c = Math.cos(a), s = Math.sin(a)
      ;[dx, dy] = [dx * c - dy * s, dx * s + dy * c]
      ;[plx, ply] = [plx * c - ply * s, plx * s + ply * c]
    }
    const tryMove = (nx: number, ny: number) => {
      const r = 0.22
      if (!solid(nx + Math.sign(nx - px) * r, py)) px = nx
      if (!solid(px, ny + Math.sign(ny - py) * r)) py = ny
    }

    // ── the raycast: one DDA ray per column ──
    const zbuf = new Float32Array(W)
    const img = ctx.createImageData(W, VIEW_H)
    // The view is built on a hidden canvas, then drawn in like everything else: mixing putImageData
    // straight onto the screen with drawImage on top made the gun and HUD flicker on Android (JP, 2026-10-17).
    const view = document.createElement('canvas'); view.width = W; view.height = VIEW_H
    const vctx = view.getContext('2d')!
    function renderWalls() {
      const d = img.data
      // The sky and the floor in the wave's colour.
      const SKY_TOP = theme.skyTop, SKY_LOW = theme.skyLow, CHECK_A = theme.checkA, CHECK_B = theme.checkB
      // The sky: navy into blue, the Windows 98 title bar.
      const hz = Math.round(VIEW_H / 2 + pitch)
      for (let y = 0; y < hz; y++) {
        const k = y / Math.max(1, hz)
        const r = SKY_TOP[0] + (SKY_LOW[0] - SKY_TOP[0]) * k, g = SKY_TOP[1] + (SKY_LOW[1] - SKY_TOP[1]) * k, b = SKY_TOP[2] + (SKY_LOW[2] - SKY_TOP[2]) * k
        for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255 }
      }
      // The floor: the checker, cast row by row onto the ground.
      const lx = dx - plx, ly = dy - ply, rx = dx + plx, ry = dy + ply
      for (let y = Math.max(0, hz); y < VIEW_H; y++) {
        const rowDist = (VIEW_H / 2) / (y - hz + 0.5)
        let fx = px + rowDist * lx, fy = py + rowDist * ly
        const stx = rowDist * (rx - lx) / W, sty = rowDist * (ry - ly) / W
        const fog = Math.max(0.35, 1 - rowDist / 12)
        for (let x = 0; x < W; x++) {
          const c = (Math.floor(fx * 2) + Math.floor(fy * 2)) & 1 ? CHECK_A : CHECK_B
          const o = (y * W + x) * 4
          d[o] = c[0] * fog; d[o + 1] = c[1] * fog; d[o + 2] = c[2] * fog; d[o + 3] = 255
          fx += stx; fy += sty
        }
      }
      for (let x = 0; x < W; x++) {
        const camX = 2 * x / W - 1
        const rdx = dx + plx * camX, rdy = dy + ply * camX
        let mx = Math.floor(px), my = Math.floor(py)
        const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy)
        const sx = rdx < 0 ? -1 : 1, sy = rdy < 0 ? -1 : 1
        let sdx = (rdx < 0 ? px - mx : mx + 1 - px) * ddx
        let sdy = (rdy < 0 ? py - my : my + 1 - py) * ddy
        let side = 0
        for (let i = 0; i < 64; i++) {
          if (sdx < sdy) { sdx += ddx; mx += sx; side = 0 } else { sdy += ddy; my += sy; side = 1 }
          if (MAP[my]?.[mx] === '#') break
        }
        const dist = side === 0 ? sdx - ddx : sdy - ddy
        zbuf[x] = dist
        const lineH = Math.floor(VIEW_H / Math.max(dist, 0.001))
        const top = Math.floor(-lineH / 2 + hz), bot = Math.min(VIEW_H - 1, top + lineH)
        if (!wall) continue
        // The brick tile is two 32-wide halves: lit for one wall face, shaded for the other.
        let wx = side === 0 ? py + dist * rdy : px + dist * rdx
        wx -= Math.floor(wx)
        const tx = Math.floor(wx * 32) + (side === 1 ? 32 : 0)
        const fog = Math.max(0.25, 1 - dist / 14)
        const pi = posterAt.get(mx + ',' + my + ',' + side)
        const art = pi === undefined ? null : pi < 0 ? memes.get(-pi) : posters.length ? posters[pi % posters.length] : null
        const poster = art ? posterNow(art) : null
        // Read the face left to right as you look at it, so the poster is never mirrored.
        const u = side === 0 ? (rdx > 0 ? wx : 1 - wx) : (rdy < 0 ? wx : 1 - wx)
        for (let y = Math.max(0, top); y <= bot; y++) {
          const v = (y - top) / lineH
          // A poster hangs in the middle of its face: 20%..80% across, 12%..88% down.
          if (poster && u > 0.2 && u < 0.8 && v > 0.12 && v < 0.88) {
            const pu = Math.min(poster.width - 1, Math.max(0, Math.floor((u - 0.2) / 0.6 * poster.width)))
            const pv = Math.min(poster.height - 1, Math.floor((v - 0.12) / 0.76 * poster.height))
            const s = (pv * poster.width + pu) * 4, o = (y * W + x) * 4
            const shade = side === 1 ? 0.92 : 1
            // Full-bright, like Doom's lit signs: a poster never fades into the dark.
            d[o] = poster.data[s] * shade; d[o + 1] = poster.data[s + 1] * shade; d[o + 2] = poster.data[s + 2] * shade
            continue
          }
          const ty = Math.floor(v * wall.height) % wall.height
          const s = (ty * wall.width + tx) * 4, o = (y * W + x) * 4
          d[o] = wall.data[s] * fog; d[o + 1] = wall.data[s + 1] * fog; d[o + 2] = wall.data[s + 2] * fog
        }
      }
      vctx.putImageData(img, 0, 0)
      ctx.drawImage(view, 0, 0)
    }

    /** A billboard: drawn a column at a time, behind any wall that is nearer. */
    function sprite(im: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, wx: number, wy: number, scale: number, lift = 0, squash = 1) {
      const rx = wx - px, ry = wy - py
      const inv = 1 / (plx * dy - dx * ply)
      const tX = inv * (dy * rx - dx * ry), tY = inv * (-ply * rx + plx * ry)
      if (tY <= 0.1) return null
      const cx = Math.floor((W / 2) * (1 + tX / tY))
      const h = Math.abs(Math.floor(VIEW_H / tY)) * scale
      const w = h * (sw / sh)
      const hh = h * squash                     // squashed from the top: the feet stay on the floor
      const y0 = Math.floor(VIEW_H / 2 + pitch + (VIEW_H / tY) / 2 - hh + lift / tY)
      const x0 = Math.floor(cx - w / 2)
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
        if (tY >= zbuf[x]) continue
        const col = sx + Math.floor(((x - x0) / w) * sw)
        ctx.drawImage(im, col, sy, 1, sh, x, y0, 1, hh)
      }
      return { x0, x1: x0 + w, y0, cx, depth: tY, seen: cx >= 0 && cx < W && tY < (zbuf[Math.max(0, Math.min(W - 1, cx))] ?? 0) }
    }

    // ── online ──
    const net = room ? new RatxNet(room, name ?? 'CAT', face) : null
    let netAcc = 0
    /** Knocked-over cats: they tip back for KO_TIP s, then go up in the explosion. */
    const KO_TIP = 0.4
    /** How tall a player's framed picture stands (JP: "make the player sprites look a little bit bigger"). */
    const PLAYER_SCALE = 0.85
    let knocked: { x: number; y: number; face: string; t: number }[] = []
    const pHurt = new Map<string, number>()
    /** Each player's picture, framed like a poster (JP: "have the pfps be static"). */
    const framedFaces = new Map<string, HTMLCanvasElement | null>()
    const framed = (src: string) => {
      if (framedFaces.has(src)) return framedFaces.get(src)!
      framedFaces.set(src, null)
      load(src).then(im => {
        const c = document.createElement('canvas'); c.width = 72; c.height = 84
        const x = c.getContext('2d')!
        x.fillStyle = '#101018'; x.fillRect(0, 0, 72, 84)                 // the edge
        x.fillStyle = '#f4f1e8'; x.fillRect(3, 3, 66, 78)                 // the paper
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'
        x.drawImage(im, 8, 8, 56, 56)
        x.fillStyle = '#000080'; x.fillRect(8, 68, 56, 9)                  // a navy name plate
        framedFaces.set(src, c)
      }).catch(() => {})
      return null
    }
    if (net) {
      net.onEvents = evs => {
        for (const e of evs) {
          if (e.e === 'shot' && e.by !== net.id) sShot()
          if (e.e === 'hit') { pHurt.set(e.on, 0.25); if (e.by === net.id) hitMark = 0.18; if (e.on === net.id) hurt = 0.3 }
          if (e.e === 'ko') {
            if (e.on === net.id) { hurt = 0.6; sBoom() }
            else {
              const who = net.latest?.players.find(p => p.id === e.on)
              knocked.push({ x: e.x, y: e.y, face: who?.face ?? face, t: 0 })
              if (e.by === net.id) hitMark = 0.3
            }
          }
          if (e.e === 'rat') { booms.push({ x: e.x, y: e.y, t: 0 }); sBoom(); if (e.by === net.id) hitMark = 0.18 }
          if (e.e === 'pick' && e.id === net.id) sPick()
        }
      }
      net.connect()
      framed(face)
    }
    /** One frame of the online game: turn here, send inputs on the fixed tick, read the rest from the server. */
    function netStep(dt: number) {
      if (!net) return
      const live = started && !paused
      let fwd = 0, str = 0
      if (live) {
        if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1
        if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1
        if (keys.has('KeyD')) str += 1
        if (keys.has('KeyA')) str -= 1
        if (keys.has('ArrowLeft') || keys.has('KeyQ')) turn(-TURN * dt)
        if (keys.has('ArrowRight') || keys.has('KeyE')) turn(TURN * dt)
        fwd += -stick.current.my; str += stick.current.mx
        if (free && edge && document.pointerLockElement !== cv) turn(edge * TURN * 1.4 * opts.current.sens * dt)
        if (stick.current.turn) turn(stick.current.turn * TURN * dt)
      }
      netAcc = Math.min(netAcc + dt, TICK_S * 4)
      while (netAcc >= TICK_S) { netAcc -= TICK_S; net.input(live ? keyBits(fwd, str) : 0, Math.atan2(dy, dx)) }
      px = net.me.x; py = net.me.y
      const mine = net.mine
      if (mine) { hp = mine.hp; ammo = mine.ammo; kills = mine.score }
      if (fire.current) {
        fire.current = false
        if (live && mine?.alive && ammo > 0 && net.latest?.phase === 'live') {
          flash = 0.08; sShot()
          // The ray through the crosshair's column, the way it is drawn.
          const camX = 2 * Math.round(aimX) / W - 1
          net.fire(Math.atan2(dy + ply * camX, dx + plx * camX))
        }
      }
      for (const [k, v] of pHurt) { if (v - dt <= 0) pHurt.delete(k); else pHurt.set(k, v - dt) }
      knocked = knocked.filter(k => (k.t += dt) < KO_TIP + 0.7)
    }
    /** The scoreboard: Tab during the match, on its own when the match is over. */
    function scoreboard(title: string, sub: string) {
      if (!net) return
      ctx.fillStyle = 'rgba(10,10,20,0.8)'; ctx.fillRect(0, 0, LW, LVIEW)
      text(title, LW / 2, 12, '#ffd166', 1, true, 'outline')
      const list = [...(net.latest?.players ?? [])].sort((a, b) => b.score - a.score)
      list.forEach((p, i) => {
        const y = 40 + i * 17, ink = p.id === net.id ? '#ffd166' : '#ffffff'
        text(`${i + 1}. ${p.name}`, 70, y, ink, 0.75, false, 'outline')
        text(String(p.score), LW - 70, y, ink, 0.75, true, 'outline')
      })
      if (sub) text(sub, LW / 2, LVIEW - 18, '#c8d6ff', 0.6, true, 'outline')
    }
    const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`

    /*
     * THE TITLE (JP: "the title screen not to have the cat show up ... the rat
     * executioner text just be on there and to say get ready"): no game behind it,
     * the bricks dark, the name, GET READY, and the keys.
     */
    function drawTitle() {
      ctx.fillStyle = '#0b0e24'; ctx.fillRect(0, 0, LW, LH)
      if (wall) {
        // The lair's own bricks, dim, in rows.
        ctx.globalAlpha = 0.18
        for (let y = 0; y < LH; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < LW; x += 32) { ctx.fillStyle = '#3b5bdb'; ctx.fillRect(x + 1, y + 1, 30, 14) }
        ctx.globalAlpha = 1
      }
      text('RATXECUTIONER', LW / 2, 44, '#ffd166', 1.6, true, 'outline')
      text('GET READY TO XECUTE SOME RATS', LW / 2, 86, '#ffffff', 0.7, true, 'outline')
      if (Math.floor(t * 2) % 2 === 0) text('CLICK TO START', LW / 2, 118, '#ff6060', 1, true, 'outline')
      text('WASD MOVE · MOUSE AIM · CLICK FIRE · 1-4 WEAPONS · ESC PAUSE', LW / 2, LH - 22, '#c8d6ff', 0.45, true, 'outline')
    }
    /*
     * THE RESULTS, IN THE GAME (JP: "the same result screen, but ... within the game
     * itself of just it fades out ... the Smash Bros. Melee bonus score stuff ...
     * continue, and then ... wave two"): the view fades, the lines land one by one
     * with their points, the total, then CONTINUE.
     */
    function drawResults(r: NonNullable<typeof results>) {
      ctx.fillStyle = `rgba(8,10,28,${Math.min(0.88, r.t * 1.6)})`; ctx.fillRect(0, 0, LW, LVIEW)
      if (r.t < 0.35) return
      text(`WAVE ${wave} CLEAR!`, LW / 2, 8, '#ffd166', 1.2, true, 'outline')
      text(`TIME ${Math.floor(r.time / 60)}:${(r.time % 60).toFixed(2).padStart(5, '0')}`, LW / 2, 32, '#ffffff', 0.7, true, 'outline')
      const shown = Math.max(0, Math.min(r.lines.length, Math.floor((r.t - 0.8) / 0.45) + 1))
      r.lines.slice(0, shown).forEach((l, i) => {
        const y = 50 + i * 11
        text(l.label, 60, y, i === 0 || l.label.startsWith('NUGGETS') ? '#c8d6ff' : '#7dff9a', 0.55, false, 'outline')
        text(`+${l.pts}`, LW - 60 - 30, y, '#ffffff', 0.55, false, 'outline')
      })
      if (r.t > 0.8 + r.lines.length * 0.45) text(`TOTAL  ${r.total}`, LW / 2, LVIEW - 34, '#ffd166', 0.9, true, 'outline')
      if (r.t > 0.8 + r.lines.length * 0.45 + 0.6 && Math.floor(t * 2.5) % 2 === 0) text('CONTINUE ▶  CLICK', LW / 2, LVIEW - 16, '#ffffff', 0.7, true, 'outline')
    }
    /*
     * THE WEAPONS, DRAWN (JP: "make a custom sprite for the gun"): pixel art in the
     * 320 layout, a 1px ink outline round every part, in the paw at the bottom.
     */
    function drawWeapon(wp: number, kick: number, bob: number) {
      const cx = LW / 2, base = LVIEW + kick + bob
      const box = (x: number, y: number, w: number, h: number, fill: string, ink = '#101018') => {
        ctx.fillStyle = ink; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, w + 2, h + 2)
        ctx.fillStyle = fill; ctx.fillRect(Math.round(x), Math.round(y), w, h)
      }
      const paw = (x: number, y: number) => {
        box(x - 17, y - 16, 34, 18, '#f5d9a8')
        ctx.fillStyle = '#e8bf86'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 15 + i * 8, y - 20, 6, 6)
        ctx.fillStyle = '#101018'; for (let i = 0; i < 4; i++) { ctx.fillRect(x - 15 + i * 8, y - 21, 6, 1) }
        ctx.fillStyle = '#ffb3c1'; ctx.fillRect(x - 4, y - 10, 8, 4)          // a toe bean
      }
      if (wp === 0) {
        // CLAW: the paw raised, swiping across on a hit, with three white streaks.
        const sw = swing > 0 ? 1 - swing / 0.25 : 0
        const x = cx + 50 - sw * 90, y = base - 10 - Math.sin(sw * Math.PI) * 30
        box(x - 18, y - 30, 36, 30, '#f5d9a8')
        ctx.fillStyle = '#e8bf86'; ctx.fillRect(x - 18, y - 6, 36, 6)
        ctx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { ctx.fillRect(x - 15 + i * 9, y - 40, 3, 10); ctx.fillStyle = '#101018'; ctx.fillRect(x - 15 + i * 9, y - 41, 3, 1); ctx.fillStyle = '#ffffff' }
        if (swing > 0) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 3; i++) ctx.fillRect(cx - 50 + i * 10, LVIEW / 2 - 30 + i * 8, 100, 2) }
        return
      }
      if (wp === 1) {
        // CAN CANNON: a soda can with a red band and a pull-tab muzzle.
        box(cx - 10, base - 52, 20, 36, '#8a8a99')
        ctx.fillStyle = '#c0c0c8'; ctx.fillRect(cx - 10, base - 52, 4, 36)
        ctx.fillStyle = '#d81e1e'; ctx.fillRect(cx - 10, base - 40, 20, 10)
        ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 6, base - 37, 12, 2)
        box(cx - 7, base - 57, 14, 5, '#c0c0c8')
      } else if (wp === 2) {
        // REPEATER: three barrels that turn while it fires, on a drum.
        const spin = Math.floor(t * (fireHeld ? 30 : 2)) % 3
        for (let i = 0; i < 3; i++) box(cx - 13 + i * 9, base - 64, 7, 44, i === spin ? '#c0c0c8' : '#8a8a99')
        box(cx - 16, base - 30, 32, 12, '#5c5c6a')
        ctx.fillStyle = '#ffd166'; ctx.fillRect(cx - 12, base - 26, 24, 3)
      } else {
        // B.F.G.: a big green furball cannon with a glowing core.
        const glow = 0.6 + Math.sin(t * 6) * 0.4
        box(cx - 30, base - 44, 60, 30, '#1f5f34')
        ctx.fillStyle = '#2d8a4a'; ctx.fillRect(cx - 30, base - 44, 60, 6)
        ctx.fillStyle = `rgba(120,255,150,${glow})`; ctx.beginPath(); ctx.arc(cx, base - 30, 9, 0, 7); ctx.fill()
        ctx.fillStyle = '#eaffef'; ctx.beginPath(); ctx.arc(cx, base - 30, 3, 0, 7); ctx.fill()
        for (let i = 0; i < 3; i++) box(cx - 26 + i * 4, base - 40 + i * 0, 2, 20, '#0f3a1f')
        for (let i = 0; i < 3; i++) box(cx + 20 + i * 4, base - 40, 2, 20, '#0f3a1f')
      }
      paw(cx, base)
      if (flash > 0 && wp !== 3) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(cx, base - (wp === 2 ? 70 : 62), 9, 0, 7); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, base - (wp === 2 ? 70 : 62), 4, 0, 7); ctx.fill() }
    }

    // ── a frame ──
    let last = performance.now(), t = 0
    function frame(now: number) {
      if (!alive || myLoop !== LOOP_ID) return
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt

      if (net) netStep(dt)
      else if (!over && started && !paused && !hold.current) {
        // Move and turn.
        let fwd = 0, str = 0
        if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1
        if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1
        if (keys.has('KeyD')) str += 1
        if (keys.has('KeyA')) str -= 1
        if (keys.has('ArrowLeft') || keys.has('KeyQ')) turn(-TURN * dt)
        if (keys.has('ArrowRight') || keys.has('KeyE')) turn(TURN * dt)
        fwd += -stick.current.my; str += stick.current.mx
        if (free && edge && document.pointerLockElement !== cv) turn(edge * TURN * 1.4 * opts.current.sens * dt)
        if (stick.current.turn) turn(stick.current.turn * TURN * dt)
        if (fwd || str) {
          const k = MOVE * dt / Math.max(1, Math.hypot(fwd, str))
          tryMove(px + (dx * fwd + (-dy) * str) * k, py + (dy * fwd + dx * str) * k)
        }

        waveTime += dt
        // Rats come for you, and bite — each kind at its own pace.
        for (const r of rats) {
          if (r.dead) { r.dead += dt; continue }
          r.hurt = Math.max(0, r.hurt - dt)
          const K = kindOf(r)
          const vx = px - r.x, vy = py - r.y, d = Math.hypot(vx, vy)
          if (d > 0.45 + K.scale * 0.25) {
            const s = K.speed * dt / d
            const nx = r.x + vx * s, ny = r.y + vy * s
            if (!solid(nx, r.y)) r.x = nx
            if (!solid(r.x, ny)) r.y = ny
          } else {
            hp -= K.bite * dt; waveHurt += K.bite * dt; hurt = 0.25
            if (Math.random() < dt * 0.8) babble(['eek', 'skree', 'nyik nyik', 'chit'][Math.floor(Math.random() * 4)], { pitch: r.kind === 'king' ? 0.9 : r.kind === 'brute' ? 1.4 : 2.4, speed: 1.6, vol: 0.06 })
            if (Math.random() < dt * 2) sBite()
          }
        }
        if (hp <= 0) { hp = 0; over = true; musicOn(false); cursor(); babble('the rats got you', { pitch: 0.6, speed: 0.8 }) }

        // Nuggets: ammo, a little health, and bonus score.
        for (const n of nugs) if (!n.taken && Math.hypot(n.x - px, n.y - py) < 0.5) {
          n.taken = true; ammo = Math.min(MAX_AMMO, ammo + 12); hp = Math.min(100, hp + 10); waveNugs++; score += 250; sPick()
        }

        // Fire, by weapon. The repeater keeps going while the button is held.
        cool = Math.max(0, cool - dt)
        const Wp = WEAPONS[weapon]
        const want = fire.current || (Wp.auto && fireHeld)
        fire.current = false
        if (want && cool <= 0 && ammo >= Wp.cost) {
          cool = Wp.cool; ammo -= Wp.cost; waveShots++
          if (weapon !== 0) waveClawOnly = false
          /** The rat under the crosshair (its drawn box, a little generous), nearest first. */
          const under = (ax: number, ay: number, reach: number) => {
            let best: Rat | null = null, bestD = Math.min(reach, zbuf[Math.round(ax)] ?? Infinity)
            for (const r of rats) {
              if (r.dead) continue
              const rx = r.x - px, ry = r.y - py
              const inv = 1 / (plx * dy - dx * ply)
              const tX = inv * (dy * rx - dx * ry), tY = inv * (-ply * rx + plx * ry)
              if (tY <= 0.1 || tY > bestD) continue
              const sc = kindOf(r).scale
              const h = (VIEW_H / tY) * sc, w = h * (ratImg ? ratImg.width / ratImg.height : 1.7)
              const cx = (W / 2) * (1 + tX / tY)
              const y0 = VIEW_H / 2 + pitch + (VIEW_H / tY) / 2 - h
              const padX = w * 0.12, padY = h * 0.25
              if (ax > cx - w / 2 - padX && ax < cx + w / 2 + padX && ay > y0 - padY && ay < y0 + h + padY) { best = r; bestD = tY }
            }
            return best
          }
          const hurtRat = (r: Rat, dmg: number) => {
            r.hp -= dmg; r.hurt = 0.15
            if (r.hp <= 0) {
              r.dead = 0.001; kills++; score += kindOf(r).pts; booms.push({ x: r.x, y: r.y, t: 0 }); sBoom()
              if (r.kind === 'king') waveKing = true
            }
          }
          if (weapon === 0) {
            // The claw: a swipe that reaches about one cell.
            swing = 0.25
            const r = under(aimX, aimY, 1.25)
            if (r) { hurtRat(r, Wp.dmg); hitMark = 0.18; waveHits++ }
          } else if (weapon === 3) {
            // The B.F.G.: every rat in sight, in front, within eight cells.
            flash = 0.12; bfgFlash = 0.35; sBoom()
            let hit = false
            for (const r of rats) {
              if (r.dead) continue
              const rx = r.x - px, ry = r.y - py
              const inv = 1 / (plx * dy - dx * ply)
              const tX = inv * (dy * rx - dx * ry), tY = inv * (-ply * rx + plx * ry)
              const col = Math.round((W / 2) * (1 + tX / tY))
              if (tY <= 0.1 || tY > 8 || col < 0 || col >= W || tY > zbuf[col]) continue
              hurtRat(r, Wp.dmg); hit = true
            }
            if (hit) { hitMark = 0.3; waveHits++ }
          } else {
            flash = 0.08; sShot()
            // The repeater sprays a little.
            const ax = weapon === 2 ? aimX + (Math.random() - 0.5) * 14 * S : aimX
            const r = under(ax, aimY, Infinity)
            if (r) { hurtRat(r, Wp.dmg); hitMark = 0.18; waveHits++ }
          }
        }

        // The last rat down: the results screen, in the game (JP: "it should just be within the game itself").
        if (!results && rats.every(r => r.dead) && !booms.length) {
          const lines: { label: string; pts: number }[] = []
          const par = 10 + rats.length * 3
          const killed = rats.length
          lines.push({ label: `RATS XECUTED  x${killed}`, pts: rats.reduce((n, r) => n + kindOf(r).pts, 0) })
          if (waveNugs) lines.push({ label: `NUGGETS  x${waveNugs}`, pts: waveNugs * 250 })
          if (waveTime < par) lines.push({ label: 'TIME BONUS', pts: Math.round((par - waveTime) * 50) })
          if (waveTime < par * 0.5) lines.push({ label: 'SPEED DEMON', pts: 1000 })
          if (waveHurt < 0.5) lines.push({ label: 'UNTOUCHABLE', pts: 1500 })
          if (waveShots >= 5 && waveHits / waveShots >= 0.75) lines.push({ label: 'SHARPSHOOTER', pts: 800 })
          if (nugs.every(n => n.taken)) lines.push({ label: 'CLEAN SWEEP', pts: 1000 })
          if (waveClawOnly) lines.push({ label: 'BARE PAWS', pts: 2000 })
          if (hp <= 15) lines.push({ label: 'CLOSE CALL', pts: 500 })
          if (waveKing) lines.push({ label: 'KINGSLAYER', pts: 3000 })
          // Kills and nuggets were already counted as they happened; the bonuses add now.
          const bonus = lines.slice(waveNugs ? 2 : 1).reduce((n, l) => n + l.pts, 0)
          results = { t: 0, lines, total: score + bonus, time: waveTime }
          score += bonus
          try { const a = new Audio('/game/announcer/wave-cleared.mp3'); a.volume = 0.8; void a.play().catch(() => {}) } catch {}
        }
      }
      if (results) {
        const before = results.t
        results.t += dt
        // A tick as each line lands.
        const landed = (t: number) => Math.floor((t - 0.8) / 0.45)
        if (results.t > 0.8 && landed(results.t) !== landed(before) && landed(results.t) <= results.lines.length) { const l = results.lines[landed(results.t) - 1]; babble(l ? l.label : 'total', { pitch: 1.2, speed: 1.4 }) }
      }
      swing = Math.max(0, swing - dt); bfgFlash = Math.max(0, bfgFlash - dt)
            flash = Math.max(0, flash - dt); hurt = Math.max(0, hurt - dt); banner = Math.max(0, banner - dt); hitMark = Math.max(0, hitMark - dt)
      booms = booms.filter(b => (b.t += dt) < 0.7)

      // ── draw ──
      const tags: { name: string; x: number; y: number }[] = []
      let netPlayers: { id: string; name: string; face: string; x: number; y: number }[] = []
      if (net) {
        const v = net.view()
        rats = v.rats.filter(r => r.alive).map(r => ({ x: r.x, y: r.y, hp: 1, hurt: 0, dead: 0 }))
        const gone = new Set(net.latest?.nugs ?? [])
        nugs.forEach((n, i) => (n.taken = gone.has(i)))
        netPlayers = v.players.filter(p => p.alive)
      }
      renderWalls()
      const things: { d: number; draw: () => void }[] = []
      const dist = (x: number, y: number) => (x - px) ** 2 + (y - py) ** 2
      if (ratImg) for (const r of rats) if (!r.dead) things.push({ d: dist(r.x, r.y), draw: () => {
        // A hit rat flashes red, so a shot that landed never looks like a miss.
        const K = kindOf(r)
        if (!COARSE) ctx.filter = r.hurt > 0 ? 'sepia(1) saturate(8) hue-rotate(-40deg) brightness(1.1)' : K.filter
        sprite(ratImg!, 0, 0, ratImg!.width, ratImg!.height, r.x, r.y, K.scale)
        ctx.filter = 'none'
      } })
      if (nugImg) for (const n of nugs) if (!n.taken) things.push({ d: dist(n.x, n.y), draw: () => {
        const f = Math.floor(t * 10) % 8
        sprite(nugImg!, f * 31, 0, 31, 40, n.x, n.y, 0.22)
      } })
      if (boomImg) for (const b of booms) things.push({ d: dist(b.x, b.y), draw: () => {
        const f = Math.min(7, Math.floor((b.t / 0.7) * 8))
        sprite(boomImg!, f * 71, 0, 71, 98, b.x, b.y, 0.7, 30 * S)
      } })
      for (const p of netPlayers) things.push({ d: dist(p.x, p.y), draw: () => {
        const im = framed(p.face); if (!im) return
        if (!COARSE && pHurt.has(p.id)) ctx.filter = 'sepia(1) saturate(8) hue-rotate(-40deg) brightness(1.1)'
        const at = sprite(im, 0, 0, im.width, im.height, p.x, p.y, PLAYER_SCALE)
        ctx.filter = 'none'
        if (at?.seen) tags.push({ name: p.name, x: at.cx / S, y: at.y0 / S - 9 })
      } })
      // Knocked over: the picture tips back, then goes up in the explosion.
      for (const k of knocked) things.push({ d: dist(k.x, k.y), draw: () => {
        if (k.t < KO_TIP) { const im = framed(k.face); if (im) sprite(im, 0, 0, im.width, im.height, k.x, k.y, PLAYER_SCALE, 0, Math.max(0.05, Math.cos((k.t / KO_TIP) * Math.PI / 2))) }
        else if (boomImg) { const f = Math.min(7, Math.floor(((k.t - KO_TIP) / 0.7) * 8)); sprite(boomImg, f * 71, 0, 71, 98, k.x, k.y, 0.7, 30 * S) }
      } })
      things.sort((a, b) => b.d - a.d).forEach(s => s.draw())

      ctx.setTransform(S, 0, 0, S, 0, 0)
      // The weapon in your paw (drawWeapon below), kicking on each shot.
      if (started && !(net && false)) drawWeapon(net ? 1 : weapon, flash > 0 ? 6 : 0, Math.sin(t * 8) * (keys.size ? 2 : 0.5))
      if (bfgFlash > 0) { ctx.fillStyle = `rgba(80,255,120,${bfgFlash})`; ctx.fillRect(0, 0, LW, LVIEW) }
            // Crosshair.
      {
        const ax = Math.round(aimX / S), ay = Math.round(aimY / S)
        ctx.fillStyle = '#101018'
        ctx.fillRect(ax - 5, ay - 1, 4, 3); ctx.fillRect(ax + 2, ay - 1, 4, 3); ctx.fillRect(ax - 1, ay - 5, 3, 4); ctx.fillRect(ax - 1, ay + 2, 3, 4)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(ax - 4, ay, 3, 1); ctx.fillRect(ax + 2, ay, 3, 1); ctx.fillRect(ax, ay - 4, 1, 3); ctx.fillRect(ax, ay + 2, 1, 3)
        if (hitMark > 0) {
          // The hit marker: a red X round the crosshair.
          ctx.fillStyle = '#ff3030'
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(ax - 6 + i, ay - 6 + i, 1, 1); ctx.fillRect(ax + 6 - i, ay - 6 + i, 1, 1)
            ctx.fillRect(ax - 6 + i, ay + 6 - i, 1, 1); ctx.fillRect(ax + 6 - i, ay + 6 - i, 1, 1)
          }
        }
      }
      if (hurt > 0) { ctx.fillStyle = `rgba(220,30,30,${hurt * 1.2})`; ctx.fillRect(0, 0, LW, LVIEW) }
      // Name tags over the other players.
      for (const g of tags) text(g.name, g.x, g.y, '#ffffff', 0.5, true, 'outline')

      // The status bar, Doom's: ammo, the face, health, kills.
      // A Windows 98 panel: grey, bevelled, navy labels.
      ctx.fillStyle = '#c0c0c0'; ctx.fillRect(0, LVIEW, LW, LBAR)
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, LVIEW, LW, 1); ctx.fillRect(0, LVIEW, 1, LBAR)
      ctx.fillStyle = '#808080'; ctx.fillRect(0, LH - 1, LW, 1); ctx.fillRect(LW - 1, LVIEW, 1, LBAR)
      // Labels small, numbers bigger: the bar is only 32 pixels tall.
      const stat = (label: string, value: string, x: number, ink = '#101018') => {
        text(label, x, LVIEW + 3, '#000080', 0.5, false, 'emboss'); text(value, x, LVIEW + 14, ink, 0.75, false, 'emboss')
      }
      stat('AMMO', String(ammo), 10)
      stat('HEALTH', `${Math.ceil(hp)}%`, 70, hp > 30 ? '#101018' : '#d81e1e')
      stat('SCORE', String(net ? kills : score), LW - 118)
      if (net) stat('TIME', mmss(net.latest?.phase === 'live' ? net.latest.left : 0), LW - 56)
      else stat('WAVE', String(wave), LW - 56)
      ctx.fillStyle = '#101018'; ctx.fillRect(LW / 2 - 15, LVIEW + 2, 30, 28)
      if (faceImg) {
        // The player's own cat (JP: "just use their cat as the pfp face"), flashing red when bitten.
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(faceImg, LW / 2 - 13, LVIEW + 4, 26, 24)
        ctx.imageSmoothingEnabled = false
        if ((hurt > 0 && Math.floor(t * 16) % 2 === 0) || hp <= 0) { ctx.fillStyle = 'rgba(230,20,20,0.6)'; ctx.fillRect(LW / 2 - 13, LVIEW + 4, 26, 24) }
      }

      if (!net && started && !over && !results) {
        const left = rats.filter(r => !r.dead).length
        text(`RATS LEFT ${left}`, 6, 5, left <= 2 ? '#ff6060' : '#ffffff', 0.6, false, 'outline')
        text(`NUGGETS ${nugs.filter(n => n.taken).length}/${nugs.length}`, 6, 17, '#ffd166', 0.6, false, 'outline')
        const sec = waveTime
        text(`${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`, LW - 6 - 40, 5, '#ffffff', 0.6, false, 'outline')
        text(WEAPONS[weapon].name, LW - 6 - 64, LVIEW - 14, '#c8d6ff', 0.55, false, 'outline')
        const king = rats.find(r => r.kind === 'king' && !r.dead)
        if (king) {
          text('THE RAT KING', LW / 2, 26, '#ff6060', 0.7, true, 'outline')
          ctx.fillStyle = '#101018'; ctx.fillRect(LW / 2 - 70, 40, 140, 7)
          ctx.fillStyle = '#d81e1e'; ctx.fillRect(LW / 2 - 69, 41, Math.max(0, 138 * king.hp / (king.max ?? 40)), 5)
        }
      }
      if (results) drawResults(results)
      if (net) {
        const l = net.latest
        if (net.status === 'connecting') text('CONNECTING...', LW / 2, LVIEW / 2 - 50, '#ffffff', 1, true, 'outline')
        else if (net.status === 'full') text('THIS ROOM IS FULL', LW / 2, LVIEW / 2 - 50, '#ff4040', 1, true, 'outline')
        else if (net.status === 'closed') text('DISCONNECTED - RELOAD', LW / 2, LVIEW / 2 - 50, '#ff4040', 1, true, 'outline')
        if (l?.phase === 'over') {
          const top = [...l.players].sort((a, b) => b.score - a.score)[0]
          scoreboard(top ? `${top.name} WINS!` : 'MATCH OVER', `NEXT MATCH IN ${l.left}`)
        } else if (keys.has('Tab')) scoreboard('SCOREBOARD', `${mmss(l?.left ?? 0)} LEFT`)
        else if (net.mine && !net.mine.alive) {
          text('KNOCKED OUT', LW / 2, LVIEW / 2 - 40, '#ff4040', 1.5, true, 'outline')
          text('BACK IN A MOMENT', LW / 2, LVIEW / 2 - 8, '#ffffff', 0.75, true, 'outline')
        }
      }
      if (!started && !net) drawTitle()
      else if (!started) text('CLICK TO PLAY', LW / 2, LVIEW / 2 - 30, '#ffd166', 1.5, true, 'outline')
      if (over) {
        ctx.fillStyle = 'rgba(10,10,20,0.7)'; ctx.fillRect(0, 0, LW, LVIEW)
        text('THE RATS GOT YOU', LW / 2, 50, '#ff4040', 1.5, true, 'outline')
        text(`WAVE ${wave} · ${kills} RATS · ${score} PTS`, LW / 2, 90, '#ffd166', 0.8, true, 'outline')
        text('CLICK OR PRESS R', LW / 2, 122, '#ffffff', 1, true, 'outline')
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      alive = false; cancelAnimationFrame(raf)
      music.pause()
      net?.close()
      removeEventListener('blur', letGo); document.removeEventListener('visibilitychange', hidden)
      removeEventListener('ratx-start', startTouch); removeEventListener('ratx-pause', touchPause); removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('mousemove', look); removeEventListener('mouseup', mouseUp); cv.removeEventListener('wheel', wheel)
      document.removeEventListener('pointerlockchange', lockChange); cv.removeEventListener('mousedown', click); cv.removeEventListener('mouseleave', leave)
    }
  }, [face, room, name])

  // Touch: the left half of the pad moves, the right half turns, FIRE fires.
  const pad = (e: React.TouchEvent, side: 'move' | 'turn') => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const t = e.touches[0]
    if (!t) { if (side === 'move') { stick.current.mx = 0; stick.current.my = 0 } else stick.current.turn = 0; return }
    const nx = Math.max(-1, Math.min(1, ((t.clientX - r.left) / r.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, ((t.clientY - r.top) / r.height) * 2 - 1))
    if (side === 'move') { stick.current.mx = nx; stick.current.my = ny } else stick.current.turn = nx
  }

  return (
    <div style={st.wrap}>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <canvas ref={canvas} width={W} height={H} style={touch ? { ...st.canvas, imageRendering: 'auto' } : st.canvas} />
        {curtain && <GameCurtain {...curtain} width={wrapRef.current?.clientWidth ?? 640} />}
      </div>
      {!touch && !locked && hint && room && <div style={st.hint}>CLICK TO LOCK IN · MOUSE AIMS · CLICK SHOOTS · WASD MOVES · ESC PAUSES</div>}
      {paused && (
        <div style={st.dim}>
          <section className="win98" data-title="PAUSED" style={st.menu}>
            <button className="plain" style={st.menuBtn} onClick={() => menu.current.resume()}>RESUME</button>
            {!room && <button className="plain" style={st.menuBtn} onClick={() => menu.current.restart()}>RESTART</button>}
            <a style={{ ...st.menuBtn, textDecoration: 'none', textAlign: 'center' }} href="/">QUIT</a>
            {/* Two rows of one grid: labels, sliders and values each line up (JP: "format this better so the sliders are uniform"). */}
            <div style={st.optGrid}>
              <label htmlFor="ratx-sens" style={st.optLabel}>MOUSE SPEED</label>
              <input id="ratx-sens" type="range" min={0.2} max={3} step={0.1} value={sens} onChange={e => setSens(Number(e.target.value))} style={st.range} />
              <span style={st.optValue}>{sens.toFixed(1)}x</span>
              <label htmlFor="ratx-vol" style={st.optLabel}>MUSIC</label>
              <input id="ratx-vol" type="range" min={0} max={1} step={0.05} value={vol} onChange={e => setVol(Number(e.target.value))} style={st.range} />
              <span style={st.optValue}>{Math.round(vol * 100)}%</span>
            </div>
            <p style={st.menuFine}>Esc lets go of the mouse. Click RESUME, or the game, to jump back in.</p>
          </section>
        </div>
      )}
      {touch && <RatxSticks stick={stick} onFire={() => { fire.current = true }} />}
    </div>
  )
}

/**
 * THE FIGHT'S CURTAIN over the game view (MapDive's CurtainHalves, the very same
 * piece), drawn in its 480x320 stage and scaled to the view's width — the stage is
 * a touch taller than the view, so it is centred and the extra is cut off.
 *
 *   close: the view fades to white, then the checker fades in over it
 *   open:  the halves part down the middle, easing in
 */
function GameCurtain({ lines, up, phase, quiet, ink, width }: {
  lines: readonly string[]; up: number; phase: 'close' | 'open'; quiet: boolean; ink: string; width: number
}) {
  const [clock, setClock] = useState(0)
  const since = useRef({ phase, at: 0 })
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = () => { setClock(performance.now() - t0); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  if (since.current.phase !== phase) since.current = { phase, at: clock }
  const t = clock - since.current.at
  const clamp = (n: number) => Math.max(0, Math.min(1, n))
  const white = phase === 'close' ? clamp(t / CURTAIN_MS.white) : 0
  const checks = phase === 'close' ? clamp((t - CURTAIN_MS.white) / CURTAIN_MS.checks) : 1
  const split = phase === 'open' ? clamp(t / CURTAIN_MS.split) ** 2 : 0
  const k = width / CURTAIN_W
  const viewH = width * (H / W)
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width, height: viewH, overflow: 'hidden', pointerEvents: 'none' }}>
      {white > 0 && <div style={{ position: 'absolute', inset: 0, background: '#ffffff', opacity: white }} />}
      <div style={{ position: 'absolute', left: 0, top: (viewH - CURTAIN_H * k) / 2, width: CURTAIN_W, height: CURTAIN_H, transform: `scale(${k})`, transformOrigin: '0 0', imageRendering: 'pixelated' }}>
        {checks > 0 && <CurtainHalves clock={clock} checks={checks} split={split} quiet={quiet} ink={ink} words={lines} wordsUp={up} />}
      </div>
    </div>
  )
}

const st: Record<string, React.CSSProperties> = {
  wrap:   { position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  canvas: { width: '100%', aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated', background: '#000', display: 'block', cursor: 'default', touchAction: 'none' },
  hint:   { position: 'absolute', left: 0, right: 0, top: '58%', textAlign: 'center', color: '#ffd166', fontSize: 18, textShadow: '2px 2px 0 #000', pointerEvents: 'none' },
  dim:      { position: 'absolute', left: 0, top: 0, right: 0, aspectRatio: `${W} / ${H}`, background: 'rgba(0,0,40,0.45)', display: 'grid', placeItems: 'center' },
  menu:     { background: '#c0c0c0', padding: 16, width: 'min(320px, 80%)', display: 'flex', flexDirection: 'column', gap: 8, color: '#000' },
  menuBtn:  { display: 'block', padding: '10px 16px', fontSize: 20, fontFamily: 'inherit', color: '#000', background: '#c0c0c0', border: 0, cursor: 'pointer', boxShadow: 'inset -1px -1px 0 0 #0a0a0a, inset 1px 1px 0 0 #ffffff, inset -2px -2px 0 0 #808080, inset 2px 2px 0 0 #dfdfdf' },
  menuFine: { margin: '4px 0 0', fontSize: 15 },
  opts:     { display: 'flex', flexWrap: 'wrap', gap: '8px 24px', color: '#000' },
  opt:      { display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, color: '#000080' },
  range:    { width: '100%', margin: 0, accentColor: '#000080', cursor: 'pointer' },
  optGrid:  { display: 'grid', gridTemplateColumns: '112px 1fr 44px', alignItems: 'center', columnGap: 10, rowGap: 10, marginTop: 6 },
  optLabel: { fontSize: 16, color: '#000080', whiteSpace: 'nowrap' },
  optValue: { fontSize: 16, color: '#000080', textAlign: 'right' },
  pads:   { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, userSelect: 'none' },
  pad:    { height: 110, background: '#3a3a46', color: '#c0c0c8', display: 'grid', placeItems: 'center', fontSize: 16, touchAction: 'none', boxShadow: 'inset 2px 2px 0 #5a5a68, inset -2px -2px 0 #1a1a22' },
  fire:   { width: 96, background: '#c0392b', color: '#fff', border: 0, fontSize: 20, fontFamily: 'inherit', touchAction: 'none' },
}
