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
export const APP_URL = 'https://ccat-viewer.vercel.app'

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
