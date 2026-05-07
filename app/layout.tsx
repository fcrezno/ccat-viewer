import type { Metadata } from 'next'
import { Providers } from '@/lib/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'ClankerCats Viewer',
  description: 'View your on-chain ClankerCat NFTs',
  other: {
    'fc:frame': JSON.stringify({
      version: '1',
      imageUrl: 'https://ccat-viewer.vercel.app/image.png',
      button: {
        title: 'View My CCats',
        action: {
          type: 'launch_frame',
          url: 'https://ccat-viewer.vercel.app',
          name: 'ClankerCats',
          splashImageUrl: 'https://ccat-viewer.vercel.app/splash.png',
          splashBackgroundColor: '#0a0a14',
        }
      }
    })
  }
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
