import { createWalletClient, createPublicClient, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

// ── CONFIG ────────────────────────────────────────────────
const PRIVATE_KEY   = '0x1a3e1a2cfb108833a627aa7a7edab7d33f467be7860f235743bd424c359627e0'   // paste deployer private key (with 0x prefix)
const CONTRACT      = '0x4975ebf102d8980b8457a4dae84bdf56dfb72a6d'
const CLKCAT        = '0x84a5637ccac19250156e582c5bf7c01eee151b07'
const FUND_AMOUNT   = '500000'                   // $CLKCAT to seed the prize pool (no decimals)
// ─────────────────────────────────────────────────────────

const ABI = [
  { name: 'startSeason',  type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'fundRewards',  type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'seasonActive', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'prizePool',    type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint256' }] },
]

const ERC20_ABI = [
  { name: 'approve',  type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
]

const RPC = 'https://mainnet.base.org'

const account = privateKeyToAccount(PRIVATE_KEY)
const wallet  = createWalletClient({ account, chain: base, transport: http(RPC) })
const reader  = createPublicClient({ chain: base, transport: http(RPC) })

const amountWei = BigInt(FUND_AMOUNT) * BigInt(1e18)

async function main() {
  console.log(`\nWallet: ${account.address}`)

  const balance = await reader.readContract({ address: CLKCAT, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address] })
  console.log(`$CLKCAT balance: ${Number(balance) / 1e18}`)

  if (balance < amountWei) {
    console.error(`Not enough $CLKCAT — need ${FUND_AMOUNT}, have ${Number(balance) / 1e18}`)
    process.exit(1)
  }

  // 1. Approve
  console.log(`\n1. Approving ${FUND_AMOUNT} $CLKCAT...`)
  const approveTx = await wallet.writeContract({ address: CLKCAT, abi: ERC20_ABI, functionName: 'approve', args: [CONTRACT, amountWei] })
  console.log(`   ✅ approve tx: ${approveTx}`)
  await reader.waitForTransactionReceipt({ hash: approveTx })

  // 2. Start season
  console.log(`\n2. Starting Season 1...`)
  const seasonTx = await wallet.writeContract({ address: CONTRACT, abi: ABI, functionName: 'startSeason', args: [] })
  console.log(`   ✅ startSeason tx: ${seasonTx}`)
  const seasonReceipt = await reader.waitForTransactionReceipt({ hash: seasonTx, confirmations: 2 })
  console.log(`   Confirmed in block ${seasonReceipt.blockNumber}`)

  // 3. Fund rewards
  console.log(`\n3. Funding prize pool with ${FUND_AMOUNT} $CLKCAT...`)
  const fundTx = await wallet.writeContract({ address: CONTRACT, abi: ABI, functionName: 'fundRewards', args: [amountWei] })
  console.log(`   ✅ fundRewards tx: ${fundTx}`)
  const fundReceipt = await reader.waitForTransactionReceipt({ hash: fundTx, confirmations: 2 })
  console.log(`   Confirmed in block ${fundReceipt.blockNumber}`)

  // 4. Verify
  const active = await reader.readContract({ address: CONTRACT, abi: ABI, functionName: 'seasonActive' })
  const pool   = await reader.readContract({ address: CONTRACT, abi: ABI, functionName: 'prizePool' })
  console.log(`\n🏆 Season active: ${active}`)
  console.log(`🏆 Prize pool: ${Number(pool) / 1e18} $CLKCAT`)
  console.log(`\nSeason 1 is LIVE!\n`)
}

main().catch(console.error)
