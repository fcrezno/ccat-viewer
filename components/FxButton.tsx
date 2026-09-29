'use client'

import type { CSSProperties } from 'react'
import { BitmapText } from '@/components/BitmapText'

/**
 * BUTTONS WHOSE LABELS MOVE LIKE THE TITLE.
 *
 * JP, 2026-09-28: "have the animation of the clanker cat text on the buttons;
 * and when u mouse over them they animate; and when not they are static". Then,
 * 2026-09-29: "apply it to all the other buttons; make them match their colors
 * so they are not all gold".
 *
 * The label is drawn in the game's font. At rest it is still, in the button's
 * own ink. Under the pointer, or on keyboard focus, it takes CLANKER CATS' wave
 * and a glow in the button's OWN colours — the TONES below, each starting from
 * the resting ink so nothing jumps. The CSS in globals.css (.fx-host .fx-g)
 * does the switching, so any button can carry it: give the element the class
 * `fx-host` and put an <FxLabel> inside, or use <FxButton> for a new one.
 *
 * THE INK SHADOW is a drop-shadow on the label's WRAPPER, not the glyphs. A
 * filter on a glyph would be cut away by that glyph's own mask; on the wrapper
 * it follows the drawn letters and moves with the wave.
 */

/** [resting ink, glow tint]. The glow runs from the first to the second and back. */
export const TONES = {
  /** White on a filled purple button: its glow is lavender. */
  light: ['#ffffff', '#d9ccff'],
  /** The gauntlet, the burn and the play buttons. */
  gold:  ['#e0a72c', '#f7df7a'],
  /** The yard. */
  green: ['#7ee081', '#d6ffd9'],
  /** The quiet outlined buttons: BACK, RANKINGS, wallets. */
  grey:  ['#7a7a95', '#d6d6ea'],
  /** Light grey on a dark fill. */
  soft:  ['#cccccc', '#ffffff'],
  /** Anything that cannot be taken back: YES, RETIRE's own red. */
  red:   ['#d1495b', '#ffb3bd'],
} as const
export type Tone = keyof typeof TONES

/** The font is ASCII 32..127. Anything else would draw as a gap, so fold it. */
const FOLD: Record<string, string> = {
  '—': '-', '–': '-', '→': '->', '←': '<-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '·': '-', '×': 'x',
}
export const toFont = (s: string) =>
  [...s].map(c => FOLD[c] ?? (c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 128 ? c : '')).join('')

/** The label alone, for a button that is already written. Its host needs `className="fx-host"`. */
export function FxLabel({ text, tone }: { text: string; tone: Tone }) {
  const [ink, tint] = TONES[tone]
  return (
    <span style={st.label}>
      <BitmapText text={toFont(text)} scale={1} color={ink} fx="host" glow={[ink, tint]} className="fx-btn-text" />
    </span>
  )
}

export function FxButton({ label, tone, style, disabled, onClick, href }: {
  label: string
  tone: Tone
  style?: CSSProperties
  disabled?: boolean
  onClick?: () => void
  /** A link instead of a button, drawn the same. */
  href?: string
}) {
  const text = <FxLabel text={label} tone={tone} />
  return href ? (
    <a href={href} className="fx-host" style={{ ...st.base, ...style }} aria-label={label}>{text}</a>
  ) : (
    <button type="button" className="fx-host" style={{ ...st.base, ...style }} onClick={onClick} disabled={disabled} aria-label={label}>
      {text}
    </button>
  )
}

const st: Record<string, CSSProperties> = {
  base:  { display: 'flex', justifyContent: 'center', alignItems: 'center', boxSizing: 'border-box', textDecoration: 'none', cursor: 'pointer' },
  label: { display: 'flex', justifyContent: 'center', width: '100%', filter: 'drop-shadow(1px 1px 0 #1a1a1a)', pointerEvents: 'none' },
}
