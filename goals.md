# ClankerCats Viewer — Goals

> This file is the source of truth for project direction. All collaborators (human and AI) should read this before starting work and update it when tasks are completed or priorities shift.

---

## Immediate / In Progress

- [x] Deploy ccat-viewer to Vercel as Farcaster Mini App
- [x] Register accountAssociation for ccat-viewer.vercel.app
- [x] Auto-connect Farcaster frame wallet on open
- [x] Use OwnerUpegsPage + RENDERER contracts to display cats (uniPeg system)
- [x] Show owned CCats in a grid with trait detail view
- [x] Share cat image to Warpcast with correct cat PNG (800x800, selected cat)
- [x] Share text always includes $CLKCAT ticker
- [x] "View My CCats" frame button on share embed launches mini app
- [x] Push mini app source to koaque/clankercats repo under /miniapp
- [ ] **Tamagotchi game** — hunger/happiness/energy stats, Feed/Pet/Play actions (in progress)
- [ ] **Personality system** — derived from cat traits, affects decay rates + diary voice
- [ ] **Activity log** — on-chain $CCAT transfer history as cat diary entries
- [ ] **Farcaster notifications** — ping user when cat is hungry/sad via Snaps webhook
- [x] **Idle Clank game** — Trimps-style idle at `/game`, Clank as tap resource, discrete combat, zones, bosses
- [x] **Viral sharing** — ShareMoment modal auto-triggers on zone advance + boss kill, casts `#IdleClank $CLKCAT`
- [x] **Leaderboard** — `/api/leaderboard` reads Neynar `#IdleClank` casts, Token tab shows top 10
- [x] **Enemy sprites** — 11 unique enemy sprites across 2 zones; Bobo is Zone 1 boss, Bad Chart is Zone 2 boss
- [x] **Potion shop** — popup at kill 5 (mid-floor) and kill 8 (pre-boss); buy potions (25🐟), unlock slots
- [x] **Auto-Run expanded** — 5 tiers (6h/12h/24h/48h/72h), season gate removed, Season 1 live
- [x] **Prestige system** — burn $CLKCAT for permanent +25% prod multiplier per level, 5 levels
- [x] **Comic Sans font** — game-wide
- [x] **CAUTION/PERIL warnings** — HP below 20% shows CAUTION, 1 HP shows PERIL with red bar
- [x] **Cat Recruit button** — shown under Explore button in combat panel
- [x] **Prize pool banner** — home tab teaser + full banner in Token tab
- [x] **startSeason() + fundRewards()** — Season 1 live on contract `0x4975ebf102d8980b8457a4dae84bdf56dfb72a6d`, prize pool funded
- [ ] **Prize distribution** — `distribute.mjs` script to call `distributePrizes()` at season end; optionally add on-chain score submission so winners are verifiable
- [ ] **Cat fighter sprite** — cat-fighter.png + cat-fighter-attack.png (64×64, transparent bg, facing right) in public/sprites/
- [ ] **Hit effect sprite** — hit.png for combat flash in public/sprites/
- [ ] **Zone art** — zone-1.png for The Feed (zone-0.png exists)
- [ ] **Background music** — drop MP3/OGG into public/audio/ then wire up with mute toggle
- [ ] **SFX** — hit sounds, coin pickup, boss spawn (planned after music)

---

## Share Requirements (do not regress)

- Share text: `Check out my ClankerCat #<id> 🐱 $CLKCAT`
- Embed image: always the selected cat's PNG via `/api/cat?id=<id>&seed=<seed>`
- Frame button: "View My CCats" → launches `https://ccat-viewer.vercel.app`

---

## Short-Term (next 1–2 weeks)

- [ ] Tamagotchi: localStorage state (hunger, happiness, energy) with real-time decay
- [ ] Tamagotchi: Feed 🍖 / Pet 🤚 / Play 🎮 action buttons
- [ ] Tamagotchi: cat mood overlay on image (happy/neutral/sad/sleeping)
- [ ] Tamagotchi: activity log — diary entries from interactions + on-chain events
- [ ] Farcaster Snaps: notification token capture on mini app add
- [ ] Farcaster Snaps: server-side notification when hunger/happiness critical
- [ ] Add loading skeletons while cat images load
- [ ] Add "Mint" deep link to clankercats.com in empty state

---

## Medium-Term

- [ ] Persist Tamagotchi state in Supabase by FID (cross-device)
- [ ] Build mirage.garden landing page linking to mini app + collection info
- [ ] Add OpenSea / secondary market link for CCat collection
- [ ] Track LP treasury growth and display in app or landing page
- [ ] Embed $CCAT buy flow (DexScreener deep link or Uniswap widget)

---

## Long-Term

