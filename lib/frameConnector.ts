import { createConnector } from 'wagmi'
import sdk from '@farcaster/frame-sdk'

export function frameConnector() {
  return createConnector((config) => ({
    id: 'farcaster-frame',
    name: 'Farcaster Frame',
    type: 'farcaster-frame',

    async connect() {
      const provider = await this.getProvider()
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as `0x${string}`[]
      return { accounts, chainId: 8453 }
    },

    async disconnect() {},

    async getAccounts() {
      const provider = await this.getProvider()
      return provider.request({ method: 'eth_accounts' }) as Promise<`0x${string}`[]>
    },

    async getChainId() { return 8453 },

    async getProvider() {
      return sdk.wallet.ethProvider as any
    },

    async isAuthorized() {
      try {
        const accounts = await this.getAccounts()
        return accounts.length > 0
      } catch { return false }
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }))
}
