/**
 * Clanker Cats V3 mint config — Robinhood Chain.
 *
 * Unlike V2, the address here IS an env var and defaults to the zero address.
 * V2's is hard-coded on purpose, because a deployed contract should not be able
 * to go missing from a bad build — but V3 is not deployed yet, and a hard-coded
 * placeholder would be a lie that typechecks. Zero means "not deployed", the
 * voucher route says exactly that, and the app degrades instead of failing.
 *
 * Set NEXT_PUBLIC_V3_ADDRESS after the deploy and nothing else has to change.
 */
export const V3 = (process.env.NEXT_PUBLIC_V3_ADDRESS
  || '0x0000000000000000000000000000000000000000') as `0x${string}`

export const V3_DEPLOYED = V3 !== '0x0000000000000000000000000000000000000000'

/*
 * WHETHER A WON RUN EARNS A V3 CAT. OFF FOR NOW.
 *
 * JP, 2026-09-28: "make the fights free for now", and V3 is for BUN holders. The
 * fights stay free to play and earn nothing on chain. The MINT is free too (one
 * per wallet); burning BUN is optional and happens AFTER, through the cat, which
 * marks it a BunBurner (ClankerCatsV3.burnBun).
 *
 * The run door is switched off, not deleted: the signed-tag check, the claim link
 * after a run and the copy all still exist and all read this. Set it to true and
 * three wins earns a cat again.
 */
export const RUN_DOOR = false

export const V3_ABI = [
  { name: 'mintOpen',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool'    }] },
  { name: 'signer',      type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'maxSupply',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }],
  },
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
  /*
   * THE GATE, and the spent-ticket store. One per wallet, forever.
   *
   * lib/ticket.ts warns that a signed run can be replayed. This is what closes
   * that: a replayed run yields a voucher for a wallet the contract has already
   * served, and the mint reverts.
   */
  {
    name: 'minted', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ type: 'bool' }],
  },
  {
    name: 'mint', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'deadline',  type: 'uint256' },
      { name: 'signature', type: 'bytes'   },
    ],
    outputs: [{ type: 'uint256' }],
  },
  // ── BunBurner (ClankerCatsV3.burnBun) ──
  { name: 'bun',          type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'bunToll',      type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'bunBurnPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'bunBurner', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'bool' }],
  },
  {
    name: 'burnBun', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [],
  },
  {
    name: 'Minted', type: 'event',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'to',      type: 'address', indexed: true },
    ],
  },
] as const

/** Human-readable reasons the V3 endpoint can refuse, for UI copy. */
export const V3_MINT_ERRORS: Record<string, string> = {
  not_deployed:   'The Robinhood Chain drop isn’t live yet.',
  mint_closed:    'Minting hasn’t opened yet.',
  sold_out:       'All cats have been claimed.',
  already_minted: 'This wallet has already claimed its cat.',
  no_run:         'Finish a gauntlet run first — three wins or better earns a cat.',
  need_bun:       'This drop is for BUN holders. Hold some BUN in this wallet, then claim.',
  bad_run:        'That run couldn’t be verified. Play it through and try again.',
  bad_wallet:     'That doesn’t look like a wallet address.',
}
