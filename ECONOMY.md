# The arcade model

Agreed with Fierydev (MCLB / fBOMB) on 2026-08-28. Written down here because it
was agreed in a chat, and chats drift.

## The whole thing in four lines

```
cat      the ticket      you need one to enter a bracket
fBOMB    the entry       burns on the way in, automatically
pool     the prize       bounded by  total <= prizePool
winner   a share of it   burns again on the way out
```

**No new token. No emissions. Nothing is ever minted.**

## Why it is shaped like this

**A cat qualifies you, it does not print.** The common failure in game tokens is
a faucet: an asset that emits for being held. It makes the optimal play *not
opening the game*, it makes a cat worth more idle than played, and it is the
exact thing people point at when they call web3 games extractive. Every other
system here — the yard, the streak, the gauntlet — assumes somebody turns up.

**The deflation is free.** fBOMB burns on transfer, so an entry burns on the way
in and a prize burns on the way out with no burn logic of our own. Measured on
Base rather than taken from the marketing: of 23 transactions in a three-hour
window, **14 carried a paired Transfer to the zero address**.

Note the corollary: **the pool must not burn anything itself.** That would tax the
player twice for one action.

**It is a sink, not a scheme.** Supply falls because people played, and the
entries are the evidence. `require(total <= prizePool)` is the entire economy.

**And it aligns with fBOMB without competing with it.** Every entry is an fBOMB
transfer, so the game is a burn engine rather than another token chasing the same
attention. That is why using fBOMB beats launching something.

## What is NOT decided here

- **Entry price, prize split, bracket sizes.** Not chosen.
- **Aerodrome / LP / pairing / initial market cap.** Fierydev's half. He also
  floated, for a FUTURE project, minting a token and pairing 100% of supply
  against fBOMB — that is a separate idea and not this one.
- **Weight classes (D–S++).** Designed and measured, deliberately parked for
  gen 3 — grading cats people already own tells 134 holders their cat is a D.

## The blocker, stated plainly

**A gauntlet run contains one player decision: double or heal.**

Paying out top scores today would pay out luck, not skill — a raffle in an arcade
cabinet, and gamers will read it as one immediately. The same gap was the top item
of player feedback: *"the cats look unique but play almost the same."*

More agency inside a fight is the prerequisite for any payout being defensible.
It is not polish to add afterwards.

## Contracts

- `contracts/ArcadePool.sol` — **written, not deployed.** Balance-delta
  accounting, a reentrancy guard, and the payout ceiling kept.
- `contracts/IdleClankPool.sol` — the live one. **Do not point it at fBOMB.** It
  credits the amount SENT rather than RECEIVED, so every entry over-credits and
  the failure surfaces at payout, mid-distribution, with winners waiting.
