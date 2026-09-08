import { defineChain, createPublicClient, http, fallback, type Chain, type PublicClient } from 'viem'
import { base } from 'viem/chains'

/**
 * The chains a collection can live on.
 *
 * V1 and V2 are both on Base. V3 is the Robinhood Chain drop, which is why this
 * file exists at all — until now `base` was imported directly in four places and
 * a second chain had nowhere to go.
 *
 * ── ROBINHOOD CHAIN IS NOT IN VIEM ───────────────────────────────────────────
 *
 * viem 2.48.8 ships no definition for it (`hoodi` and `taikoHoodi` are unrelated
 * Ethereum testnets), so it is defined here. Every value below was read from the
 * live RPC rather than copied from a docs page:
 *
 *   eth_chainId   0x1237 = 4663
 *   multicall3    deployed at the canonical address, 7618 bytes of code
 *
 * The multicall3 entry matters more than it looks. `ownersOf` and `fetchOwnedIds`
 * batch through it, and viem silently falls back to one call per token without
 * it — which is the exact failure mode already documented in collection.ts,
 * where a rate-limited RPC returned an empty list that read as "owns no cats".
 */
export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    /*
     * The public endpoint is rate-limited and Robinhood's own docs say it is not
     * for production. It is the only free one, so it is what ships — but expect
     * to put a keyed provider in front of it before any real traffic, the same
     * way Base ended up with four RPCs in a fallback.
     */
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
})

export { base }

/**
 * One client per chain, made once.
 *
 * Building a client per call would drop viem's request de-duplication and its
 * multicall batching window, which is what keeps a 200-token owner scan to a
 * handful of requests instead of 200.
 */
/**
 * A KEYED ENDPOINT IN FRONT OF A PUBLIC ONE.
 *
 * Robinhood's public RPC is rate-limited and their own docs say it is not for
 * production. That was survivable while nothing depended on it; the V3 mint does
 * — /api/v3-voucher reads the chain before it will sign anything and FAILS
 * CLOSED, so a throttled read is a person who won three fights being told to try
 * again.
 *
 * Comma-separated, tried in order, and the public endpoint is appended LAST
 * rather than replaced. A keyed provider that lapses degrades to what shipped
 * before instead of taking the mint down with it.
 *
 *   ROBINHOOD_RPC_URL=https://key.provider.example,https://second.example
 *
 * Base keeps its hand-ordered list, which was ordered by what actually stayed up
 * under load rather than by reputation.
 */
function rpcsFor(envVar: string, fallbackUrl: string) {
  const keyed = (process.env[envVar] ?? '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean)
  return [...keyed, fallbackUrl].map(u => http(u))
}

const clients = new Map<number, PublicClient>()

export function clientForChain(chain: Chain): PublicClient {
  const had = clients.get(chain.id)
  if (had) return had

  const made = createPublicClient({
    chain,
    /*
     * Base keeps its hand-ordered fallback list — ordered by what actually stayed
     * up under load, not by reputation. Anything else gets the chain's own RPC.
     */
    transport: chain.id === base.id
      ? fallback([
          http('https://base-rpc.publicnode.com'),
          http('https://1rpc.io/base'),
          http('https://mainnet.base.org'),
          http('https://base.llamarpc.com'),
        ])
      : chain.id === robinhood.id
      ? fallback(rpcsFor('ROBINHOOD_RPC_URL', robinhood.rpcUrls.default.http[0]))
      : http(),
  }) as PublicClient

  clients.set(chain.id, made)
  return made
}
