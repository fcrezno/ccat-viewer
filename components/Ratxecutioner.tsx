'use client'

import { useEffect, useRef, useState } from 'react'
import { CELL_H, TRACKING, cell, glyph } from '@/lib/font'
import { BANNER_TOKENS, bannerFile } from '@/lib/banners'

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

const W = 320, H = 200, BAR = 32, VIEW_H = H - BAR
const FOV = 0.66                         // camera plane length: ~66 degrees, Wolfenstein's
const MOVE = 2.6, TURN = 2.4, MOUSE = 0.0026
const RAT_SPEED = 1.15, RAT_HP = 2, BITE_DPS = 9
const START_AMMO = 40, MAX_AMMO = 99

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
  const [touch, setTouch] = useState(false)
  const fire = useRef(false)
  const stick = useRef<{ mx: number; my: number; turn: number }>({ mx: 0, my: 0, turn: 0 })

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
    let hp = 100, ammo = START_AMMO, kills = 0, wave = 1, flash = 0, hurt = 0, over = false, banner = 2.2
    let rats: Rat[] = [], nugs: Nug[] = [], booms: Boom[] = []
    const dens: [number, number][] = []
    MAP.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === 'P') { px = x + 0.5; py = y + 0.5 }
      if (c === 'R') dens.push([x + 0.5, y + 0.5])
      if (c === 'N') nugs.push({ x: x + 0.5, y: y + 0.5, taken: false })
    }))
    const spawnWave = () => {
      const n = 4 + wave * 2
      rats = Array.from({ length: n }, (_, i) => {
        const [x, y] = dens[(i + wave) % dens.length]
        return { x: x + (Math.random() - 0.5) * 0.4, y: y + (Math.random() - 0.5) * 0.4, hp: RAT_HP + Math.floor(wave / 3), hurt: 0, dead: 0 }
      })
      nugs.forEach(n => (n.taken = false))
      banner = 2.2
    }
    spawnWave()
    const restart = () => { hp = 100; ammo = START_AMMO; kills = 0; wave = 1; over = false; px = 1.5; py = 1.5; dx = 1; dy = 0; plx = 0; ply = FOV; booms = []; spawnWave() }

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

    // ── art ──
    let posters: ImageData[] = []
    let wall: ImageData | null = null, ratImg: HTMLImageElement | null = null, boomImg: HTMLImageElement | null = null
    let nugImg: HTMLImageElement | null = null, faceImg: HTMLImageElement | null = null, fontImg: HTMLImageElement | null = null
    const tinted = new Map<string, HTMLCanvasElement>()
    Promise.all([load('/ratx/wall.png'), load('/ratx/rat.png'), load('/ratx/explode.png'), load('/ratx/nugget.png'), load(face).catch(() => null), load('/game/font.png')])
      .then(([w, r, b, n, f, fo]) => {
        const c = document.createElement('canvas'); c.width = w.width; c.height = w.height
        const x = c.getContext('2d')!; x.drawImage(w, 0, 0); wall = x.getImageData(0, 0, w.width, w.height)
        // JP's green bricks, re-inked: each pixel's brightness onto the site's blues.
        const BLUES = [[14, 18, 60], [0, 0, 128], [58, 90, 170], [140, 160, 214], [211, 220, 235]]
        for (let i = 0; i < wall.data.length; i += 4) {
          const l = (wall.data[i] * 0.3 + wall.data[i + 1] * 0.55 + wall.data[i + 2] * 0.15) / 255
          const k = Math.min(BLUES.length - 1.001, l * (BLUES.length - 1) * 1.15)
          const a = BLUES[Math.floor(k)], b = BLUES[Math.ceil(k)], u = k - Math.floor(k)
          wall.data[i] = a[0] + (b[0] - a[0]) * u; wall.data[i + 1] = a[1] + (b[1] - a[1]) * u; wall.data[i + 2] = a[2] + (b[2] - a[2]) * u
        }
        ratImg = r; boomImg = b; nugImg = n; faceImg = f; fontImg = fo
      })
    // The posters: every banner square and pop-up, read once as stills (a GIF's first frame).
    Promise.all(BANNER_TOKENS.flatMap((_, i) => ['-250', '-popup'].map(sfx => load(bannerFile(i, sfx)).catch(() => null))))
      .then(list => {
        posters = list.filter((p): p is HTMLImageElement => !!p).map(p => {
          const c = document.createElement('canvas'); c.width = 64; c.height = 80
          const x = c.getContext('2d')!
          x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 64, 80)                       // the paper
          const k = Math.min(60 / p.width, 76 / p.height)
          x.drawImage(p, (64 - p.width * k) / 2, (80 - p.height * k) / 2, p.width * k, p.height * k)
          x.fillStyle = '#c0c0c8'; x.fillRect(30, 1, 4, 3)                        // a pin
          return x.getImageData(0, 0, 64, 80)
        })
      })
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
      for (let i = 0; i < 22 && faces.length; i++) posterAt.set(faces.splice(Math.floor(Math.random() * faces.length), 1)[0], i)
    }
    /** The game's bitmap font, tinted once per colour. */
    const text = (s: string, x: number, y: number, color: string, scale = 1, center = false) => {
      if (!fontImg) return
      let sheet = tinted.get(color)
      if (!sheet) {
        sheet = document.createElement('canvas'); sheet.width = fontImg.width; sheet.height = fontImg.height
        const t = sheet.getContext('2d')!
        t.drawImage(fontImg, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, sheet.width, sheet.height)
        tinted.set(color, sheet)
      }
      const width = [...s].reduce((n, ch) => n + glyph(ch)[1] + TRACKING, 0) * scale
      let pen = center ? x - width / 2 : x
      for (const ch of s) {
        const [left, gw] = glyph(ch); const { x: cx, y: cy } = cell(ch)
        ctx.drawImage(sheet, cx + left, cy, gw, CELL_H, Math.round(pen), y, gw * scale, CELL_H * scale)
        pen += (gw + TRACKING) * scale
      }
    }

    // ── input ──
    const down = (e: KeyboardEvent) => {
      started = true                                // a key starts it too
      keys.add(e.code)
      if (e.code === 'Space') { fire.current = true; e.preventDefault() }
      if (over && e.code === 'KeyR') restart()
    }
    const up = (e: KeyboardEvent) => keys.delete(e.code)
    // Mouse look: free once the pointer is locked (click the screen); without a lock
    // (some embeds refuse it), dragging with the button held aims instead.
    const look = (e: MouseEvent) => {
      if (document.pointerLockElement === cv) turn(e.movementX * MOUSE)
      else if (e.buttons & 1 && e.target === cv) turn(e.movementX * MOUSE * 1.5)
    }
    const lockChange = () => setLocked(document.pointerLockElement === cv)
    const click = () => { started = true; if (over) { restart(); return } if (document.pointerLockElement !== cv && !matchMedia('(pointer: coarse)').matches) void cv.requestPointerLock?.(); else fire.current = true }
    const startTouch = () => { started = true }
    addEventListener('ratx-start', startTouch)
    addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('mousemove', look)
    document.addEventListener('pointerlockchange', lockChange); cv.addEventListener('click', click)

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
    const SKY_TOP = [0, 0, 128], SKY_LOW = [16, 132, 208]          // the 98 title bar
    const CHECK_A = [211, 220, 235], CHECK_B = [176, 190, 220]          // the site's paper-blue checker
    function renderWalls() {
      const d = img.data
      // The sky: navy into blue, the Windows 98 title bar.
      for (let y = 0; y < VIEW_H / 2; y++) {
        const k = y / (VIEW_H / 2)
        const r = SKY_TOP[0] + (SKY_LOW[0] - SKY_TOP[0]) * k, g = SKY_TOP[1] + (SKY_LOW[1] - SKY_TOP[1]) * k, b = SKY_TOP[2] + (SKY_LOW[2] - SKY_TOP[2]) * k
        for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255 }
      }
      // The floor: the checker, cast row by row onto the ground.
      const lx = dx - plx, ly = dy - ply, rx = dx + plx, ry = dy + ply
      for (let y = Math.ceil(VIEW_H / 2); y < VIEW_H; y++) {
        const rowDist = (VIEW_H / 2) / (y - VIEW_H / 2 + 0.5)
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
        const top = Math.floor(-lineH / 2 + VIEW_H / 2), bot = Math.min(VIEW_H - 1, top + lineH)
        if (!wall) continue
        // The brick tile is two 32-wide halves: lit for one wall face, shaded for the other.
        let wx = side === 0 ? py + dist * rdy : px + dist * rdx
        wx -= Math.floor(wx)
        const tx = Math.floor(wx * 32) + (side === 1 ? 32 : 0)
        const fog = Math.max(0.25, 1 - dist / 14)
        const pi = posterAt.get(mx + ',' + my + ',' + side)
        const poster = pi === undefined || !posters.length ? null : posters[pi % posters.length]
        // Read the face left to right as you look at it, so the poster is never mirrored.
        const u = side === 0 ? (rdx > 0 ? 1 - wx : wx) : (rdy < 0 ? 1 - wx : wx)
        for (let y = Math.max(0, top); y <= bot; y++) {
          const v = (y - top) / lineH
          // A poster hangs in the middle of its face: 15%..85% across, 12%..88% down.
          if (poster && u > 0.15 && u < 0.85 && v > 0.12 && v < 0.88) {
            const pu = Math.min(poster.width - 1, Math.max(0, Math.floor((u - 0.15) / 0.7 * poster.width)))
            const pv = Math.min(poster.height - 1, Math.floor((v - 0.12) / 0.76 * poster.height))
            const s = (pv * poster.width + pu) * 4, o = (y * W + x) * 4
            const shade = side === 1 ? 0.82 : 1
            d[o] = poster.data[s] * fog * shade; d[o + 1] = poster.data[s + 1] * fog * shade; d[o + 2] = poster.data[s + 2] * fog * shade
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
      const y0 = Math.floor(VIEW_H / 2 + (VIEW_H / tY) / 2 - h + lift / tY)
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

      if (!over && started) {
        // Move and turn.
        let fwd = 0, str = 0
        if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1
        if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1
        if (keys.has('KeyD')) str += 1
        if (keys.has('KeyA')) str -= 1
        if (keys.has('ArrowLeft') || keys.has('KeyQ')) turn(-TURN * dt)
        if (keys.has('ArrowRight') || keys.has('KeyE')) turn(TURN * dt)
        fwd += -stick.current.my; str += stick.current.mx
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
        if (hp <= 0) { hp = 0; over = true }

        // Nuggets: ammo and a little health.
        for (const n of nugs) if (!n.taken && Math.hypot(n.x - px, n.y - py) < 0.5) {
          n.taken = true; ammo = Math.min(MAX_AMMO, ammo + 12); hp = Math.min(100, hp + 10); sPick()
        }

        // Fire: a hitscan down the middle of the screen.
        if (fire.current) {
          fire.current = false
          if (ammo > 0) {
            ammo--; flash = 0.08; sShot()
            let best: Rat | null = null, bestD = zbuf[W / 2]
            for (const r of rats) {
              if (r.dead) continue
              const rx = r.x - px, ry = r.y - py
              const inv = 1 / (plx * dy - dx * ply)
              const tX = inv * (dy * rx - dx * ry), tY = inv * (-ply * rx + plx * ry)
              if (tY <= 0.1 || tY > bestD) continue
              const cx = (W / 2) * (1 + tX / tY), half = (VIEW_H / tY) * 0.35
              if (Math.abs(cx - W / 2) < half) { best = r; bestD = tY }
            }
            if (best) {
              best.hp--; best.hurt = 0.15
              if (best.hp <= 0) { best.dead = 0.001; kills++; booms.push({ x: best.x, y: best.y, t: 0 }); sBoom() }
            }
          }
        }
        if (rats.every(r => r.dead)) { wave++; spawnWave() }
      }
      flash = Math.max(0, flash - dt); hurt = Math.max(0, hurt - dt); banner = Math.max(0, banner - dt)
      booms = booms.filter(b => (b.t += dt) < 0.7)

      // ── draw ──
      renderWalls()
      const things: { d: number; draw: () => void }[] = []
      const dist = (x: number, y: number) => (x - px) ** 2 + (y - py) ** 2
      if (ratImg) for (const r of rats) if (!r.dead) things.push({ d: dist(r.x, r.y), draw: () => {
        sprite(ratImg!, 0, 0, ratImg!.width, ratImg!.height, r.x, r.y, 0.42)
      } })
      if (nugImg) for (const n of nugs) if (!n.taken) things.push({ d: dist(n.x, n.y), draw: () => {
        const f = Math.floor(t * 10) % 8
        sprite(nugImg!, f * 31, 0, 31, 40, n.x, n.y, 0.22)
      } })
      if (boomImg) for (const b of booms) things.push({ d: dist(b.x, b.y), draw: () => {
        const f = Math.min(7, Math.floor((b.t / 0.7) * 8))
        sprite(boomImg!, f * 71, 0, 71, 98, b.x, b.y, 0.7, 30)
      } })
      things.sort((a, b) => b.d - a.d).forEach(s => s.draw())

      // The gun: a can-cannon in a paw, kicking on each shot.
      const kick = flash > 0 ? 6 : 0, bob = Math.sin(t * 8) * (keys.size ? 2 : 0.5)
      ctx.fillStyle = '#8a8a99'; ctx.fillRect(W / 2 - 10, VIEW_H - 46 + kick + bob, 20, 34)
      ctx.fillStyle = '#5c5c6a'; ctx.fillRect(W / 2 - 10, VIEW_H - 46 + kick + bob, 4, 34)
      ctx.fillStyle = '#c0c0c8'; ctx.fillRect(W / 2 - 6, VIEW_H - 50 + kick + bob, 12, 6)
      ctx.fillStyle = '#f5d9a8'; ctx.fillRect(W / 2 - 16, VIEW_H - 18 + kick + bob, 32, 18)
      ctx.fillStyle = '#e8bf86'; for (let i = 0; i < 4; i++) ctx.fillRect(W / 2 - 14 + i * 8, VIEW_H - 22 + kick + bob, 6, 6)
      if (flash > 0) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(W / 2, VIEW_H - 56, 9, 0, 7); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(W / 2, VIEW_H - 56, 4, 0, 7); ctx.fill() }
      // Crosshair.
      ctx.fillStyle = '#ffffff'; ctx.fillRect(W / 2 - 3, VIEW_H / 2, 2, 1); ctx.fillRect(W / 2 + 2, VIEW_H / 2, 2, 1); ctx.fillRect(W / 2, VIEW_H / 2 - 3, 1, 2); ctx.fillRect(W / 2, VIEW_H / 2 + 2, 1, 2)
      if (hurt > 0) { ctx.fillStyle = `rgba(220,30,30,${hurt * 1.2})`; ctx.fillRect(0, 0, W, VIEW_H) }

      // The status bar, Doom's: ammo, the face, health, kills.
      // A Windows 98 panel: grey, bevelled, navy labels.
      ctx.fillStyle = '#c0c0c0'; ctx.fillRect(0, VIEW_H, W, BAR)
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, VIEW_H, W, 1); ctx.fillRect(0, VIEW_H, 1, BAR)
      ctx.fillStyle = '#808080'; ctx.fillRect(0, H - 1, W, 1); ctx.fillRect(W - 1, VIEW_H, 1, BAR)
      // Labels small, numbers bigger: the bar is only 32 pixels tall.
      const stat = (label: string, value: string, x: number, ink = '#101018') => {
        text(label, x, VIEW_H + 3, '#000080', 0.5); text(value, x, VIEW_H + 13, ink, 0.75)
      }
      stat('AMMO', String(ammo), 10)
      stat('HEALTH', `${Math.ceil(hp)}%`, 70, hp > 30 ? '#101018' : '#d81e1e')
      stat('KILLS', String(kills), W - 118)
      stat('WAVE', String(wave), W - 56)
      ctx.fillStyle = '#101018'; ctx.fillRect(W / 2 - 15, VIEW_H + 2, 30, 28)
      if (faceImg) {
        // The player's own cat (JP: "just use their cat as the pfp face"), flashing red when bitten.
        ctx.drawImage(faceImg, W / 2 - 13, VIEW_H + 4, 26, 24)
        if ((hurt > 0 && Math.floor(t * 16) % 2 === 0) || hp <= 0) { ctx.fillStyle = 'rgba(230,20,20,0.6)'; ctx.fillRect(W / 2 - 13, VIEW_H + 4, 26, 24) }
      }

      if (!started) text('CLICK TO START', W / 2, VIEW_H / 2 - 30, '#ffd166', 1.5, true)
      if (banner > 0 && !over && started) text(`WAVE ${wave}`, W / 2, 40, '#ffd166', 2, true)
      if (over) {
        ctx.fillStyle = 'rgba(10,10,20,0.7)'; ctx.fillRect(0, 0, W, VIEW_H)
        text('THE RATS GOT YOU', W / 2, 50, '#ff4040', 1.5, true)
        text(`${kills} RATS XECUTED`, W / 2, 90, '#ffd166', 1, true)
        text('CLICK OR PRESS R', W / 2, 122, '#ffffff', 1, true)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      alive = false; cancelAnimationFrame(raf)
      removeEventListener('ratx-start', startTouch); removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('mousemove', look)
      document.removeEventListener('pointerlockchange', lockChange); cv.removeEventListener('click', click)
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
      <canvas ref={canvas} width={W} height={H} style={st.canvas} />
      {!touch && !locked && <div style={st.hint}>CLICK TO LOCK THE MOUSE · MOUSE AIMS · CLICK SHOOTS · WASD MOVES · ESC LETS GO</div>}
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

const st: Record<string, React.CSSProperties> = {
  wrap:   { position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  canvas: { width: '100%', aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated', background: '#000', display: 'block', cursor: 'crosshair', touchAction: 'none' },
  hint:   { position: 'absolute', left: 0, right: 0, top: '42%', textAlign: 'center', color: '#ffd166', fontSize: 18, textShadow: '2px 2px 0 #000', pointerEvents: 'none' },
  pads:   { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, userSelect: 'none' },
  pad:    { height: 110, background: '#3a3a46', color: '#c0c0c8', display: 'grid', placeItems: 'center', fontSize: 16, touchAction: 'none', boxShadow: 'inset 2px 2px 0 #5a5a68, inset -2px -2px 0 #1a1a22' },
  fire:   { width: 96, background: '#c0392b', color: '#fff', border: 0, fontSize: 20, fontFamily: 'inherit', touchAction: 'none' },
}
