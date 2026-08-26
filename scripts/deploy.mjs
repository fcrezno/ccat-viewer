import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { readFileSync } from 'fs'
import solc from 'solc'

// ── CONFIG ────────────────────────────────────────────────
const PRIVATE_KEY = '0x1a3e1a2cfb108833a627aa7a7edab7d33f467be7860f235743bd424c359627e0'
const CLKCAT      = '0x84a5637ccac19250156e582c5bf7c01eee151b07'
const RPC         = 'https://mainnet.base.org'
// ─────────────────────────────────────────────────────────

// Compile
console.log('Compiling contract...')
const source = readFileSync('contracts/IdleClankPool.sol', 'utf8')
const input  = JSON.stringify({
  language: 'Solidity',
  sources: { 'IdleClankPool.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
})
const output   = JSON.parse(solc.compile(input))
const contract = output.contracts['IdleClankPool.sol']['IdleClankPool']
if (!contract) { console.error(output.errors); process.exit(1) }
const abi = contract.abi
const bin = contract.evm.bytecode.object

const account = privateKeyToAccount(PRIVATE_KEY)
const wallet  = createWalletClient({ account, chain: base, transport: http(RPC) })
const reader  = createPublicClient({ chain: base, transport: http(RPC) })

async function main() {
  console.log(`\nDeployer: ${account.address}`)

  const hash = await wallet.deployContract({
    abi,
    bytecode: `0x${bin}`,
    args: [CLKCAT],
  })

  console.log(`Deploy tx: ${hash}`)
  console.log('Waiting for confirmation...')

  const receipt = await reader.waitForTransactionReceipt({ hash })
  console.log(`\n✅ Contract deployed at: ${receipt.contractAddress}`)
  console.log(`\nSave this address — paste it into app/game/page.tsx as AUTO_RUN_ADDRESS`)
}

main().catch(console.error)
