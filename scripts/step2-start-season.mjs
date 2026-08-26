import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

// ── CONFIG ────────────────────────────────────────────────
const PRIVATE_KEY = '0x1a3e1a2cfb108833a627aa7a7edab7d33f467be7860f235743bd424c359627e0'
const CONTRACT    = '0x4975ebf102d8980b8457a4dae84bdf56dfb72a6d'
// ─────────────────────────────────────────────────────────

const ABI = [
  { name: 'startSeason',  type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'seasonActive', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'seasonNumber', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint256' }] },
]

const account = privateKeyToAccount(PRIVATE_KEY)
const wallet  = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })
const reader  = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

const alreadyActive = await reader.readContract({ address: CONTRACT, abi: ABI, functionName: 'seasonActive' })
if (alreadyActive) {
  const num = await reader.readContract({ address: CONTRACT, abi: ABI, functionName: 'seasonNumber' })
  console.log(`Season ${num} is already active — skip to step3`)
  process.exit(0)
}

console.log(`Starting Season 1...`)
const tx = await wallet.writeContract({ address: CONTRACT, abi: ABI, functionName: 'startSeason', args: [] })
console.log(`Tx: ${tx}`)
const receipt = await reader.waitForTransactionReceipt({ hash: tx, confirmations: 3 })
console.log(`\n✅ Season started! Block: ${receipt.blockNumber}`)
console.log(`\nWait ~15 seconds, then run: node scripts/step3-fund-rewards.mjs`)
