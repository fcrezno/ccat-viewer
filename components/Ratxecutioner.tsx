'use client'

import { useEffect, useRef, useState } from 'react'
import { CELL_H, TRACKING, cell, glyph } from '@/lib/font'
import { BANNER_TOKENS, bannerFile } from '@/lib/banners'
import { ANNOUNCERS, voiceFile } from '@/lib/announcers'
import { VOICE_MS } from '@/lib/announcerVoice'
import { CURTAIN_H, CURTAIN_INKS, CURTAIN_MS, CURTAIN_W, CurtainHalves } from '@/components/MapDive'

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

// The lair. # brick, . floor, P the player, R a rat's den, N a nugget.
const MAP = [
  '####################',
  '#P.....#.....R.....#',
  '#.##...#..###......#',
  '#.#....N....#..##..#',
  '#.#..####...#...#..#',
  '#......R#.......#R.#',
  '####.....#..##.....#',
  '#..N...........#...#',
  '#..##..#####...#.N.#',
  '#R.....#...#.......#',
  '#..##..#.N.#..####.#',
  '#......#...#.....R.#',
  '#.####.##.##..#....#',
  '#....#........#..#.#',
  '#.N..#..R..##....#.#',
  '#....###...#..N..#.#',
  '#..........#.....#R#',
  '#.R..##..........#.#',
  '#........N....R....#',
  '####################',
]
const solid = (x: number, y: number) => MAP[Math.floor(y)]?.[Math.floor(x)] === '#' || MAP[Math.floor(y)]?.[Math.floor(x)] === undefined

type Rat = { x: number; y: number; hp: number; hurt: number; dead: number }
type Nug = { x: number; y: number; taken: boolean }
type Boom = { x: number; y: number; t: number }

const load = (src: string) => new Promise<HTMLImageElement>((ok, no) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src
})

