# ClankerCats Viewer — Goals

> This file is the source of truth for project direction. All collaborators (human and AI) should read this before starting work and update it when tasks are completed or priorities shift.

---

## Immediate / In Progress

- [x] Deploy ccat-viewer to Vercel as Farcaster Mini App
- [x] Register accountAssociation for ccat-viewer.vercel.app
- [x] Auto-connect Farcaster frame wallet on open
- [x] Show owned CCats in a grid with trait detail view
- [x] Fix: set CCAT_COLLECTION to real address `0x7b429e994873A9f7b50484Ce6c80c25040C7Ee26`
- [x] Improve empty state UI — hero cat, buy button, collection stats
- [ ] Verify CCat display works after deploy (user sent themselves a token)
- [ ] Investigate why friend can't mint more than 5/10 CCats (check clankercats.com flow)

---

## Short-Term (next 1–2 weeks)

- [ ] Re-register CCat collection on new BpegFactory (`0xd0f4ac994cab54e955e778b35966943de331d899`) so minting works through the new system
- [ ] Add "Mint" button or flow inside the mini app (deep link or embedded)
- [ ] Add collection stats: total holders, floor price (if marketplace exists)
- [ ] Add share-to-Warpcast from gallery grid (not just detail view)
- [ ] Show "Preview" CCats in empty state (fetch a few token URIs from collection to show what they look like)
- [ ] Add loading skeletons instead of blank placeholders while images load
- [ ] Image fallback: if tokenURI doesn't decode, show placeholder gracefully

---

## Medium-Term

- [ ] Build mirage.garden landing page that links to the mini app + collection info
- [ ] Authorize BpegRouter as minter on BpegFactory (needed for mint-from-app flow)
- [ ] Add OpenSea / secondary market link for CCat collection
- [ ] Track LP treasury growth and display in app or landing page
- [ ] Embed Uniswap widget or deep link for buying $CLKCAT directly in app
- [ ] Add push notifications via Farcaster webhook (e.g. "Someone minted a new CCat!")

---

## Long-Term

- [ ] Build ClankerCat Uniswap v4 hook — gate $CLKCAT trades: must hold a CCat + 1M $CLKCAT to swap
- [ ] vPeg concept — NFT as vault with locked tokens, LP composable (spec contract when ready)
- [ ] Build ClankerCat dungeon crawler — on-chain RPG, CCats as characters, Farcaster Snaps integration
- [ ] ETH mint mode — pay ETH directly, no token required (Japan market)
- [ ] CCat trait rarity page — show rarity rank for each trait combination
- [ ] Allow CCat holders to vote on new trait drops via Warpcast poll

---

## Reach Goals

- [ ] Full bPeg marketplace integrated into viewer (browse, buy, list)
- [ ] CCat staking — lock CCat + $CLKCAT to earn protocol fees
- [ ] CCat leaderboard — most $CLKCAT held, most CCats owned
- [ ] Multi-chain CCats (Base + Zora or other L2)
- [ ] CCat x Mirage Garden game integration — use CCat as in-game avatar

---

## Contract Addresses (Base Mainnet)

| Contract | Address |
|---|---|
| CCat Collection | `0x7b429e994873A9f7b50484Ce6c80c25040C7Ee26` |
| BpegFactory (new) | `0xd0f4ac994cab54e955e778b35966943de331d899` |
| BpegRouter | `0x9c41943f108cac9171a4008622274a9e25a34eb2` |
| $CLKCAT Token | `0x56d011f3d82c91d58a14ddd07ad3e4c97f7e2e0b` |

---

## Notes

- CCat collection was deployed on OLD factory — needs re-registration on new factory for mint flow to work
- LP position: ~$2700 at 40% fee share, ~51% APR (as of 2026-05-07)
- Uniswap WETH/CLKCAT 1% pool
- Friend minting issue: unclear if it's a token threshold, UI issue on clankercats.com, or contract limit
