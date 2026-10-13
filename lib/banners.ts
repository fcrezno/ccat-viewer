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
