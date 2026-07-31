import { NextRequest, NextResponse } from 'next/server'

/**
 * Farcaster Mini App webhook.
 *
 * The manifest advertises this URL, and the client POSTs here when a user adds
 * or removes the app, or enables/disables notifications. It must return 2xx —
 * a 404 here makes the add look broken to the user.
 *
 * Events: miniapp_added, miniapp_removed,
 *         notifications_enabled, notifications_disabled
 *
 * `miniapp_added` and `notifications_enabled` carry a notificationDetails
 * { url, token } pair, which is what you'd need to push a notification later
 * ("your cat is hungry", "reveal is live"). Persisting those needs a store —
 * see the Supabase note in goals.md — so for now the event is acknowledged and
 * logged, not saved. Acknowledging is the part that has to work today.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // The payload is signed by the client; verification matters only once we act
  // on it. Logging the shape is enough while nothing is persisted.
  const event = (body as { header?: string; payload?: string })?.payload
  console.log('[miniapp webhook]', event ? `payload ${String(event).slice(0, 32)}…` : 'no payload')

  return NextResponse.json({ ok: true })
}

// Some clients probe with GET before registering the webhook.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'clanker-cats miniapp webhook' })
}
