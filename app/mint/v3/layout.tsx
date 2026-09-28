import type { Metadata } from 'next'
import { embedTags, APP_URL } from '@/lib/miniapp'

/**
 * The claim page is a client component, so its embed metadata lives here —
 * same arrangement as app/mint/layout.tsx.
 *
 * It said "win three of five and the cat is yours". Since 2026-09-28 a run earns
 * nothing on chain (RUN_DOOR in lib/mintv3.ts): V3 is for BUN holders, minting
 * takes BUN, and the fights are free. The copy says only that.
 */
export const metadata: Metadata = {
  title: 'Claim your cat — Clanker Cats',
  description: 'Clanker Cats V3 on Robinhood Chain, for BUN holders. Minting a cat burns BUN. The game is free.',
  openGraph: {
    title: 'Clanker Cats V3',
    description: 'Clanker Cats V3 on Robinhood Chain, for BUN holders. Minting a cat burns BUN. The game is free.',
    images: [`${APP_URL}/cradle.png`],
  },
  other: embedTags({
    button: 'Claim your cat',
    url: `${APP_URL}/mint/v3`,
    image: `${APP_URL}/cradle.png`,
  }),
}

export default function MintV3Layout({ children }: { children: React.ReactNode }) {
  return children
}
