import type { Metadata } from 'next'
import { Providers } from '@/lib/providers'
import { embedTags, APP_URL } from '@/lib/miniapp'
import './globals.css'

export const metadata: Metadata = {
  title: 'Clanker Cats',
  /*
   * THE GAME IS THE SELLER, so the copy sells the game.
   *
   * This said "Your Clanker Cat fights. You watch." — honest about the old
   * build, and now the exact criticism the game is being fixed for. Posted in a
   * Discord full of gamers it argues against itself, and it sat directly above
   * the line "anyone can play".
   *
   * The mint pitch is not lost. /mint keeps its own metadata and still leads
   * with the 1111 cats, which is right on the page where somebody is minting.
   *
   * What is left is the only claim that needs no chain, no wallet and no
   * explanation: it plays right now, in whatever you are reading this in.
   */
  description: "A fighting game in your browser. No wallet, no install, no sign-up.",
  openGraph: {
    title: "Cat's Cradle — Clanker Cats",
    description: "One click and you're in a fight. No wallet, no install, nothing to sign. If it's not fun, why bother?",
    images: [`${APP_URL}/cradle.png`],
  },
  /*
   * A CAST OF THIS APP NOW OPENS THE GAME, not the mint.
   *
   * `embed()` defaults its url to /mint, which was right when the mint was the
   * thing being launched. The Cradle is the front door now, so the card
   * advertises it and the button lands on it. The mint is still at /mint and
   * still linked from the game.
   *
   * The image must be 3:2 — public/cradle.png is 1200x800, drawn by
   * scripts/make-cradle-card.mjs in the game's own bitmap font.
   */
  other: embedTags({
    button: "Play Cat's Cradle",
    url: APP_URL,
    image: `${APP_URL}/cradle.png`,
  }),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        THE FONT IS NO LONGER SET HERE, and that is the fix.

        It used to be, because an inline `fontFamily: 'monospace'` on this body
        was beating the stylesheet and MyFont was downloaded and then ignored on
        every screen. The value was corrected in place, which worked — and left
        TWO owners of the same property, quietly disagreeing about the fallback:
        monospace here, Arial in globals.css.

        An inline style still beats any stylesheet, so the rule has not changed.
        The conclusion did: the way to stop an inline style winning an argument
        is to not have one. globals.css owns the font now, as --font-game.
      */}
      <body style={{ margin: 0, background: '#0a0a14', color: 'white', minHeight: '100vh' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
