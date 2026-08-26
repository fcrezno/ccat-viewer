/**
 * Sends reserved cats to giveaway winners.
 *
 *   node scripts/send.mjs 0xabc…                 send 1 to an address
 *   node scripts/send.mjs @crezno                resolve the handle, send 1
 *   node scripts/send.mjs @crezno 2              send 2
 *   node scripts/send.mjs --list winners.txt     one recipient per line
 *   node scripts/send.mjs @crezno --dry-run
 *
 * Sends the lowest-numbered cats the sender wallet holds, so the reserve is
 * spent in order and nothing has to be tracked by hand.
 *
 * Every send is appended to scripts/.sent.log before the next one starts, so a
 * crash or a rate-limit mid-run can't turn into a double-send — rerun and
 * already-sent recipients are skipped.
 *
 * Handles need NEYNAR_API_KEY in .env.local (it currently lives only in Vercel).
 * Addresses work without it.
 */
import { createWalletClient, createPublicClient, http, fallback, isAddress, getAddress } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { readFileSync, existsSync, appendFileSync } from 'fs'

const LOG = 'scripts/.sent.log'
const APP = 'https://ccat-viewer.vercel.app'

function cfg(key) {
  if (process.env[key]) return process.env[key]
  if (!existsSync('.env.local')) return undefined
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
    if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const ABI = [
  { name: 'ownerOf',     type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf',   type: 'function', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'safeTransferFrom', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], outputs: [] },
]

const args = process.argv.slice(2).filter(a => a !== '--dry-run')
const dry  = process.argv.includes('--dry-run')

const CONTRACT = getAddress(cfg('NEXT_PUBLIC_V2_ADDRESS') ?? '0x5C5b928f937F63656BE62d0A45f4Db756b79934B')
/** Private keys paste without the 0x prefix often enough to just tolerate it. */
function privKey(name) {
  const raw = cfg(name)?.trim()
  if (!raw) return undefined
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw
  return /^[0-9a-fA-F]{64}$/.test(hex) ? `0x${hex}` : undefined
}

const key = privKey('DEPLOYER_KEY')
if (!key) { console.error('❌ DEPLOYER_KEY missing or malformed in .env.local'); process.exit(1) }

const sender = privateKeyToAccount(key)
const pub = createPublicClient({
  chain: base,
  transport: fallback([http('https://base.llamarpc.com'), http('https://mainnet.base.org')]),
})

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function read(fn, a = [], tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { return await pub.readContract({ address: CONTRACT, abi: ABI, functionName: fn, args: a }) }
    catch (e) { if (i === tries - 1) throw e; await sleep(900 * (i + 1)) }
  }
}

/**
 * @handle → address, through the app's own /api/resolve.
 *
 * Goes via the deployed endpoint rather than calling Neynar directly, so the
 * Neynar key stays in Vercel and doesn't need to exist on this machine.
 */
async function resolve(handle) {
  const name = handle.replace(/^@/, '')
  const res  = await fetch(`${APP}/api/resolve?handle=${encodeURIComponent(name)}`)
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    console.error(`❌ @${name}: ${data?.error === 'not_found' ? 'no such Farcaster user' : 'lookup failed'}`)
    process.exit(1)
  }

  console.log(`  @${name} → ${data.address}${data.verified ? '' : '  ⚠️  custody address, not verified'}`)
  return getAddress(data.address)
}

// ── build the recipient list ────────────────────────────────────────────────
let recipients = []
if (args[0] === '--list') {
  if (!args[1] || !existsSync(args[1])) { console.error('❌ list file not found'); process.exit(1) }
  recipients = readFileSync(args[1], 'utf8').split(/\r?\n/)
    .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(l => ({ who: l, count: 1 }))
} else if (args[0]) {
  recipients = [{ who: args[0], count: Number(args[1]) || 1 }]
} else {
  console.error('Usage: node scripts/send.mjs <address|@handle> [count] | --list <file> [--dry-run]')
  process.exit(1)
}

// ── which cats do we hold ───────────────────────────────────────────────────
const supply = Number(await read('totalSupply'))
const held = []
for (let id = 1; id <= supply; id++) {
  const o = await read('ownerOf', [BigInt(id)])
  if (String(o).toLowerCase() === sender.address.toLowerCase()) held.push(id)
  await sleep(120)
}

const need = recipients.reduce((n, r) => n + r.count, 0)
console.log('contract   ', CONTRACT)
console.log('sender     ', sender.address)
console.log('holding    ', held.length, 'cats', held.length ? `(#${held[0]}…#${held[held.length - 1]})` : '')
console.log('sending    ', need, 'to', recipients.length, 'recipient(s)')

if (need > held.length) {
  console.error(`\n❌ need ${need} but only hold ${held.length}`)
  process.exit(1)
}

const sentAlready = existsSync(LOG) ? readFileSync(LOG, 'utf8') : ''

console.log('')
let cursor = 0
for (const r of recipients) {
  const to = isAddress(r.who) ? getAddress(r.who) : await resolve(r.who)

  if (sentAlready.includes(to.toLowerCase())) {
    console.log(`  skip ${r.who} — already in ${LOG}`)
    continue
  }

  for (let i = 0; i < r.count; i++) {
    const tokenId = held[cursor++]
    if (dry) { console.log(`  would send #${tokenId} → ${r.who}`); continue }

    const wallet = createWalletClient({ account: sender, chain: base, transport: http('https://mainnet.base.org') })
    try {
      const hash = await wallet.writeContract({
        address: CONTRACT, abi: ABI, functionName: 'safeTransferFrom',
        args: [sender.address, to, BigInt(tokenId)],
      })
      await pub.waitForTransactionReceipt({ hash })
      // Log before moving on — a crash after this point must not re-send.
      appendFileSync(LOG, `${new Date().toISOString()}\t${to.toLowerCase()}\t${tokenId}\t${r.who}\t${hash}\n`)
      console.log(`  ✅ #${tokenId} → ${r.who}`)
    } catch (e) {
      console.error(`  ❌ #${tokenId} → ${r.who}: ${String(e.shortMessage ?? e.message).split('\n')[0]}`)
      process.exit(1)
    }
    await sleep(250)
  }
}

if (dry) console.log('\n(dry run — nothing sent)')
else console.log(`\n✅ done — log at ${LOG}`)
