'use client'

import { useEffect, useState } from 'react'
import sdk from '@farcaster/miniapp-sdk'
import { BaseMint } from '@/components/mint/BaseMint'
import { RobinhoodMint } from '@/components/mint/RobinhoodMint'

/**
 * /mint — TWO MINTS, KEPT APART.
 *
 * JP, 2026-09-29: "seperate the farcaster stuff from the robin hood".
 *
 *   inside Farcaster   the Base (V2) mint: each cat is tied to a Farcaster
 *                      account, and Quick Auth only exists in a Farcaster client
 *   everywhere else    the Robinhood mint: the count, a cat taking the mints as
 *                      damage, and the way to the claim on /mint/v3
 *
 * One URL because the Farcaster mini app's home and every cast already shared
 * point here. Nothing is drawn until the answer is known, so neither page flashes
 * the other's content first. On a top-level page isInMiniApp() answers at once.
 */
export default function MintPage() {
  const [inApp, setInApp] = useState<boolean | null>(null)
  useEffect(() => {
    sdk.isInMiniApp().then(setInApp).catch(() => setInApp(false))
  }, [])

  if (inApp === null) return null
  return inApp ? <BaseMint /> : <RobinhoodMint />
}
