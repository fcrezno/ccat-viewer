/**
 * Tests ClankerCatsV3.burnBun on a LOCAL chain. Never touches a real network.
 *
 *   ~/.foundry/bin/anvil --port 8546        (in another terminal)
 *   node scripts/test-v3-bunburner.mjs
 *
 * Uses anvil's published default test keys and a stand-in BUN. Run it before
 * the real V3 deploy: the price, token and toll are immutable once deployed.
 */
import solc from 'solc'
import { readFileSync } from 'fs'
import { createWalletClient, createPublicClient, http, parseEventLogs } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'

const REPO = '.'
// anvil's published default test keys — no value anywhere
const K = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
]
const [deployer, signer, alice, bob] = K.map(k => privateKeyToAccount(k))
const chain = { ...foundry, rpcUrls: { default: { http: ['http://127.0.0.1:8546'] } } }
const pub = createPublicClient({ chain, transport: http() })
const w = a => createWalletClient({ account: a, chain, transport: http() })

const MOCK = `
pragma solidity ^0.8.20;
contract MockBUN {
  mapping(address=>uint256) public balanceOf;
  mapping(address=>mapping(address=>uint256)) public allowance;
  function decimals() external pure returns (uint8) { return 18; }
  function give(address to, uint256 v) external { balanceOf[to] += v; }
  function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
  function transferFrom(address f, address t, uint256 v) external returns (bool) {
    require(allowance[f][msg.sender] >= v, "allowance"); require(balanceOf[f] >= v, "balance");
    allowance[f][msg.sender] -= v; balanceOf[f] -= v; balanceOf[t] += v; return true;
  }
}`
const out = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { 'V3.sol': { content: readFileSync(`${REPO}/contracts/ClankerCatsV3.sol`, 'utf8') }, 'M.sol': { content: MOCK } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
})))
for (const e of out.errors ?? []) if (e.severity === 'error') { console.error(e.formattedMessage); process.exit(1) }
const V3c = out.contracts['V3.sol'].ClankerCatsV3, Mc = out.contracts['M.sol'].MockBUN

async function deploy(c, args = []) {
  const hash = await w(deployer).deployContract({ abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, args })
  return (await pub.waitForTransactionReceipt({ hash })).contractAddress
}
const send = async (acct, address, abi, functionName, args = []) => {
  const hash = await w(acct).writeContract({ address, abi, functionName, args })
  return pub.waitForTransactionReceipt({ hash })
}
const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args })
async function reverts(p, name) {
  try { await p; return `NO REVERT (expected ${name})` } catch (e) {
    const m = String(e.shortMessage || e.message)
    const full = m + " " + String(e.cause?.data?.errorName ?? "") + " " + String(e.cause?.cause?.data?.errorName ?? "") + " " + String(e.metaMessages ?? ""); return full.includes(name) ? `reverts ${name}` : `reverts, but not ${name}: ${full.replace(/s+/g," ").slice(0, 300)}`
  }
}
let fails = 0
const check = (label, ok, detail = "") => { if (ok !== true && typeof ok === "string") { detail = ok; ok = false } if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + label + (detail ? "  — " + detail : "")) }

const TOLL = '0x000000000000000000000000000000000000ba11'   // any address; the split contract is not under test here
const PRICE = 111n * 10n ** 18n
const bun = await deploy(Mc)
const v3  = await deploy(V3c, [1111n, signer.address, 'https://x/v3/cat/', 'https://x/v3/contract', deployer.address, 800, bun, TOLL, PRICE])

check('price, token and toll are what was deployed',
  (await read(v3, V3c.abi, 'bunBurnPrice')) === PRICE && (await read(v3, V3c.abi, 'bun')).toLowerCase() === bun.toLowerCase()
  && (await read(v3, V3c.abi, 'bunToll')).toLowerCase() === TOLL.toLowerCase())

