'use client'

import { useEffect, useState } from 'react'
import { useConnect } from 'wagmi'

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
  return named.length ? named : web
}
