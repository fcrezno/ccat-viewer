import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

// ── CONFIG ────────────────────────────────────────────────
const PRIVATE_KEY = '0x1a3e1a2cfb108833a627aa7a7edab7d33f467be7860f235743bd424c359627e0'
const CONTRACT    = '0x4975ebf102d8980b8457a4dae84bdf56dfb72a6d'
const CLKCAT      = '0x84a5637ccac19250156e582c5bf7c01eee151b07'
const FUND_AMOUNT = '500000'
// ─────────────────────────────────────────────────────────

const ABI = [
  { name: 'fundRewards', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'prizePool',   type: 'function', stateMutability: 'view',       inputs: [],                                    outputs: [{ type: 'uint256' }] },
  { name: 'seasonActive',type: 'function', stateMutability: 'view',       inputs: [],                                    outputs: [{ type: 'bool' }] },
]

const account = privateKeyToAccount(PRIVATE_KEY)
const wallet  = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })
const reader  = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

const amountWei = BigInt(FUND_AMOUNT) * BigInt(1e18)

const active = await reader.readContract({ address: CONTRACT, abi: ABI, functionName: 'seasonActive' })
if (!active) {
  console.error('No active season — run step2 first')
  process.exit(1)
}

console.log(`Funding prize pool with ${FUND_AMOUNT} $CLKCAT...`)
const tx = await wallet.writeContract({ address: CONTRACT, abi: ABI, functionName: 'fundRewards', args: [amountWei] })
console.log(`Tx: ${tx}`)
const receipt = await reader.waitForTransactionReceipt({ hash: tx, confirmations: 3 })
console.log(`\n✅ Funded! Block: ${receipt.blockNumber}`)

const pool = await reader.readContract({ address: CONTRACT, abi: ABI, functionName: 'prizePool' })
console.log(`\n🏆 Prize pool: ${Number(pool) / 1e18} $CLKCAT`)
console.log(`Season 1 is LIVE!\n`)
