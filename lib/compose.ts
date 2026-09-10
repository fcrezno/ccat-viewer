import { readdir } from 'fs/promises'
import { join } from 'path'
import { seeded } from './arena'

/**
 * WHICH THREE DRAWINGS A SEED MAKES A CAT OUT OF.
 *
 * Lifted out of /api/cat-art, which had been the only thing that needed to know.
 * It is now needed twice — the PNG, and the TRAITS behind it — and the two must
 * agree or a cat is drawn with one face and described as having another.
 *
 * One definition, so they cannot disagree. That is the same rule the yard and
 * the s&box port live by, applied one level down.
 *
 * SERVER ONLY. It reads `layers/` off the disk.
 */

const LAYERS = join(process.cwd(), 'layers')

export const ORDER = ['Background', 'Body', 'Face'] as const
export type Layer = (typeof ORDER)[number]

type Choice = { file: string; weight: number }

/** Cached per process: reading three directories on every fight is wasteful. */
let cache: Record<string, Choice[]> | null = null

export async function inventory(): Promise<Record<string, Choice[]>> {
  if (cache) return cache

  const out: Record<string, Choice[]> = {}
  for (const dir of ORDER) {
    /*
     * SORTED, AND THAT IS NOT TIDINESS.
     *
     * `readdir` returns whatever order the filesystem gives, and it is NOT sorted
     * on this machine — checked. NTFS and Vercel's Linux do not have to agree, so
     * without this the weighted walk below starts from a different list on the
     * dev box than in production and THE SAME SEED DRAWS A DIFFERENT CAT.
     *
     * Harmless while the only composed cats were throwaway opponents. Not
     * harmless now that a composed cat is somebody's pet — see lib/mycats.ts.
     */
    const files = (await readdir(join(LAYERS, dir)))
      .filter(f => f.toLowerCase().endsWith('.png'))
      .sort()
    out[dir] = files.map(file => {
      // "Beach Classic#10.png" -> weight 10. No suffix means an even chance.
      const m = file.match(/#(\d+)\.png$/i)
      return { file, weight: m ? Number(m[1]) : 1 }
    })
  }
  cache = out
  return out
}

/** Weighted pick, so the rare traits stay rare. */
function weighted(r: () => number, xs: Choice[]): Choice {
  const total = xs.reduce((n, x) => n + x.weight, 0)
  let t = r() * total
  for (const x of xs) {
    t -= x.weight
    if (t <= 0) return x
  }
  return xs[xs.length - 1]
}

/**
 * THE TRAIT NAME AS THE COLLECTION WRITES IT.
 *
 * The rarity weight is a filename convention, not part of the trait — a cat
 * wears "Aliem", never "Aliem#300". The metadata on chain says the former, and
 * `temperOf()` and `inkFor()` both look their answer up BY THAT NAME, so getting
 * this wrong would silently hand every composed cat the `plain` temperament.
 */
export const traitName = (file: string) => file.replace(/#\d+(?=\.png$)/i, '').replace(/\.png$/i, '')

/**
 * THE THREE LAYERS ASKED FOR BY NAME, for a cat that was inherited rather than
 * drawn. See lib/breed.ts.
 *
 * ANYTHING MISSING FALLS BACK TO THE SEED'S OWN PICK rather than to a default.
 * A trait can genuinely be absent — an older cat stored before a layer existed,
 * or a parent whose metadata never carried one — and substituting a fixed layer
 * would give every such cat the same face. Falling back to the draw keeps the
 * kitten looking like a cat somebody could have won.
 *
 * A NAME THAT MATCHES NOTHING IS ALSO A MISS, deliberately. Renaming a layer
 * file must not 500 the picture of a cat that already wears it; it degrades to a
 * drawn trait and the cat still appears.
 */
export async function namedLayers(
  want: Partial<Record<Layer, string | null>>,
  seed = 0,
): Promise<{ files: string[]; traits: Record<Layer, string> }> {
  const inv = await inventory()
  const fallback = await pickLayers(seed)

  const files: string[] = []
  const traits = {} as Record<Layer, string>

  ORDER.forEach((dir, i) => {
    const asked = want[dir]
    const hit = asked ? inv[dir].find(c => traitName(c.file) === asked) : undefined
    if (hit) {
      files.push(join(LAYERS, dir, hit.file))
      traits[dir] = traitName(hit.file)
    } else {
      files.push(fallback.files[i])
      traits[dir] = fallback.traits[dir]
    }
  })

  return { files, traits }
}

/**
 * The three layers this seed draws, in painting order.
 *
 * The draw order matters and is fixed by ORDER: background, then body, then
 * face. Consuming the same stream in the same order is what makes the PNG and
 * the traits the same cat.
 */
export async function pickLayers(seed: number): Promise<{ files: string[]; traits: Record<Layer, string> }> {
  const inv = await inventory()
  const r = seeded(seed >>> 0)

  const files: string[] = []
  const traits = {} as Record<Layer, string>

  for (const dir of ORDER) {
    const got = weighted(r, inv[dir]).file
    files.push(join(LAYERS, dir, got))
    traits[dir] = traitName(got)
  }

  return { files, traits }
}
