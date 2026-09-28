import { getAddress, isAddress, type Hex } from 'viem'
import { clientForChain, robinhood } from '@/lib/chains'

/**
 * BURN BUNDLECAT, MINT A CAT.
 *
 * JP, 2026-09-21: "BUN is about to launch and I have an idea; Cat nfts burn bun."
 * BUN is Bundlecat, a PONS token on Robinhood Chain, and it is permissionless.
 *
 * ── WHY NONE OF THIS IS IN THE CONTRACT ──────────────────────────────────────
 *
 * ClankerCatsV3.mint() takes a signed voucher and nothing else. It moves no
 * token and it imports no IERC20. That is not a gap — it means the SERVER is
 * already the whole policy, so a new way to earn a cat is a new check here
 * rather than a new contract.
 *
 * It also solves a problem that has no other answer: BUN HAS NOT LAUNCHED YET.
 * An immutable contract cannot hold an address that does not exist. An env var
 * can, and it gets filled on the day BUN goes live. Nothing waits on the deploy.
 *
 * ── PERMISSIONLESS MEANS THE ADDRESS IS THE ONLY IDENTITY ────────────────────
 *
 * Anybody can launch a second token called Bundlecat with the same ticker. So
 * this file NEVER looks at a symbol or a name. It compares the log's contract
 * address against one address JP pins in the environment. That also protects a
 * player who gets told by a stranger to burn the wrong BUN — their burn simply
 * does not count, instead of counting for a fake.
 *
 * ── WHY NO SPENT-TX DATABASE IS NEEDED ───────────────────────────────────────
 *
 * lib/ticket.ts says plainly that this app has no database, and that a spent
 * store is what the gauntlet would need before it paid out automatically. A burn
 * does NOT need one, and the reason is worth keeping:
 *
 *   The proof checked below is a Transfer whose FROM is the asking wallet. So a
 *   burn can only ever mint for the wallet that made it. And minted[wallet] in
 *   the contract is permanent. Replaying your own burn produces a voucher that
 *   reverts with AlreadyMinted — it takes nothing and gives nothing.
 *
 * The chain is the store. One wallet, one burn, one cat.
 *
 * ── WHAT A TRANSFER TAX WOULD DO ─────────────────────────────────────────────
 *
 * ArcadePool.sol measured fBOMB taking a cut on every transfer, so a burn on top
 * would tax the player twice. This counts what ARRIVED at the dead address, not
 * what was sent, so a taxing BUN is handled correctly and not guessed at. It
 * does mean JP sets BUN_BURN_AMOUNT knowing a tax eats part of it. MEASURE BUN
 * ON LAUNCH before picking the number.
 */

const ZERO = '0x0000000000000000000000000000000000000000'

/** The pinned BUN contract. Unset = the burn path is off, and the game says so. */
const RAW_BUN = process.env.BUN_TOKEN_ADDRESS?.trim() ?? ''
export const BUN = isAddress(RAW_BUN) ? getAddress(RAW_BUN) : (ZERO as `0x${string}`)


/**
 * The CatToll splitter, if one is deployed.
 *
 * Set, and a payment must land ON THE TOLL, which then divides 30/30/40 by code
 * nobody can change. Unset, and this falls back to a straight burn to a dead
 * address. Both are real answers, so both are supported by one code path.
 */
const RAW_TOLL = process.env.BUN_TOLL_ADDRESS?.trim() ?? ''
export const TOLL = isAddress(RAW_TOLL) ? getAddress(RAW_TOLL) : (ZERO as `0x${string}`)
export const TOLL_LIVE = TOLL !== ZERO

/** Whole tokens, not wei. Decimals are read from the token, once. */
const BURN_AMOUNT = process.env.BUN_BURN_AMOUNT?.trim() || '0'

/**
 * THE PATH IS LIVE ONLY WHEN ALL THREE ARE SET: token, toll, amount.
 *
 * The amount is part of the switch because a set address with a zero threshold
 * would let one wei buy a cat. The TOLL is part of it because JP chose a
 * 30/30/40 split on 2026-09-21: without the toll this file would happily accept
 * a payment burnt straight to 0x…dEaD, which mints the cat and pays the three
 * agents and the creator NOTHING. That is not a looser setting, it is a silently
 * different deal.
 *
 * A half-set configuration must be OFF, not free, and not a quieter bargain than
 * the one that was agreed.
 */
/*
 * OR A PLAIN BURN, CHOSEN ON PURPOSE.
 *
 * JP, 2026-09-28: "minting a cat burns some BUN". If the whole payment is to be
 * burned rather than split, set BUN_BURN_ALL=1 and leave the toll empty: the page
 * then calls BUN's own burn() and the check above accepts the zero address. It is
 * its own switch so that a MISSING toll still reads as "off", never as "burn it".
 */
export const BURN_ALL = process.env.BUN_BURN_ALL?.trim() === '1' && !TOLL_LIVE

export const BURN_LIVE = BUN !== ZERO && (TOLL_LIVE || BURN_ALL) && Number(BURN_AMOUNT) > 0

/**
 * The earliest block a burn may come from.
 *
 * Without this, any burn BUN already had — a launch burn, somebody clearing a
 * wallet, a PONS mechanic — could be claimed as payment for a cat that was never
 * paid for. Set it to the block where the offer opens.
 */
