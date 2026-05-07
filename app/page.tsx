'use client'

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useReadContract, useReadContracts } from 'wagmi'
import sdk from '@farcaster/miniapp-sdk'

const CCAT_COLLECTION = '0x7b429e994873A9f7b50484Ce6c80c25040C7Ee26' as `0x${string}`
const CCAT_DEXSCREENER = 'https://dexscreener.com/base/0x88b2debaed47d530ec3442bc28ce8073422180e6f2acdb6b1ff75cee12c9806f'

const COLLECTION_ABI = [
  { type: 'function', name: 'balanceOf',   inputs: [{ name: 'owner',   type: 'address' }],         outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'ownerOf',     inputs: [{ name: 'tokenId', type: 'uint256' }],         outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'tokenURI',    inputs: [{ name: 'tokenId', type: 'uint256' }],         outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [],                                              outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const

type CatMeta = { name: string; image: string; attributes: { trait_type: string; value: string }[] }

function decodeTokenURI(uri: string): CatMeta | null {
  try { return JSON.parse(atob(uri.split(',')[1])) }
  catch { return null }
}

function CatCard({ tokenId, selected, onClick }: { tokenId: bigint; selected: boolean; onClick: () => void }) {
  const { data: uri } = useReadContract({
    address: CCAT_COLLECTION, abi: COLLECTION_ABI, functionName: 'tokenURI', args: [tokenId],
  })
  const meta = uri ? decodeTokenURI(uri as string) : null

  return (
    <div onClick={onClick} style={{ ...s.card, borderColor: selected ? '#7c3aed' : '#1e1e2e', transform: selected ? 'scale(0.97)' : 'scale(1)', transition: 'all 0.15s ease' }}>
      {meta?.image
        ? <img src={meta.image} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
        : <div style={s.placeholder}><span style={{ fontSize: 24 }}>🐱</span></div>
      }
      <div style={s.cardLabel}>#{tokenId.toString()}</div>
    </div>
  )
}

function CatDetail({ tokenId, onBack }: { tokenId: bigint; onBack: () => void }) {
  const { data: uri } = useReadContract({
    address: CCAT_COLLECTION, abi: COLLECTION_ABI, functionName: 'tokenURI', args: [tokenId],
  })
  const meta = uri ? decodeTokenURI(uri as string) : null

  async function share() {
    try { await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=Check out my ClankerCat %23${tokenId} 🐱%0Amirage.garden`) }
    catch { window.open(`https://warpcast.com/~/compose?text=Check out my ClankerCat %23${tokenId}`, '_blank') }
  }

  async function viewOnExplorer() {
    try { await sdk.actions.openUrl(`https://basescan.org/token/${CCAT_COLLECTION}?a=${tokenId}`) }
    catch { window.open(`https://basescan.org/token/${CCAT_COLLECTION}?a=${tokenId}`, '_blank') }
  }

  return (
    <div style={s.detail}>
      <button style={s.back} onClick={onBack}>← Back to my CCats</button>
      <div style={s.detailCard}>
        {meta?.image
          ? <img src={meta.image} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
          : <div style={{ ...s.placeholder, aspectRatio: '1', borderRadius: 12 }}><span style={{ fontSize: 48 }}>🐱</span></div>
        }
      </div>
      <div style={s.detailName}>{meta?.name ?? `CCat #${tokenId}`}</div>
      <div style={{ fontSize: 12, color: '#555' }}>ClankerCat on Base</div>
      {meta?.attributes && meta.attributes.length > 0 && (
        <>
          <div style={s.sectionLabel}>Traits</div>
          <div style={s.traits}>
            {meta.attributes.map((a, i) => (
              <div key={i} style={s.trait}>
                <div style={s.traitKey}>{a.trait_type}</div>
                <div style={s.traitVal}>{a.value}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button style={s.shareBtn} onClick={share}>Cast this CCat 🐱</button>
        <button style={s.explorerBtn} onClick={viewOnExplorer}>View on Basescan</button>
      </div>
    </div>
  )
}

function EmptyState() {
  async function openDex() {
    try { await sdk.actions.openUrl(CCAT_DEXSCREENER) }
    catch { window.open(CCAT_DEXSCREENER, '_blank') }
  }
  return (
    <div style={s.emptyState}>
      <div style={s.heroCat}>🐱</div>
      <div style={s.emptyTitle}>No ClankerCats yet</div>
      <div style={s.emptySubtitle}>
        Hold $CCAT on Base to mint your cat.<br />
        Each CCat is unique — fully on-chain pixel art.
      </div>
      <button style={s.buyBtn} onClick={openDex}>Buy $CCAT →</button>
      <div style={s.emptyHint}>Get $CCAT, then mint at clankercats.com</div>
    </div>
  )
}

export default function Home() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const [ready, setReady]        = useState(false)
  const [selected, setSelected]  = useState<bigint | null>(null)

  useEffect(() => {
    try { sdk.actions.ready() } catch {}
    setReady(true)
    const fc = connectors.find(c => c.id === 'farcaster-frame')
    if (fc) connect({ connector: fc })
  }, [])

  const { data: totalSupplyData } = useReadContract({
    address: CCAT_COLLECTION, abi: COLLECTION_ABI, functionName: 'totalSupply',
  })
  const total = totalSupplyData ? Number(totalSupplyData as bigint) : 0

  // Call ownerOf for every token 1..totalSupply, filter to those owned by connected address
  const { data: ownerResults } = useReadContracts({
    contracts: Array.from({ length: total }, (_, i) => ({
      address: CCAT_COLLECTION,
      abi: COLLECTION_ABI,
      functionName: 'ownerOf' as const,
      args: [BigInt(i + 1)] as const,
    })),
    query: { enabled: total > 0 },
  })

  const ids: bigint[] = (ownerResults ?? [])
    .map((r, i) => ({ owner: r.result as string, id: BigInt(i + 1) }))
    .filter(t => t.owner?.toLowerCase() === address?.toLowerCase())
    .map(t => t.id)

  if (!ready) return null

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div>
          <div style={s.logo}>ClankerCats</div>
          {total > 0 && <div style={s.supply}>{total} minted</div>}
        </div>
        {address && <div style={s.addr}>{address.slice(0,6)}…{address.slice(-4)}</div>}
      </div>

      {!isConnected ? (
        <div style={s.connectState}>
          <div style={s.heroCat}>🐱</div>
          <div style={s.emptyTitle}>ClankerCats Viewer</div>
          <div style={s.emptySubtitle}>Open in Warpcast to auto-connect,<br />or connect your wallet below.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            {connectors.filter(c => c.id !== 'farcaster-frame').map(c => (
              <button key={c.id} style={s.connectBtn} onClick={() => connect({ connector: c })}>{c.name}</button>
            ))}
          </div>
        </div>
      ) : selected !== null ? (
        <CatDetail tokenId={selected} onBack={() => setSelected(null)} />
      ) : ids.length > 0 ? (
        <>
          <div style={s.ownedHeader}>
            <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>{ids.length}</span>
            <span style={{ color: '#555' }}> ClankerCat{ids.length !== 1 ? 's' : ''} owned</span>
          </div>
          <div style={s.grid}>
            {ids.map(id => (
              <CatCard key={id.toString()} tokenId={id} selected={selected === id} onClick={() => setSelected(id)} />
            ))}
          </div>
          <div style={s.mintHint}>Tap a CCat to see its traits ↑</div>
        </>
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:         { padding: '16px 16px 32px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100vh' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo:         { fontSize: 18, fontWeight: 'bold', color: '#7c3aed' },
  supply:       { fontSize: 11, color: '#444', marginTop: 2 },
  addr:         { fontSize: 11, color: '#555', background: '#1e1e2e', padding: '4px 10px', borderRadius: 20, flexShrink: 0 },
  ownedHeader:  { fontSize: 14 },
  mintHint:     { fontSize: 11, color: '#333', textAlign: 'center' as const },
  grid:         { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  card:         { border: '1px solid #1e1e2e', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#12122a' },
  placeholder:  { display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', color: '#2a2a3e', fontSize: 12 },
  cardLabel:    { padding: '6px 8px', fontSize: 11, color: '#444' },
  detail:       { display: 'flex', flexDirection: 'column', gap: 14 },
  detailCard:   { borderRadius: 14, overflow: 'hidden', border: '1px solid #1e1e2e' },
  detailName:   { fontSize: 22, fontWeight: 'bold' },
  sectionLabel: { fontSize: 11, color: '#555', textTransform: 'uppercase' as const, letterSpacing: 1 },
  traits:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  trait:        { background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, padding: '8px 10px' },
  traitKey:     { fontSize: 10, color: '#555', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 },
  traitVal:     { fontSize: 13, color: '#ccc', fontWeight: 'bold' },
  shareBtn:     { padding: 14, background: '#7c3aed', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 'bold' },
  explorerBtn:  { padding: 12, background: 'transparent', color: '#555', border: '1px solid #2a2a3e', borderRadius: 10, cursor: 'pointer', fontSize: 13 },
  back:         { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: '0 0 4px 0', textAlign: 'left' as const },
  connectState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 24 },
  emptyState:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, paddingTop: 24, textAlign: 'center' as const },
  heroCat:      { fontSize: 72, lineHeight: 1 },
  emptyTitle:   { fontSize: 20, fontWeight: 'bold', color: '#ccc' },
  emptySubtitle:{ fontSize: 14, color: '#555', lineHeight: 1.6 },
  emptyHint:    { fontSize: 11, color: '#333' },
  buyBtn:       { padding: '14px 24px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 'bold', width: '100%' },
  connectBtn:   { padding: '14px 20px', background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 10, color: 'white', cursor: 'pointer', fontSize: 14, width: '100%' },
}
