'use client'

import { BitmapText } from '@/components/BitmapText'

/**
 * A PAGE'S HEADING, the way the front page has it: the game's gold, waving, with
 * a 2px ink outline. The pages stand on the moving checker now (PageChecker),
 * whose colours turn, and a plain white heading all but vanished on it —
 * JP, 2026-10-06: "give the background the update we did and apply it to all
 * other pages as well".
 */
const OUTLINE = 'drop-shadow(2px 0 0 #1a1a1a) drop-shadow(-2px 0 0 #1a1a1a) drop-shadow(0 2px 0 #1a1a1a) drop-shadow(0 -2px 0 #1a1a1a)'

export function PageTitle({ text, scale = 3 }: { text: string; scale?: number }) {
  return (
    <h1 aria-label={text} style={{ margin: 0, display: 'flex', justifyContent: 'center', filter: OUTLINE }}>
      <BitmapText text={text} scale={scale} color="#b07a10" fx />
    </h1>
  )
}
