import type { Metadata } from 'next'
import { embedTags, APP_URL } from '@/lib/miniapp'

/**
 * The yard's page is a client component, so its embed metadata lives here —
 * the same arrangement as app/mint/layout.tsx and app/mint/v3/layout.tsx.
 *
 * The copy follows the rule the root layout sets: sell the game, not the token.
 * A yard is a strange thing to describe cold, so it says what is in it rather
 * than what it is called.
 */
export const metadata: Metadata = {
  title: 'The Yard — Clanker Cats',
  description: 'Your cats and the cats of people you follow, getting on with it.',
  openGraph: {
    title: 'The Yard',
    description: 'Your cats and the cats of people you follow, getting on with it. Leave them something to play with and see what happens.',
    images: [`${APP_URL}/cradle.png`],
  },
  other: embedTags({
    button: 'Open the yard',
    url: `${APP_URL}/yard`,
    image: `${APP_URL}/cradle.png`,
  }),
}

export default function YardLayout({ children }: { children: React.ReactNode }) {
  return children
}
