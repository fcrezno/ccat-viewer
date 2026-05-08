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
- [ ] **Idle Clank sprites** — cat fighter (64×64), hit effect, zone art, enemy sprites
- [ ] **Fund mini-game pool** — call `fundRewards()` + `startSeason()` on contract `0xa003b34f82950604d2c5e7b26986d6acc7862514`

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
| $CCAT / CLKCAT Token (uniPeg) | `0xD7800C338228a6eeb37cF74133732Fb6aE05915F` |
| CCat Renderer | `0x2fE5bf2aB284bc71B261Ea6d32aaadfcA987Eeb8` |
| BpegFactory (new) | `0xd0f4ac994cab54e955e778b35966943de331d899` |
| BpegRouter | `0x9c41943f108cac9171a4008622274a9e25a34eb2` |

---

## Notes

- uniPeg system: OwnerUpegsPage() + OwnerUpegsCount() live on the $CCAT token contract itself
- RENDERER.tokenURI(id, seed) returns base64 JSON with base64 SVG image
- Share always uses selected cat's id+seed — never a generic image
- LP position: ~$2700 at 40% fee share, ~51% APR (as of 2026-05-07)
- Clankercats.com uses Supabase for global chat — reuse for Tamagotchi state persistence
