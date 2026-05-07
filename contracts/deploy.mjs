import { createWalletClient, createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

// Compile ABI + bytecode via solc
const SOLC_VERSION = '0.8.20'
const SOURCE = readFileSync('./contracts/IdleAutoRun.sol', 'utf8')

console.log('Compiling contract...')
const solc = await import('solc')
const input = {
  language: 'Solidity',
  sources: { 'IdleAutoRun.sol': { content: SOURCE } },
  settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
}
const output = JSON.parse(solc.default.compile(JSON.stringify(input)))
if (output.errors?.some(e => e.severity === 'error')) {
  console.error('Compile errors:', output.errors)
  process.exit(1)
}
const contract = output.contracts['IdleAutoRun.sol']['IdleAutoRun']
const abi      = contract.abi
const bytecode = '0x' + contract.evm.bytecode.object

console.log('✅ Compiled. Bytecode size:', bytecode.length / 2, 'bytes')

// ── Config ───────────────────────────────────────────────────────────────────
const PRIVATE_KEY = process.env.DEPLOYER_KEY   // set this before running
const TREASURY    = process.env.TREASURY_ADDRESS ?? process.env.DEPLOYER_ADDRESS
const CLKCAT      = '0xD7800C338228a6eeb37cF74133732Fb6aE05915F'

if (!PRIVATE_KEY) {
  console.error('❌ Set DEPLOYER_KEY env var to your wallet private key')
  process.exit(1)
}

const account = privateKeyToAccount(PRIVATE_KEY)
console.log('Deploying from:', account.address)
console.log('Treasury:', TREASURY ?? account.address)

const wallet = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })
const pub    = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

console.log('Deploying to Base mainnet...')
const hash = await wallet.deployContract({
  abi,
  bytecode,
  args: [CLKCAT, TREASURY ?? account.address],
})

console.log('Tx hash:', hash)
console.log('Waiting for confirmation...')

const receipt = await pub.waitForTransactionReceipt({ hash })
console.log('✅ Deployed at:', receipt.contractAddress)
console.log('\nUpdate AUTO_RUN_ADDRESS in app/game/page.tsx with:', receipt.contractAddress)
