'use client'

import { useEffect, useState } from 'react'
import { PageTitle } from '@/components/PageTitle'
import { FxLabel } from '@/components/FxButton'
import { ANNOUNCERS } from '@/lib/announcers'
import { BANNER_SIZES, BANNER_TOKENS } from '@/lib/banners'

/**
 * THE MEME KIT — everything a holder needs to post about Clanker Cats in ten
 * seconds. JP, 2026-10-12: "a meme kit page on the site", from Mosh's growth
 * playbook: "If posting about you takes 10 seconds, they'll do it."
 *
 * Every picture is drawn by /api/kit in the game's own bitmap font (lib/kitArt),
 * so the kit can never drift from how the game looks. Lines to post are copied
 * with one tap. Nothing here needs a wallet.
 */

const POSTS = [
  'playing with bots has never been this fun. clankercats.com',
  "Clanker Cats: a browser game. No wallet, no download. Pick a cat and fight. clankercats.com #ClankerCats",
  'TWO CATS ENTER; ONE CAT LEAVES. clankercats.com #ClankerCats',
  "If it's not fun, why bother? clankercats.com",
]

const seed = () => Math.floor(Math.random() * 1e9)

/*
 * THE BANNERS (scripts/make-banners.mjs -> public/banners). JP, 2026-10-12: "add
 * these to the page and randomize them". Old-web ads for the Mosh tokens and a
 * house ad for us, in the five sizes of the era; a random one of each size per
 * visit, and SHUFFLE for another. Each links to its own token's site.
 */
const rollBanners = () => BANNER_SIZES.map(() => Math.floor(Math.random() * BANNER_TOKENS.length))
const bannerSrc = (t: number, z: number) => `/banners/${BANNER_TOKENS[t].sym}${BANNER_SIZES[z].suffix}.gif`
const embedOf = (t: number, z: number) => {
  const { name, href } = BANNER_TOKENS[t], { w, h } = BANNER_SIZES[z]
  return `<a href="${href}"><img src="https://clankercats.com${bannerSrc(t, z)}" width="${w}" height="${h}" alt="${name}"></a>`
}

