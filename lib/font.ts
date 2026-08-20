// GENERATED from the game's Font.Generated.cs — do not edit by hand.
//
// The bitmap font JP drew for Clanker Cats, with the widths MEASURED off the
// sheet rather than assumed. The 1px baseline drift in font.png is real and is
// deliberately kept — do not "tidy" these numbers.

export const CELL_W = 16
export const CELL_H = 24
export const COLS = 16
export const FIRST = 32
export const TRACKING = 1
export const SHEET_W = 256
export const SHEET_H = 144

/** [left, width] per glyph, indexed by charCode - FIRST. */
export const METRICS: readonly (readonly [number, number])[] = [
  [0, 4],
  [6, 4],
  [5, 6],
  [1, 14],
  [3, 10],
  [2, 12],
  [3, 10],
  [7, 2],
  [5, 7],
  [5, 7],
  [4, 8],
  [4, 8],
  [6, 4],
  [5, 6],
  [7, 2],
  [4, 9],
  [4, 9],
  [5, 7],
  [3, 9],
  [4, 9],
  [4, 9],
  [3, 10],
  [3, 9],
  [3, 12],
  [2, 10],
  [2, 10],
  [7, 2],
  [6, 3],
  [5, 5],
  [5, 6],
  [5, 8],
  [3, 9],
  [1, 13],
  [2, 12],
  [4, 9],
  [3, 11],
  [3, 11],
  [3, 10],
  [4, 8],
  [3, 10],
  [3, 11],
  [4, 8],
  [4, 9],
  [4, 9],
  [3, 9],
  [1, 13],
  [1, 13],
  [1, 13],
  [4, 8],
  [1, 14],
  [3, 11],
  [3, 11],
  [2, 12],
  [2, 11],
  [3, 11],
  [0, 16],
  [3, 11],
  [2, 11],
  [2, 12],
  [6, 6],
  [4, 8],
  [5, 5],
  [4, 9],
  [2, 12],
  [3, 6],
  [4, 10],
  [4, 7],
  [4, 8],
  [3, 9],
  [4, 10],
  [4, 9],
  [3, 9],
  [4, 9],
  [7, 2],
  [4, 6],
  [4, 9],
  [7, 2],
  [1, 13],
  [4, 8],
  [3, 9],
  [4, 8],
  [3, 10],
  [5, 8],
  [5, 7],
  [5, 6],
  [4, 10],
  [5, 9],
  [2, 11],
  [3, 10],
  [3, 9],
  [4, 9],
  [4, 8],
  [7, 2],
  [5, 6],
  [3, 11],
  [2, 12],
]

export const glyph = (ch: string): readonly [number, number] =>
  METRICS[ch.charCodeAt(0) - FIRST] ?? METRICS[0]

/** Where this glyph sits on the sheet. */
export const cell = (ch: string): { x: number; y: number } => {
  const i = ch.charCodeAt(0) - FIRST
  const safe = i >= 0 && i < METRICS.length ? i : 0
  return { x: (safe % COLS) * CELL_W, y: Math.floor(safe / COLS) * CELL_H }
}

/** Width of a whole string in layout pixels at scale 1. */
export const measure = (s: string): number => {
  if (!s) return 0
  let pen = 0
  for (const ch of s) pen += glyph(ch)[1] + TRACKING
  return pen - TRACKING
}
