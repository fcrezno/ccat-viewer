import { NextRequest, NextResponse } from 'next/server'
import { fetchMeta, getCollection } from '@/lib/collection'

// GET /api/meta?id=46&c=v1 → hosted metadata JSON for one cat
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  const col = getCollection(req.nextUrl.searchParams.get('c'))

  if (!id || !/^\d+$/.test(id))
    return NextResponse.json({ error: 'missing or invalid id' }, { status: 400 })

  const meta = await fetchMeta(col, id)
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json(meta, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  })
}
