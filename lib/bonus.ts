/**
 * Extra mints for people who shared the drop.
 *
 * The contract enforces one mint per fid and that logic is immutable — but
 * mint() only checks whether a *fid value* has been used, it never verifies the
 * fid belongs to a real Farcaster account. Only the backend does that, via
 * Quick Auth. So an extra mint is granted by issuing a voucher on a derived
 * "bonus fid" that no real account can ever occupy.
 *
 * Bonus fids live at 800,000,000+ and creator-reserve fids at 900,000,000+, both
 * far above any real Farcaster id, so the three ranges can never collide. The
 * Minted event logs the fid, which keeps every non-standard mint auditable on
 * chain rather than hidden.
 */

/** fid → how many extra mints they get, on top of their normal one. */
export const BONUS_MINTS: Record<number, number> = {
  // Quoted the cast with their cat
  409857:  1,  // yerbearserker
  435160:  1,  // bigbenz
  977319:  1,  // dasilva
  654826:  1,  // dreez

  // Quoted AND recast — counted for both
  1088459: 2,  // kayonfire

  // Recast the cast
  1331766: 1,  // bribe
  8332:    1,  // awedjob
  314353:  1,  // hanma
  1079922: 1,  // presdency.eth
  188778:  1,  // deusex
  376599:  1,  // ejceo.eth
  434449:  1,  // warpcast-com
  1071216: 1,  // fattylazyboy
}

/**
 * An extra mint for anyone who already owns a cat.
 *
 * Unlike BONUS_MINTS above this is a RULE rather than a list, so it needs no
 * maintenance as people mint — the check happens against the chain at request
 * time. It stacks with a share bonus: someone on the list who also holds a cat
 * gets both.
 *
 * It rides the same derived-fid mechanism, so the one-per-fid rule in the
 * contract is untouched and every extra stays visible in the Minted event.
 */
export const HOLDER_BONUS = 1

const BONUS_FID_BASE = BigInt(800_000_000)

/**
 * The fid a bonus mint is recorded under. Derived from the real fid so each
 * account's extras are distinct, stable, and identifiable after the fact.
 */
export function bonusFid(fid: number, slot: number): bigint {
  return BONUS_FID_BASE + BigInt(fid) * BigInt(10) + BigInt(slot)
}

export function bonusAllowance(fid: number): number {
  return BONUS_MINTS[fid] ?? 0
}
