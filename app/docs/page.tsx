import type { Metadata } from 'next'
import { PageTitle } from '@/components/PageTitle'

/**
 * THE DOCS — what Clanker Cats is, how to play, the cats, the token, the dates.
 * JP, 2026-10-13: "we should make docs soon", after the Mosh team asked for
 * "docs / token info / how it ties in to the project". One page, the site's
 * Windows 98 look, a link to send. Token numbers JP has not given yet say
 * "announced at launch"; nothing here promises a return.
 */
export const metadata: Metadata = {
  title: 'Clanker Cats — Docs',
  description: 'A browser game. No wallet, no download. Pick a cat and fight.',
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 18, boxSizing: 'border-box', color: '#000' },
  win:  { background: '#c0c0c0', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  p:    { margin: 0, fontSize: 23, lineHeight: 1.5 },
  ul:   { margin: 0, paddingLeft: 24, fontSize: 23, lineHeight: 1.55, display: 'flex', flexDirection: 'column', gap: 6 },
  b:    { color: '#000080' },
  a:    { color: '#000080' },
  fine: { margin: 0, fontSize: 18, color: '#303040' },
  toc:  { display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 21 },
}

export default function DocsPage() {
  return (
    <main style={S.page}>
      <PageTitle text="CLANKER CATS DOCS" />

      <section className="win98" data-title="README.TXT" style={S.win}>
        <p style={S.p}>
          <b style={S.b}>Clanker Cats is a browser game.</b> Open <a style={S.a} href="/">clankercats.com</a> and play: no
          wallet, no download, nothing to sign. Pick a cat, fight, and come back to it — your cat keeps its record, its
          name and its friends.
        </p>
        <nav style={S.toc}>
          <a style={S.a} href="#play">How to play</a>
          <a style={S.a} href="#modes">Modes</a>
          <a style={S.a} href="#cats">The cats</a>
          <a style={S.a} href="#token">The token</a>
          <a style={S.a} href="#boards">Leaderboards</a>
          <a style={S.a} href="#dates">Dates</a>
          <a style={S.a} href="#links">Links</a>
        </nav>
      </section>

      <section id="play" className="win98" data-title="How to play" style={S.win}>
        <ul style={S.ul}>
          <li>Open the site and press <b style={S.b}>QUICK FIGHT</b>. That is the whole tutorial.</li>
          <li>Every fight opens with the map, the curtain and the announcer, then <b style={S.b}>3, 2, 1, FIGHT!</b></li>
          <li>Win, lose, share the result card on X, and fight again.</li>
          <li>Hold a Clanker Cat? Connect a wallet and your own cat fights, keeps a record, and can be named.</li>
        </ul>
      </section>

      <section id="modes" className="win98" data-title="Modes" style={S.win}>
        <ul style={S.ul}>
          <li><b style={S.b}>Quick Fight</b> — one bout against a stray. Free, no wallet.</li>
          <li><b style={S.b}>The Gauntlet</b> — five fights in a row against cats real people own. After each win: double your points, or heal.</li>
          <li><b style={S.b}>The Yard</b> — where your cats live between fights: they play, groom and share, and you can watch it happen.</li>
          <li><b style={S.b}><a style={S.a} href="/ratxecutioner">RATXECUTIONER</a></b> — a first-person rat hunt in the old Doom style: waves of rats, nuggets, the announcer. A timed deathmatch for up to six players is next.</li>
          <li><b style={S.b}>Coming:</b> a dungeon mode where you pick your own moves and face a boss in each area.</li>
        </ul>
      </section>

      <section id="cats" className="win98" data-title="The cats" style={S.win}>
        <ul style={S.ul}>
          <li><b style={S.b}>V1</b> — 200 cats on Base. <b style={S.b}>V2</b> — 1111 free-mint cats on Base. (<a style={S.a} href="https://opensea.io/collection/clanker-cats">OpenSea</a>)</li>
          <li><b style={S.b}>V3</b> — on Robinhood Chain. You do not buy one: you <b style={S.b}>earn</b> it, by <b style={S.b}>burning BUN</b> or by <b style={S.b}>winning 3 fights</b>.</li>
          <li><b style={S.b}>One cat per wallet</b>, however you got it — a wallet that already earned a cat cannot burn for a second.</li>
          <li>Your cat is your save file: its record, its name and its friends go with it.</li>
        </ul>
      </section>

      <section id="token" className="win98" data-title="The token" style={S.win}>
        <ul style={S.ul}>
          <li>Launching on <a style={S.a} href="https://mosh.trade">Mosh</a>, paired with <b style={S.b}>BUN</b>.</li>
          <li>It has a job in the game: it is the game&apos;s <b style={S.b}>in-game sink</b>.</li>
          <li>Fees go to three places: <b style={S.b}>burns</b>, <b style={S.b}>player rewards</b> and <b style={S.b}>development</b>. The exact weights and triggers are published at launch, so nobody can farm the mechanics before they are live.</li>
          <li>Name, ticker and bundle settings: announced at launch.</li>
        </ul>
        <p style={S.fine}>Nothing here is financial advice or a promise of value. Clanker Cats is a game first.</p>
      </section>

      <section id="boards" className="win98" data-title="Leaderboards" style={S.win}>
        <ul style={S.ul}>
          <li>Everyone can play everything. To be <b style={S.b}>ranked</b>, you need a cat: the NFT is your ticket onto the board.</li>
          <li>Multiplayer is for bragging rights.</li>
          <li>Any event with a prize will come with its own official rules — and a free way in (winning 3 fights earns a cat).</li>
        </ul>
      </section>

      <section id="dates" className="win98" data-title="Dates" style={S.win}>
        <ul style={S.ul}>
          <li><b style={S.b}>October 28</b> — early launch: V3 cats, earned by burning BUN.</li>
          <li><b style={S.b}>October 30</b> — release: the free way in opens — win 3 fights, earn a cat.</li>
          <li><b style={S.b}>After</b> — the RATXECUTIONER deathmatch, the dungeon mode, and the full game on Steam (s&amp;box).</li>
        </ul>
      </section>

      <section id="links" className="win98" data-title="Links" style={S.win}>
        <ul style={S.ul}>
          <li>Play: <a style={S.a} href="/">clankercats.com</a></li>
          <li>RATXECUTIONER: <a style={S.a} href="/ratxecutioner">clankercats.com/ratxecutioner</a></li>
          <li>Meme kit and banners: <a style={S.a} href="/kit">clankercats.com/kit</a></li>
          <li>Mosh: <a style={S.a} href="https://mosh.trade">mosh.trade</a></li>
        </ul>
        <p style={S.fine}>— crezno</p>
      </section>
    </main>
  )
}
