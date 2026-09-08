import { bond, diary, temperOf, NEEDS, type Memory, type Resident, type YardState } from './yard'
import { skinOf } from './items'

/**
 * A CAT, DESCRIBED — the Dwarf Fortress creature paragraph.
 *
 * JP: "in Dwarf Fortress dwarves have a description kind of way of looking at
 * things. Can we have the same for the cats? If I look into a cat's thoughts and
 * likes I can go into that in depth like Dwarf Fortress."
 *
 * ── NOTHING HERE IS INVENTED ABOUT A CAT ─────────────────────────────────────
 *
 * That is the whole discipline of DF's creature screen and it is why it reads as
 * true rather than as flavour text. "She is quick to anger" is not decoration —
 * it is a stat, printed as a sentence. Every line below is the same:
 *
 *   how it looks   its own Background and Body Color traits, from the metadata
 *   what it is     the three numbers its Face carries, banded
 *   what it likes  counted out of the memories the yard actually kept
 *
 * So a cat described as never still IS the one that acts most, and a cat said to
 * favour the melon is the one whose commonest deed needs the bowl. Change the
 * yard and the description changes with it, because it is not stored anywhere.
 *
 * ── THE WORDS ARE PLACEHOLDERS. THEY ARE JP'S TO REPLACE. ────────────────────
 *
 * The same standing rule as `reads()`, `TOGETHER`, `PROP_WHY` and `DEMO_NAMES`:
 * this file must not put prose in his game. The SHAPE is the deliverable — the
 * bands, the counting, the order — and every string is swappable without
 * touching any of it.
 *
 * ── THE BANDS ARE THE DATA'S OWN, NOT THIRDS ─────────────────────────────────
 *
 * TEMPERS holds ten faces and their values cluster; cutting at even thirds would
 * have described eight of them identically. The cuts below are where the ten
 * actually sit, so each band has faces in it:
 *
 *   act     <=0.35 two faces · <=0.50 six · >0.50 two
 *   bold    <=0.30 three    · <=0.55 four · >0.55 three
 *   clumsy   =0.00 three    · <=0.04 four · >0.04 three
 */

/** One described cat: a few short sentences, in the order DF prints them. */
export type Description = {
  /** Its own traits, read back. Null when the metadata carried neither. */
  looks: string | null
  /** What it is like, from the numbers. Always three. */
  nature: string[]
  /** What it does and who with, from the yard. Empty before anything happens. */
  likes: string[]
}

/* ── PLACEHOLDER PROSE BELOW THIS LINE ────────────────────────────────────── */

/**
 * Its coat and the ground it stands on. `{coat}` and `{bg}` are the traits.
 *
 * NAMED, NOT DESCRIBED. The values are proper nouns from the metadata — "dore",
 * "Black Cat", "King of the jungle", "Gmod" — so the sentence has to introduce
 * them rather than use them as adjectives. "A {coat} cat" reads as "A Black Cat
 * cat" one time in five.
 */
const LOOKS = {
  both: 'Its coat is {coat}, against {bg}.',
  coat: 'Its coat is {coat}.',
  bg:   'It stands against {bg}.',
}

const ACT = [
  'It hardly stirs.',
  'It gets round to things.',
  'It is never still.',
]

const BOLD = [
  'It would rather be left alone than make a point.',
  'It takes things as they come.',
  'It would sooner show off than say hello.',
]

/* Every line starts "It", so the paragraph reads as one voice describing one cat. */
const CLUMSY = [
  'It does what it means to do.',
  'Now and then it comes out wrong.',
  'It means well and makes a mess of it.',
]

/**
 * What it reaches for. `{item}` is the thing standing in THIS yard.
 *
 * THE LABEL BRINGS ITS OWN ARTICLE — "a feather", "something shiny" — so nothing
 * here supplies one. Writing "the {item}" produced "found on the something to
 * stand over", which is how the labels got cleaned up in lib/items.ts as well.
 */
const FAVOURS: Partial<Record<Memory['kind'], string>> = {
  play:     'It likes {item} more than anything.',
  share:    'It is always at {item}.',
  showoff:  'It can usually be found on {item}.',
  groom:    'It has taken to {item}.',
}

