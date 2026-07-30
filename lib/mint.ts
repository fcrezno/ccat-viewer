/**
 * Clanker Cats V2 mint config.
 *
 * Set NEXT_PUBLIC_V2_ADDRESS once the contract is deployed (scripts/deploy-v2.mjs
 * prints it). Until then the mint UI shows a "coming soon" state instead of a
 * broken button, and the voucher API returns 503.
 */
export const V2 = (process.env.NEXT_PUBLIC_V2_ADDRESS ?? '') as `0x${string}` | ''

export const V2_ABI = [
  { name: 'mintOpen',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool'    }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'maxSupply',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    name: 'fidMinted', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'fid', type: 'uint256' }], outputs: [{ type: 'bool' }],
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
  mint_closed:    'Minting hasn’t opened yet.',
  already_minted: 'This Farcaster account already minted a cat.',
  sold_out:       'All cats have been claimed.',
}
