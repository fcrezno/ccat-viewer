import type { Metadata } from 'next'
import { embedTags, APP_URL } from '@/lib/miniapp'

/**
 * The mint page is a client component, so its embed metadata lives here.
 * Casting ccat-viewer.vercel.app/mint shows the mint card and the button drops
 * the user straight into minting rather than the collection viewer.
 */
export const metadata: Metadata = {
  title: 'Mint a Clanker Cat',
  description: '1111 free pixel cats on Base. One per Farcaster account. Eleven are Mystery.',
  openGraph: {
    title: 'Clanker Cats V2 — Free Mint',
    description: '1111 free pixel cats on Base. One per Farcaster account.',
    images: [`${APP_URL}/image.png`],
  },
  other: embedTags({ button: 'Mint a Cat' }),
}

export default function MintLayout({ children }: { children: React.ReactNode }) {
  return children
}
