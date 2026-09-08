# Deploying Clanker Cats V3 — Robinhood Chain

Everything below is ready. **Nothing has been deployed.** The steps that send a
transaction are yours to run; the rest is already done and checked in.

## What is already done

| | |
|---|---|
| Contract | `contracts/ClankerCatsV3.sol` — compiles, 7,747 bytes |
| Chain | `lib/chains.ts` — chain 4663, multicall3 verified against the live RPC |
| Art | 1,111 cats, `art/rh/out/` (gitignored, 21MB, rebuilt in 46s from the tracked layers) |
| Served art | `public/v3/images/` + `public/v3/metadata/` — 1,111 each |
| Metadata routes | `/v3/cat/[id]` and `/v3/meta/[id]`, with progressive reveal |
| Mint page | `app/mint/v3/page.tsx` |
| Voucher API | `app/api/v3-voucher/route.ts` |
| Collection wiring | `lib/collection.ts` — appears the moment the address is set |

## The one thing to decide first

**Where the metadata is hosted.** It is baked into 1,111 files *and* into the
contract's `baseURI`.

It is **not** irreversible — `setBaseURI` is `onlyOwner` on this contract, so you
can move it later with one transaction. But marketplaces cache on the tokenURI
string, so moving means re-indexing, not just editing a config.

The default is the app's own origin, matching V2:

```bash
node scripts/prep-v3.mjs --host https://ccat-viewer.vercel.app
```

Re-run that with a different `--host` and the 1,111 files are rewritten. It is a
command, not a migration.

## Order of operations

**1 — Rebuild the art if `art/rh/out/` is missing** (it is gitignored)

```bash
node art/rh/make-collection.mjs --count 1111
```

**2 — Prepare what gets served**

```bash
node scripts/prep-v3.mjs --host https://ccat-viewer.vercel.app
```

**3 — Deploy the site first, not the contract**

`baseURI` must already answer before any token exists, or the first indexer to
look gets a 404 and caches it. Push, let Vercel build, then check:

```bash
curl -s https://ccat-viewer.vercel.app/v3/cat/1
```

It should return the **Unrevealed** card — not an error, and not the real cat.
That is correct: nothing is minted, so nothing reveals.

**4 — Dry run the deploy**

```bash
node scripts/deploy-v3.mjs
```

Compiles and prints exactly what would be sent. Sends nothing.

**5 — Deploy**

Needs in `.env.local`: `DEPLOYER_KEY`, `MINT_SIGNER_ADDRESS`, `BASE_URI`.

```bash
node scripts/deploy-v3.mjs --send
```

**6 — Wire the address up**

`NEXT_PUBLIC_V3_ADDRESS` in `.env.local` **and in Vercel**, plus `MINT_SIGNER_KEY`.
No code change: `COLLECTIONS` adds the V3 entry itself once that variable is set,
and the yard, the roster and `/cats` all pick it up.

**7 — Delete `DEPLOYER_KEY` from `.env.local`.**

**8 — Open the mint when you are ready**

`setMintOpen(true)`. Until then nothing can be minted, which is why steps 5 and 8
are separate — deploying is not launching.

## Things worth knowing before you commit to this chain

- **The gas subsidy behind Robinhood Chain's numbers expires around late
  September 2026.** Researched 2026-08-31; today is 2026-09-08. If the plan is to
  mint there, that window is short.
- **Robinhood Wallet does not display Robinhood Chain NFTs.** Its own support
  page lists Ethereum, Polygon, Arbitrum, Optimism and Base — receive-only,
  iOS-only. A cat minted here does not appear in the Robinhood app.
- The public RPC is rate-limited and Robinhood's own docs say it is not for
  production. Put a keyed provider in front of it before real traffic, the same
  way Base ended up with four RPCs behind a fallback.

None of that is an argument against doing it — it is what the decision looks like
with the facts attached.
