/**
 * WHAT EACH CAT HAS DONE, AND WHO IT KNOWS.
 *
 * ── WHERE THIS LIVES, AND WHY IT MATTERS ─────────────────────────────────────
 *
 * In the browser, in localStorage. This app has NO DATABASE — the existing
 * leaderboard proves the point: it has no store either and derives its table by
 * searching Farcaster casts for a hashtag and parsing them.
 *
 * So a record here is THIS DEVICE'S memory of a cat. It is honest for a preview
 * and it is not a global ladder: clear the browser and the record goes with it,
 * and two devices will not agree.
 *
 * The public, shared version of a result is a CAST. That is deliberate rather
 * than a shortcut — it is how the rest of this app already works, and it means a
 * boast has to be posted in the open rather than asserted by a number nobody can
 * check.
 *
 * Keyed by the collection uid ("v2:412") from `makeUid`, so a V1 and a V2 cat
 * with the same number never collide.
 */

const RECORDS = 'cradle.records.v1'
const FRIENDS = 'cradle.friends.v1'
const NAMES = 'cradle.names.v1'
const GUEST = 'cradle.guest.v1'

/*
 * HOW LONG A CAT'S NAME MAY BE.
 *
 * 32, the same as the main game — which took it from Steam, where a profile name
 * is 2 to 32. Keeping the two the same means a cat named here still fits when the
 * full game gets hold of it.
 */
export const NAME_LIMIT = 32

/** Trim a typed name to something safe to draw and to put in a cast. */
export function cleanName(raw: string): string {
  return (raw ?? '')
    // A newline would break a log line in half and a cast into two paragraphs.
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_LIMIT)
}

/*
 * THE GUEST CAT — for somebody who arrived without a wallet.
 *
 * A demo cat used to be invented per REQUEST, so the cat that just went four
 * rounds deep stopped existing the moment the run ended. Nothing to get attached
 * to, and nothing a prize could be attached to either.
 *
 * This is a number kept on the device. It is not an account and it is not
 * secure — it is a seed, and the whole point is that it costs nothing to have
 * one. The stats roll from it exactly as a token id rolls a real cat's, so a
 * guest cat is a settled fighter that is the same every visit.
 *
 * Losing it (new phone, cleared storage) loses the cat. That is the honest
 * trade for needing no sign-up, and it is why WINNING one converts it into an
 * NFT that cannot be lost.
 */
export function guestId(): number {
  if (typeof window === 'undefined') return 0
  try {
    const had = window.localStorage.getItem(GUEST)
    if (had) {
      const n = Number(had)
      if (Number.isInteger(n) && n > 0) return n
    }
    // Kept well clear of real token ids so a guest can never be mistaken for one.
    const made = 100000 + Math.floor(Math.random() * 899999)
    window.localStorage.setItem(GUEST, String(made))
    return made
  } catch {
    // Private browsing with storage blocked: still playable, just not remembered.
    return 100000 + Math.floor(Math.random() * 899999)
  }
}

export const names = (): { [uid: string]: string } => read(NAMES, {})

/** The name the player gave this cat, or null to fall back to the token's own. */
export const nameFor = (uid: string): string | null => names()[uid] ?? null

/** Setting an empty name REMOVES it, so the collection name comes back. */
export function setName(uid: string, raw: string): string | null {
  const all = names()
  const clean = cleanName(raw)
  if (clean) all[uid] = clean
  else delete all[uid]
  write(NAMES, all)
  return clean || null
}

export type Record = {
  wins: number
  losses: number
  /** A retired cat keeps its record and stops fighting. */
  retired: boolean
  /** When it last fought, so a list can be ordered by who is active. */
  lastFought: number
}

export type Friend = {
  uid: string
  name: string
  image: string
  addedAt: number
}

const BLANK: Record = { wins: 0, losses: 0, retired: false, lastFought: 0 }

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    // A corrupted or blocked store must not take the page down with it.
    return fallback
  }
}

function write(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode and a full quota both throw. Losing a record is survivable;
    // throwing here would lose the fight the player just watched.
  }
}

/* ── records ──────────────────────────────────────────────────────────────── */

export const allRecords = (): { [uid: string]: Record } => read(RECORDS, {})

export const recordFor = (uid: string): Record => allRecords()[uid] ?? { ...BLANK }

/** Note a finished fight. A retired cat's record is final and is left alone. */
export function noteFight(uid: string, won: boolean): Record {
  const all = allRecords()
  const cur = all[uid] ?? { ...BLANK }
  if (cur.retired) return cur

  const next: Record = {
    ...cur,
    wins: cur.wins + (won ? 1 : 0),
    losses: cur.losses + (won ? 0 : 1),
    lastFought: Date.now(),
  }
  all[uid] = next
  write(RECORDS, all)
  return next
}

export function setRetired(uid: string, retired: boolean): Record {
  const all = allRecords()
  const next = { ...(all[uid] ?? BLANK), retired }
  all[uid] = next
  write(RECORDS, all)
  return next
}

/** Fights, and the share of them won. A cat with no fights has no ratio. */
export function ratio(r: Record): { fights: number; pct: number | null } {
  const fights = r.wins + r.losses
  return { fights, pct: fights === 0 ? null : Math.round((100 * r.wins) / fights) }
}

/** "4-1" or "no fights yet". */
export const recordLine = (r: Record): string =>
  r.wins + r.losses === 0 ? 'no fights yet' : `${r.wins}-${r.losses}`

/* ── friends ──────────────────────────────────────────────────────────────── */

export const friends = (): Friend[] => read(FRIENDS, [] as Friend[])

/** Adding the same cat twice is a no-op rather than a duplicate row. */
export function addFriend(f: Omit<Friend, 'addedAt'>): Friend[] {
  const list = friends()
  if (list.some(x => x.uid === f.uid)) return list
  const next = [...list, { ...f, addedAt: Date.now() }]
  write(FRIENDS, next)
  return next
}

export function removeFriend(uid: string): Friend[] {
  const next = friends().filter(f => f.uid !== uid)
  write(FRIENDS, next)
  return next
}

/* ── the ladder ───────────────────────────────────────────────────────────── */

export type Ranked = {
  uid: string
  name: string
  image: string
  record: Record
  mine: boolean
}

/**
 * Best first.
 *
 * A cat with no fights sits below every cat that has fought, whatever the
 * arithmetic says — otherwise an untouched cat ties for first on a 0-0.
 * Between two that have fought it is win RATE, then fights, so a 9-1 outranks a
 * 3-0 only once the 3-0 has proved it.
 */
export function ladder(cats: Omit<Ranked, 'record'>[]): Ranked[] {
  return cats
    .map(c => ({ ...c, record: recordFor(c.uid) }))
    .sort((a, b) => {
      const ra = ratio(a.record)
      const rb = ratio(b.record)
      if (ra.fights === 0 && rb.fights === 0) return a.name.localeCompare(b.name)
      if (ra.fights === 0) return 1
      if (rb.fights === 0) return -1
      if (rb.pct !== ra.pct) return (rb.pct ?? 0) - (ra.pct ?? 0)
      if (rb.fights !== ra.fights) return rb.fights - ra.fights
      return a.name.localeCompare(b.name)
    })
}
