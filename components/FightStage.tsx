'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ArenaCat, LogLine } from '@/lib/arena'
import { BitmapText } from '@/components/BitmapText'
import { GameBar } from '@/components/GameBar'
import { Haloed } from '@/components/Haloed'
import { FloatWord, type Float } from '@/components/FloatWord'

/**
 * THE s&box BATTLE SCREEN, ON THE WEB.
 *
 * JP, 2026-09-29: "now i think we can make this closer to the game on sandbox",
 * "where are the hp bar sprites? you do have the original files", "lets add the
 * backgrounds for the stages", and "follow the same thing you did for the title
 * screen for the background of the page".
 *
 * Built from the game's own source rather than from memory: the layers and their
 * order are BattleScreen.razor's, and every coordinate below is from
 * BattleScreen.razor.scss (itself measured off battlescreen.png), in GAME PIXELS
 * on a 480x320 stage that is scaled to fit — so every offset stays the game's.
 *
 *   back to front   zone loop, the paper that floods the text box and the KO box,
 *                   battlescreen.png's line art, then the cats and the HUD
 *   portraits       106 square at (75, 64) and (299, 64)
 *   bars            left (32, 21) 176x15, right (274, 22) 172x13 — GameBar, the
 *                   same trail and hot edge the s&box port draws
 *   HP numbers      over the bars' outer tips, top 0; the second row (top 36) is
 *                   the game's LVL: this build has no levels, so it carries the
 *                   cat's TYPE
 *   CAUTION!        either side of the KO box, blinking
 *   names           centred under each portrait, top 168
 *   the log         the text box, three rows of 24 from x 54, y 226, filling from
 *                   the top; once all three are full the oldest leaves the top
 *
 * The web's old separate paper log is this text box now — the game's log IS on
 * paper, inside the frame.
 */

const W = 480
const H = 320
/**
 * How much of the screen a phone shows: see `crop`. Down to y 200, and x 24..456:
 * the outer 24 each side is only backdrop (the HP numbers start at x 30), and
 * leaving it off makes everything else a sixth bigger on a narrow screen.
 */
const CROP_H = 200
const CROP_X = 24
const CROP_W = W - 2 * CROP_X
const ZONES = ['caves', 'forest', 'mountain', 'temple', 'town']

/** The log's inks on paper. Moved here from Cradle.tsx, which imports them. */
export const KIND_INK: Record<LogLine['kind'], string> = {
  info: '#6b6b60', move: '#1a1a1a', miss: '#6b6b60', crit: '#c2410c',
  weak: '#3f6ea8', perk: '#2f7a44', ko: '#a01b1b', win: '#a06a10',
}

/*
 * LOW HEALTH, the way render.mjs does it: below a fifth a cat gets a blinking
 * CAUTION!, and on its last point that becomes PERIL!.
 */
const warnFor = (hp: number, max: number) =>
  hp <= 0 ? null : hp === 1 ? 'PERIL!' : hp / max <= 0.2 ? 'CAUTION!' : null

const ALARM = '#e02020'
/** Your own cat's name, in the gold the fight log prints a win in. */
const MINE_INK = '#b07a10'

