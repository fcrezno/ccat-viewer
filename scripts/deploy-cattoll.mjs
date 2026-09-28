/**
 * DEPLOY THE TOLL — where BUN goes when somebody buys a cat.
 *
 * JP, 2026-09-21: "30 goes toward agents; 30% to me and the rest is burned",
 * then "there are 3 agents". So: 10 / 10 / 10 / 30 / burn the rest.
 *
 * DRY RUN BY DEFAULT. Nothing is sent without --send.
 *
 *   node scripts/deploy-cattoll.mjs            # show what would happen
 *   node scripts/deploy-cattoll.mjs --send     # actually deploy
 *
 * Needed in .env.local (or the environment):
 *
 *   TOLL_AGENT_1 / _2 / _3   the three agent wallets, 10% each
 *   TOLL_CREATOR             JP's wallet, 30%
 *   BUN_TOKEN_ADDRESS        already pinned and verified on chain
 *   DEPLOYER_KEY             only for --send. DELETE IT AFTERWARDS.
 *
 * The addresses are CONSTRUCTOR ARGUMENTS and every one is immutable. There is
 * no setter and no owner, so a wrong address cannot be corrected — it can only
 * be abandoned and redeployed. That is why this script checks them properly
 * instead of trusting what is in a file.
 */
import { createWalletClient, createPublicClient, http, isAddress, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync, existsSync } from 'fs'
import solc from 'solc'

const RH = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' } },
}

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

const BUN     = cfg('BUN_TOKEN_ADDRESS')
const AGENT_1 = cfg('TOLL_AGENT_1')
const AGENT_2 = cfg('TOLL_AGENT_2')
const AGENT_3 = cfg('TOLL_AGENT_3')
const CREATOR = cfg('TOLL_CREATOR')
const KEY     = cfg('DEPLOYER_KEY')

const fields = {
  BUN_TOKEN_ADDRESS: BUN,
  TOLL_AGENT_1: AGENT_1,
  TOLL_AGENT_2: AGENT_2,
  TOLL_AGENT_3: AGENT_3,
  TOLL_CREATOR: CREATOR,
}
let bad = false
for (const [name, value] of Object.entries(fields)) {
  if (!value) { console.error('Set ' + name); bad = true }
  else if (!isAddress(value)) { console.error(name + ' is not an address: ' + value); bad = true }
}
if (bad) process.exit(1)
if (SEND && !KEY) { console.error('Set DEPLOYER_KEY to send'); process.exit(1) }

const a1 = getAddress(AGENT_1), a2 = getAddress(AGENT_2), a3 = getAddress(AGENT_3)
const cr = getAddress(CREATOR), bn = getAddress(BUN)

/*
 * THREE AGENTS MUST BE THREE ADDRESSES.
 *
 * The contract refuses duplicates too, but failing here costs nothing while
 * failing there costs a deploy. The same check twice is cheap; a toll paying
 * somebody 20% forever because two lines were pasted the same is not.
 */
if (a1 === a2 || a1 === a3 || a2 === a3) {
  console.error('Two of the agent addresses are the same. That pays one of them twice.')
  process.exit(1)
}
if ([a1, a2, a3].includes(cr)) {
  console.error('WARNING: the creator is also an agent, so that wallet takes 40%, not 30%.')
  console.error('If that is deliberate, ignore this. It is printed because it cannot be undone.')
}

// ── the token is checked, not assumed ────────────────────────────────────────
const pub = createPublicClient({ chain: RH, transport: http(RH.rpcUrls.default.http[0]) })

const code = await pub.getCode({ address: bn })
if (!code || code === '0x') {
  console.error('No contract at BUN_TOKEN_ADDRESS ' + bn + ' on chain 4663.')
  process.exit(1)
}

const erc20 = [
  { name: 'symbol',   type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'string' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view',       inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'burn',     type: 'function', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
]
const symbol   = await pub.readContract({ address: bn, abi: erc20, functionName: 'symbol' })
const decimals = await pub.readContract({ address: bn, abi: erc20, functionName: 'decimals' })

/*
 * settle() ENDS IN A BURN, so a token without a working burn() would strand 40%
 * of every payment in this contract forever. Simulated from an address that
 * holds BUN, because eth_call defaults the sender to 0x0 and OpenZeppelin
 * rejects a burn by the zero address — a false failure that already fooled me
 * once during this build.
 */
const RICH = '0x8366a39cc670b4001a1121b8f6a443a643e40951'
let burnable = true
try {
  await pub.simulateContract({ address: bn, abi: erc20, functionName: 'burn', args: [1n], account: RICH })
} catch {
  burnable = false
}

console.log('Compiling CatToll…')
const output = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { 'CatToll.sol': { content: readFileSync('./contracts/CatToll.sol', 'utf8') } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
  },
})))
const errors = (output.errors ?? []).filter(e => e.severity === 'error')
if (errors.length) { errors.forEach(e => console.error(e.formattedMessage)); process.exit(1) }

const contract = output.contracts['CatToll.sol']['CatToll']
const bytecode = '0x' + contract.evm.bytecode.object
const account  = KEY ? privateKeyToAccount(KEY) : null

console.log('Compiled —', bytecode.length / 2, 'bytes\n')
console.log('  chain     Robinhood Chain (4663)')
console.log('  deployer ', account?.address ?? '(DEPLOYER_KEY not set — dry run only)')
console.log('  token    ', bn + '  ' + symbol + ', ' + decimals + ' decimals, burn() ' + (burnable ? 'works' : 'FAILED TO SIMULATE'))
console.log('  agent 1  ', a1, ' 10%')
console.log('  agent 2  ', a2, ' 10%')
console.log('  agent 3  ', a3, ' 10%')
console.log('  creator  ', cr, ' 30%')
console.log('  burned          the remaining 40%, plus all rounding dust')

if (!burnable) {
  console.error('\nRefusing: burn() could not be simulated, and settle() ends in a burn.')
  console.error('40% of every payment would be stuck in the toll with no way out.')
  process.exit(1)
}

if (!SEND) {
  console.log('\n  DRY RUN. Nothing was sent.\n')
  console.log('  Every address above is IMMUTABLE once deployed. Read them again,')
  console.log('  then re-run with --send.\n')
  process.exit(0)
}

const wallet = createWalletClient({ account, chain: RH, transport: http(RH.rpcUrls.default.http[0]) })
console.log('\nDeploying CatToll…')
const hash = await wallet.deployContract({ abi: contract.abi, bytecode, args: [bn, a1, a2, a3, cr] })
console.log('Tx hash:', hash)

const receipt = await pub.waitForTransactionReceipt({ hash })
console.log('Deployed at:', receipt.contractAddress)

console.log('\nNext:')
console.log('  1. .env.local AND Vercel:')
console.log('       BUN_TOLL_ADDRESS=' + receipt.contractAddress)
console.log('       BUN_BURN_AMOUNT=<whole BUN per cat — the path stays OFF while this is 0>')
console.log('  2. Players pay with an ordinary transfer to that address. No approve.')
console.log('  3. settle() is callable by ANYONE, whenever. Nothing expires while it waits.')
console.log('  4. Delete DEPLOYER_KEY from .env.local.')
console.log('  5. ' + RH.blockExplorers.default.url + '/address/' + receipt.contractAddress)
