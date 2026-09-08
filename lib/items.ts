import { PROPS, type PropKind } from './yard'

/*
 * THE FURNITURE IS DRAWN, NOT TYPED, and that is a bug fix as much as it is
 * taste. The perch used to be 🪵 — Emoji 13, 2020 — and rendered as an empty box
 * on this Windows build. A piece of furniture the player cannot see is worse
 * than a plain one, and a file we ship cannot fail to draw.
 *
 * These are JP's own, from the same hand as the fonts and the faces.
 *
 * ── ONE PROP, SEVERAL FACES ──────────────────────────────────────────────────
 *
 * A prop is a MECHANIC, not an object: the toy is whatever makes `play`
 * possible. So eighteen drawings are eighteen SKINS over four mechanics rather
 * than eighteen new rules — nothing is re-tuned, and nothing here is decoration.
 * Every item standing in a yard is doing the job its prop does.
 *
 * ── THE TWENTY JP POSTED, AND ONLY THOSE ─────────────────────────────────────
 *
 * "i dont think u need all the item sprite jsut the 20 i put in for now."
 *
 * The whole Monke folder was pulled in once, on a misread of "resize my extra
 * assets", and that put another 41 drawings in the yard that were never chosen
 * for it. They are out. Eighteen items plus sun and moon, which are the clock
 * rather than props.
 *
 * Adding to this list means being asked to.
 *
 * WHICH ONE A YARD GETS IS THE YARD'S, drawn from its seed rather than chosen.
 * Two people's yards do not look alike, and a yard keeps its own feather or its
 * own handheld for as long as it exists.
 */
export type Item = { file: string; label: string }

export const ITEMS: Record<PropKind, Item[]> = {
  /* Something to bat about, knock off a table, or carry around. */
  toy: [
    { file: 'feather', label: 'a feather' },
    { file: 'gameboy', label: 'a handheld' },
    { file: 'walnut',  label: 'a walnut' },
    { file: 'gum',     label: 'a stick of gum' },
    { file: 'film',    label: 'a roll of film' },
    { file: 'pills',   label: 'a bottle that rattles' },
    { file: 'lighter', label: 'a lighter' },
  ],
  /* Something worth eating, which is the only thing worth sharing. */
  bowl: [
    { file: 'chips',     label: 'a bag of chips' },
    { file: 'pizza',     label: 'a slice of pizza' },
    { file: 'banana',    label: 'a banana' },
    { file: 'donut',     label: 'a donut' },
    { file: 'pineapple', label: 'a pineapple' },
    { file: 'cup',       label: 'a cup of something' },
    { file: 'beer',      label: 'a can of something' },
  ],
  /* Something flat and worth standing on where everyone can see. */
  perch: [
    { file: 'magazine', label: 'a magazine' },
    { file: 'vinyl',    label: 'a record' },
    { file: 'gun',      label: 'a gun' },
  ],
  /* Something to be cleaned with. */
  wash: [
    { file: 'soap', label: 'a bar of soap' },
  ],
}/**
 * WHICH ITEM THIS YARD'S PROP IS.
 *
 * Salted with the prop's own place in PROPS, because the seed alone would move
 * all four together — every yard would get the first of each, or the second of
 * each, and the variety would be between yards instead of inside one.
 */
export function skinOf(kind: PropKind, seed: number): Item {
  const list = ITEMS[kind]
  const salt = Math.imul(PROPS.indexOf(kind) + 1, 0x9e3779b1)
  return list[((seed ^ salt) >>> 0) % list.length]
}