- [ ] Build ClankerCat Uniswap v4 hook — gate $CCAT trades: must hold a CCat + 1M $CCAT to swap
- [ ] vPeg concept — NFT as vault with locked tokens, LP composable (spec contract when ready)
- [ ] Build ClankerCat dungeon crawler — on-chain RPG, CCats as characters, Farcaster Snaps integration
- [ ] ETH mint mode — pay ETH directly, no token required (Japan market)
- [ ] CCat trait rarity page — show rarity rank for each trait combination

---

## Reach Goals

- [ ] Full bPeg marketplace integrated into viewer (browse, buy, list)
- [ ] CCat staking — lock CCat + $CCAT to earn protocol fees
- [ ] CCat leaderboard — most $CCAT held, most CCats owned
- [ ] Multi-chain CCats (Base + Zora or other L2)
- [ ] CCat x Mirage Garden game integration — use CCat as in-game avatar

---

## Contract Addresses (Base Mainnet)

| Contract | Address |
|---|---|
| **Clanker Cats V1 NFT** (the OpenSea collection) | `0xbE76Ce3cE0966fedA606fCF70884dae8FBaa7FCF` |
| Clanker Cats V2 NFT | not yet deployed |
| $CCAT Token | `0xD7800C338228a6eeb37cF74133732Fb6aE05915F` |
| $CLKCAT Token | `0x84a5637CcAC19250156e582c5bF7C01Eee151b07` |
| IdleAutoRun (game, bound to $CCAT) | `0x4975ebf102d8980b8457a4dae84bdf56dfb72a6d` |
| Legacy uniPeg renderer (no longer used by the apps) | `0x2fE5bf2aB284bc71B261Ea6d32aaadfcA987Eeb8` |
| BpegFactory | `0xd0f4ac994cab54e955e778b35966943de331d899` |
| BpegRouter | `0x9c41943f108cac9171a4008622274a9e25a34eb2` |

---

## Collections

