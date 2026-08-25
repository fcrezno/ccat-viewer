import { CELL_H, SHEET_W, SHEET_H, TRACKING, cell, glyph, measure } from '@/lib/font'

/**
 * THE GAME'S OWN FONT, drawn on the web.
 *
 * `font.png` is a 256x144 sheet of 16x24 cells that JP drew for Clanker Cats.
 * Each glyph has its own measured width, so this is not a monospace grid — the
 * widths come from the same table the game uses, and the 1px baseline drift in
 * the sheet is real and deliberately kept.
 *
 * COLOUR BY MASK, NOT BY TINTED SHEETS. The game ships a recoloured copy of
 * font.png per ink, because a background image takes no `color`. On the web a
 * CSS mask does the job from one file: the sheet becomes the stencil and the
 * background colour shows through it. One 3KB asset instead of a dozen, and no
 * generated copies to go stale.
 *
 * WORDS ARE KEPT WHOLE. Every glyph is its own box, so a naive layout would wrap
 * mid-word. Each word is therefore its own non-wrapping run and the line breaks
 * between them.
 */
export function BitmapText({
  text,
  scale = 2,
  color = '#1a1a1a',
  className,
  fx = false,
}: {
  text: string
  scale?: number
  color?: string
  className?: string
  /**
   * The game's gold WAVE, as its results screen gives RESULTS and VICTOR.
   *
   * Per glyph, because a wave that moved every letter together would just be a
   * bob. Each glyph's delay is NEGATIVE and stepped by its position, so the word
   * is already mid-wave on the first frame instead of starting flat and lurching.
   *
   * The animation paints `background-color`, which IS the glyph's ink here, so
   * it takes over from `color` while it runs — that is what the glow is.
   */
  fx?: boolean
}) {
  const words = (text ?? '').split(' ')
  // Counts glyphs across the WHOLE string, not per word, or the wave would
  // restart at every space.
  let glyphIndex = 0

  return (
    <span
      className={className}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        // The gap IS the space glyph's width plus its tracking, so spacing
        // between words matches what the game draws.
        columnGap: (glyph(' ')[1] + TRACKING) * scale,
        rowGap: Math.round(CELL_H * scale * 0.15),
      }}
      // The visible text for anything that reads the page rather than looks at it.
      aria-label={text}
      role="img"
    >
      {words.map((word, wi) => (
        <span key={wi} style={{ display: 'flex', flexShrink: 0 }}>
          {[...word].map((ch, i) => {
            const gi = glyphIndex++
            const [left, width] = glyph(ch)
            const c = cell(ch)
            const pos = `${-(c.x + left) * scale}px ${-c.y * scale}px`
            const size = `${SHEET_W * scale}px ${SHEET_H * scale}px`
            return (
              <span
                key={i}
                className={fx ? 'cradle-fx' : undefined}
                style={{
                  width: width * scale,
                  height: CELL_H * scale,
                  marginRight: i === word.length - 1 ? 0 : TRACKING * scale,
                  backgroundColor: color,
                  // VICTOR's own settings from the game: Amp 3, Freq 0.7, gold
                  // #b07a10 through #f0d060. The step is what makes it travel.
                  ...(fx ? {
                    animation:
                      `cradle-wave 1.15s ease-in-out ${-(gi * 0.07).toFixed(2)}s infinite, ` +
                      `cradle-glow 1.15s ease-in-out ${-(gi * 0.07).toFixed(2)}s infinite`,
                  } : null),
                  WebkitMaskImage: 'url(/game/font.png)',
                  maskImage: 'url(/game/font.png)',
                  WebkitMaskPosition: pos,
                  maskPosition: pos,
                  WebkitMaskSize: size,
                  maskSize: size,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  /*
                   * NEAREST-NEIGHBOUR, OR THE SHEET GETS SMOOTHED.
                   *
                   * The mask is a 256x144 sheet blown up by `scale`, and the
                   * browser's default is to interpolate as it stretches. At
                   * scale 1 or 2 that is barely visible; the countdown draws at
                   * scale 6 and every edge went soft and grey.
                   *
                   * Checked in the browser rather than assumed, because
                   * `image-rendering` is documented against background images
                   * and <img>, and whether it reaches a CSS mask is a question
                   * about the engine. Side by side at scale 6 it does: without
                   * it the glyph is furred, with it the pixels are square.
                   *
                   * This is also the faithful choice. The 1px baseline drift in
                   * font.png is deliberate and measured, and smoothing was
                   * quietly sanding it off along with everything else.
                   */
                  imageRendering: 'pixelated',
                  flexShrink: 0,
                }}
              />
            )
          })}
        </span>
      ))}
    </span>
  )
}

export { measure }
