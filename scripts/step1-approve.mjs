import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

// ── CONFIG ────────────────────────────────────────────────
const PRIVATE_KEY   = '0x1a3e1a2cfb108833a627aa7a7edab7d33f467be7860f235743bd424c359627e0'
const CONTRACT      = '0x4975ebf102d8980b8457a4dae84bdf56dfb72a6d'
const CLKCAT        = '0x84a5637ccac19250156e582c5bf7c01eee151b07'
const FUND_AMOUNT   = '500000'
// ─────────────────────────────────────────────────────────

const ERC20_ABI = [
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }],                                     outputs: [{ type: 'uint256' }] },
]

const account = privateKeyToAccount(PRIVATE_KEY)
const wallet  = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })
const reader  = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

const amountWei = BigInt(FUND_AMOUNT) * BigInt(1e18)

const balance = await reader.readContract({ address: CLKCAT, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] })
console.log(`Wallet: ${account.address}`)
console.log(`$CLKCAT balance: ${Number(balance) / 1e18}`)

if (balance < amountWei) {
  console.error(`Not enough $CLKCAT — need ${FUND_AMOUNT}, have ${Number(balance) / 1e18}`)
  process.exit(1)
}

console.log(`\nApproving ${FUND_AMOUNT} $CLKCAT for contract...`)
const tx = await wallet.writeContract({ address: CLKCAT, abi: ERC20_ABI, functionName: 'approve', args: [CONTRACT, amountWei] })
console.log(`Tx: ${tx}`)
const receipt = await reader.waitForTransactionReceipt({ hash: tx, confirmations: 3 })
console.log(`\n✅ Approved! Block: ${receipt.blockNumber}`)
console.log(`\nWait ~15 seconds, then run: node scripts/step2-start-season.mjs`)
