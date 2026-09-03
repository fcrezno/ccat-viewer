'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, metaMask } from 'wagmi/connectors'
import { useState, useEffect } from 'react'
import { frameConnector } from '@/lib/frameConnector'
import { robinhood } from '@/lib/chains'

/*
 * BASE STAYS FIRST, and that is not cosmetic.
 *
 * wagmi treats the first entry as the default a connector lands on. V1, V2, the
 * mint and the idle game's $CLKCAT are all on Base, so a wallet that connects
 * straight onto Robinhood Chain would find nothing it recognises. Adding a chain
 * here only makes it AVAILABLE — the app still has to ask for the switch when a
 * V3 cat is the thing being read or minted.
 */
const config = createConfig({
  chains: [base, robinhood],
  transports: {
    [base.id]: http(),
    [robinhood.id]: http(),
  },
  connectors: [frameConnector(), metaMask(), injected()],
})

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
