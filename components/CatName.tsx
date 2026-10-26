/**
 * A CAT'S NAME, animated for BunBurners (JP, 2026-10-26: "make their name animated
 * compared to the standard stuff", "give them the option to change it"). Plain for
 * everyone else. Styles: rainbow, sparkle, wave, gold (globals.css .cn-*). Which cats
 * are burners comes from ClankerCatsV3.bunBurner(tokenId) once V3 is deployed.
 */
export type NameStyle = 'plain' | 'rainbow' | 'sparkle' | 'wave' | 'gold'
export const NAME_STYLES: NameStyle[] = ['rainbow', 'sparkle', 'wave', 'gold']

export function CatName({ name, burner = false, look = 'rainbow' }: { name: string; burner?: boolean; look?: NameStyle }) {
  if (!burner || look === 'plain') return <span>{name}</span>
  if (look === 'wave') return <span className="cn-wave" aria-label={name}>{[...name].map((c, i) => <span key={i} style={{ animationDelay: `${i * 0.08}s` }}>{c === ' ' ? ' ' : c}</span>)}</span>
  return <span className={`cn-${look}`}>{name}</span>
}
