/**
 * RATXECUTIONER'S RULES — shared by the browser (components/Ratxecutioner) and
 * the room server (ratx-server, a Cloudflare Durable Object), so the client's
 * prediction and the server's truth run the very same code.
 *
 * JP, 2026-10-13: a TIMED DEATHMATCH, players as static framed pfps, on
 * Cloudflare, "and add rollback netcode". The netcode, the way shooters do it:
 *
 *   PREDICTION      your own movement runs here at once, from your own inputs
 *   ROLLBACK        each server snapshot says which of your inputs it has used;
 *                   you snap back to its state and REPLAY the rest
 *   LAG COMPENSATION a shot says which server tick you were looking at; the
 *                   server rewinds everyone else to that tick and checks there
 *
 * Pure: no DOM, no timers. Fixed steps of TICK_S.
 */

export const TICK_HZ = 30
export const TICK_S = 1 / TICK_HZ
export const SNAP_HZ = 20
export const MATCH_S = 300                    // a match: five minutes
export const OVER_S = 12                      // the scoreboard, between matches
export const RESPAWN_S = 3
export const HISTORY_TICKS = TICK_HZ          // one second of rewind
export const MAX_PLAYERS = 6

export const MOVE = 2.6                       // units a second
export const PLAYER_R = 0.22                  // body radius against walls
export const HIT_R = 0.42                     // a pfp's half-width, for shots (the picture stands 0.85 tall)
export const HP_MAX = 100
export const SHOT_DMG = 34                    // three hits
export const AMMO_START = 30, AMMO_MAX = 99
export const RAT_HP = 2, RAT_SPEED = 1.15, RAT_BITE_DPS = 9, RAT_COUNT = 6, RAT_RESPAWN_S = 8

// The lair. # brick, . floor, P a spawn point, R a rat's den, N a nugget.
export const MAP = [
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

export const solid = (x: number, y: number) => {
  const c = MAP[Math.floor(y)]?.[Math.floor(x)]
  return c === '#' || c === undefined
}

const cells = (want: string) => {
  const out: [number, number][] = []
  MAP.forEach((row, y) => [...row].forEach((c, x) => { if (c === want) out.push([x + 0.5, y + 0.5]) }))
  return out
}
export const DENS = cells('R')
export const NUGGETS = cells('N')
/** Spawn points: every open cell far enough from a wall to stand in. */
export const SPAWNS = MAP.flatMap((row, y) => [...row].map((c, x) => [x, y, c] as const))
  .filter(([x, y, c]) => c !== '#' && !solid(x + 1.5, y + 0.5) && !solid(x - 0.5, y + 0.5) && !solid(x + 0.5, y + 1.5) && !solid(x + 0.5, y - 0.5))
  .map(([x, y]) => [x + 0.5, y + 0.5] as [number, number])

/** Input bits. */
export const K_FWD = 1, K_BACK = 2, K_LEFT = 4, K_RIGHT = 8

export type Body = { x: number; y: number; yaw: number }

/** One fixed step of movement from one input: the same here and on the server. */
export function step(b: Body, keys: number, yaw: number) {
  b.yaw = yaw
  const fwd = (keys & K_FWD ? 1 : 0) - (keys & K_BACK ? 1 : 0)
  const str = (keys & K_RIGHT ? 1 : 0) - (keys & K_LEFT ? 1 : 0)
  if (!fwd && !str) return
  const dx = Math.cos(yaw), dy = Math.sin(yaw)
  const k = MOVE * TICK_S / Math.max(1, Math.hypot(fwd, str))
  const nx = b.x + (dx * fwd - dy * str) * k
  const ny = b.y + (dy * fwd + dx * str) * k
  if (!solid(nx + Math.sign(nx - b.x) * PLAYER_R, b.y)) b.x = nx
  if (!solid(b.x, ny + Math.sign(ny - b.y) * PLAYER_R)) b.y = ny
}

/** Distance along a ray to the first wall (DDA, the renderer's own walk). */
export function wallDist(x: number, y: number, yaw: number): number {
  const rdx = Math.cos(yaw), rdy = Math.sin(yaw)
  let mx = Math.floor(x), my = Math.floor(y)
  const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy)
  const sx = rdx < 0 ? -1 : 1, sy = rdy < 0 ? -1 : 1
  let sdx = (rdx < 0 ? x - mx : mx + 1 - x) * ddx
  let sdy = (rdy < 0 ? y - my : my + 1 - y) * ddy
  for (let i = 0; i < 64; i++) {
    let side: 0 | 1
    if (sdx < sdy) { sdx += ddx; mx += sx; side = 0 } else { sdy += ddy; my += sy; side = 1 }
    if (MAP[my]?.[mx] === '#' || MAP[my]?.[mx] === undefined) return side === 0 ? sdx - ddx : sdy - ddy
  }
  return 64
}

/**
 * A shot along `yaw` from (x, y): the nearest target whose body the ray passes
 * within `r` of, before any wall. Returns its index and distance, or null.
 */
export function rayHit(x: number, y: number, yaw: number, targets: { x: number; y: number; r: number }[]) {
  const dx = Math.cos(yaw), dy = Math.sin(yaw)
  let best = -1, bestD = wallDist(x, y, yaw)
  targets.forEach((t, i) => {
    const tx = t.x - x, ty = t.y - y
    const along = tx * dx + ty * dy
    if (along <= 0 || along >= bestD) return
    const across = Math.abs(tx * dy - ty * dx)
    if (across <= t.r) { best = i; bestD = along }
  })
  return best < 0 ? null : { index: best, dist: bestD }
}

// ── The wire ─────────────────────────────────────────────────────────────────

/** Browser -> room. */
export type ClientMsg =
  | { t: 'hello'; name: string; face: string }
  | { t: 'in'; s: number; k: number; yaw: number }
  | { t: 'fire'; s: number; yaw: number; at: number }      // `at`: the server tick the shooter was seeing

export type PlayerSnap = { id: string; name: string; face: string; x: number; y: number; yaw: number; hp: number; alive: boolean; score: number; ammo: number }
export type RatSnap = { id: number; x: number; y: number; alive: boolean }
export type GameEvent =
  | { e: 'hit'; by: string; on: string }
  | { e: 'ko'; by: string; on: string; x: number; y: number }
  | { e: 'rat'; by: string; x: number; y: number }
  | { e: 'pick'; id: string; n: number }
  | { e: 'shot'; by: string }

/** Room -> browser. */
export type ServerMsg =
  | { t: 'welcome'; id: string; tick: number }
  | {
      t: 'snap'; tick: number
      ack: number                                   // the last of YOUR inputs this state includes
      phase: 'live' | 'over'; left: number          // seconds left in the phase
      players: PlayerSnap[]; rats: RatSnap[]; nugs: number[]   // nugs: the indexes taken
      events: GameEvent[]
    }
  | { t: 'full' }

/** Names and pictures come from players: keep them short and plain. */
export const cleanName = (s: string) => (s ?? '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 16) || 'CAT'
export const cleanFace = (s: string) =>
  /^\/(api\/cat-art\?seed=\d{1,10}|v[123]\/images\/\d{1,6}\.png)$/.test(s ?? '') ? s : '/api/cat-art?seed=1'
