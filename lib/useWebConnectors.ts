'use client'

import { useEffect, useState } from 'react'
import { useConfig, useConnect, type Connector } from 'wagmi'
import { reconnect } from 'wagmi/actions'

/**
 * THE WALLET BUTTONS FOR A WEB PAGE — one list, used everywhere a page offers them.
 *
 * ── DRAWN ONLY IN THE BROWSER ────────────────────────────────────────────────
 *
 * Wallet extensions announce themselves after the page loads (EIP-6963): Rabby,
 * Phantom and MetaMask each add a connector the server never saw. So the server
 * drew three buttons, the browser five, and React threw error #418 (hydration
 * mismatch) and the buttons went dead — found live on /mint/v3, 2026-09-28.
 * Returning nothing until mount makes the server and the first browser render
 * agree; the real list appears one frame later.
 *
 * ── WHAT IS LEFT OUT ─────────────────────────────────────────────────────────
 *
 *   farcaster-frame  works only inside Farcaster, where pages connect it on
 *                    their own; on the web it did nothing when clicked.
 *   injected         the generic "whatever owns window.ethereum" button. It
 *                    duplicates a named wallet, so it is only offered when the
 *                    browser announced none (an older wallet without EIP-6963).
 */
export function useWebConnectors() {
  const { connectors } = useConnect()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return []

  const web   = connectors.filter(c => c.id !== 'farcaster-frame')
  const named = web.filter(c => c.id !== 'injected')
  if (!named.length) return web
  /*
   * A METAMASK THAT DID NOT ANNOUNCE ITSELF (a holder's Chrome, 2026-10-30): no EIP-6963
   * button, yet window.ethereum answers as MetaMask. Offer the generic button too, so
   * there is still something to click besides a download page.
   */
  const eth = (globalThis as { ethereum?: { isMetaMask?: boolean } }).ethereum
  const hasMM = named.some(c => /metamask/i.test(c.name))
  const generic = web.find(c => c.id === 'injected')
  return !hasMM && eth?.isMetaMask && generic ? [...named, generic] : named
}

/**
 * CONNECT WITHOUT THE EXTRA "CHOOSE ACCOUNTS" WINDOW WHEN THE WALLET ALREADY TRUSTS US.
 *
 * wagmi's connect() always asks for `wallet_requestPermissions` first. MetaMask next to
 * Rabby and Phantom never opened that window, so the click hung with nothing on screen
 * (JP and a holder, 2026-10-30). If the wallet already lists accounts for this site, a
 * reconnect takes them with no window; only a first-time connect still asks.
 */
export function useConnectWallet() {
  const config = useConfig()
  const { connect } = useConnect()
  return async (connector: Connector) => {
    try {
      const provider = await connector.getProvider() as { request?: (a: { method: string }) => Promise<unknown> } | undefined
      const accounts = await provider?.request?.({ method: 'eth_accounts' })
      if (Array.isArray(accounts) && accounts.length) {
        const done = await reconnect(config, { connectors: [connector] })
        if (done.length) return
      }
    } catch { /* fall through to the normal connect */ }
    connect({ connector })
  }
}
