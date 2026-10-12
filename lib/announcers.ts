import { NO_CHAIN } from '@/lib/appmode'

/**
 * THE ANNOUNCER'S LINES — one opens every fight (components/Cradle, drawn on
 * MapDive's curtain), and the meme kit (app/kit) offers them as pictures.
 * JP wrote every one, 2026-10-06. Each is one or two halves: white, then gold.
 */
export const ANNOUNCERS = [
  ['TWO CATS ENTER;', 'ONE CAT LEAVES'],
  // JP, 2026-10-06: make one of the lines "ITS TIME TO CLANK SOME CATS!".
  ['ITS TIME TO', 'CLANK SOME CATS!'],
  ['THE CLANG OF DESTINY', 'SHALL CLANK THY DNA'],
  ['THE WHEEL OF CLANK', 'IS TURNING...'],
  ['YES, I DO', 'EAT GLUE.'],
  ['HEY', 'IS THIS ON..?'],
  // One half only: it slams once, then holds.
  ['IM MOSHING IT!'],
  /*
   * TOKEN SHOUTS, web only. The App Store build (NO_CHAIN) has no way to buy
   * anything — Guideline 3.1.1 — so these are not in it at all.
   */
  ...(NO_CHAIN ? [] : [['BUY $BUN'], ['BUY $BPEPE'], ['BUY $ALF']]),
] as readonly (readonly string[])[]
/** One per fight, off its seed: the same fight always opens the same way. */
export const announcerFor = (seed: number) => ANNOUNCERS[Math.abs(seed) % ANNOUNCERS.length]
