import { Cradle } from '@/components/Cradle'

/**
 * The Cradle kept at its own address.
 *
 * It is the ROOT of the app now, but this URL has been shared and embedded in
 * casts, so it stays and renders the same screen rather than 404ing.
 */
export default function CradlePage() {
  return <Cradle />
}
