import type { Metadata } from 'next'
import { embedTags, APP_URL } from '@/lib/miniapp'

/**
 * The claim page is a client component, so its embed metadata lives here —
 * same arrangement as app/mint/layout.tsx.
 *
 * The copy follows the rule the root layout now sets: sell the game, not the
 * token. Somebody sees this link because a run earned something, so it leads
 * with the run rather than with a chain nobody has heard of.
 */
export const metadata: Metadata = {
  title: 'Claim your cat — Clanker Cats',
  description: 'Win three of five and the cat is yours. Free, on Robinhood Chain.',
  openGraph: {
    title: 'Play the game, mint the cat',
    description: 'Win three of five and the cat is yours. Free, on Robinhood Chain.',
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
