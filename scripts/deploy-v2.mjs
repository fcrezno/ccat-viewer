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
import { readFileSync, existsSync } from 'fs'
import solc from 'solc'

/**
 * Read a setting from the environment, falling back to .env.local.
 * .env* is gitignored, so values can be pasted into a file instead of typed
 * into a terminal. Delete DEPLOYER_KEY from that file once you've deployed —
 * a private key sitting in plaintext on disk is fine for one run, not forever.
 */
function cfg(key) {
  if (process.env[key]) return process.env[key]
  if (!existsSync('.env.local')) return undefined
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
    if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '')
  }
  return undefined
}

const DEPLOYER_KEY        = cfg('DEPLOYER_KEY')
const MINT_SIGNER_ADDRESS = cfg('MINT_SIGNER_ADDRESS')
const BASE_URI            = cfg('BASE_URI')
const CONTRACT_URI        = cfg('CONTRACT_URI')
const ROYALTY_RECEIVER    = cfg('ROYALTY_RECEIVER')
const ROYALTY_BPS         = cfg('ROYALTY_BPS') ?? '800'
const MAX_SUPPLY          = cfg('MAX_SUPPLY')  ?? '1111'

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

if (!BASE_URI.endsWith('/')) {
  console.error('❌ BASE_URI must end with a slash — tokenURI is BASE_URI + tokenId,')
  console.error(`   so "${BASE_URI}" would produce "${BASE_URI}1" instead of "${BASE_URI}/1".`)
  process.exit(1)
}

// Deploying straight onto the real metadata exposes which token ids are Mystery,
// and ids are handed out in mint order — so they can be sniped. Refuse by default.
if (/\/v2\/metadata\/?$/.test(BASE_URI) && !process.argv.includes('--reveal-now')) {
  console.error('❌ BASE_URI points at the real metadata.')
  console.error('   Deploy with the placeholder instead:')
  console.error('     https://ccat-viewer.vercel.app/v2/placeholder/')
  console.error('   then setBaseURI to the metadata once the mint closes.')
  console.error('   (pass --reveal-now if you really mean to skip the delayed reveal)')
  process.exit(1)
}

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
