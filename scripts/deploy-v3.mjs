/**
 * Deploy ClankerCatsV3 to Robinhood Chain (4663).
 *
 * NOT RUN BY ANYONE BUT JP. This script sends a transaction from a key on disk;
 * it exists so the deploy is one command with the arguments already reasoned
 * about, not so somebody else can press it.
 *
 *   DEPLOYER_KEY=0x…            wallet that deploys and OWNS the contract
 *   MINT_SIGNER_ADDRESS=0x…     address of the backend voucher signer
 *   BASE_URI=https://…/         metadata base, tokenId is appended (trailing slash)
 *   CONTRACT_URI=https://…      optional, collection-level metadata
 *   ROYALTY_RECEIVER=0x…        optional, defaults to the deployer
 *   ROYALTY_BPS=800             optional, defaults to 800 (8%, same as V1 and V2)
 *   MAX_SUPPLY=1111             optional, defaults to 1111
 *
 *   node scripts/deploy-v3.mjs            dry run: compiles, prints, sends nothing
 *   node scripts/deploy-v3.mjs --send     actually deploys
 *
 * ── WHY --send EXISTS, AND V2 HAD NO SUCH THING ──────────────────────────────
 *
 * deploy-v2.mjs deploys the moment it is run. That was fine for a script written
 * the day it was used; this one is being written WEEKS BEFORE anybody has
 * decided whether to deploy at all, and a file whose whole job is to send an
 * irreversible transaction should not do it because somebody was reading it.
 *
 * The dry run does everything except the last step — compiles, checks every
 * argument, prints exactly what would be sent — so the thing that gets tested is
 * the thing that gets deployed.
 *
 * ── THE BASE_URI GUARD IS DIFFERENT FROM V2's ────────────────────────────────
 *
 * V2 refuses to deploy pointing at real metadata, because publishing all 1111
 * files while the mint is open lets anyone watch the supply counter and time a
 * transaction onto a Mystery cat.
 *
 * V3 has no Mystery, and more to the point its reveal is enforced by the ROUTE
 * rather than by the URL: /v3/cat/<id> asks the chain whether the token exists
 * and serves the placeholder if it does not. So pointing straight at it is safe
 * here, and the guard below checks the shape of the URL instead — the mistake
 * actually available on this collection is a missing trailing slash, which
 * silently produces "…/v3/cat1" for every token.
 */
import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync, existsSync } from 'fs'
import solc from 'solc'

/** Chain 4663, read from the live RPC rather than a docs page — see lib/chains.ts. */
const RH = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
}

/**
 * Read a setting from the environment, falling back to .env.local.
 * .env* is gitignored, so values can be pasted into a file instead of typed.
 * DELETE DEPLOYER_KEY from that file once you have deployed — a private key in
 * plaintext on disk is fine for one run, not forever.
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

const SEND = process.argv.includes('--send')

const DEPLOYER_KEY        = cfg('DEPLOYER_KEY')
const MINT_SIGNER_ADDRESS = cfg('MINT_SIGNER_ADDRESS')
const BASE_URI            = cfg('BASE_URI')
const CONTRACT_URI        = cfg('CONTRACT_URI')
const ROYALTY_RECEIVER    = cfg('ROYALTY_RECEIVER')
const ROYALTY_BPS         = cfg('ROYALTY_BPS') ?? '800'
const MAX_SUPPLY          = cfg('MAX_SUPPLY')  ?? '1111'

function need(name, value) {
  if (!value) { console.error(`Set ${name}`); process.exit(1) }
  return value
}

need('MINT_SIGNER_ADDRESS', MINT_SIGNER_ADDRESS)
need('BASE_URI', BASE_URI)
if (SEND) need('DEPLOYER_KEY', DEPLOYER_KEY)

if (!BASE_URI.endsWith('/')) {
  console.error('BASE_URI must end with a slash — tokenURI is BASE_URI + tokenId,')
  console.error(`so "${BASE_URI}" would produce "${BASE_URI}1" rather than "${BASE_URI}/1".`)
  process.exit(1)
}

console.log('Compiling ClankerCatsV3…')
const source = readFileSync('./contracts/ClankerCatsV3.sol', 'utf8')
const output = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { 'ClankerCatsV3.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
  },
})))

const errors = (output.errors ?? []).filter(e => e.severity === 'error')
if (errors.length) { errors.forEach(e => console.error(e.formattedMessage)); process.exit(1) }

const contract = output.contracts['ClankerCatsV3.sol']['ClankerCatsV3']
const bytecode = '0x' + contract.evm.bytecode.object
console.log('Compiled —', bytecode.length / 2, 'bytes')

const account  = DEPLOYER_KEY ? privateKeyToAccount(DEPLOYER_KEY) : null
const receiver = ROYALTY_RECEIVER ?? account?.address ?? '(deployer)'

const args = [
  BigInt(MAX_SUPPLY),
  MINT_SIGNER_ADDRESS,
  BASE_URI,
  CONTRACT_URI ?? '',
  receiver,
  Number(ROYALTY_BPS),
]

console.log('\n  chain     Robinhood Chain (4663)')
console.log('  deployer ', account?.address ?? '(DEPLOYER_KEY not set — dry run only)')
console.log('  signer   ', MINT_SIGNER_ADDRESS)
console.log('  supply   ', MAX_SUPPLY)
console.log('  baseURI  ', BASE_URI)
console.log('  royalty  ', `${receiver} @ ${Number(ROYALTY_BPS) / 100}%`)

if (!SEND) {
  console.log(`
  DRY RUN. Nothing was sent.

  Everything above is what would be deployed. Re-run with --send to do it,
  and read scripts/DEPLOY-V3.md first — the ordering matters.
`)
  process.exit(0)
}

const wallet = createWalletClient({ account, chain: RH, transport: http(RH.rpcUrls.default.http[0]) })
const pub    = createPublicClient({ chain: RH, transport: http(RH.rpcUrls.default.http[0]) })

console.log('\nDeploying to Robinhood Chain…')
const hash = await wallet.deployContract({ abi: contract.abi, bytecode, args })
console.log('Tx hash:', hash)

const receipt = await pub.waitForTransactionReceipt({ hash })
console.log('Deployed at:', receipt.contractAddress)

console.log(`
Next:
  1. .env.local AND Vercel:
       NEXT_PUBLIC_V3_ADDRESS=${receipt.contractAddress}
       MINT_SIGNER_KEY=<private key for ${MINT_SIGNER_ADDRESS}>
     COLLECTIONS picks V3 up automatically once that address is set — there is
     no code change to make.
  2. Mint is CLOSED until setMintOpen(true). Nothing can be minted before then.
  3. Delete DEPLOYER_KEY from .env.local.
  4. ${RH.blockExplorers.default.url}/address/${receipt.contractAddress}
`)