const FROM_BLOCK = BigInt(process.env.BUN_BURN_FROM_BLOCK?.trim() || '0')

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/**
 * WHERE THE PAYMENT HAS TO LAND.
 *
 * With a toll deployed there is exactly ONE valid destination, and paying the
 * wrong address cannot be mistaken for paying the right one.
 *
 * Without one, a real burn() emits Transfer to the zero address while tokens
 * without a burn function are killed by sending to 0x…dEaD. Both are accepted
 * in that case, because both take the supply out and a player should not have to
 * know which their token implements.
 */
function sinks(): Set<string> {
  return TOLL_LIVE
    ? new Set([TOLL.toLowerCase()])
    : new Set([ZERO, '0x000000000000000000000000000000000000dead'])
}

const ERC20_DECIMALS = [{
  name: 'decimals', type: 'function', stateMutability: 'view',
  inputs: [], outputs: [{ type: 'uint8' }],
}] as const

/** A topic is 32 bytes; an address is the low 20 of it. */
function addressFromTopic(topic: Hex): string {
  return ('0x' + topic.slice(-40)).toLowerCase()
}

/**
 * The threshold in wei, held for the life of the instance.
 *
 * decimals() is immutable in every ERC20 worth accepting, so reading it once is
 * not a stale-cache risk. It is read rather than assumed to be 18 because PONS
 * does not promise that and a wrong guess here is off by a factor of 10^12.
 */
let thresholdOnce: Promise<bigint> | null = null

function threshold(): Promise<bigint> {
  if (!thresholdOnce) {
    thresholdOnce = (async () => {
      const client = clientForChain(robinhood)
      const decimals = await client.readContract({
        address: BUN, abi: ERC20_DECIMALS, functionName: 'decimals',
      }) as number
      const [whole, frac = ''] = BURN_AMOUNT.split('.')
      const padded = (frac + '0'.repeat(decimals)).slice(0, decimals)
      return BigInt(whole || '0') * BigInt(10) ** BigInt(decimals) + BigInt(padded || '0')
    })().catch(e => { thresholdOnce = null; throw e })
  }
  return thresholdOnce
}

export type BurnCheck =
  | { ok: true;  burned: bigint; needed: bigint }
  | { ok: false; reason: 'off' | 'bad_hash' | 'unknown_tx' | 'reverted' | 'too_old' | 'not_paid' | 'too_small'; burned?: bigint; needed?: bigint }

/**
 * Did `wallet` burn enough BUN in transaction `hash`?
 *
 * Read only. It proves a burn; it never makes one. The player burns from their
 * own wallet, in their own transaction, and hands over the hash afterwards —
 * so this app never needs an allowance and can never move anybody's token.
 */
export async function verifyBurn(hash: string, wallet: string): Promise<BurnCheck> {
  if (!BURN_LIVE) return { ok: false, reason: 'off' }
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return { ok: false, reason: 'bad_hash' }

  const client = clientForChain(robinhood)
  const from = getAddress(wallet).toLowerCase()

  let receipt
  try {
    receipt = await client.getTransactionReceipt({ hash: hash as Hex })
  } catch {
    // Not found, or the RPC is unwell. Both mean "cannot prove it", not "false".
    return { ok: false, reason: 'unknown_tx' }
  }

  if (receipt.status !== 'success') return { ok: false, reason: 'reverted' }
  if (receipt.blockNumber < FROM_BLOCK) return { ok: false, reason: 'too_old' }

  /*
   * Sum every qualifying Transfer in the transaction rather than taking the
   * first. A token that splits a burn across two logs, or a player who burns
   * twice in one call, should still be credited with what actually left.
   */
  const SINKS = sinks()
  let burned = BigInt(0)
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BUN.toLowerCase()) continue
    if (log.topics[0]?.toLowerCase() !== TRANSFER) continue
    if (log.topics.length < 3) continue
    if (addressFromTopic(log.topics[1] as Hex) !== from) continue
    if (!SINKS.has(addressFromTopic(log.topics[2] as Hex))) continue
    burned += BigInt(log.data === '0x' ? '0x0' : log.data)
  }

  if (burned === BigInt(0)) return { ok: false, reason: 'not_paid' }

  const needed = await threshold()
  if (burned < needed) return { ok: false, reason: 'too_small', burned, needed }

  return { ok: true, burned, needed }
}

/**
 * WHAT THE PAGE HAS TO BE TOLD.
 *
 * The mint page cannot read any of the settings above — they are server-side on
 * purpose, so the pinned token and the toll cannot be swapped by anything
 * running in a browser. It therefore asks for them, and this is the one place
 * that answers.
 *
 * The amount goes out BOTH ways: `amount` for a person to read and `amountWei`
 * for the wallet call. Letting the page multiply by the decimals itself is how
 * an off-by-10^18 payment happens, and this token has 18 of them.
 */
export async function terms() {
  if (!BURN_LIVE) return { live: false as const }
  return {
    live:      true as const,
    token:     BUN,
    // The zero address here means "burn it all": the page calls burn() instead.
    toll:      TOLL,
    amount:    BURN_AMOUNT,
    amountWei: (await threshold()).toString(),
    chainId:   robinhood.id,
  }
}
