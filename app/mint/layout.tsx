import type { Metadata } from 'next'
import { embedTags, APP_URL } from '@/lib/miniapp'

/**
 * The mint page is a client component, so its embed metadata lives here.
 *
 * TWO READERS, KEPT APART (JP, 2026-09-29: "seperate the farcaster stuff from
 * the robin hood"). The title, description and Open Graph card are what a link
 * shows on the web — Telegram, X, a browser tab — and the web gets the Robinhood
 * mint, so they say Robinhood, in the claim page's words. The fc:miniapp embed
 * is what a Farcaster cast shows, and inside Farcaster this page is the Base
 * mint, so its button still drops the user straight into minting.
 */
export const metadata: Metadata = {
  title: 'Mint a Clanker Cat',
  description: 'Clanker Cats on Robinhood Chain, for BUN holders. Free to mint, one per wallet. Burn BUN through your cat and it becomes a BunBurner.',
  openGraph: {
    title: 'Clanker Cats',
    description: 'Clanker Cats on Robinhood Chain, for BUN holders. Free to mint, one per wallet. Burn BUN through your cat and it becomes a BunBurner.',
    images: [`${APP_URL}/cradle.png`],
  },
  other: embedTags({ button: 'Mint a Cat' }),
}

export default function MintLayout({ children }: { children: React.ReactNode }) {
  return children
}
