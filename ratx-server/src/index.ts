/**
 * RATXECUTIONER'S ROOM SERVER — a Cloudflare Worker, one Durable Object per room.
 *
 *   wss://<worker>/room/ABCD   joins room ABCD (made on first join)
 *
 * The room is the truth for one timed deathmatch (lib/ratxSim has the rules):
 * it moves every cat from the inputs it is sent, runs the rats, checks every
 * shot against where the targets WERE on the shooter's screen (a second of
 * history to rewind into), keeps the clock and the scores, and sends everyone
 * the state 30 times a second — with, for each player, the last of their own
 * inputs it has used, so their browser can roll back and replay the rest.
 */
import {
  AMMO_MAX, AMMO_START, DENS, HISTORY_TICKS, HIT_R, HP_MAX, MATCH_S, MAX_PLAYERS, NUGGETS, OVER_S,
  RAT_BITE_DPS, RAT_COUNT, RAT_HP, RAT_RESPAWN_S, RAT_SPEED, RESPAWN_S, SHOT_DMG, SPAWNS, TICK_HZ, TICK_S,
  cleanFace, cleanName, rayHit, solid, step,
  type ClientMsg, type GameEvent, type ServerMsg,
} from '../../lib/ratxSim'

export interface Env { ROOMS: DurableObjectNamespace }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const m = url.pathname.match(/^\/room\/([A-Z0-9]{3,8})$/i)
    if (!m) return new Response('ratx-server', { status: 200 })
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 })
    const room = env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase()))
    return room.fetch(req)
  },
}

type Input = { s: number; k: number; yaw: number }
type Player = {
  id: string; ws: WebSocket; name: string; face: string
  x: number; y: number; yaw: number; hp: number; alive: boolean; respawnAt: number
  score: number; ammo: number; inputs: Input[]; ack: number
}
type Rat = { id: number; x: number; y: number; hp: number; alive: boolean; respawnAt: number }
type Frame = { tick: number; players: Map<string, { x: number; y: number; alive: boolean }>; rats: { x: number; y: number; alive: boolean }[] }

const MAX_STEPS_PER_TICK = 3      // a client cannot run faster by sending more inputs
const NUG_RESPAWN_S = 15

export class RatxRoom {
  players = new Map<string, Player>()
  rats: Rat[] = []
  nugAt: number[] = NUGGETS.map(() => 0)       // the tick a nugget is back (0 = there)
  tick = 0
  phase: 'live' | 'over' = 'live'
  phaseEnd = 0
  history: Frame[] = []
  events: GameEvent[] = []
  timer: ReturnType<typeof setInterval> | null = null
  nextId = 1

  constructor(_state: DurableObjectState, _env: Env) {
    this.reset()
  }

  reset() {
    this.phase = 'live'
    this.phaseEnd = this.tick + MATCH_S * TICK_HZ
    this.rats = Array.from({ length: RAT_COUNT }, (_, i) => {
      const [x, y] = DENS[i % DENS.length]
      return { id: i, x, y, hp: RAT_HP, alive: true, respawnAt: 0 }
    })
    this.nugAt = NUGGETS.map(() => 0)
    for (const p of this.players.values()) { p.score = 0; this.spawn(p) }
  }

  spawn(p: Player) {
    // The spawn point furthest from every other living cat.
    let best = SPAWNS[0], bestD = -1
    for (const s of SPAWNS) {
      let d = Infinity
      for (const o of this.players.values()) if (o !== p && o.alive) d = Math.min(d, Math.hypot(o.x - s[0], o.y - s[1]))
      d += Math.random() * 2
      if (d > bestD) { bestD = d; best = s }
    }
    p.x = best[0]; p.y = best[1]; p.yaw = Math.random() * Math.PI * 2
    p.hp = HP_MAX; p.alive = true; p.ammo = AMMO_START
  }

  async fetch(_req: Request): Promise<Response> {
    if (this.players.size >= MAX_PLAYERS) {
      const pair = new WebSocketPair(); pair[1].accept()
      pair[1].send(JSON.stringify({ t: 'full' } satisfies ServerMsg)); pair[1].close(1000, 'full')
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    const pair = new WebSocketPair()
    const ws = pair[1]
    ws.accept()
    const id = String(this.nextId++)
    const p: Player = { id, ws, name: 'CAT', face: '/api/cat-art?seed=1', x: 1.5, y: 1.5, yaw: 0, hp: HP_MAX, alive: true, respawnAt: 0, score: 0, ammo: AMMO_START, inputs: [], ack: 0 }
    this.players.set(id, p)
    this.spawn(p)
    ws.send(JSON.stringify({ t: 'welcome', id, tick: this.tick } satisfies ServerMsg))
    ws.addEventListener('message', e => this.onMessage(p, e.data))
    const bye = () => { this.players.delete(id); if (!this.players.size) this.stop() }
    ws.addEventListener('close', bye)
    ws.addEventListener('error', bye)
    this.start()
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  start() { if (!this.timer) { this.reset(); this.timer = setInterval(() => this.step(), 1000 / TICK_HZ) } }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  onMessage(p: Player, raw: string | ArrayBuffer) {
    let m: ClientMsg
    try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) } catch { return }
    if (m.t === 'hello') { p.name = cleanName(m.name); p.face = cleanFace(m.face); return }
    if (m.t === 'in') {
      if (typeof m.s === 'number' && m.s > p.ack && p.inputs.length < 30) p.inputs.push({ s: m.s, k: m.k | 0, yaw: +m.yaw || 0 })
      return
    }
    if (m.t === 'fire') this.fire(p, +m.yaw || 0, m.at | 0)
  }

