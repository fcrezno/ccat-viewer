/**
 * Clanker Cats V2 — single source of truth for the trait table.
 *
 * Shared by:
 *   prep-layers.mjs    builds the HashLips `layers/` folder from these
 *   apply-mystery.mjs  swaps in the super rares after HashLips generates
 *   generate-v2.mjs    standalone all-in-one generator (alternative to HashLips)
 *
 * Trait names are taken literally. Misspellings like "Frekcles" are intentional,
 * in the spirit of V1's "Whtie" — nothing here normalises them.
 */

export const SUPPLY        = 1111   // Ethereum's 11th birthday
export const MYSTERY_COUNT = 11     // ~1%, keeps the eleven theme

export const NAME = id => `Clanker Cats V2 #${id}`
export const DESC = 'Clanker Cats V2 — free mint on Base.'

/**
 * Body colours. Each maps colours found in art/body/base.png to replacements.
 * Run `node scripts/prep-layers.mjs --inspect` to print the base sprite's actual
 * palette, then fill in the keys below.
 *
 * The seven you drew come first; the rest are new colours that cost only a hex value.
 */
export const BODY_COLOURS = {
  crimson:  { '#RRGGBB': '#8b1e2d' },
  Lemonade: { '#RRGGBB': '#f2e07a' },
  Gleep:    { '#RRGGBB': '#6fd08c' },
  dore:     { '#RRGGBB': '#d4a24c' },
  White:    { '#RRGGBB': '#f2f2f2' },
  Black:    { '#RRGGBB': '#2a2a2a' },
  Tom:      { '#RRGGBB': '#7f9ac4' },
  // nine more to reach 16 — add once --inspect gives you the real palette keys
}

/**
 * Flat-colour backgrounds. No art, no export — the canvas is filled with the hex.
 * The cheapest way to widen the combination space.
 */
export const BG_COLOURS = {
  yellow:   '#f2d857',
  Blue:     '#4a7fd4',
  Red:      '#d44a4a',
  green:    '#5ec27a',
  Purple:   '#8b5ed4',
  orange:   '#e8873f',
  pink:     '#f08fb8',
  teal:     '#3fb8b0',
  mint:     '#8fe3b4',
  lavender: '#b39ddb',
  cream:    '#f5e6c8',
  slate:    '#6b7a8f',
  rust:     '#b5502f',
  navy:     '#2c3e73',
  olive:    '#7f8c3f',
  plum:     '#6d3a5d',
}

/**
 * Tints for *illustrated* backgrounds only (the four OG + Farcaster gate).
 * Set to `{ Day: null }` to switch tints off — with 16 flat colours you don't
 * need them, and fewer trait values makes the OpenSea sidebar far more readable.
 */
export const BG_TINTS = {
  Day: null,
}

/**
 * HashLips rarity weights, by trait name. Anything unlisted gets DEFAULT_WEIGHT.
 * These become the `#N` suffix on the layer filenames.
 */
/**
 * Faces restricted to a single body — one-directional.
 *
 * Aliem (the alien face) only ever appears on Gleep (the alien body), because
 * alien eyes on an ordinary cat read as a mistake. Gleep is NOT restricted in
 * return: it can wear any face, which is what lets the alien body be reasonably
 * common while the alien face stays rare.
 *
 * Ceiling: an alien-faced cat can only vary by background, so Aliem can never
 * exceed the background count (23).
 */
export const FACE_ONLY_ON = {
  Aliem: 'Gleep',
}

export const DEFAULT_WEIGHT = 100
export const WEIGHTS = {
  // ── bodies ────────────────────────────────────────────────────────────────
  // Uncommon — roughly half as likely as the other six.
  'King of the jungle': 55,
  'Tom':                55,

  // Alien body — free to wear any face, so it isn't capped by the pairing.
  'Gleep':              40,

  // ── faces ─────────────────────────────────────────────────────────────────
  // Rare.
  'chupa':              28,
  'silly':              28,

  // Alien face — only drawn when the body is Gleep, so this weight competes
  // against the other faces within that ~6% slice, not across the whole supply.
  'Aliem':             300,

  // ── backgrounds ───────────────────────────────────────────────────────────
  // Solid colours stay common at DEFAULT_WEIGHT — they're the bulk of the set.

  // Rare — the new illustrated scenes.
  'Gmod':             28,
  'Pool':             28,
  'The moon':         28,
  'Farcaster gate':   28,

  // Very rare — the Classic backgrounds carried over from V1.
  'Beach Classic':    10,
  'Mountains Classic':10,
  'Mochi Classic':    10,
}