export default function KitPage() {
  const [line, setLine] = useState(0)
  const [pair, setPair] = useState<[number, number] | null>(null)
  const [cats, setCats] = useState<number[]>([])
  const [copied, setCopied] = useState<number | null>(null)
  const [banners, setBanners] = useState<number[] | null>(null)
  const [embedded, setEmbedded] = useState<number | null>(null)

  // Seeds only after mount: the server and the browser must agree on the first paint.
  useEffect(() => {
    setPair([seed(), seed()])
    setCats(Array.from({ length: 6 }, seed))
    setBanners(rollBanners())
  }, [])

  const copyEmbed = async (z: number) => {
    if (!banners) return
    try { await navigator.clipboard.writeText(embedOf(banners[z], z)); setEmbedded(z); setTimeout(() => setEmbedded(null), 1500) } catch { /* nothing to copy into */ }
  }

  const copy = async (i: number) => {
    try { await navigator.clipboard.writeText(POSTS[i]); setCopied(i); setTimeout(() => setCopied(null), 1500) } catch { /* no clipboard: the text is on screen to select */ }
  }

  const meme = pair ? `/api/kit?k=meme&i=${line}&a=${pair[0]}&b=${pair[1]}` : null

  return (
    <main style={st.page}>
      <PageTitle text="MEME KIT" />
      <p style={st.lead}>Take anything here and post it. Every picture is free to use for posts about Clanker Cats.</p>

      <section className="win98" data-title="Meme template" style={st.win}>
        <div style={st.field}>
          {meme ? <img src={meme} alt="A Clanker Cats meme: two cats, VS, and an announcer line" style={st.wide} /> : <div style={{ ...st.wide, aspectRatio: '1200 / 675' }} />}
        </div>
        <div style={st.row}>
          <button className="fx-host" style={st.btn} onClick={() => setLine(n => (n + 1) % ANNOUNCERS.length)}><FxLabel text="NEXT LINE" tone="grey" /></button>
          <button className="fx-host" style={st.btn} onClick={() => setPair([seed(), seed()])}><FxLabel text="NEW CATS" tone="grey" /></button>
          {meme && <a className="fx-host" style={st.btn} href={meme} download={`clanker-cats-meme-${line}.png`}><FxLabel text="SAVE" tone="grey" /></a>}
        </div>
      </section>

      <section className="win98" data-title="Banners" style={st.win}>
        <p style={st.fine}>Old-web ads for Clanker Cats and our Mosh friends. A new mix every visit.</p>
        {banners && BANNER_SIZES.map((z, i) => (
          <div key={z.label} style={st.bannerRow}>
            <div style={st.bannerLabel}>{z.label}</div>
            <a href={BANNER_TOKENS[banners[i]].href} target="_blank" rel="noopener" style={{ ...st.bannerBox, maxWidth: z.w }}>
              <img src={bannerSrc(banners[i], i)} alt={BANNER_TOKENS[banners[i]].name} width={z.w} height={z.h} style={st.bannerImg} />
            </a>
            <div style={st.row}>
              <a className="fx-host" style={st.btnSmall} href={bannerSrc(banners[i], i)} download><FxLabel text="SAVE" tone="grey" /></a>
              <button className="fx-host" style={st.btnSmall} onClick={() => copyEmbed(i)}><FxLabel text={embedded === i ? 'COPIED' : 'COPY EMBED'} tone="grey" /></button>
            </div>
          </div>
        ))}
        <div style={st.row}>
          <button className="fx-host" style={st.btn} onClick={() => setBanners(rollBanners())}><FxLabel text="SHUFFLE" tone="grey" /></button>
        </div>
      </section>

      <section className="win98" data-title="Lines to post" style={st.win}>
        {POSTS.map((p, i) => (
          <div key={i} style={st.post}>
            <div style={st.postText}>{p}</div>
            <button className="fx-host" style={st.btnSmall} onClick={() => copy(i)}><FxLabel text={copied === i ? 'COPIED' : 'COPY'} tone="grey" /></button>
          </div>
        ))}
      </section>

      <section className="win98" data-title="Announcer lines" style={st.win}>
        <p style={st.fine}>On transparency, for your own pictures and clips.</p>
        <div style={st.grid}>
          {ANNOUNCERS.map((l, i) => (
            <a key={i} href={`/api/kit?k=line&i=${i}`} download={`clanker-cats-line-${i}.png`} style={st.tile} title="Save">
              <img src={`/api/kit?k=line&i=${i}`} alt={l.join(' ')} style={st.tileImg} loading="lazy" />
            </a>
          ))}
        </div>
      </section>

      <section className="win98" data-title="Logo and cats" style={st.win}>
        <a href="/api/kit?k=logo" download="clanker-cats-logo.png" style={{ ...st.tile, marginBottom: 12 }}>
          <img src="/api/kit?k=logo" alt="CLANKER CATS" style={{ ...st.tileImg, maxHeight: 90 }} />
        </a>
        <p style={st.fine}>Cats drawn from the collection&apos;s own layers — they belong to nobody, so use them freely.</p>
        <div style={st.cats}>
          {cats.map(s => (
            <a key={s} href={`/api/cat-art?seed=${s}`} download={`clanker-cat-${s}.png`} style={st.cat} title="Save">
              <img src={`/api/cat-art?seed=${s}`} alt="A Clanker Cat" style={st.catImg} />
            </a>
          ))}
        </div>
        <div style={st.row}>
          <button className="fx-host" style={st.btn} onClick={() => setCats(Array.from({ length: 6 }, seed))}><FxLabel text="SHUFFLE" tone="grey" /></button>
        </div>
      </section>

      <a href="/" className="fx-host" style={{ ...st.btn, alignSelf: 'center' }}><FxLabel text="PLAY" tone="grey" /></a>
    </main>
  )
}

const st: Record<string, React.CSSProperties> = {
  page:     { maxWidth: 960, margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 20, boxSizing: 'border-box' },
  lead:     { margin: 0, textAlign: 'center', fontSize: 22, color: '#1a1a1a' },
  win:      { background: '#c0c0c0', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, color: '#000' },
  field:    { background: '#fff', padding: 6, boxShadow: 'inset 1px 1px 0 0 #808080, inset -1px -1px 0 0 #ffffff, inset 2px 2px 0 0 #0a0a0a, inset -2px -2px 0 0 #dfdfdf' },
  wide:     { width: '100%', display: 'block', imageRendering: 'pixelated' },
  row:      { display: 'flex', gap: 10, flexWrap: 'wrap' },
  btn:      { flex: '1 1 140px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px 16px', background: '#000080', border: 0, cursor: 'pointer', textDecoration: 'none' },
  btnSmall: { flex: '0 0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 14px', background: '#000080', border: 0, cursor: 'pointer' },
  post:     { display: 'flex', gap: 10, alignItems: 'center', background: '#fff', padding: '10px 12px', boxShadow: 'inset 1px 1px 0 0 #808080, inset -1px -1px 0 0 #ffffff' },
  postText: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 1.3 },
  fine:     { margin: 0, fontSize: 18 },
  grid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 },
  tile:     { display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#3a3f55', padding: 10, minHeight: 80 },
  tileImg:  { maxWidth: '100%', maxHeight: 120, imageRendering: 'pixelated' },
  cats:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 },
  cat:      { display: 'block', border: '4px solid #1a1a1a', background: '#e6e0d2' },
  bannerRow:   { display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 10, borderBottom: '1px solid #808080' },
  bannerLabel: { fontSize: 18 },
  bannerBox:   { display: 'block', width: '100%' },
  bannerImg:   { display: 'block', width: '100%', height: 'auto', imageRendering: 'pixelated' },
  catImg:   { width: '100%', display: 'block', aspectRatio: '1', objectFit: 'cover', imageRendering: 'pixelated' },
}
