'use client'

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useReadContract, useReadContracts } from 'wagmi'
import sdk from '@farcaster/frame-sdk'
import { frameConnector } from '@/lib/frameConnector'

// CCat collection address — update once re-registered on new factory
const CCAT_COLLECTION = '0x0000000000000000000000000000000000000000' as `0x${string}`

const COLLECTION_ABI = [
  { type: 'function', name: 'balanceOf',           inputs: [{ name: 'owner', type: 'address' }],                                          outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'tokenOfOwnerByIndex', inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],       outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'tokenURI',            inputs: [{ name: 'tokenId', type: 'uint256' }],                                         outputs: [{ type: 'string'  }], stateMutability: 'view' },
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
    <div onClick={onClick} style={{ ...s.card, borderColor: selected ? '#7c3aed' : '#1e1e2e' }}>
      {meta?.image
        ? <img src={meta.image} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
        : <div style={s.placeholder}>#{tokenId.toString()}</div>
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
    await sdk.actions.openUrl(
      `https://warpcast.com/~/compose?text=Check out my ClankerCat %23${tokenId} 🐱%0Amirage.garden`
    )
  }

  return (
    <div style={s.detail}>
      <button style={s.back} onClick={onBack}>← Back</button>
      {meta?.image
        ? <img src={meta.image} style={{ width: '100%', borderRadius: 12, border: '1px solid #1e1e2e' }} />
        : <div style={{ ...s.placeholder, aspectRatio: '1', borderRadius: 12 }}>Loading…</div>
      }
      <div style={s.detailName}>{meta?.name ?? `CCat #${tokenId}`}</div>
      {meta?.attributes && meta.attributes.length > 0 && (
        <div style={s.traits}>
          {meta.attributes.map((a, i) => (
            <div key={i} style={s.trait}>
              <div style={s.traitKey}>{a.trait_type}</div>
              <div style={s.traitVal}>{a.value}</div>
            </div>
          ))}
        </div>
      )}
      <button style={s.shareBtn} onClick={share}>Cast this CCat 🐱</button>
    </div>
  )
}

export default function Home() {
  const { address, isConnected } = useAccount()
  const { connect, connectors }  = useConnect()
  const [ready, setReady]        = useState(false)
  const [selected, setSelected]  = useState<bigint | null>(null)

  useEffect(() => {
    sdk.actions.ready()
    setReady(true)
    const fc = connectors.find(c => c.id === 'farcaster-frame')
    if (fc) connect({ connector: fc })
  }, [])

  const { data: balance } = useReadContract({
    address: CCAT_COLLECTION, abi: COLLECTION_ABI, functionName: 'balanceOf', args: [address!],
    query: { enabled: !!address },
  })

  const count = balance ? Number(balance as bigint) : 0

  const { data: tokenIds } = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: CCAT_COLLECTION,
      abi: COLLECTION_ABI,
      functionName: 'tokenOfOwnerByIndex' as const,
      args: [address!, BigInt(i)] as const,
    })),
    query: { enabled: count > 0 && !!address },
  })

  const ids = tokenIds?.map(d => d.result as bigint).filter(Boolean) ?? []

  if (!ready) return null

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.logo}>ClankerCats 🐱</div>
        {address && <div style={s.addr}>{address.slice(0,6)}…{address.slice(-4)}</div>}
      </div>

      {!isConnected ? (
        <div style={s.center}>
          <div style={{ color: '#555', fontSize: 14 }}>Connecting wallet…</div>
        </div>
      ) : count === 0 ? (
        <div style={s.center}>
          <div style={{ fontSize: 14, color: '#888' }}>You don't have any ClankerCats yet.</div>
          <div style={{ color: '#555', fontSize: 12, marginTop: 8 }}>Buy $CLKCAT on Base to mint one.</div>
        </div>
      ) : selected !== null ? (
        <CatDetail tokenId={selected} onBack={() => setSelected(null)} />
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#555' }}>{count} ClankerCat{count !== 1 ? 's' : ''}</div>
          <div style={s.grid}>
            {ids.map(id => (
              <CatCard key={id.toString()} tokenId={id} selected={selected === id} onClick={() => setSelected(id)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:       { padding: 16, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo:       { fontSize: 18, fontWeight: 'bold', color: '#7c3aed' },
  addr:       { fontSize: 12, color: '#555', background: '#1e1e2e', padding: '4px 10px', borderRadius: 20 },
  center:     { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, textAlign: 'center' },
  grid:       { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  card:       { border: '1px solid #1e1e2e', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#12122a' },
  placeholder:{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1', color: '#2a2a3e', fontSize: 12 },
  cardLabel:  { padding: '6px 8px', fontSize: 11, color: '#555' },
  detail:     { display: 'flex', flexDirection: 'column', gap: 14 },
  detailName: { fontSize: 18, fontWeight: 'bold' },
  traits:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  trait:      { background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, padding: '8px 10px' },
  traitKey:   { fontSize: 10, color: '#555', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 3 },
  traitVal:   { fontSize: 13, color: '#ccc', fontWeight: 'bold' },
  shareBtn:   { padding: 12, background: '#7c3aed', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 'bold' },
  back:       { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13, padding: '0 0 8px 0', textAlign: 'left' as const },
}
