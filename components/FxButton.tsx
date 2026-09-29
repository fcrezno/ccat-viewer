'use client'

import { useState, type CSSProperties, type FocusEvent } from 'react'
import { BitmapText } from '@/components/BitmapText'

/**
 * A BUTTON WHOSE LABEL MOVES LIKE THE TITLE.
 *
 * JP, 2026-09-28: "have the animation of the clanker cat text on the buttons;
 * and when u mouse over them they animate; and when not they are static".
 *
 * The label is drawn in the game's font. At rest it is still, in the button's
 * own ink. Under the pointer, or on keyboard focus, it takes CLANKER CATS' gold
 * wave and glow, rolled in from a flat start (BitmapText fx 'roll'), so no
 * letter jumps when it begins. A disabled button stays still.
 *
 * THE INK SHADOW is a drop-shadow on the WRAPPER, not the glyphs. A filter on a
 * glyph would be cut away by that glyph's own mask; on the wrapper it follows
 * the drawn letters and moves with the wave, with no second copy to keep in step.
 */

/** The font is ASCII 32..127. Anything else would draw as a gap, so fold it. */
const FOLD: Record<string, string> = {
  '—': '-', '–': '-', '→': '->', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '·': '-',
}
export const toFont = (s: string) =>
  [...s].map(c => FOLD[c] ?? (c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 128 ? c : '')).join('')

export function FxButton({ label, ink, style, disabled, onClick, href }: {
  label: string
  /** The label's colour at rest. The hover glow is always the title's gold. */
  ink: string
  style?: CSSProperties
  disabled?: boolean
  onClick?: () => void
  /** A link instead of a button, drawn the same. */
  href?: string
}) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const on = (hover || focus) && !disabled

  const events = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    // Keyboard focus only. A click focuses a button too, and it would go on
    // waving after the pointer left.
    onFocus: (e: FocusEvent<HTMLElement>) => setFocus(e.currentTarget.matches(':focus-visible')),
    onBlur: () => setFocus(false),
  }

  const text = (
    <span style={st.label}>
      <BitmapText text={toFont(label)} scale={1} color={ink} fx={on ? 'roll' : false} className="fx-btn-text" />
    </span>
  )

  return href ? (
    <a href={href} style={{ ...st.base, ...style }} aria-label={label} {...events}>{text}</a>
  ) : (
    <button type="button" style={{ ...st.base, ...style }} onClick={onClick} disabled={disabled} aria-label={label} {...events}>
      {text}
    </button>
  )
}

const st: Record<string, CSSProperties> = {
  base:  { display: 'flex', justifyContent: 'center', alignItems: 'center', boxSizing: 'border-box', textDecoration: 'none', cursor: 'pointer' },
  label: { display: 'flex', justifyContent: 'center', width: '100%', filter: 'drop-shadow(1px 1px 0 #1a1a1a)', pointerEvents: 'none' },
}
