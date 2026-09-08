import type { Resident, YardState } from './yard'

/**
 * A STRANGE MOOD — the one thing in the yard that asks YOU for something.
 *
 * JP: "in Dwarf Fortress there are things known as strange moods, which dwarves
 * need to do something before they do anything. Maybe we can do something with
 * actively doing our gameplay. Some cats will seek to go outside, and this is
 * how they go into their quick fights… you click on the cat and it says your cat
 * wants to go outside, and then it'll have an option to go with the quick fight."
 *
 * ── WHY THIS IS THE PIECE THAT WAS MISSING ───────────────────────────────────
 *
 * Everything else in the yard happens whether you are there or not. That is the
 * point of it and it should stay true — but it means the yard has never once
 * NEEDED you. A mood is the one thing that does. It is DF's whole trick: a dwarf
 * is seized, downs tools, demands something only the player can supply, and the
 * fortress waits.
 *
 * It is also the join between the two halves of this game. The yard has been a
 * place your cats live and the fight has been a thing you do; a cat asking to go
 * out is one sentence that makes them the same game.
 *
 * ── DERIVED, NEVER STORED. SAME RULE AS THE BOND ─────────────────────────────
 *
 * A mood is a pure function of the yard and the day. Nothing is written when one
 * begins, so there is no second source of truth to fall out of step with the
 * simulation, and a mood cannot be duplicated, lost or replayed wrongly. The
 * only thing that IS stored is that you answered one — see `settled`.
 *
 * ── ONE AT A TIME, ONE A DAY ─────────────────────────────────────────────────
 *
 * DF's moods are rare, and the rarity is the whole reason they land as events.
 * Two cats in a mood at once would be a queue of chores. One cat, chosen by the
 * day, and it holds for that day.
 */

/** What a cat in a mood is asking for. One kind for now; DF has several. */
export type Want = 'outside'

export type Mood = {
  uid: string
  want: Want
  /** The day it began — the tick divided by 24, which is what picks the cat. */
  day: number
}

/** A day is a full turn of the clock, the same 24 the map's hours run on. */
const DAY = 24

/**
 * How long the yard must have been going before anybody is seized.
 *
 * A cat asking for something on its first hour is noise: you have not met it,
 * it has no history, and there is nothing for the moment to mean. A day in, the
 * log has something to say about it first.
 */
const SETTLE_IN = DAY

/**
 * FNV-1a WITH A FINALISER, and the finaliser is not optional here.
 *
 * The other two files that hash (lib/demonames.ts, lib/catink.ts) hash a whole
 * uid, where plenty of characters differ between one input and the next. This
 * one hashes "${seed}:${day}" — where only the last digit or two ever moves —
 * and plain FNV-1a barely carries a change in the last byte up into the TOP
 * byte. The top byte is exactly what decides whether today has a mood.
 *
 * Measured before this was added: seed 7 gave seventeen quiet days in a row and
 * then thirteen days with a mood, unbroken. Not a 55% chance — the high bits
 * were flipping on the day COUNT going from one digit to two.
 *
 * The three steps below are murmur3's finaliser, which exists for this exact
 * job: it folds the low bits up so every bit of the output depends on every bit
 * of the input.
 */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * WHO IS IN A MOOD TODAY, if anybody.
 *
 * NOT `moodOf`. lib/yardmap.ts already exports one and it means something else
 * entirely — the CP437 glyph for a deed. Two of those imported into one file
 * would be a coin toss over which mood anybody meant.
 *
 * Not every day has one. `QUIET` is the share of days nobody is seized, and it
 * is high on purpose — a mood every single day is a chore rota, and the thing
 * being borrowed from DF is that it is unusual.
 */
const QUIET = 0.45

export function moodFor(y: YardState, cats: Resident[]): Mood | null {
  if (y.ticks < SETTLE_IN || cats.length === 0) return null

  const day = Math.floor(y.ticks / DAY)
  const roll = hash(`${y.seed}:${day}`)

  /* The top bits decide whether today has one at all; the rest picks the cat. */
  if ((roll >>> 24) / 256 < QUIET) return null

  /*
   * ORDERED BY UID, not by the array's order. `cats` arrives from a fetch and
   * its order is not guaranteed stable between renders — picking by index would
   * move the mood from cat to cat while you looked at it.
   */
  const ordered = [...cats].sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0))
  const who = ordered[roll % ordered.length]

  return { uid: who.uid, want: 'outside', day }
}

/**
 * Whether this mood has already been answered.
 *
 * THE ONE THING WORTH STORING. A mood is derived, but taking the cat out is a
 * real thing you did and it must not come back the moment the page reloads.
 * Keyed by yard, cat and day, so answering today's says nothing about tomorrow's.
 *
 * localStorage, like everything else here — this app has no database.
 */
const ANSWERED = 'cradle.yard.moods.v1'

const key = (y: YardState, m: Mood) => `${y.seed}:${m.day}:${m.uid}`

function answered(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(window.localStorage.getItem(ANSWERED) ?? '{}') } catch { return {} }
}

export function settled(y: YardState, m: Mood): boolean {
  return key(y, m) in answered()
}

/** Mark today's mood answered. Returns nothing — the caller re-derives. */
export function settle(y: YardState, m: Mood) {
  if (typeof window === 'undefined') return
  const all = answered()
  all[key(y, m)] = Date.now()
  /*
   * Kept small. A yard runs for months and every answered mood would otherwise
   * sit in storage forever; only the last thirty are any use, and nothing reads
   * one older than the day it belongs to.
   */
  const trimmed = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 30)
  try { window.localStorage.setItem(ANSWERED, JSON.stringify(Object.fromEntries(trimmed))) } catch {}
}

/* ── PLACEHOLDER PROSE. JP'S TO REPLACE, like the rest of the yard's words. ── */

/** What the map says when you tap the cat. `{name}` is the cat. */
export const ASKS: Record<Want, string> = {
  outside: '{name} wants to go outside.',
}

/** The control that answers it. */
export const ANSWER: Record<Want, string> = {
  outside: 'Take it out',
}

/**
 * The glyph over a cat that is asking.
 *
 * NOT '!'. That is already `greet` in lib/yardmap.ts, and the two would differ
 * only by colour — a 12px character sitting on top of full-colour cat art, which
 * is the worst place in the app to ask anybody to tell two golds from two blues.
 * Counted on screen: four '!' glyphs at once, one of them meaning something
 * completely different from the other three.
 *
 * An arrow is free, and it says the thing: the cat wants OUT.
 */
export const MOOD_GLYPH = '↑'
export const MOOD_INK = '#e0a72c'