  /** A shot, checked where the targets were on the shooter's screen at tick `at`. */
  fire(p: Player, yaw: number, at: number) {
    if (this.phase !== 'live' || !p.alive || p.ammo <= 0) return
    p.ammo--
    this.events.push({ e: 'shot', by: p.id })
    const back = Math.max(this.tick - HISTORY_TICKS, Math.min(this.tick, at))
    const frame = this.history.find(f => f.tick === back) ?? this.history[this.history.length - 1]
    const ids: string[] = [], targets: { x: number; y: number; r: number }[] = []
    for (const o of this.players.values()) {
      if (o === p || !o.alive) continue
      const was = frame?.players.get(o.id) ?? o
      if (!was.alive) continue
      ids.push(o.id); targets.push({ x: was.x, y: was.y, r: HIT_R })
    }
    const ratAt = targets.length
    this.rats.forEach((r, i) => {
      const was = frame?.rats[i] ?? r
      if (r.alive && was.alive) { ids.push('rat:' + i); targets.push({ x: was.x, y: was.y, r: 0.3 }) }
    })
    const hit = rayHit(p.x, p.y, yaw, targets)
    if (!hit) return
    if (hit.index >= ratAt) {
      const r = this.rats[+ids[hit.index].slice(4)]
      if (--r.hp <= 0) {
        r.alive = false; r.respawnAt = this.tick + RAT_RESPAWN_S * TICK_HZ
        p.score++
        this.events.push({ e: 'rat', by: p.id, x: r.x, y: r.y })
      }
      return
    }
    const o = this.players.get(ids[hit.index])!
    o.hp -= SHOT_DMG
    this.events.push({ e: 'hit', by: p.id, on: o.id })
    if (o.hp <= 0) this.knockOut(o, p)
  }

  knockOut(o: Player, by: Player | null) {
    o.hp = 0; o.alive = false; o.respawnAt = this.tick + RESPAWN_S * TICK_HZ
    if (by) by.score++
    this.events.push({ e: 'ko', by: by?.id ?? 'rat', on: o.id, x: o.x, y: o.y })
  }

  step() {
    this.tick++

    if (this.phase === 'live' && this.tick >= this.phaseEnd) { this.phase = 'over'; this.phaseEnd = this.tick + OVER_S * TICK_HZ }
    else if (this.phase === 'over' && this.tick >= this.phaseEnd) this.reset()

    for (const p of this.players.values()) {
      // Each input is one fixed step, as the browser ran it when predicting.
      let n = 0
      while (p.inputs.length && n < MAX_STEPS_PER_TICK) {
        const i = p.inputs.shift()!
        if (p.alive && this.phase === 'live') step(p, i.k, i.yaw); else p.yaw = i.yaw
        p.ack = i.s; n++
      }
      if (!p.alive && this.phase === 'live' && this.tick >= p.respawnAt) this.spawn(p)
    }

    if (this.phase === 'live') {
      // Rats: after the nearest living cat; a bite when close.
      for (const r of this.rats) {
        if (!r.alive) { if (this.tick >= r.respawnAt) { const [x, y] = DENS[r.id % DENS.length]; Object.assign(r, { x, y, hp: RAT_HP, alive: true }) } continue }
        let near: Player | null = null, nd = Infinity
        for (const p of this.players.values()) { if (!p.alive) continue; const d = Math.hypot(p.x - r.x, p.y - r.y); if (d < nd) { nd = d; near = p } }
        if (!near) continue
        if (nd > 0.55) {
          const s = RAT_SPEED * TICK_S / nd
          const nx = r.x + (near.x - r.x) * s, ny = r.y + (near.y - r.y) * s
          if (!solid(nx, r.y)) r.x = nx
          if (!solid(r.x, ny)) r.y = ny
        } else {
          near.hp -= RAT_BITE_DPS * TICK_S
          if (near.hp <= 0) this.knockOut(near, null)
        }
      }
      // Nuggets: ammo and a little health, back after a while.
      NUGGETS.forEach(([x, y], i) => {
        if (this.nugAt[i] > this.tick) return
        for (const p of this.players.values()) {
          if (!p.alive || Math.hypot(p.x - x, p.y - y) > 0.5) continue
          p.ammo = Math.min(AMMO_MAX, p.ammo + 12); p.hp = Math.min(HP_MAX, p.hp + 10)
          this.nugAt[i] = this.tick + NUG_RESPAWN_S * TICK_HZ
          this.events.push({ e: 'pick', id: p.id, n: i })
          break
        }
      })
    }

    // History, for rewinding shots.
    this.history.push({
      tick: this.tick,
      players: new Map([...this.players.values()].map(p => [p.id, { x: p.x, y: p.y, alive: p.alive }])),
      rats: this.rats.map(r => ({ x: r.x, y: r.y, alive: r.alive })),
    })
    if (this.history.length > HISTORY_TICKS + 2) this.history.shift()

    // The snapshot: the same for everyone except each player's own ack.
    const left = Math.max(0, Math.ceil((this.phaseEnd - this.tick) / TICK_HZ))
    const players = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, face: p.face, x: +p.x.toFixed(3), y: +p.y.toFixed(3), yaw: +p.yaw.toFixed(3),
      hp: Math.max(0, Math.round(p.hp)), alive: p.alive, score: p.score, ammo: p.ammo,
    }))
    const rats = this.rats.map(r => ({ id: r.id, x: +r.x.toFixed(3), y: +r.y.toFixed(3), alive: r.alive }))
    const nugs = this.nugAt.flatMap((t, i) => (t > this.tick ? [i] : []))
    const events = this.events; this.events = []
    for (const p of this.players.values()) {
      const msg: ServerMsg = { t: 'snap', tick: this.tick, ack: p.ack, phase: this.phase, left, players, rats, nugs, events }
      try { p.ws.send(JSON.stringify(msg)) } catch { /* a closing socket */ }
    }
  }
}