/** What it reaches for when the deed needs nothing standing there. */
const HABIT: Partial<Record<Memory['kind'], string>> = {
  greet:    'It says hello to everybody.',
  snub:     'It walks past most of them.',
  squabble: 'It falls out with people.',
}

const SEEKS = 'It seeks out {other}.'
const AVOIDS = 'It keeps away from {other}.'

/* ── NO PROSE BELOW THIS LINE ─────────────────────────────────────────────── */

const band = (v: number, low: number, mid: number) => (v <= low ? 0 : v <= mid ? 1 : 2)

const fill = (s: string, vars: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')

/**
 * How it looks, from the two traits its own metadata carries.
 *
 * Both are NAMES rather than colours — "dore", "King of the jungle" — so they go
 * in as written. The one that becomes a colour is `bg`, and that happens in
 * lib/catink.ts, not here.
 */
export function looksOf(cat: Resident): string | null {
  const coat = cat.coat?.trim()
  const bg = cat.bg?.trim()
  if (coat && bg) return fill(LOOKS.both, { coat, bg })
  if (coat) return fill(LOOKS.coat, { coat })
  if (bg) return fill(LOOKS.bg, { bg })
  return null
}

/**
 * What it is like, from the three numbers behind every deed it takes.
 *
 * These are the SAME values the simulation reads. A cat described as never still
 * is the one `act` lets act most often — the description cannot drift from the
 * behaviour, because there is only one set of numbers.
 */
export function natureOf(cat: Resident): string[] {
  const t = temperOf(cat.face)
  return [
    ACT[band(t.act, 0.35, 0.50)],
    BOLD[band(t.bold, 0.30, 0.55)],
    CLUMSY[band(t.clumsy, 0.0001, 0.04)],
  ]
}

/**
 * What it actually does, counted out of what the yard still remembers.
 *
 * NOT A PREFERENCE IT WAS BORN WITH. DF gives a dwarf its likes at creation; a
 * cat earns them here, out of the same fading memory list the bond is summed
 * from. A cat that stops playing stops being the one that likes the toy, and
 * that is the better version of the idea — it is a habit, observed.
 *
 * The item is named from the yard's own skin, so it is the melon in a yard with
 * a melon in it. A deed that needs nothing standing there is described as a
 * habit instead, because there is no object to point at.
 */
export function likesOf(y: YardState, cat: Resident, others: Resident[]): string[] {
  const out: string[] = []
  const mine = diary(y, cat.uid, 40)

  if (mine.length) {
    /*
     * COUNTED, NOT LAST. The newest memory is one tick of noise; what a cat is
     * LIKE is what it keeps doing. Ties break by the deed table's own order so
     * the same history always describes the same way.
     */
    const n = new Map<Memory['kind'], number>()
    for (const m of mine) n.set(m.kind, (n.get(m.kind) ?? 0) + 1)
    let top: Memory['kind'] | null = null
    for (const [k, c] of n) if (!top || c > (n.get(top) ?? 0)) top = k

    if (top) {
      const needs = NEEDS[top]
      if (needs && FAVOURS[top] && y.props.includes(needs)) {
        out.push(fill(FAVOURS[top]!, { item: skinOf(needs, y.seed).label }))
      } else if (HABIT[top]) {
        out.push(HABIT[top]!)
      }
    }
  }

  /*
   * WHO IT SEEKS OUT AND WHO IT AVOIDS — the two ends of its own bond list, and
   * only when there is a real one. A pair at zero has no relationship to report,
   * and printing "it seeks out" for a bond of 1 would make a stranger sound like
   * a friend.
   */
  const NOTABLE = 5
  const ranked = others
    .filter(o => o.uid !== cat.uid)
    .map(o => ({ o, n: bond(y, cat.uid, o.uid) }))
    .sort((a, b) => b.n - a.n)

  const best = ranked[0]
  const worst = ranked[ranked.length - 1]
  if (best && best.n >= NOTABLE) out.push(fill(SEEKS, { other: best.o.name }))
  if (worst && worst.n <= -NOTABLE) out.push(fill(AVOIDS, { other: worst.o.name }))

  return out
}

/** Everything about one cat, in the order it is printed. */
export function describe(y: YardState, cat: Resident, others: Resident[]): Description {
  return { looks: looksOf(cat), nature: natureOf(cat), likes: likesOf(y, cat, others) }
}
