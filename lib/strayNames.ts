/**
 * NAMES FOR CATS THAT ARE NOT CLANKER CATS — the strays the fights invent, and
 * guests. Its own file so the page can name a guest without loading lib/arena,
 * whose fight machinery stays on the server ("the client is handed a finished
 * log, never the machinery that produced it").
 */
export const STRAY_NAMES = [
  'Mittens', 'Socks', 'Tabby', 'Smudge', 'Pepper', 'Biscuit', 'Marmalade', 'Nutmeg',
  'Domino', 'Patches', 'Freckles', 'Bandit', 'Clover', 'Pumpkin', 'Sable', 'Ash',
  'Willow', 'Juniper', 'Poppy', 'Hazel', 'Olive', 'Maple', 'Cinder', 'Dusty',
  'Boots', 'Ziggy', 'Pickles', 'Waffles', 'Noodle', 'Dumpling', 'Bean', 'Peanut',
  'Shadow', 'Midnight', 'Storm', 'Comet', 'Rocket', 'Pebble', 'Flint', 'Slate',
  'Ginger', 'Saffron', 'Honey', 'Toffee', 'Custard', 'Muffin', 'Crumpet', 'Scone',
] as const

/**
 * A GUEST CAT'S NAME, from its six-digit code. JP, 2026-10-06: "change the guest
 * names to the generic cat names" — "Guest #716617" read like a ticket number.
 * The same list the strays are named from, picked by the code, so a guest is the
 * same cat with the same name on every visit and in every mode. A name the
 * player typed still wins over this; the code itself stays for "fight a friend".
 */
export function strayName(code: number | string): string {
  const n = Number(code) >>> 0
  return STRAY_NAMES[(Math.imul(n, 2654435761) >>> 0) % STRAY_NAMES.length]
}
