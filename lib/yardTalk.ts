/**
 * YARD TALK — the cats' conversations, built the way Animal Crossing builds its
 * villagers' (JP, 2026-10-19: "borrow animal crossings style of text creation ...
 * use that as a template"). Its SYSTEM, our own words:
 *
 *   PERSONALITY  each temperament (lib/yard TEMPERS) talks in one of five styles,
 *                the way a villager is lazy, peppy, cranky, snooty or jock
 *   CATCHPHRASE  each cat ends some lines with its own word, picked by its seed,
 *                so the same cat always says the same one
 *   TEMPLATES    lines with blanks: {me} {you} {other} {place} {thing} {phrase}
 *                filled from what really happened in the yard
 *   TOPICS       greet, share, groom, clash, make up, gossip, a fight won or lost
 *   EXCHANGES    one cat opens, the other answers in ITS style
 *
 * ALL THE WORDS ARE PLACEHOLDERS, JP's to rewrite, like everything else the yard says.
 * Pure: no DOM. Wired to speech bubbles + lib/babble later (plan in memory).
 */

export type Style = 'sweet' | 'smug' | 'lazy' | 'plucky' | 'odd'
export type Topic = 'greet' | 'share' | 'groom' | 'clash' | 'makeup' | 'gossip' | 'won' | 'lost'

/** Temperament label (lib/yard temperOf().label) -> how that cat talks. */
export const STYLE_OF: Record<string, Style> = {
  sweet: 'sweet', pleading: 'sweet',
  smug: 'smug', alien: 'smug',
  hungry: 'lazy', defeatist: 'lazy',
  plucky: 'plucky', focused: 'plucky',
  confused: 'odd', erratic: 'odd', plain: 'odd',
}

/** Each style's voice for lib/babble: higher is younger and brighter. */
export const VOICE: Record<Style, { pitch: number; speed: number }> = {
  sweet:  { pitch: 1.35, speed: 1.1 },
  smug:   { pitch: 0.95, speed: 0.9 },
  lazy:   { pitch: 0.8,  speed: 0.75 },
  plucky: { pitch: 1.15, speed: 1.3 },
  odd:    { pitch: 1.05, speed: 1.0 },
}

/** Catchphrases, one per cat, picked by seed. */
const PHRASES = ['meowza', 'clank', 'purrhaps', 'nya', 'mrrp', 'whiskers', 'bloop', 'pawsome', 'mew mew', 'zoomies', 'kibble', 'beans']
export const catchphrase = (seed: number) => PHRASES[Math.abs(seed) % PHRASES.length]

const PLACES = ['the fence', 'the food bowl', 'the sunny spot', 'the big box', 'the window']