export function FightStage({
  you, foe, hp, ghost, turf, swinging, struck, beat, speed, lines, crop = false, catsIn = true, catsFadeMs = 0, float = null, children,
}: {
  you: ArenaCat
  foe: ArenaCat
  /** Health as the current line has it: [you, foe]. */
  hp: [number, number]
  /** Health before the current line — where each bar's trail starts. */
  ghost: [number, number]
  /** "the forest": the zone the fight is in. */
  turf: string
  swinging: 'you' | 'foe' | null
  struck: { side: 'you' | 'foe'; kind: 'crit' | 'weak' | 'hit' } | null
  /** Which line is showing — alternates the animation names so each replays. */
  beat: number
  speed: number
  /** Every line said so far. The text box shows the end of it. */
  lines: LogLine[]
  /**
   * A PHONE SHOWS THE TOP OF THE SCREEN ONLY — bars, KO box, portraits, names —
   * and its log is the old scrolling paper under it instead (JP, 2026-09-29: "for
   * mobile keep the old text scroll down we had before"). At phone width the
   * text box's three rows were too small to read. The names end at y 192 and the
   * box's drawn edge starts at 207, so 200 cuts between them.
   */
  crop?: boolean
  /**
   * THE CATS, AFTER THE ARENA. JP, 2026-10-05: "make it fade in to the arena
   * background then fade in the cats with the count down". False hides both
   * portraits and their names, so the map's split opens onto the arena alone;
   * true fades them in over `catsFadeMs` — the countdown's length.
   */
  catsIn?: boolean
  catsFadeMs?: number
  /** The line floating off a cat on a crit, a weak hit or a miss (components/FloatWord). */
  float?: Float | null
  /** Drawn over the stage, like the countdown. */
  children?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setK(el.clientWidth / (crop ? CROP_W : W))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [crop])

  // The newest row stays in view: once three are full, the oldest leaves the top.
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  const zone = turf.replace(/^the /, '')
  const hasZone = ZONES.includes(zone)
  const alt = beat % 2 === 1 ? '-b' : ''

  /** A portrait's motion this line: the lunge and flash of a swing, or a recoil. */
  const motion = (who: 'you' | 'foe', alive: boolean) => {
    const side = who === 'you' ? 'left' : 'right'
    if (struck?.side === who) return `cradle-recoil-${struck.kind}${alt} ${0.6 / speed}s linear`
    if (swinging === who && alive) {
      // LINEAR: Beat.Lunge is already baked into the keyframe stops.
      return `cradle-lunge-${side}${alt} ${0.35 / speed}s linear, cradle-swing${alt} ${0.35 / speed}s ease-out`
    }
    return undefined
  }

  const portrait = (cat: ArenaCat, who: 'you' | 'foe', x: number, health: number) => (
    <div style={{ ...st.portrait, left: x, animation: motion(who, health > 0) }}>
      <div style={{
        ...st.mount,
        /*
         * A DOWNED CAT'S COLOUR DRAINS rather than snapping — the game fades a
         * grey copy in over ten steps. Ten steps here too, not a smooth ease.
         */
        filter: health > 0 ? 'none' : 'grayscale(1)',
        opacity: health > 0 ? 1 : 0.55,
      }}>
        {cat.art ? <img src={cat.art} alt={cat.label} style={st.art} /> : null}
      </div>
    </div>
  )

  /** A bar's clip while the cats are out, and its opening as they come in. */
  const fill = (side: 'left' | 'right'): React.CSSProperties => ({
    clipPath: catsIn ? 'inset(0 0 0 0)' : side === 'left' ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)',
    transition: catsIn ? `clip-path ${catsFadeMs}ms ease-out` : 'none',
  })

  const warnYou = warnFor(hp[0], you.maxHp)
  const warnFoe = warnFor(hp[1], foe.maxHp)

  return (
    <>
      {/*
        THE PAGE BEHIND THE FIGHT, as the title screen does it: the same zone,
        blurred and darkened, so the fight sits in its own world instead of on
        flat navy. The page's own background is made clear while it shows.
      */}
      {hasZone && (
        <>
          <div aria-hidden style={{ ...st.pageBg, backgroundImage: `url(/title/${zone}.jpg)` }} />
          <div aria-hidden style={st.pageShade} />
        </>
      )}

      <div ref={box} style={{ ...st.frame, ...(crop ? st.frameCrop : null), aspectRatio: `${crop ? CROP_W : W} / ${crop ? CROP_H : H}` }}>
        <div style={{ ...st.stage, transform: `${crop ? `translateX(${-CROP_X * k}px) ` : ''}scale(${k})` }}>
          {hasZone && (
            <video
              key={zone}
              src={`/title/${zone}.mp4`} poster={`/title/${zone}.jpg`}
              autoPlay muted loop playsInline aria-hidden
              style={st.backdrop}
            />
          )}
          <img src="/game/bar/textbox.png" alt="" style={st.textbox} />
          <img src="/game/bar/kobox.png" alt="" style={st.kobox} />
          <img src="/game/bar/kohole.png" alt="" style={st.kohole} />
          <img src="/game/battlescreen.png" alt="" style={st.chrome} />

          <div style={{ ...st.cats, opacity: catsIn ? 1 : 0, transition: catsIn ? `opacity ${catsFadeMs}ms ease-in-out` : 'none' }}>
            {portrait(you, 'you', 75, hp[0])}
            {portrait(foe, 'foe', 299, hp[1])}
            <div style={{ ...st.name, left: 75 }}><Haloed text={you.label} color={you.mine ? MINE_INK : '#1a1a1a'} /></div>
            <div style={{ ...st.name, left: 299 }}><Haloed text={foe.label} color={foe.mine ? MINE_INK : '#1a1a1a'} /></div>
          </div>

          {/*
           * "have the hp bars filling up as well": with the cats, over the
           * countdown. The bars drain from the outside in, so they fill from the
           * centre out — a clip opening, round the bar, not inside its own logic.
           */}
          <div style={{ ...st.bar, left: 32, top: 21, width: 176, ...fill('left') }}>
            <GameBar hp={hp[0]} ghost={ghost[0]} max={you.maxHp} side="left" speed={speed} />
          </div>
          <div style={{ ...st.bar, left: 274, top: 22, width: 172, ...fill('right') }}>
            <GameBar hp={hp[1]} ghost={ghost[1]} max={foe.maxHp} side="right" speed={speed} />
          </div>

          <div style={{ ...st.txt, top: 0, left: 30 }}><Haloed text={`${Math.max(0, hp[0])}/${you.maxHp}`} /></div>
          <div style={{ ...st.txt, top: 0, right: 32 }}><Haloed text={`${Math.max(0, hp[1])}/${foe.maxHp}`} /></div>
          <div style={{ ...st.txt, top: 36, left: 30 }}><Haloed text={you.type} /></div>
          <div style={{ ...st.txt, top: 36, right: 32 }}><Haloed text={foe.type} /></div>

          {warnYou && (
            <div style={{ ...st.txt, ...st.blink, top: 0, left: 105, width: 100, justifyContent: 'flex-end' }}>
              <Haloed text={warnYou} color={ALARM} />
            </div>
          )}
          {warnFoe && (
            <div style={{ ...st.txt, ...st.blink, top: 0, left: 277 }}>
              <Haloed text={warnFoe} color={ALARM} />
            </div>
          )}

          {float && <FloatWord key={float.key} float={float} secs={1.15 / speed} />}

          {!crop && <div ref={log} style={st.log} aria-live="polite">
            {lines.map((l, i) => (
              <div key={i} style={{
                ...st.row,
                // The crit's shake, on the line that has just landed.
                animation: l.kind === 'crit' && i === lines.length - 1 ? `cradle-crit ${0.45 / speed}s ease-out` : undefined,
              }}>
                <BitmapText text={l.text} scale={1} color={KIND_INK[l.kind] ?? '#1a1a1a'} />
              </div>
            ))}
          </div>}

          {children}
        </div>
      </div>
    </>
  )
}

