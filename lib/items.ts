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
 * possible. So fifty-nine drawings are fifty-nine SKINS over four mechanics
 * rather than fifty-nine new rules — nothing is re-tuned, and nothing here is
 * decoration. Every item standing in a yard is doing the job its prop does.
 *
 * JP: "resize my extra assets and make them fit the grid too." Every numbered
 * asset he drew is now in, which is why the food list is long: he drew a lot of
 * food. Six cheeses and four berries are six and four DIFFERENT yards, not six
 * and four things in one.
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
    { file: 'key',     label: 'a key on a ring' },
    { file: 'coin',    label: 'a coin' },
    { file: 'gem',     label: 'something shiny' },
    { file: 'remote',  label: 'a remote control' },
    { file: 'pacman',  label: 'a little yellow thing' },
    { file: 'blob',    label: 'whatever that is' },
    { file: 'crumbs',  label: 'a scattering of bits' },
    { file: 'walkman', label: 'a walkman' },
    { file: 'bomb',    label: 'a bomb, apparently' },
    { file: 'star',    label: 'a star' },
    { file: 'heart',   label: 'a heart' },
  ],
  /* Something worth eating, which is the only thing worth sharing. */
  bowl: [
    { file: 'chips',        label: 'a bag of chips' },
    { file: 'pizza',        label: 'a slice of pizza' },
    { file: 'banana',       label: 'a banana' },
    { file: 'donut',        label: 'a donut' },
    { file: 'pineapple',    label: 'a pineapple' },
    { file: 'cup',          label: 'a cup of something' },
    { file: 'beer',         label: 'a can of something' },
    { file: 'melon',        label: 'a melon' },
    { file: 'melon-2',      label: 'another melon' },
    { file: 'walnut-2',     label: 'a walnut' },
    { file: 'juice',        label: 'a juice box' },
    { file: 'cheese',       label: 'a wedge of cheese' },
    { file: 'cheese-2',     label: 'a bit of cheese' },
    { file: 'cheese-3',     label: 'a good cheese' },
    { file: 'cheese-4',     label: 'a slice of cheese' },
    { file: 'cheese-5',     label: 'more cheese' },
    { file: 'cheese-6',     label: 'the last of the cheese' },
    { file: 'potato',       label: 'a potato' },
    { file: 'berry',        label: 'a berry' },
    { file: 'berry-2',      label: 'a fat berry' },
    { file: 'berry-3',      label: 'a small berry' },
    { file: 'berry-4',      label: 'one more berry' },
    { file: 'coconut',      label: 'a coconut' },
    { file: 'coconut-half', label: 'half a coconut' },
    { file: 'chocolate',    label: 'a bar of chocolate' },
    { file: 'peanut',       label: 'a peanut' },
    { file: 'peanut-2',     label: 'a peanut in its shell' },
    { file: 'peanut-3',     label: 'a split peanut' },
    { file: 'grapes',       label: 'a bunch of grapes' },
    { file: 'grapes-2',     label: 'more grapes' },
    { file: 'strawberry',   label: 'a strawberry' },
  ],
  /* Something flat and worth standing on where everyone can see. */
  perch: [
    { file: 'magazine', label: 'a magazine to sit on' },
    { file: 'vinyl',    label: 'a record to sit on' },
    { file: 'gun',      label: 'something to stand over' },
    { file: 'cash',     label: 'a stack of notes' },
    { file: 'eth',      label: 'something valuable' },
    { file: 'ring',     label: 'a gold ring to sit in' },
    { file: 'log',      label: 'a log' },
    { file: 'mixer',    label: 'a mixing desk' },
    { file: 'poster',   label: 'a framed picture' },
  ],
  /* Something to be cleaned with. */
  wash: [
    { file: 'soap', label: 'a bar of soap' },
  ],
}
/**
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