/** [openers, replies] per style and topic. */
const LINES: Record<Style, Partial<Record<Topic, [string[], string[]]>>> = {
  sweet: {
    greet:  [['Hiii {you}! I missed you, {phrase}!', '{you}! Want to sit by {place} with me?'], ['Aww, hi {you}!', 'Yes please, {phrase}!']],
    share:  [['I saved you some {thing}, {you}!'], ['You are the best, {phrase}!']],
    groom:  [['Hold still, your ear is all fluffy!'], ['Hehe, that tickles!']],
    clash:  [['That was mine... but okay.'], ['S-sorry, {phrase}...']],
    makeup: [['Friends again, {you}?'], ['Always, {phrase}!']],
    gossip: [['Did you see {other} today? So cute!'], ['{other} is the cutest, {phrase}!']],
    won:    [['I won a fight today! I was so scared, {phrase}!'], ['I knew you could do it!']],
    lost:   [['I lost today... but I tried my best.'], ['That is what counts, {phrase}!']],
  },
  smug: {
    greet:  [['Oh. {you}. You may sit near me, {phrase}.'], ['How generous, {phrase}.']],
    share:  [['Take some {thing}. I have plenty, naturally.'], ['Hmph. Thank you, {phrase}.']],
    groom:  [['Your fur is a mess. Allow me.'], ['If you insist.']],
    clash:  [['Move. That is my spot, {phrase}.'], ['Make me, {phrase}.']],
    makeup: [['Fine. I forgive you. This time.'], ['How kind of you, {phrase}.']],
    gossip: [['{other} tried to beat me today. Tried, {phrase}.'], ['Of course they did.']],
    won:    [['Another win. Is anyone even surprised, {phrase}?'], ['Not me.']],
    lost:   [['That loss was the arena\'s fault, {phrase}.'], ['Clearly.']],
  },
  lazy: {
    greet:  [['Oh, hey {you}... is it snack time, {phrase}?'], ['Heh. Always, {phrase}.']],
    share:  [['You want some {thing}? I was gonna nap anyway.'], ['Ooh, {thing}, {phrase}!']],
    groom:  [['Mmm... I will groom you after my nap.'], ['Zzz... okay.']],
    clash:  [['Ugh. Fine. Take the spot, {phrase}.'], ['Thanks I guess.']],
    makeup: [['Let\'s just... nap it off?'], ['Best idea ever, {phrase}.']],
    gossip: [['{other} ran around all day. Why, {phrase}?'], ['Too much energy...']],
    won:    [['I won? Huh. Can I nap now, {phrase}?'], ['You earned it.']],
    lost:   [['Lost again... at least there is {thing}.'], ['There is always {thing}, {phrase}.']],
  },
  plucky: {
    greet:  [['{you}! Race you to {place}, {phrase}!', 'Morning, {you}! Ready to train?'], ['You\'re on, {phrase}!', 'Always ready!']],
    share:  [['Here, {you}! {thing} makes you strong!'], ['Thanks! Training fuel, {phrase}!']],
    groom:  [['Gotta look sharp for the arena!'], ['Looking good, {phrase}!']],
    clash:  [['Hey! I was here first, {phrase}!'], ['Rematch later, then!']],
    makeup: [['Good fight, {you}. Friends?'], ['Friends! {phrase}!']],
    gossip: [['{other} has a great left paw, {phrase}!'], ['I want to train with them!']],
    won:    [['I WON! All that training, {phrase}!'], ['Yeah! Next one too!']],
    lost:   [['Lost one. Back to training, {phrase}!'], ['That\'s the spirit!']],
  },
  odd: {
    greet:  [['{you}? Or are you a very big {thing}, {phrase}?'], ['Uh... it\'s me, {phrase}.']],
    share:  [['I found {thing} inside {place}. Want it?'], ['Why was it there, {phrase}?']],
    groom:  [['Your fur smells like the moon, {phrase}.'], ['...Thanks?']],
    clash:  [['This spot hums. It is mine now, {phrase}.'], ['What does that mean?']],
    makeup: [['Let\'s be friends. The box told me to.'], ['Okay, {phrase}!']],
    gossip: [['I think {other} is three cats in a coat.'], ['That explains a lot, {phrase}.']],
    won:    [['I won. I don\'t know how, {phrase}.'], ['Me neither!']],
    lost:   [['I lost. But I learned a new noise, {phrase}.'], ['Show me!']],
  },
}

export type Speaker = { name: string; seed: number; temper: string }

const pick = <T,>(list: T[], seed: number) => list[Math.abs(seed) % list.length]

/** Fill a line's blanks. */
function fill(line: string, me: Speaker, you: Speaker, ctx: { other?: string; thing?: string; place?: string }, seed: number) {
  return line
    .replaceAll('{me}', me.name).replaceAll('{you}', you.name)
    .replaceAll('{other}', ctx.other ?? 'that cat')
    .replaceAll('{thing}', ctx.thing ?? 'kibble')
    .replaceAll('{place}', ctx.place ?? pick(PLACES, seed))
    .replaceAll('{phrase}', catchphrase(me.seed))
}

/**
 * One exchange: `a` opens on `topic`, `b` answers in its own style. `seed` picks
 * among the variants (use the yard tick, so a replay says the same).
 * Returns the two lines with who says them and in which voice.
 */
export function converse(topic: Topic, a: Speaker, b: Speaker, ctx: { other?: string; thing?: string; place?: string } = {}, seed = 0) {
  const sa = STYLE_OF[a.temper] ?? 'odd', sb = STYLE_OF[b.temper] ?? 'odd'
  const open = LINES[sa][topic]?.[0] ?? LINES[sa].greet![0]
  const reply = LINES[sb][topic]?.[1] ?? LINES[sb].greet![1]
  return [
    { who: a, text: fill(pick(open, seed + a.seed), a, b, ctx, seed), voice: VOICE[sa] },
    { who: b, text: fill(pick(reply, seed + b.seed), b, a, ctx, seed + 1), voice: VOICE[sb] },
  ]
}
