import type { Metadata } from 'next'
import { Providers } from '@/lib/providers'
import { embedTags, APP_URL } from '@/lib/miniapp'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clanker Cats',
  description: '1111 free pixel cats on Base. One per Farcaster account, plus one more for holders.',
  openGraph: {
    title: 'Clanker Cats V2',
    description: '1111 free pixel cats on Base. One per Farcaster account, plus one more for holders.',
    images: [`${APP_URL}/image.png`],
  },
  // Casting any page of the app opens straight into the mint.
  other: embedTags({ button: 'Mint a Cat' }),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        THE FONT IS SET HERE, and it has to be.

        This was `fontFamily: 'monospace'`, an INLINE style on the body — and an
        inline style beats any stylesheet, so the `@font-face` and the body rule in
        globals.css could never win. MyFont was downloaded and then ignored on
        every screen in the app.

        monospace is kept as the fallback, so a failed font load looks like the app
        always did rather than dropping to Times.
      */}
      <body style={{ margin: 0, background: '#0a0a14', color: 'white', fontFamily: "'MyFont', monospace", minHeight: '100vh' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
