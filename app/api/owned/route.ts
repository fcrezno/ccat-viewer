import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { fetchCats } from '@/lib/collection'

// GET /api/owned?wallet=0x… → [{ collection, id, uid, meta }, …] across all collections
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')

  if (!wallet || !isAddress(wallet))
    return NextResponse.json({ error: 'invalid wallet address' }, { status: 400 })

  try {
    const cats = await fetchCats(wallet)
    return NextResponse.json(cats, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    })
  } catch {
    return NextResponse.json({ error: 'failed to read collection' }, { status: 502 })
  }
}
