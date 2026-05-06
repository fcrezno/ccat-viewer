'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, metaMask } from 'wagmi/connectors'
import { useState, useEffect } from 'react'
import { frameConnector } from '@/lib/frameConnector'

const config = createConfig({
  chains: [base],
  transports: { [base.id]: http() },
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
