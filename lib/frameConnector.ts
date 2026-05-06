import { createConnector } from 'wagmi'
import sdk from '@farcaster/frame-sdk'

export function frameConnector() {
  return createConnector((config) => ({
    id: 'farcaster-frame',
    name: 'Farcaster Frame',
    type: 'farcaster-frame',

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async connect(): Promise<any> {
      const provider = await this.getProvider()
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as `0x${string}`[]
      return { accounts, chainId: 8453 }
    },

    async disconnect() {},

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async getAccounts(): Promise<any> {
      const provider = await this.getProvider()
      return provider.request({ method: 'eth_accounts' })
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
