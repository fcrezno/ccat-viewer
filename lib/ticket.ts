import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * A SIGNED TICKET — the run's state, handed to the player to carry.
 *
 * The gauntlet asks the player to choose between points and health after every
 * round, so the run cannot be decided in one answer: a choice made while already
 * knowing the next round is not a choice. The server therefore reveals ONE ROUND
 * AT A TIME.
 *
 * There is no database in this app, so there is nowhere to keep a half-finished
 * run between two requests. The run travels with the player instead, signed, so
 * it can be handed back without being editable. Sign it and the state is as safe
 * as it would be in a table; leave it unsigned and a player picks their own seed
 * and their own health.
 *
 * ── WHAT THIS DOES NOT STOP ──────────────────────────────────────────────────
 *
 * A ticket can be REPLAYED. Nothing here remembers that one was already spent,
 * because remembering needs the database this app does not have. A player who
 * takes the points, dies, and then sends the same ticket back choosing health
 * gets a fresh crack at that round.
 *
 * That is a real limit and it is written down rather than hidden. It is bounded
 * — two choices means at most two attempts at any one round, not unlimited
 * re-rolls, because the round is decided by the seed and plays the same way for
 * the same choice every time. It is acceptable while the prize is a title that
 * is awarded BY HAND after a run is checked. Before the gauntlet pays anything
 * automatically, this needs a spent-ticket store and that means a database.
 */

const DOMAIN = 'ccat-gauntlet-v1'

/**
 * The HMAC key.
 *
 * A dedicated GAUNTLET_SECRET is the right answer. Failing that the mint signer
 * is HASHED WITH A DOMAIN STRING to derive one — never used directly, never for
 * anything on chain, and the hash means this cannot leak the key it came from.
 * It is only borrowed because it is already set in production, so the mode works
 * on deploy rather than after somebody remembers an env var.
 *
 * With neither, the process invents one. Runs then break if a later request
 * lands on a different instance, which is why it warns.
 */
let fallbackWarned = false
let ephemeral: Buffer | null = null

function key(): Buffer {
  const dedicated = process.env.GAUNTLET_SECRET?.trim()
  if (dedicated) return createHash('sha256').update(DOMAIN + dedicated).digest()

  const borrowed = process.env.MINT_SIGNER_KEY?.trim()
  if (borrowed) return createHash('sha256').update(DOMAIN + borrowed).digest()

  if (!ephemeral) {
    ephemeral = randomBytes(32)
    if (!fallbackWarned) {
      fallbackWarned = true
      console.warn(
        '[gauntlet] no GAUNTLET_SECRET and no MINT_SIGNER_KEY — signing runs with a ' +
        'per-process key. A run will fail if its next request lands on another instance.',
      )
    }
  }
  return ephemeral
}

const b64url = (b: Buffer) => b.toString('base64url')

/** How long a run may sit half-finished. Long enough to watch it, short enough to matter. */
export const TICKET_TTL_MS = 30 * 60 * 1000

export function sign<T extends object>(payload: T): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const mac = b64url(createHmac('sha256', key()).update(body).digest())
  return `${body}.${mac}`
}

/** The payload if the signature is good and it has not expired, otherwise null. */
export function verify<T extends { exp?: number }>(ticket: string): T | null {
  if (typeof ticket !== 'string' || ticket.length > 8192) return null

  const dot = ticket.lastIndexOf('.')
  if (dot < 1) return null

  const body = ticket.slice(0, dot)
  const given = Buffer.from(ticket.slice(dot + 1), 'base64url')
  const want = createHmac('sha256', key()).update(body).digest()

  // Lengths must match before timingSafeEqual, which throws on a mismatch.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null

  let parsed: T
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (typeof parsed.exp === 'number' && Date.now() > parsed.exp) return null
  return parsed
}