The apps read the **Clanker Cats ERC-721s** — the collections that are actually on
OpenSea — not the uniPeg system on the token contract. Both are configured in
`lib/collection.ts` (mirrored in ccat-frame-app's `app/api/_lib/collection.js`);
adding V2 is one entry in the `COLLECTIONS` array.

**V1 — `0xbE76Ce…`, and it stays rare.**
- Highlight.xyz ERC721 minimal proxy, `owner()` = `0x934C80e3…`
- `limitSupply()` = 200, sold out. **Do not call `setLimitSupply`** — the 200 are the 200.
- Metadata: `arweave.net/aHi9QW…/<tokenId>` → hosted PNG on highlight.xyz. Immutable.
- Token id ≠ display number (token 1 is "Clanker Cats #46"). Always show the metadata `name`.
- Traits: Background (4), Body Color (6), Face (10). "Whtie" typo is baked in permanently.
- Token id 200's metadata 404s on Arweave.

**V2 — the free-mint follow-up. 1,111 supply** (Ethereum's 11th birthday, 30 July 2026).
- Separate contract (`contracts/ClankerCatsV2.sol`), so V1 can't be diluted.
- Same pixel art style, **entirely new images** — no V1 assets reused, except the
  four OG backgrounds, which are carried over deliberately.
- Pure NFT drop. **Not wired to $CCAT or $CLKCAT** — no token gate, no holder requirement.
- Minted **inside the Farcaster mini app** at `/mint`. Free — minter pays only Base gas.

### V2 mint flow

Gated on **Farcaster ID, not wallet address** — farming the drop needs real Farcaster
accounts, not fresh wallets.

1. `/mint` calls `sdk.quickAuth.getToken()` → Farcaster-signed JWT.
2. `POST /api/mint-voucher` verifies that JWT against Farcaster's JWKS and reads the
   FID from the token — never from the request body — then signs an EIP-712 voucher
   `Mint(address to, uint256 fid, uint256 deadline)` with `MINT_SIGNER_KEY`.
3. The client calls `mint(fid, deadline, signature)`. The contract re-checks the
   signature and `fidMinted[fid]`, so a leaked or replayed voucher still can't mint twice.

Verified: the contract's hand-rolled digest matches viem's `hashTypedData` exactly.

Required env (`.env.local` + Vercel):
- `NEXT_PUBLIC_V2_ADDRESS` — set after deploy; until then `/mint` shows "coming soon"
- `MINT_SIGNER_KEY` — voucher signer private key (server-only, never `NEXT_PUBLIC_`)
- `NEXT_PUBLIC_APP_DOMAIN` — must match the mini app domain or JWT verification fails

Deploy with `node scripts/deploy-v2.mjs`. **Mint stays closed until `setMintOpen(true)`.**

### V2 trait plan

**No accessories.** Three drawn axes, widened by config rather than art:

Final, as exported (all 250x199 with alpha):

| Axis | Count | Values |
|---|---|---|
| Face | 10 | Aliem, chupa, Frekcles, hehe, huh, Korin, silly, uwu, whyy, Wont u |
| Body Color | 8 | Black Cat, crimson, dore, Gleep, King of the jungle, Lemonade, Tom, White cat |
| Background | 23 | 13 illustrated (Beach Classic, Mountains Classic, Mochi Classic, Gmod, Pool, The moon, Farcaster gate, Blue, Pink, Purple, Red, green, yellow) + 10 flat colours from hex |

**1,840 combinations** for 1,100 layered cats — 1.7x headroom.

`Base Body` is **transparent** — there is nothing to palette-remap, so the 8 drawn
bodies are the full set. `prep-layers.mjs` keeps exported bodies and only *adds*
remapped ones, so dropping a `base.png` in later can't clobber them.

`Background` and `Mochi` in the file's Group 6 are **not part of V2** — don't export them.

**Mystery** is `art/backgrounds/MYSTERY.png` + `art/body/Mystery.png` composited into
`art/mystery/mystery.png`; the two source layers live in `art/_unused/` so they aren't
picked up as an ordinary background and body.

Known nit: `dore` renders blue, not golden. Deliberate or a mislabel — it ships as-is
in the metadata either way. `orange` (`#e8873f`) sits very close to the King of the
jungle body tone; shift the hex if the low-contrast pairing bothers you.

Body colours and background tints are **palette mapping**, not hue rotation — hue
rotation would smear outlines and eyes along with the fur. Flat-colour backgrounds
need no export at all; the generator fills the canvas from a hex value, which is why
widening the space costs nothing.

**MYSTERY is a standalone super rare** — full art, not layer-composed, so it doesn't
consume combination space. 11 of 1,111 (~1%), token ids drawn at random.

### Generation pipeline

Uses the **HashLips Art Engine app** (`AppData\Local\Programs\hashlips-art-engine-app`)
plus **NFT UP** for the IPFS upload — the tooling already in use for the Slime drop.

HashLips composes PNG files only; it has no palette remapping or flat-colour fills,
which is what the trait plan depends on. So the palette work happens first:

1. Krita → **File → Export Layers** to flat PNGs:
   `art/faces/*.png` (10), `art/body/base.png`, `art/backgrounds/*.png` (4 OG +
   Farcaster gate), `art/mystery/mystery.png`
2. `node scripts/prep-layers.mjs --inspect` → prints `base.png`'s real palette
3. Paste those hex values into `BODY_COLOURS` in `scripts/traits.config.mjs`
4. `node scripts/prep-layers.mjs` → writes `layers/{Background,Body,Face}` with
   HashLips `#weight` filenames. Warns if a palette key matched no pixels.
5. HashLips app → point at `layers/`, order **Background, Body, Face**,
   generate **1100** (not 1111 — the rest are Mystery)
6. `node scripts/apply-mystery.mjs` → appends the 11 Mystery tokens and reshuffles
   all ids so the rares land at random positions
7. NFT UP → upload `build/images`, then replace `__BASE_IMAGE_URI__` in the JSON
   and upload `build/json`

All config lives in `scripts/traits.config.mjs` — one source of truth.

`scripts/generate-v2.mjs` is a standalone all-in-one alternative that needs no
HashLips (it does its own sampling and metadata). Kept as a fallback; the HashLips
path above is the primary one.

Verified end to end against fixtures: 1,111 contiguous tokens, 11 Mystery,
1,100 Standard, ids and names aligned.

Cut for IP: `anya` (Spy×Family), `Link Eyes` (Nintendo). `Everynyan` and `Toshi`
flagged. `Carrot smut` needs renaming for marketplace content policy.

**Trait spellings are deliberate — do not "correct" them.** `Frekcles` stays misspelled
on purpose, in the spirit of V1's `Whtie`. Same for `Alium`. Ship trait names exactly
as they appear in the file.

Still to fix in `mochibit.kra`: move `Mystery` out of `colors for body` (it's the
standalone super rare now, not a body colour) and export it as `art/mystery/mystery.png`.

Token id == display number, unlike V1.

### ⚠️ Delayed reveal is mandatory

Token ids are assigned in mint order and the Mystery ids are fixed at generation
time. If the metadata is public before the mint ends, anyone can see which position
is a Mystery and time their transaction to take it — trivial on Base. Point
`BASE_URI` at a placeholder during the mint, then `setBaseURI()` to the real folder
once it closes.

---

## Notes

- Neither collection is enumerable → ownership comes from an `ownerOf` multicall scan
  over the full supply (200 tokens ≈ 800ms), served by `/api/owned`.
- Share embeds use `?id=<tokenId>&c=<collection>`; the old `seed` param is accepted and ignored.
- The game contract's `CLKCAT` is `immutable` and points at `0xD7800C…` — it can't be
  repointed without redeploying and migrating the prize pool. Left alone deliberately.
- LP position: ~$2700 at 40% fee share, ~51% APR (as of 2026-05-07)
- Clankercats.com uses Supabase for global chat — reuse for Tamagotchi state persistence
- Won a $500 USDC Clanker Ecosystem Fund Round 3 sustainability grant (2026-07-30).
