'use client'

import { useEffect, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'

/**
 * WHICH WALLET IS CONNECTED, ON EVERY PAGE — the chip other web3 apps show
 * (JP, 2026-10-30: "show that you are connected to your wallet like other web3 apps").
 * Bottom-right so it never sits on a page's own header buttons. Click the address to
 * copy it; DISCONNECT lets somebody switch wallets without digging in the extension.
 *
 * Browser only: wagmi reconnects after load, so the server would draw nothing and
 * the browser a chip, and React would throw the page away (see lib/useWebConnectors).
 */
export function WalletChip() {
  const { address, isConnected, chain, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const [mounted, setMounted] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted || !isConnected || !address) return null

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  const copy = () => {
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }

  return (
    <div style={s.chip} aria-label={`Connected: ${address}`}>
      <span style={s.dot} />
      <button type="button" className="plain" style={s.addr} onClick={copy} title={`${address} — click to copy`}>
        {copied ? 'COPIED' : short}
      </button>
      <span style={s.meta}>{connector?.name ?? 'wallet'} · {chain?.name ?? 'unknown chain'}</span>
      <button type="button" className="plain" style={s.off} onClick={() => disconnect()} title="Disconnect this wallet">
        DISCONNECT
      </button>
    </div>
  )
}

const bevel = 'inset -1px -1px 0 0 #0a0a0a, inset 1px 1px 0 0 #ffffff, inset -2px -2px 0 0 #808080, inset 2px 2px 0 0 #dfdfdf'

const s: Record<string, React.CSSProperties> = {
  chip: {
    position: 'fixed', right: 12, bottom: 12, zIndex: 50,
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box',
    padding: '6px 8px', background: '#c0c0c0', color: '#000', boxShadow: bevel,
    fontFamily: 'var(--font-game)', fontSize: 14,
  },
  dot:  { width: 9, height: 9, borderRadius: '50%', background: '#1fbf3a', boxShadow: '0 0 4px #1fbf3a' },
  addr: { background: 'none', border: 0, padding: 0, font: 'inherit', fontSize: 16, color: '#000', cursor: 'pointer' },
  meta: { color: '#404040', fontSize: 12 },
  off:  { background: '#c0c0c0', border: 0, padding: '3px 8px', font: 'inherit', fontSize: 12, color: '#000', cursor: 'pointer', boxShadow: bevel },
}
