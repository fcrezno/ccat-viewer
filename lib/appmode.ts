/**
 * WHICH BUILD THIS IS.
 *
 * JP, 2026-09-09: "can we put the web app game into a actual app on the app
 * store?" ... "make it NFT less" ... "for the app".
 *
 * -- WHY A FLAG AND NOT A FORK -----------------------------------------------
 *
 * The web build is live and must not change: 569 of 1111 minted on V2, V3
 * waiting on a deploy, and a mini app running inside Farcaster. So the App Store
 * build is the SAME CODEBASE with the chain switched off, not a copy.
 *
 * A copy would drift inside a week. That is the whole reason `Social.cs` had
 * four measured tunings the web build had already corrected, and it is the one
 * mistake this project keeps paying for. One source, two builds.
 *
 * -- WHAT APPLE ACTUALLY OBJECTS TO ------------------------------------------
 *
 * App Review Guideline 3.1.1, verbatim:
 *
 *   "Apps may allow users to view their own NFTs, provided that NFT ownership
 *    does not unlock features or functionality within the app."
 *
 * That clause has no US exception, and the yard is exactly what it describes:
 * `open()` admits adopted cats and turns guests away, so holding a token unlocks
 * the yard. The anti-steering half of 3.1.1 now DOES carve out the US storefront,
 * so a link out to /mint would be allowed there — but the gate would not be.
 *
 * So this flag does not hide the chain. IT REMOVES THE REASON TO HAVE ONE: cats
 * are earned by playing, and a cat you won is a real cat. See `winCat` in
 * lib/stable.ts.
 *
 * -- IT IS BUILD TIME, NOT RUN TIME ------------------------------------------
 *
 * `NEXT_PUBLIC_` is inlined by the bundler, so `if (NO_CHAIN)` around an import
 * or a page is dead code the app build can drop. A runtime toggle would ship the
 * wallet code inside the app binary and then hide it, which is both bigger and
 * exactly the thing a reviewer would find.
 *
 *   web (default)   npm run build
 *   app             NEXT_PUBLIC_NO_CHAIN=1 npm run build
 */
export const NO_CHAIN = process.env.NEXT_PUBLIC_NO_CHAIN === '1'

/** The other way round, for reading at a call site where that is the clearer word. */
export const ON_CHAIN = !NO_CHAIN
