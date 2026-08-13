/**
 * Clanker Cats V2 mint config.
 *
 * The contract address is public and version-controlled, same as the entry in
 * lib/collection.ts — it does not belong in an env var. Keeping it here means a
 * deploy can't silently come up unconfigured because a NEXT_PUBLIC_ value was
 * missing from the build.
 *
 * NEXT_PUBLIC_V2_ADDRESS still overrides it, which is useful for pointing a
 * preview deployment at a test contract.
 */
export const V2 = (process.env.NEXT_PUBLIC_V2_ADDRESS
  || '0x5C5b928f937F63656BE62d0A45f4Db756b79934B') as `0x${string}`

export const V2_ABI = [
  { name: 'mintOpen',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool'    }] },
  { name: 'signer',      type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }],
  },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'maxSupply',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'fidMinted', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'fid', type: 'uint256' }], outputs: [{ type: 'bool' }],
  },
  // How the holder bonus is decided — see HOLDER_BONUS in lib/bonus.ts. Reading
  // ownership rather than trusting the client is the whole point.
  {
    name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }],
  },
  {
    name: 'mint', type: 'function', stateMutability: 'nonpayable',
    inputs: [
      { name: 'fid',       type: 'uint256' },
      { name: 'deadline',  type: 'uint256' },
      { name: 'signature', type: 'bytes'   },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const

export type Voucher = {
  fid:       number
  deadline:  string
  signature: `0x${string}`
}

/** Human-readable reasons the mint endpoint can refuse, for UI copy. */
export const MINT_ERRORS: Record<string, string> = {
  mint_closed:       'Minting hasn’t opened yet.',
  already_minted:    'This Farcaster account already minted a cat.',
  sold_out:          'All cats have been claimed.',
  low_score:         'Your Farcaster account doesn’t meet the score needed for this mint.',
  score_unavailable: 'Couldn’t check your account right now. Try again in a minute.',
}
