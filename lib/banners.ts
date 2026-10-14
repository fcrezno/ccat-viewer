/**
 * THE BANNERS (scripts/make-banners.mjs, scripts/make-popups.mjs -> public/flyers).
 *
 * NAMED SO AD BLOCKERS LEAVE THEM BE (JP, 2026-10-13: "i dont see the ads at 100%
 * zoom" — his ad blocker hid them). Filters match words like "banners", "ad-strip"
 * and size names like 88x31, so the folder is /flyers/ and the files are named by
 * style: -sq (250 square), -sm (125 square), -btn (88x31), -won (the YOU WON pop-up).
 * Old-web ads for Clanker Cats and our Mosh friends. Shared by the meme kit's
 * Banners window (app/kit) and the ad columns down the sides of every page
 * (components/SideAds). Each links to its own token's site.
 */
export const BANNER_TOKENS = [
  { sym: 'clkcat', name: 'Clanker Cats', href: 'https://clankercats.com' },
  { sym: 'bun', name: 'Bundle Cat ($BUN)', href: 'https://mosh.trade' },
  { sym: 'bpepe', name: 'Bundle Pepe ($BPEPE)', href: 'https://mosh.trade' },
  { sym: 'alf', name: 'Agentic Liquid Fund ($ALF)', href: 'https://alfmemecoin.xyz' },
  { sym: 'bork', name: 'King Bork ($BORK)', href: 'https://kingbork.fun' },
] as const

export const BANNER_SIZES = [
  { suffix: '', w: 468, h: 60, label: 'Banner 468x60' },
  { suffix: '-story', w: 468, h: 60, label: 'Story 468x60' },
  { suffix: '-sq', w: 250, h: 250, label: 'Square 250x250' },
  { suffix: '-sm', w: 125, h: 125, label: 'Square 125x125' },
  { suffix: '-btn', w: 88, h: 31, label: 'Button 88x31' },
  // JP, 2026-10-12: the "YOU WON!!!" pop-ups (scripts/make-popups.mjs).
  { suffix: '-won', w: 540, h: 675, label: 'Pop-up 540x675' },
] as const

export const bannerFile = (token: number, suffix: string) => `/flyers/${BANNER_TOKENS[token].sym}${suffix}.gif`

/** `n` different tokens, in a random order. */
export function pickTokens(n: number): number[] {
  const all = BANNER_TOKENS.map((_, i) => i)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]]
  }
  return all.slice(0, n)
}

/**
 * The other Mosh tokens' ads only — our own house ad does not belong on our own
 * site (JP, 2026-10-13: "add the ads of other mosh tokens to the sides ... do this
 * for all pages"). `n` picks, shuffled; a token repeats only when there are
 * more slots than tokens, and never twice in a row.
 */
export function pickMosh(n: number): number[] {
  const mosh = BANNER_TOKENS.map((_, i) => i).filter(i => BANNER_TOKENS[i].sym !== 'clkcat')
  const out: number[] = []
  while (out.length < n) {
    const deck = [...mosh]
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]] }
    if (out.length && deck[0] === out[out.length - 1]) deck.push(deck.shift()!)
    out.push(...deck)
  }
  return out.slice(0, n)
}

/*
 * BUNDLE CAT MEME ADS (scripts/make-memeads.mjs): the Meme Depot memes as 2000s
 * IAB ads (JP, 2026-10-13: "make some of the new images ads for the site in the
 * same internet ad style"). They take a column's top slot about half the time.
 * Round two ("use the images we gain and make more ads"): ten more, same script.
 */
export const MEME_AD_HREF = BANNER_TOKENS[1].href
export const MEME_AD_NAME = BANNER_TOKENS[1].name
export type MemeAd = { file: string; w: number; h: number }
const memeAd = (name: string, w: number, h: number): MemeAd => ({ file: `/flyers/bun-x-${name}.webp`, w, h })
/*
 * 35 ads (JP, 2026-10-14: "make at least 33 ads and put them on the website and in
 * the game"), drawn sharp at the size they are SHOWN: every square is 250x250 for
 * the 250 column (scripts/make-memeads.mjs). RATXECUTIONER hangs the squares and
 * the tall ones on its walls too.
 */
// Every square is saved 250x250 ("make the ads be uniform"), whatever its design size.
const sq = (n: string) => memeAd(n, 250, 250), sq250 = sq
export const MEME_ADS = {
  /** For the 250-wide top of the left column. */
  square: [
    sq('getby'), sq250('career'), sq('nowall'), sq('beforeyougo'), sq('comfy'), sq250('bundog'),
    sq('throne'), sq('storm'), sq250('energy'), sq('trick'), sq('virus'), sq('bunmania'), sq('stone'),
    sq('infinity'), sq('bunwich'), sq250('aisle9'), sq('pillow'), sq250('smiling'), sq('theory'), sq250('doom'),
    sq('extreme'), sq250('buddy'), sq('island'), sq('singles'), sq250('screensaver'),
  ],
  /** The skyscrapers, for the top of the right columns. */
  tall: [memeAd('side', 160, 600), memeAd('fighter', 160, 600), memeAd('quiz', 160, 600), memeAd('hotornot', 160, 600)],
  /** The 468x60s, for the strip at the foot. */
  strip: [memeAd('hearing', 468, 60), memeAd('creation', 468, 60), memeAd('bear', 468, 60), memeAd('punch', 468, 60), memeAd('dialup', 468, 60), memeAd('askbun', 468, 60)],
}
export const pickOne = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]
