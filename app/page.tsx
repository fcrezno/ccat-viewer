import { Cradle } from '@/components/Cradle'

/**
 * THE FRONT DOOR IS THE GAME NOW.
 *
 * This used to `redirect('/game')`, so opening the app dropped you into the idle
 * game. The Cradle is the thing being shown off, so it takes the root and the
 * older apps are a link away from it.
 *
 * Note the mint is unaffected: `embedTags` in the layout still points a cast at
 * the mint, and /mint is untouched.
 */
export default function Home() {
  return <Cradle />
}
