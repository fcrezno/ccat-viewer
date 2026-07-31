/**
 * Mints a reserve to the creator, before the public mint is announced.
 *
 *   node scripts/reserve.mjs 55            mint 55 to the sender wallet
 *   node scripts/reserve.mjs 55 --dry-run  show the plan, send nothing
 *
 * How it works, and the honest version of why it's possible:
 *
 * The contract has no owner-mint function — mint() is the only path, and it
 * gates on `fidMinted[fid]`, not on whether the fid is a real Farcaster account.
 * Only the backend checks that, via Quick Auth. So the signer key can authorise
 * a mint for any fid value. That is inherent to the design: anyone holding the
 * signer key could mint the whole supply. Keep it where you keep it.
 *
 * Reserved mints therefore use a sentinel fid range far above any real Farcaster
 * id (RESERVE_FID_BASE). Two consequences worth having:
 *   - they can never collide with a genuine account's one-per-fid slot
 *   - the Minted event logs the fid, so anyone auditing the chain can see
 *     exactly which tokens were reserved and which were publicly minted
 *
 * Reserved cats come out of the 1111. Minting 55 leaves 1056 for the public.
 *
 * Needs MINT_SIGNER_KEY (signs the vouchers) and DEPLOYER_KEY (sends the txs and
 * receives the cats — mint() credits msg.sender). Both read from .env.local.
 */
import { createWalletClient, createPublicClient, http, fallback, getAddress } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync, existsSync } from 'fs'

const RESERVE_FID_BASE = 900_000_000n   // far above any real Farcaster id
const TTL              = 60 * 60        // voucher lifetime, seconds

function cfg(key) {
  if (process.env[key]) return process.env[key]
  if (!existsSync('.env.local')) return undefined
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
    if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const ABI = [
  { name: 'mint', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'fid', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'signature', type: 'bytes' }],
    outputs: [{ type: 'uint256' }] },
  { name: 'mintOpen',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool'    }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'maxSupply',   type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'signer',      type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'fidMinted',   type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
]

const count  = Number(process.argv[2])
const dry    = process.argv.includes('--dry-run')
const CONTRACT = getAddress(cfg('NEXT_PUBLIC_V2_ADDRESS') ?? '')

if (!Number.isInteger(count) || count < 1 || count > 200) {
  console.error('Usage: node scripts/reserve.mjs <count 1-200> [--dry-run]')
  process.exit(1)
}

const signerKey = cfg('MINT_SIGNER_KEY') ?? cfg('DEPLOYER_KEY')
const senderKey = cfg('DEPLOYER_KEY')
if (!signerKey || !senderKey) {
  console.error('❌ need MINT_SIGNER_KEY and DEPLOYER_KEY in .env.local')
  process.exit(1)
}

const signerAcct = privateKeyToAccount(signerKey)
const sender     = privateKeyToAccount(senderKey)

const pub = createPublicClient({
  chain: base,
  transport: fallback([http('https://base.llamarpc.com'), http('https://mainnet.base.org')]),
})

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function read(fn, args = [], tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { return await pub.readContract({ address: CONTRACT, abi: ABI, functionName: fn, args }) }
    catch (e) {
      if (i === tries - 1) throw e
      await sleep(900 * (i + 1))
    }
  }
}

const onChainSigner = await read('signer')
const open   = await read('mintOpen')
const supply = await read('totalSupply')
const max    = await read('maxSupply')

console.log('contract   ', CONTRACT)
console.log('signer     ', onChainSigner)
console.log('sender     ', sender.address, '(receives the cats)')
console.log('supply     ', `${supply} / ${max}`)
console.log('mintOpen   ', open)
console.log('reserving  ', count, `→ leaves ${Number(max) - Number(supply) - count} for the public`)

if (signerAcct.address.toLowerCase() !== String(onChainSigner).toLowerCase()) {
  console.error(`\n❌ MINT_SIGNER_KEY is ${signerAcct.address} but the contract expects ${onChainSigner}.`)
  console.error('   Every voucher would be rejected.')
  process.exit(1)
}
if (!open) {
  console.error('\n❌ mint is closed — mint() reverts. Run: node scripts/admin.mjs open')
  process.exit(1)
}
if (Number(supply) + count > Number(max)) {
  console.error('\n❌ not enough supply left')
  process.exit(1)
}

// Find `count` unused sentinel fids.
const fids = []
for (let i = 0n; fids.length < count; i++) {
  const fid = RESERVE_FID_BASE + i
  if (!(await read('fidMinted', [fid]))) fids.push(fid)
  await sleep(120)
}
console.log('fid range  ', `${fids[0]} … ${fids[fids.length - 1]}`)

if (dry) {
  console.log('\n(dry run — nothing sent)')
  process.exit(0)
}

const wallet = createWalletClient({ account: sender, chain: base, transport: http('https://mainnet.base.org') })
const deadline = BigInt(Math.floor(Date.now() / 1000) + TTL)
let minted = 0

console.log('')
for (const fid of fids) {
  const signature = await signerAcct.signTypedData({
    domain: { name: 'ClankerCatsV2', version: '1', chainId: base.id, verifyingContract: CONTRACT },
    types: { Mint: [{ name: 'to', type: 'address' }, { name: 'fid', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
    primaryType: 'Mint',
    message: { to: sender.address, fid, deadline },
  })

  try {
    const hash = await wallet.writeContract({ address: CONTRACT, abi: ABI, functionName: 'mint', args: [fid, deadline, signature] })
    await pub.waitForTransactionReceipt({ hash })
    minted++
    if (minted % 5 === 0 || minted === count) console.log(`  minted ${minted}/${count}`)
  } catch (e) {
    console.error(`  ❌ fid ${fid}: ${String(e.shortMessage ?? e.message).split('\n')[0]}`)
    break
  }
  await sleep(250)
}

const after = await read('totalSupply')
console.log(`\n✅ reserved ${minted} — supply now ${after} / ${max}`)
