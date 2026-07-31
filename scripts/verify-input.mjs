/**
 * Produces everything BaseScan needs to verify ClankerCatsV2.
 *
 *   node scripts/verify-input.mjs
 *
 * Writes verify/ with:
 *   standard-input.json      paste into BaseScan's "Standard-Json-Input" form
 *   constructor-args.txt     ABI-encoded constructor arguments, no 0x prefix
 *   settings.txt            compiler version and optimizer settings
 *
 * The compiler settings must match the deploy exactly or verification fails —
 * these are read from the same source and flags deploy-v2.mjs used, not typed
 * in again by hand.
 */
import solc from 'solc'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { encodeAbiParameters, parseAbiParameters } from 'viem'

const SOURCE_PATH = './contracts/ClankerCatsV2.sol'
const OUT_DIR     = 'verify'

// Must match deploy-v2.mjs exactly.
const OPTIMIZER = { enabled: true, runs: 200 }

// The values the live contract was actually deployed with.
const ARGS = {
  maxSupply:       1111n,
  signer:          '0x49Bf733dcC6aC167540C48B1183aFC49d1C833AD',
  baseURI:         'https://ccat-viewer.vercel.app/v2/placeholder/',
  contractURI:     'https://ccat-viewer.vercel.app/v2/metadata/1',
  royaltyReceiver: '0x934C80e3a3e9136eE3558950385B66Ac5e7D9bf7',
  royaltyBps:      800,
}

const source = readFileSync(SOURCE_PATH, 'utf8')

const input = {
  language: 'Solidity',
  sources: { 'ClankerCatsV2.sol': { content: source } },
  settings: {
    optimizer: OPTIMIZER,
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
  },
}

// Compile so we can confirm the settings reproduce the deployed bytecode.
const out = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (out.errors ?? []).filter(e => e.severity === 'error')
if (errors.length) {
  errors.forEach(e => console.error(e.formattedMessage))
  process.exit(1)
}

const compiled = out.contracts['ClankerCatsV2.sol']['ClankerCatsV2']
const version  = solc.version()

const constructorArgs = encodeAbiParameters(
  parseAbiParameters('uint256, address, string, string, address, uint96'),
  [ARGS.maxSupply, ARGS.signer, ARGS.baseURI, ARGS.contractURI, ARGS.royaltyReceiver, ARGS.royaltyBps],
).slice(2)

mkdirSync(OUT_DIR, { recursive: true })

// BaseScan wants the input without outputSelection noise; keep it minimal.
writeFileSync(`${OUT_DIR}/standard-input.json`, JSON.stringify({
  language: 'Solidity',
  sources: { 'ClankerCatsV2.sol': { content: source } },
  settings: { optimizer: OPTIMIZER, outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } },
}, null, 2))

writeFileSync(`${OUT_DIR}/constructor-args.txt`, constructorArgs)

writeFileSync(`${OUT_DIR}/settings.txt`,
`Contract      ClankerCatsV2
Address       0x5C5b928f937F63656BE62d0A45f4Db756b79934B
Chain         Base mainnet (8453)

Compiler      ${version}
Optimization  enabled, ${OPTIMIZER.runs} runs
License       MIT

Constructor arguments (already encoded, in verify/constructor-args.txt):
  maxSupply        ${ARGS.maxSupply}
  signer           ${ARGS.signer}
  baseURI          ${ARGS.baseURI}
  contractURI      ${ARGS.contractURI}
  royaltyReceiver  ${ARGS.royaltyReceiver}
  royaltyBps       ${ARGS.royaltyBps}

Note: baseURI here is the deploy-time value, not the current one. Verification
matches the constructor call in the original transaction, so it must stay the
placeholder even though setBaseURI has since pointed it at /v2/meta/.
`)

console.log(`compiler   ${version}`)
console.log(`bytecode   ${compiled.evm.bytecode.object.length / 2} bytes`)
console.log(`args       ${constructorArgs.length / 2} bytes encoded`)
console.log(`\n✅ wrote ${OUT_DIR}/`)
console.log(`
On BaseScan:
  1. basescan.org/address/0x5C5b928f937F63656BE62d0A45f4Db756b79934B#code
  2. Verify and Publish → Solidity (Standard-Json-Input)
  3. Compiler ${version.split('+')[0]}, License MIT
  4. Upload verify/standard-input.json
  5. Paste verify/constructor-args.txt into the constructor arguments field`)
