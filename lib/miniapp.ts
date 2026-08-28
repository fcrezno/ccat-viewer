/**
 * Farcaster Mini App embed metadata.
 *
 * When the URL is cast, this JSON decides what the card looks like and where the
 * button lands. Both `fc:miniapp` and `fc:frame` carry identical content —
 * `fc:frame` is the legacy name and older clients still read it.
 *
 * Spec: https://miniapps.farcaster.xyz/docs/specification
 *   imageUrl      must be 3:2   (public/image.png is 1200x800)
 *   splashImage   200x200       (public/splash.png)
 *   button.title  max 32 chars
 */
/**
 * WHERE THIS APP LIVES. One place, so moving it is one variable.
 *
 * It was written out in fourteen files, and five of those had each grown their
 * own `process.env.NEXT_PUBLIC_APP_URL ?? '…'` with its own copy of the fallback.
 * Moving domain meant finding all of them and getting every one right.
 *
 * The fallback is the current address, so nothing changes until the variable is
 * set. Set NEXT_PUBLIC_APP_URL and the whole app follows.
 *
 * ── WHAT THIS DOES NOT COVER ─────────────────────────────────────────────────
 *
 * public/.well-known/farcaster.json holds twelve more, and it CANNOT be driven
 * from here: its `accountAssociation` is SIGNED against the domain, so a new
 * address needs a new signature made with the Farcaster account. That is a
 * manual step and there is no way around it.
 *
 * And it is not only cosmetic to move. From the Farcaster client source,
 * `favorited` and `notificationDetails` are keyed by DOMAIN — everybody who has
 * added the mini app has added THIS address. Moving orphans them, and the cost
 * grows with every person who adds it.
 */
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ccat-viewer.vercel.app'

/** The bare host, for Quick Auth's domain check and anything that wants no scheme. */
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? new URL(APP_URL).host

type EmbedOpts = {
  /** Max 32 characters — longer titles are truncated by the client. */
  button: string
  /** Where the button lands. Defaults to the mint. */
  url?: string
  /** 3:2 image for the card. */
  image?: string
}

export function embed({ button, url = `${APP_URL}/mint`, image = `${APP_URL}/image.png` }: EmbedOpts) {
  if (button.length > 32)
    throw new Error(`Mini App button title must be <= 32 chars: "${button}" is ${button.length}`)

  return JSON.stringify({
    version: '1',
    imageUrl: image,
    button: {
      title: button,
      action: {
        type: 'launch_frame',
        url,
        name: 'Clanker Cats',
        splashImageUrl: `${APP_URL}/splash.png`,
        splashBackgroundColor: '#0a0a14',
      },
    },
  })
}

/** Both meta tags, ready to spread into a Next `metadata.other`. */
export function embedTags(opts: EmbedOpts) {
  const json = embed(opts)
  return { 'fc:miniapp': json, 'fc:frame': json }
}
