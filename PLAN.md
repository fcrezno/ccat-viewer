# What to build next, and why in this order

Written 2026-08-28. The honest problem: **almost nobody is playing.** Everything
below is ordered by what actually moves that, not by what is most interesting.

Start here if you are picking this up cold. Then read `ECONOMY.md` for the
agreed money model, and the memory folder for the standing rules.

---

## Where it stands

**Live** — guest cats that persist, guest PvP by six-digit code, the win streak,
the yard (your cats plus the cats of people you follow), QR codes, the season
record rebuilt from casts.

**Built, not wired** — the fire blast animation (18 frames, no player exists),
sixteen Krita templates at 250x200 waiting on art, `ArcadePool.sol` (correct for
fBOMB, undeployed).

**Parked on purpose** — D–S++ grades until gen 3 · a Farcaster client fork
(never) · a new token (option 1 chosen with Fierydev) · emissions (never).

---

## 1. Put real decisions in a fight

**This is the only item that blocks everything else.**

A whole gauntlet run currently contains ONE player decision: double or heal. The
rest is watched. That single fact is behind three separate problems:

- **The one piece of player feedback we got** said it: *"the cats look unique but
  play almost the same."* It is what won pascaline the bounty.
- **A paid bracket is dishonest without it.** Paying out top scores today pays
  out luck. A raffle in an arcade cabinet, and players will say so.
- **Fierydev is waiting on it.** The entry model was agreed BECAUSE we said the
  game was not ready. That is now a promise with someone on the other end.

The cheapest start is surfacing rather than building: **natures and field effects
already exist** in `combat.json` and `Fight.cs` on the s&box side and have never
been shown to a player. Per-cat abilities were pascaline's actual suggestion.

Done properly this also makes every cat worth owning, which is the thing gen-3
weight classes were designed to fix from the other direction.

## 2. Play the effects

The fire blast is finished and nothing consumes it. "Clearer hits, stronger
impact" was the FIRST item of the same feedback, and the mini app already shakes
the struck cat — the missing half is the sprite player and the white flash.

Wire it with the one effect that exists so every later sheet is a drop-in. It
also settles whether 18 frames is right in a real fight, which no GIF can answer.

## 3. Write the yard's prose

Six lines in `SAYS` (`components/Yard.tsx`) and `reads()` (`lib/yard.ts`) are
placeholders in a shipped feature. That is the whole texture of it, and it has to
be JP's voice — nobody else can do this one.

Small, and it makes a live feature stop feeling unfinished.

## 4. The funnel: domain, PWA, stickers

In order, because each needs the last:

1. **A domain.** `lib/miniapp.ts` already holds the address in one place, so the
   code side is one variable. The manual parts remain: re-signing
   `farcaster.json`, and deciding what happens to `metaBase` — the CONTRACT
   points at the current host for V2 metadata, so moving it breaks every
   marketplace unless the old host keeps serving or the baseURI changes on-chain.
   **Note it gets more expensive with every person who adds the mini app**, since
   `favorited` and notification tokens are keyed by domain.
2. **PWA.** Manifest, icon, service worker. About a day. Gets a home-screen icon
   and web push without an app store.
3. **Stickers.** `/api/qr` is built and verified. A sticker is a QR to a short
   domain; guest PvP already needs no wallet, so a stranger can play in ten
   seconds. Ask them to add it to the home screen AFTER they win something.

## 5. Deploy the pool, once entries are worth charging for

`ArcadePool.sol` is written and correct for fBOMB. It stays undeployed until
item 1 is done — that is the whole agreement.

`IdleClankPool` is live and **must not be pointed at fBOMB**: it credits the
amount sent rather than received, and fails at payout with winners watching.

---

## Open decisions, none of them mine

- **The domain.** Nothing moves on item 4 without it.
- **What $CLKCAT is for**, now the entry currency is fBOMB. Existing holders will
  ask, and it is better answered before they do.
- **Whether replies should be in Simplified Technical English.** The standing
  rule says yes; practice has drifted. Worth settling either way.
- **pascaline's bounty payout** and the announcement post (drafted, unsent).

## The thing to resist

Every idea today that sounded exciting — the client fork, a new token,
cats-that-emit, grades on the existing 1111 — was a way of avoiding item 1. It is
the least glamorous thing on this list and the only one that changes whether
anybody plays.
