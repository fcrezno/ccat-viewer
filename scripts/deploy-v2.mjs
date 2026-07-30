/**
 * Deploy ClankerCatsV2 to Base mainnet.
 *
 *   DEPLOYER_KEY=0x…            wallet that deploys and owns the contract
 *   MINT_SIGNER_ADDRESS=0x…     address of the backend voucher signer
 *   BASE_URI=https://…/         metadata base, tokenId is appended (note trailing slash)
 *   CONTRACT_URI=https://…      collection-level metadata for OpenSea
 *   ROYALTY_RECEIVER=0x…        optional, defaults to deployer
 *   ROYALTY_BPS=800             optional, defaults to 800 (8%, same as V1)
 *   MAX_SUPPLY=1111             optional, defaults to 1111 (Ethereum's 11th birthday)
 *
 * Run from the repo root:  node scripts/deploy-v2.mjs
 */
import { createWalletClient, createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync } from 'fs'
import solc from 'solc'

const {
  DEPLOYER_KEY,
  MINT_SIGNER_ADDRESS,
  BASE_URI,
  CONTRACT_URI,
  ROYALTY_RECEIVER,
  ROYALTY_BPS = '800',
  MAX_SUPPLY  = '1111',
} = process.env

function require_(name, value) {
  if (!value) {
    console.error(`❌ Set ${name}`)
    process.exit(1)
  }
  return value
}

require_('DEPLOYER_KEY', DEPLOYER_KEY)
require_('MINT_SIGNER_ADDRESS', MINT_SIGNER_ADDRESS)
require_('BASE_URI', BASE_URI)

if (!BASE_URI.endsWith('/'))
  console.warn('⚠️  BASE_URI has no trailing slash — tokenURI will concatenate straight onto it.')

console.log('Compiling ClankerCatsV2…')
const source = readFileSync('./contracts/ClankerCatsV2.sol', 'utf8')
const input = {
  language: 'Solidity',
  sources: { 'ClankerCatsV2.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (output.errors ?? []).filter(e => e.severity === 'error')
if (errors.length) {
  errors.forEach(e => console.error(e.formattedMessage))
  process.exit(1)
}

const contract = output.contracts['ClankerCatsV2.sol']['ClankerCatsV2']
const abi      = contract.abi
const bytecode = '0x' + contract.evm.bytecode.object
console.log('✅ Compiled —', bytecode.length / 2, 'bytes')

const account  = privateKeyToAccount(DEPLOYER_KEY)
const receiver = ROYALTY_RECEIVER ?? account.address

console.log('\nDeployer: ', account.address)
console.log('Signer:   ', MINT_SIGNER_ADDRESS)
console.log('Supply:   ', MAX_SUPPLY)
console.log('Base URI: ', BASE_URI)
console.log('Royalty:  ', `${receiver} @ ${Number(ROYALTY_BPS) / 100}%`)

const wallet = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })
const pub    = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

console.log('\nDeploying to Base mainnet…')
const hash = await wallet.deployContract({
  abi,
  bytecode,
  args: [
    BigInt(MAX_SUPPLY),
    MINT_SIGNER_ADDRESS,
    BASE_URI,
    CONTRACT_URI ?? '',
    receiver,
    Number(ROYALTY_BPS),
  ],
})

console.log('Tx hash:', hash)
const receipt = await pub.waitForTransactionReceipt({ hash })
console.log('✅ Deployed at:', receipt.contractAddress)

console.log(`
Next steps:
  1. Add to .env.local and Vercel:
       NEXT_PUBLIC_V2_ADDRESS=${receipt.contractAddress}
       MINT_SIGNER_KEY=<private key for ${MINT_SIGNER_ADDRESS}>
  2. Add the V2 entry to COLLECTIONS in lib/collection.ts (and the frame app's copy).
  3. Mint stays closed until you call setMintOpen(true) — do that when you're ready to drop.
`)
