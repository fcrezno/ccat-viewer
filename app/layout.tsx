import type { Metadata } from 'next'
import { Providers } from '@/lib/providers'
import { embedTags, APP_URL } from '@/lib/miniapp'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clanker Cats',
  description: '1111 free pixel cats on Base. One per Farcaster account.',
  openGraph: {
    title: 'Clanker Cats V2',
    description: '1111 free pixel cats on Base. One per Farcaster account.',
    images: [`${APP_URL}/image.png`],
  },
  // Casting any page of the app opens straight into the mint.
  other: embedTags({ button: 'Mint a Cat' }),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0a14', color: 'white', fontFamily: 'monospace', minHeight: '100vh' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