export function Ratxecutioner({ face }: { face: string }) {
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
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    let raf = 0, alive = true

    // ── state ──
    const keys = new Set<string>()
    let px = 1.5, py = 1.5, dx = 1, dy = 0, plx = 0, ply = FOV
    // Nothing moves until the player clicks in: the rats wait for you.
    let started = false
    let paused = false
    const begin = (_why = '') => { if (!started) { started = true; setHint(false); intro.current(1, true) } musicOn(true); cursor() }
    /** No arrow over the game while you play; it comes back for the start, the menu and game over. */
    const cursor = () => { cv.style.cursor = started && !paused && !over ? 'none' : 'default' }
    /** Looking up and down, Doom's way: the horizon slides; the world never tilts. */
    let pitch = 0
    const PITCH_MAX = 50 * S
    let hp = 100, ammo = START_AMMO, kills = 0, wave = 1, flash = 0, hurt = 0, over = false, banner = 2.2
    let rats: Rat[] = [], nugs: Nug[] = [], booms: Boom[] = []
    const dens: [number, number][] = []
    MAP.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === 'P') { px = x + 0.5; py = y + 0.5 }
      if (c === 'R') dens.push([x + 0.5, y + 0.5])
      if (c === 'N') nugs.push({ x: x + 0.5, y: y + 0.5, taken: false })
    }))
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
      rats = Array.from({ length: n }, (_, i) => {
        const [x, y] = dens[(i + wave) % dens.length]
        return { x: x + (Math.random() - 0.5) * 0.4, y: y + (Math.random() - 0.5) * 0.4, hp: RAT_HP + Math.floor(wave / 3), hurt: 0, dead: 0 }
      })
      nugs.forEach(n => (n.taken = false))
      banner = 2.2
    }
    const restart = () => { musicOn(true); cleared = 0; hp = 100; ammo = START_AMMO; kills = 0; wave = 1; over = false; px = 1.5; py = 1.5; dx = 1; dy = 0; plx = 0; ply = FOV; booms = []; spawnWave(); cursor(); intro.current(1, true) }

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
      const dec = new Dec({ data: await (await fetch(url)).arrayBuffer(), type: 'image/gif' })
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
      posterOf(bannerFile(i, sfx as string), step as number).catch(() => null))))
      .then(list => { posters = list.filter((p): p is NonNullable<typeof p> => !!p) })
    /** The frame of poster `p` showing now. */
    const posterNow = (p: (typeof posters)[number]) => {
      let k = (performance.now() % p.total)
      for (let i = 0; i < p.frames.length; i++) { if (k < p.ms[i]) return p.frames[i]; k -= p.ms[i] }
      return p.frames[0]
    }
    // Which wall faces carry a poster: brick that faces open floor, picked at random.
    const posterAt = new Map<string, number>()
    {
      const faces: string[] = []
      MAP.forEach((row, y) => [...row].forEach((c, x) => {
        if (c !== '#') return
        if (MAP[y]?.[x + 1] && MAP[y][x + 1] !== '#') faces.push(x + ',' + y + ',0')
        if (MAP[y]?.[x - 1] && MAP[y][x - 1] !== '#') faces.push(x + ',' + y + ',0')
        if (MAP[y + 1]?.[x] && MAP[y + 1][x] !== '#') faces.push(x + ',' + y + ',1')
        if (MAP[y - 1]?.[x] && MAP[y - 1][x] !== '#') faces.push(x + ',' + y + ',1')
      }))
      // Three in sight of the start, so the first look down the corridor has ads in it:
      // the wall dead ahead, and one either side.
      const first = ['7,1,0', '5,0,1', '3,2,1']
      first.forEach((k, i) => posterAt.set(k, i))
      for (let i = first.length; i < 22 && faces.length; i++) {
        const k = faces.splice(Math.floor(Math.random() * faces.length), 1)[0]
        if (!posterAt.has(k)) posterAt.set(k, i)
      }
    }
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
      // Without a lock the browser does not pause for us: Esc toggles it here.
      if (e.code === 'Escape' && free && started && !over) {
        paused = !paused; setPaused(paused); letGo(); musicOn(!paused); cursor()
      }
      if (over && e.code === 'KeyR') restart()
    }
    const up = (e: KeyboardEvent) => keys.delete(e.code)
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
      if (over) { restart(); if (!coarse) lock(); return }
      if (!coarse && !free && document.pointerLockElement !== cv) { begin('click'); lock(); return }
      begin('click')
      fire.current = true
    }
    menu.current = {
      resume: () => { if (free) { paused = false; setPaused(false); musicOn(true); cursor() } else lock() },
      restart: () => { restart(); lock() },
    }
    const startTouch = () => begin('touch')
    addEventListener('ratx-start', startTouch)
    addEventListener('blur', letGo); document.addEventListener('visibilitychange', hidden)
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('mousemove', look)
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
        const poster = pi === undefined || !posters.length ? null : posterNow(posters[pi % posters.length])
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
      ctx.putImageData(img, 0, 0)
    }

    /** A billboard: drawn a column at a time, behind any wall that is nearer. */
    function sprite(im: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, wx: number, wy: number, scale: number, lift = 0) {
      const rx = wx - px, ry = wy - py
      const inv = 1 / (plx * dy - dx * ply)
      const tX = inv * (dy * rx - dx * ry), tY = inv * (-ply * rx + plx * ry)
      if (tY <= 0.1) return null
      const cx = Math.floor((W / 2) * (1 + tX / tY))
      const h = Math.abs(Math.floor(VIEW_H / tY)) * scale
      const w = h * (sw / sh)
      const y0 = Math.floor(VIEW_H / 2 + pitch + (VIEW_H / tY) / 2 - h + lift / tY)
      const x0 = Math.floor(cx - w / 2)
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
        if (tY >= zbuf[x]) continue
        const col = sx + Math.floor(((x - x0) / w) * sw)
        ctx.drawImage(im, col, sy, 1, sh, x, y0, 1, h)
      }
      return { x0, x1: x0 + w, depth: tY }
    }

    // ── a frame ──
    let last = performance.now(), t = 0
    function frame(now: number) {
      if (!alive) return
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt

      if (!over && started && !paused && !hold.current) {
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

        // Rats come for you, and bite.
        for (const r of rats) {
          if (r.dead) { r.dead += dt; continue }
          r.hurt = Math.max(0, r.hurt - dt)
          const vx = px - r.x, vy = py - r.y, d = Math.hypot(vx, vy)
          if (d > 0.55) {
            const s = RAT_SPEED * dt / d
            const nx = r.x + vx * s, ny = r.y + vy * s
            if (!solid(nx, r.y)) r.x = nx
            if (!solid(r.x, ny)) r.y = ny
          } else {
            hp -= BITE_DPS * dt; hurt = 0.25
            if (Math.random() < dt * 2) sBite()
          }
        }
        if (hp <= 0) { hp = 0; over = true; musicOn(false); cursor() }

        // Nuggets: ammo and a little health.
        for (const n of nugs) if (!n.taken && Math.hypot(n.x - px, n.y - py) < 0.5) {
          n.taken = true; ammo = Math.min(MAX_AMMO, ammo + 12); hp = Math.min(100, hp + 10); sPick()
        }

        // Fire: a hitscan down the middle of the screen.
        if (fire.current) {
          fire.current = false
          if (ammo > 0) {
            ammo--; flash = 0.08; sShot()
            const col = Math.round(aimX)
            let best: Rat | null = null, bestD = zbuf[col] ?? Infinity
            for (const r of rats) {
              if (r.dead) continue
              const rx = r.x - px, ry = r.y - py
              const inv = 1 / (plx * dy - dx * ply)
              const tX = inv * (dy * rx - dx * ry), tY = inv * (-ply * rx + plx * ry)
              if (tY <= 0.1 || tY > bestD) continue
              // Exactly the box the rat is drawn in (see sprite(): scale 0.42), a little generous.
              const h = (VIEW_H / tY) * 0.42, w = h * (ratImg ? ratImg.width / ratImg.height : 1.7)
              const cx = (W / 2) * (1 + tX / tY)
              const y0 = VIEW_H / 2 + pitch + (VIEW_H / tY) / 2 - h
              const padX = w * 0.12, padY = h * 0.25
              if (aimX > cx - w / 2 - padX && aimX < cx + w / 2 + padX && aimY > y0 - padY && aimY < y0 + h + padY) { best = r; bestD = tY }
            }
            if (best) {
              hitMark = 0.18
              best.hp--; best.hurt = 0.15
              if (best.hp <= 0) { best.dead = 0.001; kills++; booms.push({ x: best.x, y: best.y, t: 0 }); sBoom() }
            }
          }
        }
        // The round is won: "WAVE CLEARED!" (JP: "when u finish a round; say WAVE CLEARED!"), then the next wave.
        if (!cleared && rats.every(r => r.dead) && !booms.length) {
          cleared = CLEARED_S
          try { const a = new Audio('/game/announcer/wave-cleared.mp3'); a.volume = 0.8; void a.play().catch(() => {}) } catch {}
        }
        if (cleared) {
          cleared = Math.max(0, cleared - dt)
          if (!cleared) { wave++; spawnWave(); intro.current(wave, false) }
        }
      }
      flash = Math.max(0, flash - dt); hurt = Math.max(0, hurt - dt); banner = Math.max(0, banner - dt); hitMark = Math.max(0, hitMark - dt)
      booms = booms.filter(b => (b.t += dt) < 0.7)

      // ── draw ──
      renderWalls()
      const things: { d: number; draw: () => void }[] = []
      const dist = (x: number, y: number) => (x - px) ** 2 + (y - py) ** 2
      if (ratImg) for (const r of rats) if (!r.dead) things.push({ d: dist(r.x, r.y), draw: () => {
        // A hit rat flashes red, so a shot that landed never looks like a miss.
        if (r.hurt > 0) ctx.filter = 'sepia(1) saturate(8) hue-rotate(-40deg) brightness(1.1)'
        sprite(ratImg!, 0, 0, ratImg!.width, ratImg!.height, r.x, r.y, 0.42)
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
      things.sort((a, b) => b.d - a.d).forEach(s => s.draw())

      ctx.setTransform(S, 0, 0, S, 0, 0)
      // The gun: a can-cannon in a paw, kicking on each shot.
      const kick = flash > 0 ? 6 : 0, bob = Math.sin(t * 8) * (keys.size ? 2 : 0.5)
      ctx.fillStyle = '#8a8a99'; ctx.fillRect(LW / 2 - 10, LVIEW - 46 + kick + bob, 20, 34)
      ctx.fillStyle = '#5c5c6a'; ctx.fillRect(LW / 2 - 10, LVIEW - 46 + kick + bob, 4, 34)
      ctx.fillStyle = '#c0c0c8'; ctx.fillRect(LW / 2 - 6, LVIEW - 50 + kick + bob, 12, 6)
      ctx.fillStyle = '#f5d9a8'; ctx.fillRect(LW / 2 - 16, LVIEW - 18 + kick + bob, 32, 18)
      ctx.fillStyle = '#e8bf86'; for (let i = 0; i < 4; i++) ctx.fillRect(LW / 2 - 14 + i * 8, LVIEW - 22 + kick + bob, 6, 6)
      if (flash > 0) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(LW / 2, LVIEW - 56, 9, 0, 7); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(LW / 2, LVIEW - 56, 4, 0, 7); ctx.fill() }
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
      stat('KILLS', String(kills), LW - 118)
      stat('WAVE', String(wave), LW - 56)
      ctx.fillStyle = '#101018'; ctx.fillRect(LW / 2 - 15, LVIEW + 2, 30, 28)
      if (faceImg) {
        // The player's own cat (JP: "just use their cat as the pfp face"), flashing red when bitten.
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(faceImg, LW / 2 - 13, LVIEW + 4, 26, 24)
        ctx.imageSmoothingEnabled = false
        if ((hurt > 0 && Math.floor(t * 16) % 2 === 0) || hp <= 0) { ctx.fillStyle = 'rgba(230,20,20,0.6)'; ctx.fillRect(LW / 2 - 13, LVIEW + 4, 26, 24) }
      }

      if (cleared > 0) text('WAVE CLEARED!', LW / 2, LVIEW / 2 - 40, '#ffd166', 2, true, 'outline')
      if (!started) text('CLICK TO PLAY', LW / 2, LVIEW / 2 - 30, '#ffd166', 1.5, true, 'outline')
      if (over) {
        ctx.fillStyle = 'rgba(10,10,20,0.7)'; ctx.fillRect(0, 0, LW, LVIEW)
        text('THE RATS GOT YOU', LW / 2, 50, '#ff4040', 1.5, true, 'outline')
        text(`${kills} RATS XECUTED`, LW / 2, 90, '#ffd166', 1, true, 'outline')
        text('CLICK OR PRESS R', LW / 2, 122, '#ffffff', 1, true, 'outline')
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      alive = false; cancelAnimationFrame(raf)
      music.pause()
      removeEventListener('blur', letGo); document.removeEventListener('visibilitychange', hidden)
      removeEventListener('ratx-start', startTouch); removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('mousemove', look)
      document.removeEventListener('pointerlockchange', lockChange); cv.removeEventListener('mousedown', click); cv.removeEventListener('mouseleave', leave)
    }
  }, [face])

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
        <canvas ref={canvas} width={W} height={H} style={st.canvas} />
        {curtain && <GameCurtain {...curtain} width={wrapRef.current?.clientWidth ?? 640} />}
      </div>
      {!touch && !locked && hint && <div style={st.hint}>CLICK TO LOCK IN · MOUSE AIMS · CLICK SHOOTS · WASD MOVES · ESC PAUSES</div>}
      {paused && (
        <div style={st.dim}>
          <section className="win98" data-title="PAUSED" style={st.menu}>
            <button className="plain" style={st.menuBtn} onClick={() => menu.current.resume()}>RESUME</button>
            <button className="plain" style={st.menuBtn} onClick={() => menu.current.restart()}>RESTART</button>
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
      {touch && (
        <div style={st.pads}>
          <div style={st.pad} onTouchStart={e => pad(e, 'move')} onTouchMove={e => pad(e, 'move')} onTouchEnd={e => pad(e, 'move')}>MOVE</div>
          <button style={st.fire} onTouchStart={e => { e.preventDefault(); fire.current = true; window.dispatchEvent(new Event('ratx-start')) }}>FIRE</button>
          <div style={st.pad} onTouchStart={e => pad(e, 'turn')} onTouchMove={e => pad(e, 'turn')} onTouchEnd={e => pad(e, 'turn')}>TURN</div>
        </div>
      )}
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
