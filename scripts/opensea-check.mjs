/**
 * DOES OPENSEA ACTUALLY KNOW ABOUT A COLLECTION?
 *
 * JP, 2026-09-14: "last time I actually made a collection, I never got to see
 * the V2 Clanker Cats on OpenSea... people were complaining about that, so I
 * kinda wanna make that not an issue."
 *
 * A supported chain does NOT mean a collection is listed. V2 is the proof: Base
 * is fully supported, and V2's cats are invisible there while V1's are not.
 *
 * -- WHAT WAS ALREADY RULED OUT, FROM OUTSIDE, ON 2026-09-14 ----------------
 *
 *   Transfer events   Blockscout classifies the DEPLOYED V2 as ERC-721, so the
 *                     events are right — not just the source file.
 *   supportsInterface ERC721, ERC721Metadata, ERC2981, ERC165 all reported.
 *   tokenURI          .../v2/metadata/1 resolves, 200, valid JSON.
 *   images            /v2/images/1.png and /573.png both 200.
 *   farming           42 of the first 50 holders hold exactly one cat.
 *   a renamed slug    no collection under clanker-cats-v2, -v2-1 (the name the
 *                     broken contractURI would have produced), or four others.
 *
 * What CANNOT be checked from outside is whether OpenSea's own indexer has the
 * contract at all. That needs its API, and its API needs a key. That is what
 * this script is for.
 *
 * -- WHAT IT DOES --------------------------------------------------------------
 *
 *   1. Asks OpenSea about V1 first, as a CONTROL. V1 is listed; if this lookup
 *      fails for V1 too, the problem is the key or the network, not V2.
 *   2. Asks about the target contract. 404 means OpenSea has never indexed it.
 *   3. With --refresh, queues a metadata refresh for the first few tokens. That
 *      is OpenSea's documented way to make it re-read a token, and asking about
 *      a token it has not seen is the practical nudge toward indexing one.
 *
 * READ ONLY without --refresh. Nothing here touches the chain or signs anything.
 *
 * -- USAGE -------------------------------------------------------------------
 *
 *   OPENSEA_API_KEY=... node scripts/opensea-check.mjs                   # V2
 *   OPENSEA_API_KEY=... node scripts/opensea-check.mjs --refresh         # V2, and nudge
 *   OPENSEA_API_KEY=... node scripts/opensea-check.mjs robinhood 0x...   # V3 after deploy
 *
 * The key is read from the environment and never printed. Get one free from
 * OpenSea's developer portal — it is JP's account and JP's key.
 */

const KEY = process.env.OPENSEA_API_KEY
if (!KEY) {
  console.error('OPENSEA_API_KEY is not set. Get a free key from OpenSea, then:')
  console.error('  OPENSEA_API_KEY=... node scripts/opensea-check.mjs')
  process.exit(1)
}

const args = process.argv.slice(2)
const refresh = args.includes('--refresh')
const positional = args.filter(a => !a.startsWith('--'))

const V1 = { chain: 'base', address: '0xbE76Ce3cE0966fedA606fCF70884dae8FBaa7FCF', label: 'V1 (control, known listed)' }
const target = positional.length >= 2
  ? { chain: positional[0], address: positional[1], label: `${positional[0]} ${positional[1]}` }
  : { chain: 'base', address: '0x5C5b928f937F63656BE62d0A45f4Db756b79934B', label: 'V2' }

const API = 'https://api.opensea.io/api/v2'
const headers = { 'x-api-key': KEY, accept: 'application/json' }

async function contract({ chain, address }) {
  const r = await fetch(`${API}/chain/${chain}/contract/${address}`, { headers })
  const body = await r.json().catch(() => null)
  return { status: r.status, body }
}

function report(label, { status, body }) {
  if (status === 200) {
    console.log(`  ${label}: KNOWN — collection "${body?.collection}", ${body?.contract_standard}, name "${body?.name}"`)
    return true
  }
  if (status === 404) {
    console.log(`  ${label}: NOT KNOWN — OpenSea has never indexed this contract (404)`)
    return false
  }
  console.log(`  ${label}: HTTP ${status} ${JSON.stringify(body)?.slice(0, 160)}`)
  return null
}

/*
 * EXIT BY RETURNING, NOT BY process.exit().
 *
 * On Windows, calling process.exit() while fetch is still closing its socket
 * trips a libuv assertion ("UV_HANDLE_CLOSING") and the process dies with exit
 * 127 instead of the code it asked for — seen on the first test of this file.
 * Returning lets the event loop drain, so the exit code is the real answer.
 */
async function main() {
  console.log('\nAsking OpenSea…\n')

  const control = report(V1.label, await contract(V1))
  if (control !== true) {
    console.log('\nThe CONTROL failed, so nothing below can be trusted. Check the key and try again.')
    return 1
  }

  const known = report(target.label, await contract(target))

  if (known === true) {
    console.log('\nOpenSea knows this contract. If people still cannot see it, it is being HIDDEN rather')
    console.log('than missing — look it up by the collection slug above, and raise it with OpenSea support.')
    return 0
  }

  if (!refresh) {
    console.log('\nRun again with --refresh to queue metadata refreshes, which nudges OpenSea to read it.')
    return 2
  }

  /*
   * A HANDFUL, NOT ALL OF THEM. The point is to get the contract read, not to
   * hammer the API with 573 requests — and the API rate-limits.
   */
  console.log('\nQueuing refreshes for tokens 1–5…')
  for (let id = 1; id <= 5; id++) {
    const r = await fetch(`${API}/chain/${target.chain}/contract/${target.address}/nfts/${id}/refresh`, {
      method: 'POST', headers,
    })
    console.log(`  token ${id}: HTTP ${r.status}`)
    await new Promise(res => setTimeout(res, 1200))
  }
  console.log('\nRefreshes are processed asynchronously. Wait ~30 minutes, then run this again without --refresh.')
  console.log('Still NOT KNOWN after that means it needs OpenSea support — send them the contract address')
  console.log('and the ruled-out list at the top of this file.')
  return 2
}

process.exitCode = await main()