// zero toll is refused at deploy
{ const hash = await w(deployer).deployContract({ abi: V3c.abi, bytecode: '0x' + V3c.evm.bytecode.object, args: [1111n, signer.address, 'a/', '', deployer.address, 800, bun, '0x0000000000000000000000000000000000000000', PRICE], gas: 3_000_000n }); const r = await pub.waitForTransactionReceipt({ hash }); check('constructor refuses a zero toll', r.status === 'reverted', 'deploy status ' + r.status) }

// mint one for alice with a real voucher
await send(deployer, v3, V3c.abi, 'setMintOpen', [true])
const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
const sig = await signer.signTypedData({
  domain: { name: 'ClankerCatsV3', version: '1', chainId: chain.id, verifyingContract: v3 },
  types: { Mint: [{ name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }] },
  primaryType: 'Mint', message: { to: alice.address, deadline },
})
const mr = await send(alice, v3, V3c.abi, 'mint', [deadline, sig])
const [minted] = parseEventLogs({ abi: V3c.abi, logs: mr.logs, eventName: 'Minted' })
const id = minted.args.tokenId
check('free mint works', id === 1n, `token #${id}`)
check('new cat is not a BunBurner', (await read(v3, V3c.abi, 'bunBurner', [id])) === false)

await send(deployer, bun, Mc.abi, 'give', [alice.address, 500n * 10n ** 18n])
await send(deployer, bun, Mc.abi, 'give', [bob.address, 500n * 10n ** 18n])

{ const r = await reverts(send(alice, v3, V3c.abi, 'burnBun', [id]), 'BunBurnFailed'); check('burn without approve fails', r === 'reverts BunBurnFailed', r) }
check('mark NOT set by the failed burn', (await read(v3, V3c.abi, 'bunBurner', [id])) === false)

await send(bob, bun, Mc.abi, 'approve', [v3, PRICE])
{ const r = await reverts(send(bob, v3, V3c.abi, 'burnBun', [id]), 'NotOwnerOrApproved'); check('someone else cannot burn through alice’s cat', r === 'reverts NotOwnerOrApproved', r) }

await send(alice, bun, Mc.abi, 'approve', [v3, PRICE])
const br = await send(alice, v3, V3c.abi, 'burnBun', [id])
const ev = parseEventLogs({ abi: V3c.abi, logs: br.logs })
check('burn succeeds after approve', br.status === 'success')
check('cat is now a BunBurner', (await read(v3, V3c.abi, 'bunBurner', [id])) === true)
check('exactly 111 BUN reached the toll', (await read(bun, Mc.abi, 'balanceOf', [TOLL])) === PRICE)
check('alice paid exactly 111', (await read(bun, Mc.abi, 'balanceOf', [alice.address])) === 389n * 10n ** 18n)
check('BunBurner event names cat, wallet and amount',
  ev.some(e => e.eventName === 'BunBurner' && e.args.tokenId === id && e.args.burner === alice.address && e.args.amount === PRICE))
check('MetadataUpdate (ERC-4906) emitted', ev.some(e => e.eventName === 'MetadataUpdate' && e.args._tokenId === id))

await send(alice, bun, Mc.abi, 'approve', [v3, PRICE])
{ const r = await reverts(send(alice, v3, V3c.abi, 'burnBun', [id]), 'AlreadyBunBurner'); check('second burn on the same cat is refused', r === 'reverts AlreadyBunBurner', r) }
check('no BUN taken by the refused second burn', (await read(bun, Mc.abi, 'balanceOf', [alice.address])) === 389n * 10n ** 18n)

{ const r = await reverts(send(alice, v3, V3c.abi, 'burnBun', [99n]), 'NonexistentToken'); check('burn through a cat that does not exist is refused', r === 'reverts NonexistentToken', r) }

// the mark travels with the cat
await send(alice, v3, V3c.abi, 'transferFrom', [alice.address, bob.address, id])
check('mark stays on the cat after a sale', (await read(v3, V3c.abi, 'bunBurner', [id])) === true)

check('supports ERC-4906 interface', (await read(v3, V3c.abi, 'supportsInterface', ['0x49064906'])) === true)

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
process.exit(fails ? 1 : 0)
