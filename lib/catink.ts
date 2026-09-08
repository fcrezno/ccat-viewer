/**
 * WHAT COLOUR A CAT'S NAME IS PRINTED IN.
 *
 * JP: "make each name color coded."
 *
 * ── THE ART ALREADY DECIDED THIS. IT WAS NOT INVENTED. ───────────────────────
 *
 * Every cat carries a `Background` trait, and every one of those backgrounds is
 * a PNG in `layers/Background`. Each ink below is that layer's own average
 * colour, so the pink cat's name is pink and the navy cat's name is navy. Read
 * the log and you can pick the cat out on the map without reading a word of it.
 *
 * A hand-picked palette would have been quicker and would have meant nothing.
 *
 * ── DARKENED ONLY AS FAR AS THE PAPER FORCES ─────────────────────────────────
 *
 * The log is cream (#f2eee3), and a background is ART, not ink: `yellow` samples
 * at #fff20b and `Pink` at #ffccfb, which are invisible on it.
 *
 * So each colour keeps its hue, keeps its OWN lightness where that is already
 * dark enough, and is otherwise pushed down to the lightest value that still
 * clears 4.5:1 against the paper. That floor is bisected per hue rather than
 * guessed, because green carries far more luminance than blue at the same
 * lightness — a fixed lightness left eight of these below the floor.
 *
 * It is why `navy` comes through untouched at 8.9:1 while `Pink` is pulled from
 * a pastel down to a magenta. Measured: every ink here is at or above 4.5.
 *
 * ── WHAT IT CANNOT DO ────────────────────────────────────────────────────────
 *
 * Twenty-two distinct inks from twenty-three backgrounds. `Gmod` and
 * `Mochi Classic` are both pale near-greys and land on the same neutral, and the
 * six green-ish backgrounds stay a family rather than becoming six unrelated
 * colours. That is the art being what it is; pulling them apart would break the
 * one thing this is for.
 *
 * V1 uses a different vocabulary of backgrounds ("Whtie", "Beach") and its layer
 * art does not live in this repo, so a V1 cat falls through to the hash in
 * `inkFor`. It still gets a colour, and still the same one every time.
 */
export const BACKGROUND_INK: Record<string, string> = {
  'Beach Classic':     '#2e7957',
  'Blue':              '#1a71aa',
  'cream':             '#8c6519',
  'Farcaster gate':    '#2c7394',
  'Gmod':              '#636d7e',
  'green':             '#0a7e22',
  'lavender':          '#7d57c1',
  'mint':              '#1f7b48',
  'Mochi Classic':     '#636d7e',
  'Mountains Classic': '#2a7966',
  'navy':              '#2c3e73',
  'olive':             '#67722b',
  'orange':            '#ab5414',
  'Pink':              '#c110b4',
  'plum':              '#792e61',
  'Pool':              '#217a56',
  'Purple':            '#b126cc',
  'Red':               '#d32023',
  'rust':              '#b24e2e',
  'slate':             '#416dac',
  'teal':              '#297872',
  'The moon':          '#4f5865',
  'yellow':            '#746f09',
}

/** Every ink, in a fixed order, for the cats whose background cannot be read. */
const ALL = Object.values(BACKGROUND_INK)

/** Stable, and the same hash lib/demonames.ts uses. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return h >>> 0
}

/**
 * The ink for one cat.
 *
 * Matched case-insensitively, because the trait values are typed by hand and do
 * not agree with themselves — the same collection ships `Pink` and `orange`.
 *
 * A cat whose background cannot be read still gets a colour, drawn from this
 * same table by its uid. It will not match the tile, but the log never ends up
 * with one name in it that looks like every other name.
 */
export function inkFor(uid: string, bg?: string | null): string {
  if (bg) {
    const hit = Object.keys(BACKGROUND_INK).find(k => k.toLowerCase() === bg.toLowerCase())
    if (hit) return BACKGROUND_INK[hit]
  }
  return ALL[hash(uid) % ALL.length]
}
