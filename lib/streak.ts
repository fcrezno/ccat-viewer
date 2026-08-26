/**
 * THE WIN STREAK — how many in a row, on this device.
 *
 * From feedback on the preview: *"a streak, like a win streak ('3 wins in a row')
 * that builds the more you play would make people want to keep fighting right
 * away instead of stopping after one good result."*
 *
 * That is the whole design brief, and it decides two things.
 *
 * ── IT COUNTS EVERY FIGHT, INCLUDING A GUEST'S ───────────────────────────────
 *
 * lib/stable.ts keeps a per-cat record and deliberately skips demo and
 * exhibition fights, because that record is a claim about a CAT and an
 * exhibition does not count. A streak is not that. It is a reason to press the
 * button again, and the person most in need of one is the player who arrived
 * with no wallet — see the same feedback: *"keep the no-wallet quick fight super
 * obvious, it's actually an interesting way to get new people in."*
 *
 * So a guest builds a streak, a gauntlet round builds a streak, and a coded
 * fight against a friend builds a streak. Excluding them would remove the hook
 * exactly where it does the most work.
 *
 * ── IT IS NOT A RANKING, AND MUST NOT BE READ AS ONE ─────────────────────────
 *
 * It lives in localStorage, so it is this device's memory and nothing else.
 * Clear the browser and it is gone; two phones will not agree. That is fine
 * BECAUSE it is a motivator rather than a record — nobody else ever needs to
 * trust the number. The public, checkable version of a result is still a cast,
 * and lib/season.ts is still the only thing that ranks anybody.
 *
 * Keeping it here also means it costs no wallet, no account and no request.
 */

const STREAK = 'cradle.streak.v1'

export type Streak = {
  /** Wins in a row right now. A loss puts this back to zero. */
  now: number
  /** The best this device has managed. Never goes down. */
  best: number
}

/** What just happened, for the screen to talk about. */
export type Beat = Streak & {
  /** The streak this loss ended, or 0 if nothing was lost. */
  ended: number
  /** Whether this win set a new best. */
  record: boolean
}

const BLANK: Streak = { now: 0, best: 0 }

export function streak(): Streak {
  if (typeof window === 'undefined') return { ...BLANK }
  try {
    const raw = window.localStorage.getItem(STREAK)
    if (!raw) return { ...BLANK }
    const v = JSON.parse(raw)
    const now = Number(v?.now)
    const best = Number(v?.best)
    // A hand-edited or half-written value must not poison the display.
    return {
      now: Number.isInteger(now) && now >= 0 ? now : 0,
      best: Number.isInteger(best) && best >= 0 ? best : 0,
    }
  } catch {
    return { ...BLANK }
  }
}

function put(s: Streak): Streak {
  try { window.localStorage.setItem(STREAK, JSON.stringify(s)) } catch {}
  return s
}

/**
 * One more in a row.
 *
 * `record` is true only when the best actually MOVES. EQUALLING your best is
 * therefore not a record — but every win past it is, so a run in record
 * territory is called out on each win. That is intended: once you are beyond
 * your best, each fight really is the furthest you have ever been.
 */
export function noteWin(): Beat {
  const was = streak()
  const now = was.now + 1
  const record = now > was.best
  const next = put({ now, best: Math.max(now, was.best) })
  return { ...next, ended: 0, record }
}

/** Back to nothing. Returns what was lost, so the screen can say so. */
export function noteLoss(): Beat {
  const was = streak()
  const next = put({ now: 0, best: was.best })
  return { ...next, ended: was.now, record: false }
}
