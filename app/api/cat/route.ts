import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, fallback } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://mainnet.base.org'),
    http('https://base.llamarpc.com'),
    http('https://rpc.ankr.com/base'),
  ]),
})

const RENDERER = '0x2fE5bf2aB284bc71B261Ea6d32aaadfcA987Eeb8' as `0x${string}`

const RENDERER_ABI = [
  {
    name: 'tokenURI',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'upegId', type: 'uint256' },
      { name: 'seed',   type: 'uint256' },
    ],
    outputs: [{ type: 'string' }],
  },
] as const

export async function GET(req: NextRequest) {
  const id   = req.nextUrl.searchParams.get('id')
  const seed = req.nextUrl.searchParams.get('seed')

  if (!id || !seed) return new NextResponse('Missing id or seed', { status: 400 })

  try {
    const uri = await client.readContract({
      address: RENDERER,
      abi: RENDERER_ABI,
      functionName: 'tokenURI',
      args: [BigInt(id), BigInt(seed)],
    }) as string

    const json  = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'))
    const svg   = Buffer.from((json.image as string).split(',')[1], 'base64')

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse('Error rendering cat', { status: 500 })
  }
}
