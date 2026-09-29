import { BitmapText } from '@/components/BitmapText'

/**
 * A LIGHT EDGE AROUND TEXT THAT SITS ON THE BACKDROP — Haloed.razor in the s&box
 * build, from haloed() in render.mjs: "what makes it read on a busy mid-tone
 * picture is a light edge separating the letters from whatever is behind them."
 *
 * EIGHT OFFSETS, NOT FOUR: "at four the diagonals stay open and the halo reads
 * as a cross rather than an outline." The offsets are 1px of the space the text
 * is drawn in, as in the game, not multiplied by its scale.
 *
 * THE RING IS CHOSEN AGAINST THE TEXT (Rec. 601 luma, the renderer's rule): a
 * light ink gets a dark ring and a dark ink a light one.
 */
const RING = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const

const luma = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

export function Haloed({ text, color = '#1a1a1a', scale = 1, edge }: {
  text: string
  color?: string
  scale?: number
  /** Force a ring instead of choosing one. */
  edge?: string
}) {
  const ring = edge ?? (luma(color) > 0.5 ? '#1a1a1a' : '#ffffff')
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {RING.map(([x, y], i) => (
        <span key={i} aria-hidden style={{ position: 'absolute', left: x, top: y, width: 'max-content' }}>
          <BitmapText text={text} scale={scale} color={ring} />
        </span>
      ))}
      <span style={{ position: 'relative', display: 'block', width: 'max-content' }}>
        <BitmapText text={text} scale={scale} color={color} />
      </span>
    </span>
  )
}
