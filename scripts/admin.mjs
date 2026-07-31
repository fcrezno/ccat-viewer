/**
 * Owner-only operations on the deployed ClankerCatsV2 contract.
 *
 *   node scripts/admin.mjs status
 *   node scripts/admin.mjs open                  setMintOpen(true)
 *   node scripts/admin.mjs close                 setMintOpen(false)
 *   node scripts/admin.mjs set-signer <address>
 *   node scripts/admin.mjs transfer-ownership <address>
 *   node scripts/admin.mjs reveal                setBaseURI to the real metadata
 *   node scripts/admin.mjs set-base-uri <url>
 *
 * Reads DEPLOYER_KEY and NEXT_PUBLIC_V2_ADDRESS from the environment, falling
 * back to .env.local. Every write confirms the caller is the current owner and
 * re-reads the state afterwards, so a silent no-op can't pass as success.
 */
import { createWalletClient, createPublicClient, http, fallback, isAddress, getAddress } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync, existsSync } from 'fs'

function cfg(key) {
  if (process.env[key]) return process.env[key]
  if (!existsSync('.env.local')) return undefined
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
    if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const METADATA_URI = 'https://ccat-viewer.vercel.app/v2/metadata/'

const ABI = [
  { name: 'owner',       type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'signer',      type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'mintOpen',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool'    }] },
  { name: 'baseURI',     type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string'  }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'maxSupply',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'setMintOpen',       type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'open', type: 'bool' }],      outputs: [] },
  { name: 'setSigner',         type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 's',    type: 'address' }],   outputs: [] },
  { name: 'setBaseURI',        type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'uri',  type: 'string' }],    outputs: [] },
  { name: 'transferOwnership', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'o',    type: 'address' }],   outputs: [] },
]

const address = cfg('NEXT_PUBLIC_V2_ADDRESS')
const key     = cfg('DEPLOYER_KEY')
const [cmd, arg] = process.argv.slice(2)
const force = process.argv.includes('--force')

if (!address) { console.error('❌ NEXT_PUBLIC_V2_ADDRESS not set'); process.exit(1) }
if (!cmd)     { console.error('Usage: node scripts/admin.mjs <status|open|close|set-signer|transfer-ownership|reveal|set-base-uri>'); process.exit(1) }

const CONTRACT = getAddress(address)
const pub = createPublicClient({
  chain: base,
  transport: fallback([http('https://base.llamarpc.com'), http('https://mainnet.base.org')]),
})

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Public Base RPCs throttle aggressively; back off and retry rather than die. */
async function read(fn, args = [], tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      return await pub.readContract({ address: CONTRACT, abi: ABI, functionName: fn, args })
    } catch (e) {
      const rateLimited = /rate limit|429|timeout/i.test(String(e.shortMessage ?? e.message))
      if (!rateLimited || i === tries - 1) throw e
      await sleep(1000 * (i + 1))
    }
  }
}

async function state() {
  const out = {}
  for (const fn of ['owner', 'signer', 'mintOpen', 'baseURI', 'totalSupply', 'maxSupply']) {
    out[fn] = await read(fn)
    await sleep(700)
  }
  return out
}

const s = await state()

console.log('contract   ', CONTRACT)
console.log('owner      ', s.owner)
console.log('signer     ', s.signer)
console.log('mintOpen   ', s.mintOpen)
console.log('baseURI    ', s.baseURI)
console.log('supply     ', `${s.totalSupply} / ${s.maxSupply}`)

if (cmd === 'status') process.exit(0)

// ── writes ──────────────────────────────────────────────────────────────────
if (!key) { console.error('\n❌ DEPLOYER_KEY not set — needed to sign'); process.exit(1) }

const account = privateKeyToAccount(key)
if (account.address.toLowerCase() !== s.owner.toLowerCase()) {
  console.error(`\n❌ ${account.address} is not the owner (${s.owner}) — this call would revert.`)
  process.exit(1)
}

let fn, args, describe
switch (cmd) {
  case 'open':
    if (s.mintOpen) { console.log('\nAlready open — nothing to do.'); process.exit(0) }
    fn = 'setMintOpen'; args = [true]; describe = 'OPEN the mint — anyone with a Farcaster account can mint'
    break
  case 'close':
    fn = 'setMintOpen'; args = [false]; describe = 'close the mint'
    break
  case 'set-signer':
    if (!isAddress(arg)) { console.error('\n❌ set-signer needs a valid address'); process.exit(1) }
    fn = 'setSigner'; args = [getAddress(arg)]; describe = `set the voucher signer to ${arg}`
    break
  case 'transfer-ownership':
    if (!isAddress(arg)) { console.error('\n❌ transfer-ownership needs a valid address'); process.exit(1) }
    if (/^0x0+$/.test(arg)) { console.error('\n❌ refusing to transfer to the zero address'); process.exit(1) }
    fn = 'transferOwnership'; args = [getAddress(arg)]
    describe = `hand ownership to ${getAddress(arg)} — you will no longer be able to run these commands with this key`
    break
  case 'reveal':
  case 'set-base-uri': {
    const uri = cmd === 'reveal' ? METADATA_URI : arg
    if (!uri) { console.error('\n❌ set-base-uri needs a URL'); process.exit(1) }
    if (!uri.endsWith('/')) { console.error('\n❌ base URI must end with a slash'); process.exit(1) }
    // Revealing while the mint is open exposes which ids are Mystery, and ids
    // are handed out in mint order — so they can be timed and sniped.
    if (s.mintOpen && uri === METADATA_URI && !force) {
      console.error('\n❌ mint is still open — revealing now lets the Mystery ids be sniped.')
      console.error('   Close the mint first, or pass --force.')
      process.exit(1)
    }
    fn = 'setBaseURI'; args = [uri]; describe = `set baseURI to ${uri}`
    break
  }
  default:
    console.error(`\n❌ unknown command: ${cmd}`); process.exit(1)
}

console.log(`\nAbout to ${describe}`)
console.log('from       ', account.address)

const wallet = createWalletClient({ account, chain: base, transport: http('https://mainnet.base.org') })
const hash = await wallet.writeContract({ address: CONTRACT, abi: ABI, functionName: fn, args })
console.log('tx         ', hash)

const receipt = await pub.waitForTransactionReceipt({ hash })
console.log('status     ', receipt.status)

await sleep(500)
const after = await state()
console.log('\nafter:')
console.log('  owner    ', after.owner)
console.log('  signer   ', after.signer)
console.log('  mintOpen ', after.mintOpen)
console.log('  baseURI  ', after.baseURI)