const st: Record<string, React.CSSProperties> = {
  pageBg:    { position: 'fixed', inset: -60, zIndex: -2, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(28px) saturate(1.15) brightness(0.55)', transform: 'scale(1.1)' },
  pageShade: { position: 'fixed', inset: 0, zIndex: -1, background: 'radial-gradient(ellipse at 50% 30%, rgba(10,10,20,0.15) 0%, rgba(10,10,20,0.55) 55%, rgba(10,10,20,0.9) 100%)' },
  frame:     { position: 'relative', width: '100%', aspectRatio: `${W} / ${H}`, overflow: 'hidden', borderRadius: 10, background: '#0e0e18', boxShadow: '0 18px 60px rgba(0,0,0,0.55)', border: '2px solid rgba(255,255,255,0.12)' },
  // A phone: edge to edge (the Cradle gives it the full width), so no rounded ends or side rails.
  frameCrop: { borderRadius: 0, borderLeft: 'none', borderRight: 'none' },
  stage:     { position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0', imageRendering: 'pixelated' },
  // 480x320 at 1:1; maxWidth none, or the global `video { max-width: 100% }` squeezes it.
  backdrop:  { position: 'absolute', left: 0, top: 0, width: W, height: H, maxWidth: 'none' },
  chrome:    { position: 'absolute', left: 0, top: 0, width: W, height: H, maxWidth: 'none' },
  // BattleScreen.razor.scss .paper: the flood-filled insides of the drawn shapes.
  textbox:   { position: 'absolute', left: 33, top: 207, width: 416, height: 110 },
  kobox:     { position: 'absolute', left: 214, top: 16, width: 50, height: 37 },
  kohole:    { position: 'absolute', left: 242, top: 26, width: 15, height: 11 },
  portrait:  { position: 'absolute', top: 64, width: 106, height: 106 },
  // The two cats and their names, as one layer: the stage's own coordinates.
  cats:      { position: 'absolute', inset: 0 },
  // The game's mount: a 2px paper ring round a 4px ink edge, cropped from the top.
  mount:     { width: 106, height: 106, boxSizing: 'border-box', padding: 2, background: '#fdfdf8', transition: 'filter 0.6s steps(10), opacity 0.6s steps(10)' },
  art:       { width: '100%', height: '100%', display: 'block', boxSizing: 'border-box', border: '4px solid #1a1a1a', objectFit: 'cover', objectPosition: 'top', background: '#e6e0d2' },
  bar:       { position: 'absolute' },
  txt:       { position: 'absolute', display: 'flex' },
  blink:     { animation: 'cradle-blink 0.37s steps(1, end) infinite' },
  name:      { position: 'absolute', top: 168, width: 106, display: 'flex', justifyContent: 'center' },
  // x 54 .. 430 inside the text box; three rows of 24 = 72, from y 226.
  log:       { position: 'absolute', left: 54, top: 226, width: 376, height: 72, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  row:       { minHeight: 24, flexShrink: 0 },
}
