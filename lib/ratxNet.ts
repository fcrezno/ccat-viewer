/**
 * RATXECUTIONER ONLINE — the browser's half of the netcode (the room server is
 * ratx-server; the rules both run are lib/ratxSim).
 *
 *   PREDICTION  every fixed tick your input is sent AND run here at once, so your
 *               cat moves the moment you press
 *   ROLLBACK    each snapshot says the last of your inputs the server has used:
 *               your cat snaps to the server's state and the inputs after it are
 *               replayed on top
 *   INTERPOLATION everyone else is drawn a little in the past (INTERP_TICKS),
 *               between two real snapshots, so they glide instead of jumping
 *   LAG COMPENSATION a shot carries the tick you were looking at; the server
 *               rewinds the others to that tick to judge it
 *
 * JP, 2026-10-13: "a timed death match", "static pfps", "Cloudflare and add rollback netcode".
 */
import {
  K_BACK, K_FWD, K_LEFT, K_RIGHT, TICK_HZ, step,
  type Body, type ClientMsg, type GameEvent, type PlayerSnap, type RatSnap, type ServerMsg,
} from './ratxSim'

/** The room server. Set NEXT_PUBLIC_RATX_WS when it is deployed (wss://ratx-server.<account>.workers.dev). */
export const RATX_WS = process.env.NEXT_PUBLIC_RATX_WS ?? (process.env.NODE_ENV === 'development' ? 'ws://127.0.0.1:8787' : '')
export const ONLINE = !!RATX_WS

/** How far in the past the others are drawn: 3 ticks, 100 ms. */
const INTERP_TICKS = 3

export type Snap = Extract<ServerMsg, { t: 'snap' }> & { at: number }
export type NetStatus = 'connecting' | 'live' | 'full' | 'closed'

/** Keys to the input bits the server reads. */
export const keyBits = (fwd: number, str: number) =>
  (fwd > 0.3 ? K_FWD : 0) | (fwd < -0.3 ? K_BACK : 0) | (str > 0.3 ? K_RIGHT : 0) | (str < -0.3 ? K_LEFT : 0)

/** A short room code people can read out: no 0/O or 1/I. */
export const newRoomCode = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')

export class RatxNet {
  ws: WebSocket | null = null
  id = ''
  status: NetStatus = 'connecting'
  snaps: Snap[] = []
  latest: Snap | null = null
  /** My cat as predicted here. */
  me: Body = { x: 1.5, y: 1.5, yaw: 0 }
  mine: PlayerSnap | null = null
  private seq = 0
  private pending: { s: number; k: number; yaw: number }[] = []
  /** Called with each snapshot's events, once. */
  onEvents: (events: GameEvent[]) => void = () => {}

  constructor(private room: string, private name: string, private face: string) {}

  connect() {
    if (!RATX_WS) { this.status = 'closed'; return }
    const ws = new WebSocket(`${RATX_WS}/room/${this.room}`)
    this.ws = ws
    ws.onopen = () => this.send({ t: 'hello', name: this.name, face: this.face })
    ws.onmessage = e => {
      let m: ServerMsg
      try { m = JSON.parse(String(e.data)) } catch { return }
      if (m.t === 'welcome') { this.id = m.id; this.status = 'live' }
      else if (m.t === 'full') this.status = 'full'
      else if (m.t === 'snap') this.onSnap(m)
    }
    ws.onclose = () => { if (this.status !== 'full') this.status = 'closed' }
  }

  close() { try { this.ws?.close() } catch {} this.ws = null }

  private send(m: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)) }

  /** One fixed tick of input: sent, and run here at once (prediction). */
  input(k: number, yaw: number) {
    if (this.status !== 'live') return
    const s = ++this.seq
    this.send({ t: 'in', s, k, yaw })
    this.pending.push({ s, k, yaw })
    if (this.pending.length > 90) this.pending.shift()
    if (this.mine?.alive && this.latest?.phase === 'live') step(this.me, k, yaw); else this.me.yaw = yaw
  }

  /** A shot along `yaw`, judged by the server at the tick on this screen. */
  fire(yaw: number) {
    this.send({ t: 'fire', s: this.seq, yaw, at: Math.floor(this.viewTick()) })
  }

  private onSnap(m: Extract<ServerMsg, { t: 'snap' }>) {
    const snap: Snap = { ...m, at: performance.now() }
    this.snaps.push(snap)
    if (this.snaps.length > 40) this.snaps.shift()
    this.latest = snap
    const mine = m.players.find(p => p.id === this.id) ?? null
    this.mine = mine
    if (mine) {
      // Rollback: the server's word on my cat, then my inputs it has not used yet, replayed.
      this.me = { x: mine.x, y: mine.y, yaw: this.me.yaw }
      this.pending = this.pending.filter(i => i.s > m.ack)
      if (mine.alive && m.phase === 'live') for (const i of this.pending) step(this.me, i.k, i.yaw)
    }
    if (m.events.length) this.onEvents(m.events)
  }

  /** The server tick now, guessed from the last snapshot and the time since. */
  serverTick() {
    const l = this.latest
    return l ? l.tick + ((performance.now() - l.at) / 1000) * TICK_HZ : 0
  }
  /** The tick the others are drawn at. */
  viewTick() { return this.serverTick() - INTERP_TICKS }

  /** Everyone else and the rats, where they were at viewTick(), between two snapshots. */
  view(): { players: PlayerSnap[]; rats: RatSnap[] } {
    const s = this.snaps
    if (!s.length) return { players: [], rats: [] }
    const vt = this.viewTick()
    let a = s[0], b = s[s.length - 1]
    for (let i = s.length - 1; i > 0; i--) if (s[i - 1].tick <= vt) { a = s[i - 1]; b = s[i]; break }
    const u = b.tick > a.tick ? Math.max(0, Math.min(1, (vt - a.tick) / (b.tick - a.tick))) : 1
    const lerp = (p: number, q: number) => p + (q - p) * u
    const lerpYaw = (p: number, q: number) => p + Math.atan2(Math.sin(q - p), Math.cos(q - p)) * u
    const players = b.players.filter(p => p.id !== this.id).map(pb => {
      const pa = a.players.find(p => p.id === pb.id)
      // Across a respawn (dead in one, alive in the other) there is nothing to glide between.
      return pa && pa.alive === pb.alive ? { ...pb, x: lerp(pa.x, pb.x), y: lerp(pa.y, pb.y), yaw: lerpYaw(pa.yaw, pb.yaw) } : pb
    })
    const rats = b.rats.map(rb => {
      const ra = a.rats.find(r => r.id === rb.id)
      return ra && ra.alive && rb.alive ? { ...rb, x: lerp(ra.x, rb.x), y: lerp(ra.y, rb.y) } : rb
    })
    return { players, rats }
  }
}
