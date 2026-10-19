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

/*
 * 2000s INTERNET SPEAK (JP, 2026-10-19: "use more 2000s internet speak", "look up
 * conversation patterns from that time"). The patterns the lines borrow:
 *   AIM        "hey wuts up", away messages ("brb food"), the buddy-list wave
 *   LOLCATS    a little: broken grammar, the odd "i haz"
 *   4CHAN      (the clean bits) >implying, mfw, tfw, inb4, check em, u mad, cool story bro,
 *              tl;dr, lurk moar, sauce?, kek
 *   LEET/GAMES pwned, n00b, gg, ftw, 1337, "all ur spot r belong to us"
 *   FORUMS     "o rly? ya rly", "pics or it didnt happen", "+1", "this.", "epic fail"
 *   MYSPACE    rawr XD, :3, <3, ~*~sparkles~*~, "ur in my top 8"
 */
const PHRASES = ['lolz', 'rawr XD', 'kthxbai', ':3', 'ftw', 'kek', 'roflcopter', 'nyan', 'u mad', '<3', 'w00t', 'srsly']
export const catchphrase = (seed: number) => PHRASES[Math.abs(seed) % PHRASES.length]

const PLACES = ['the fence', 'the food bowl', 'the sunny spot', 'the big box', 'the window']

/** [openers, replies] per style and topic. */
const LINES: Record<Style, Partial<Record<Topic, [string[], string[]]>>> = {
  sweet: {
    greet:  [['hiii {you}!!! ~*~ {phrase}', '{you} ur in my top 8 <3'], ['omg hiii :3', 'aww ur in mine 2!! <3']],
    share:  [['i saved u sum {thing} {you} <3'], ['ur the best evar {phrase}']],
    groom:  [['hold still ur ear is all fluffy'], ['hehe tickles :3']],
    clash:  [['tfw {you} took my spot :('], ['sowwy {phrase}...']],
    makeup: [['bffs again {you}?? <3'], ['4 evar {phrase}!!']],
    gossip: [['did u see {other} today?? sooo cute', 'inb4 {other} steals ur heart'], ['{other} is 2 cute {phrase}']],
    won:    [['i won a fite!! i wuz so scared {phrase}'], ['yay!!! ~*~']],
    lost:   [['i lost... but i tried :('], ['*hugs* {phrase}']],
  },
  smug: {
    greet:  [['oh. {you}. u may sit near me {phrase}'], ['o rly?', 'how generous lol']],
    share:  [['take sum {thing}. >implying i dont have plenty'], ['k thx {phrase}']],
    groom:  [['ur fur = epic fail. allow me'], ['...fine']],
    clash:  [['all ur spot r belong to me {phrase}'], ['u mad?', 'ya rly? make me n00b']],
    makeup: [['fine. ur forgiven. this time'], ['o wow so kind {phrase}']],
    gossip: [['{other} tried 2 pwn me today. TRIED {phrase}'], ['pics or it didnt happen', 'sauce?']],
    won:    [['gg ez. another win {phrase}'], ['this.']],
    lost:   [['lag. totally lag {phrase}'], ['cool story bro', 'sure it wuz lol']],
  },
  lazy: {
    greet:  [['hey {you} wuts up... is it snack tiem {phrase}'], ['lol always {phrase}']],
    share:  [['u want sum {thing}? brb nap', 'tl;dr gave u {thing}. nap now'], ['mfw free {thing} {phrase}']],
    groom:  [['mmm grooming after mah nap'], ['zzz ok']],
    clash:  [['ugh. fine. take the spot {phrase}'], ['kthx']],
    makeup: [['lets just... nap it off?'], ['best idea evar {phrase}']],
    gossip: [['{other} ran around all day. y {phrase}'], ['2 much energy lol']],
    won:    [['i won? huh. can i nap now {phrase}'], ['u earned it']],
    lost:   [['lost again... at least theres {thing}'], ['theres always {thing} {phrase}']],
  },
  plucky: {
    greet:  [['{you}!!! race u 2 {place} {phrase}', 'yo {you} ready 2 train??'], ['ur on!!1!', 'always lets goooo']],
    share:  [['{thing} = power up {you}!! eat it'], ['w00t ty {phrase}!!']],
    groom:  [['gotta look 1337 4 the arena'], ['lookin gud {phrase}']],
    clash:  [['hey i wuz here first {phrase}!!'], ['rematch l8r then!!']],
    makeup: [['gg {you}. friends?'], ['gg!! friends {phrase}']],
    gossip: [['{other} haz a sick left paw {phrase}'], ['+1 wanna train w/ them', 'check em. {other} rolled dubs']],
    won:    [['I WON!!1! all dat training ftw {phrase}'], ['PWNED lets gooo']],
    lost:   [['lost 1. back 2 training {phrase}'], ['thats the spirit!!']],
  },
  odd: {
    greet:  [['{you}? or r u a very big {thing} {phrase}'], ['...its me {phrase}']],
    share:  [['i found {thing} in {place}. want it'], ['y wuz it there {phrase}']],
    groom:  [['ur fur smellz like the moon {phrase}'], ['...ty?']],
    clash:  [['dis spot hums. it iz mine now {phrase}'], ['wut does dat even mean']],
    makeup: [['lets b friends. the box told me 2'], ['ok {phrase}!!']],
    gossip: [['i think {other} iz 3 cats in a coat', 'lurk moar. {other} is not a cat'], ['kek dat explains a lot {phrase}']],
    won:    [['i won. idk how {phrase}'], ['me neither lol']],
    lost:   [['i lost. but i lernd a new noise {phrase}'], ['show me!!']],
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
