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
export type MemeAd = { file: string; mini?: string; w: number; h: number; href: string; name: string }
const BUN = BANNER_TOKENS[1], BPEPE = BANNER_TOKENS[2], BORK = BANNER_TOKENS[4]
const bun = (name: string, w: number, h: number, mini = false): MemeAd =>
  ({ file: `/flyers/bun-x-${name}.gif`, mini: mini ? `/flyers/bun-x-${name}-mini.gif` : undefined, w, h, href: BUN.href, name: BUN.name })
const bork = (name: string, w: number, h: number): MemeAd =>
  ({ file: `/flyers/bork-x-${name}.gif`, mini: `/flyers/bork-x-${name}-mini.gif`, w, h, href: BORK.href, name: BORK.name })
/*
 * THE MEME ADS: Bundle Cat (scripts/make-memeads.mjs, 35) and King Bork
 * (scripts/make-borkads.mjs, 33; JP, 2026-10-14: "do the same for king bork as
 * well"). Drawn sharp at the size they are SHOWN; every square is 250x250
 * ("make the ads be uniform") with a 125x125 mini made to be read in the medium
 * columns ("make sure its readable to users"). Each links to its own token.
 * RATXECUTIONER hangs the squares and the tall ones on its walls too.
 */
// Bundle Pepe (make-borkads.mjs --brand=bpepe): the $BPEPE MemeHub chat memes.
const bpepe = (name: string, w: number, h: number): MemeAd =>
  ({ file: `/flyers/bpepe-x-${name}.gif`, mini: `/flyers/bpepe-x-${name}-mini.gif`, w, h, href: BPEPE.href, name: BPEPE.name })
const psq = (n: string) => bpepe(n, 250, 250)
const sq = (n: string) => bun(n, 250, 250, true)
const ksq = (n: string) => bork(n, 250, 250)
export const MEME_ADS = {
  square: [
    sq('getby'), sq('career'), sq('nowall'), sq('beforeyougo'), sq('comfy'), sq('bundog'),
    sq('throne'), sq('storm'), sq('energy'), sq('trick'), sq('virus'), sq('bunmania'), sq('stone'),
    sq('infinity'), sq('bunwich'), sq('aisle9'), sq('pillow'), sq('smiling'), sq('theory'), sq('doom'),
    sq('extreme'), sq('buddy'), sq('island'), sq('singles'), sq('screensaver'),
    ksq('decree'), ksq('movie'), ksq('ball'), ksq('feast'), ksq('paint'), ksq('gym'), ksq('mobile'), ksq('winter'),
    ksq('tenten'), ksq('lostcrown'), ksq('court'), ksq('anger'), ksq('tour'), ksq('bakery'), ksq('yoga'), ksq('borktv'),
    ksq('driving'), ksq('seal'), ksq('shades'), ksq('queen'), ksq('castle'), ksq('mattress'), ksq('mail'), ksq('callnow'),
    ksq('gala'), ksq('spa'), ksq('builders'),
    ...['perfume', 'valentine', 'code', 'lounge', 'uup', 'firesale', 'spa', 'catcafe', 'feelsgood', 'crier', 'bff', 'fivestars', 'mindblown',
      'swamp', 'secret', 'magic', 'coffee', 'button', 'arcade', 'point', 'cleaning', 'watching', 'hotline', 'tower'].map(psq),
  ],
  /** The skyscrapers (the game's walls). */
  tall: [bun('side', 160, 600), bun('fighter', 160, 600), bun('quiz', 160, 600), bun('hotornot', 160, 600),
    bork('chocolate', 160, 600), bork('party', 160, 600), bork('borkooor', 160, 600),
    bpepe('raid', 160, 600), bpepe('hotel', 160, 600), bpepe('fanclub', 160, 600)],
  /** The 468x60s, for the strip at the foot. */
  strip: [bun('hearing', 468, 60), bun('creation', 468, 60), bun('bear', 468, 60), bun('punch', 468, 60), bun('dialup', 468, 60), bun('askbun', 468, 60),
    bork('bait', 468, 60), bork('soback', 468, 60), bork('spicy', 468, 60),
    bpepe('raidbanner', 468, 60), bpepe('tiedye', 468, 60), bpepe('science', 468, 60), bpepe('tailor', 468, 60)],
}
export const pickOne = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]
