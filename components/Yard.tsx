'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { between, bond, reads, temperOf, waiting, type Memory, type Resident } from '@/lib/yard'
import { visit, furnish, DEMO_KEY, KEY, MAX_TICKS, type Visit } from '@/lib/yardstore'
import { history, record, type Entry } from '@/lib/chronicle'
import { YardMap } from '@/components/YardMap'
import { CatSheet } from '@/components/CatSheet'
import { thoughtOf } from '@/lib/yardmap'
import { moodFor, settle, settled, MOOD_INK } from '@/lib/mood'
import { inkFor } from '@/lib/catink'
import { BitmapText, type Run } from '@/components/BitmapText'

/**
 * THE YARD — what your cats did with the cats of people you follow.
 *
 * JP: "for the yard we're still doing bromir text; but when interacting with cats
 * u can mouse over their name and see their pfp."
 *
 * ── A MAP AND A LOG, WHICH IS DWARF FORTRESS's ARRANGEMENT ───────────────────
 *
 * JP, 2026-09-07: "for the yard i would like it to be similar to the look of
 * dwarf fortress; but a very petit version… these cats arent mineing or anything;
 * so i would just like to focus on the social aspects."
 *
 * This file used to argue that a map was impossible, and the argument was sound
 * as far as it went: the cats are 250x199 PORTRAITS with no walk cycles, so a
 * garden of them milling about is not art this game has, and sliding portraits
 * around would look worse than saying what happened.
 *
 * A DF OVERWORLD NEEDS NO WALK CYCLE. Nothing animates — a creature is one tile
 * that is simply there, and the map is read rather than watched. That is exactly
 * what a portrait can do, so the objection was to ANIMATION, not to a map.
 *
 * The text stayed, because it carries the thing that actually matters, which is
 * HISTORY: a bond is the sum of what is still remembered. So the map says who is
 * stood with whom right now, and the lines below say how it got that way. See
 * components/YardMap.tsx.
 *
 * ── THE NAME IS THE PORTRAIT ─────────────────────────────────────────────────
 *
 * Every cat named in the text is hoverable, and hovering shows its face and whose
 * it is. That is what stops a wall of sentences being abstract: the cat that just
 * snubbed yours has an owner you follow, and it is one movement away.
 *
 * HOVER IS NOT ENOUGH ON ITS OWN. This is a mini app and most of its traffic is a
 * phone, where hover does not exist — so the same handler runs on tap and on
 * keyboard focus. A feature that only works with a mouse would be missing for
 * most people who see it.
 */

/*
 * WHAT EACH DEED READS AS.
 *
 * PLACEHOLDER PROSE, exactly like `reads()` in lib/yard.ts, and for the same
 * reason: this is JP's game and its voice is his. These say what happened
 * plainly so the mechanism can be judged, and nothing here should ship as the
 * final wording.
 */
/*
 * Written as the three pieces AROUND the two names, rather than as a sentence
 * with the names substituted back out of it.
 *
 * The first version built a sentence and split it apart on a regex to find where
 * the names went. It worked, and it would have broken the first time anybody
 * wrote a line whose wording did not fit the pattern — which is guaranteed, since
 * rewriting these is the entire point of them being placeholders.
 */
/**
 * WHAT A CAT SAYS ABOUT SOMETHING IT ONLY WATCHED.
 *
 * PLACEHOLDER PROSE, JP's to replace, like the rest.
 *
 * Same three pieces as SAYS, but the second name is the one being WATCHED, not
 * the one being done to — so the sentence has to be built the other way round or
 * it accuses an onlooker of a row it stood next to. Only the three loud deeds
 * can be witnessed at all; see `witnesses` in lib/yardmap.ts.
 */
const WATCHED: Partial<Record<Memory['kind'], [string, string, string]>> = {
  squabble: ['', ' saw ', ' fall out with somebody.'],
  groom:    ['', ' saw ', ' cleaning somebody up.'],
  showoff:  ['', ' saw ', ' showing off.'],
}

const SAYS: Record<Memory['kind'], [string, string, string]> = {
  greet:    ['', ' went over to say hello to ', '.'],
  play:     ['', ' and ', ' chased each other around.'],
  groom:    ['', ' cleaned ', "'s ears."],
  showoff:  ['', ' showed off in front of ', '.'],
  share:    ['', ' let ', ' eat first.'],
  snub:     ['', ' walked past ', ' without looking.'],
  squabble: ['', ' and ', ' fell out over nothing.'],
}

/* `art` now lives on Resident itself, because the map draws every cat. */
/*
 * owner and demo moved onto Resident, alongside art, for the same reason: the
 * map draws them and the map is typed on Resident.
 *
 * mine stays here. It is a fact about the VIEWER, not about the cat — the same
 * token is somebody else's in their yard.
 */
export type YardCat = Resident & { mine?: boolean }

/** A cat's name in a sentence: hover, tap or focus to see whose it is. */
function CatName({ cat, on, off }: { cat: YardCat; on: () => void; off: () => void }) {
  return (
    <button
      type="button"
      onMouseEnter={on}
      onMouseLeave={off}
      onFocus={on}
      onBlur={off}
      // Tap is the phone's hover, and this is mostly a phone.
      onClick={e => { e.preventDefault(); on() }}
      style={{
        background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer',
        /*
         * PAPER INKS. These were #ffd166 and #c4b5fd, which are for a dark
         * ground — on the log's paper they were very nearly invisible. The gold
         * is the same one the fight log prints a win in, so "this one is yours"
         * is the same colour in both places.
         */
        color: nameInk(cat),
        borderBottom: '1px dotted currentColor',
      }}
    >
      {cat.name}
    </button>
  )
}

/**
 * How many lines the log shows before it is opened.
 *
 * Three, because that is enough to see that something is HAPPENING without the
 * yard taking the whole screen it now sits at the top of. Two reads as a stub;
 * four starts pushing the rest of the page down again.
 */
/**
 * A LINE OF THE GAME'S OWN FONT, built from pieces that can differ in colour.
 *
 * JP: "you have to add my original font… I want the pixelated hand drawn stuff I
 * made, the same stuff that is used for the battle logs."
 *
 * He is right and it had been skipped. The fight's log has always drawn through
 * BitmapText — font.png, the sheet he drew — while the yard's log sat in the
 * hand-lettered web font. Two logs in one game in two different faces.
 *
 * BitmapText takes ONE string and ONE colour, which is all the fight log needs:
 * its lines are short and single-ink. A yard line is a sentence with cat names
 * coloured inside it, so it is composed from segments — each its own run, laid
 * out in a wrapping row so the sentence still breaks like a sentence.
 */
/**
 * A yard line: one flow of the game's font, with the cat names in their own ink.
 *
 * The first version put a BitmapText per coloured piece inside a wrapping row.
 * Each of those is its own flex container, so the sentence came out as blocks
 * that wrapped independently — "#346  #51" on one line and "and are chasing each
 * other" on the next. BitmapText takes runs now and lays the whole line out as it
 * always laid out a line.
 *
 * The names are still tappable. A transparent button sits over the run rather
 * than splitting the text, so the reveal is unaffected.
 */
function Bit({ runs, scale = 1 }: { runs: Run[]; scale?: number }) {
  return <BitmapText runs={runs.filter(r => r.text)} scale={scale} color={INK} />
}

/**
 * ONE SIDE OF A CONVERSATION: the portrait, the name, and the temperament.
 *
 * The temperament is here rather than left to the creature sheet because it is
 * the reason the lines below read the way they do. A cat that keeps snubbing the
 * other is not being arbitrary — it is bold, and bold leans that way. One word
 * turns a list of events into an explanation.
 */
function Mug({ cat }: { cat: YardCat }) {
  return (
    <div style={mugBox}>
      {cat.art
        ? <img src={cat.art} alt="" style={mug} />
        : <div style={{ ...mug, background: '#ddd6c4' }} />}
      <BitmapText text={cat.name} scale={1} color={nameInk(cat)} />
      <BitmapText text={temperOf(cat.face).label} scale={1} color="#8a8a7a" />
    </div>
  )
}

/**
 * WHAT A PAIR IS DOING — the headline on a conversation.
 *
 * JP: "I should be seeing cat one and cat two are talking. And then if I click on
 * that message line, then I can go into detail what they're talking about."
 *
 * The row used to read "#205 and #139 — friendly", which is a VERDICT: the sum of
 * everything between them reduced to one adjective, and the least interesting
 * thing available. This says what is happening instead, taken from the last thing
 * that passed between them.
 *
 * PLACEHOLDER PROSE like the rest, and JP's to replace.
 */
const TOGETHER: Record<Memory['kind'], string> = {
  greet:    'are talking',
  play:     'are chasing each other',
  groom:    'are grooming',
  showoff:  'are showing off',
  share:    'are sharing',
  snub:     'are not speaking',
  squabble: 'are arguing',
}

/**
 * WHAT A REMEMBERED MOMENT SAYS.
 *
 * PLACEHOLDER PROSE, JP's to replace, like everything else the yard says.
 *
 * The chronicle stores no words at all — an entry is two uids, the two bond
 * words it moved between, and the hour. The sentence is built here, so changing
 * these changes every entry ever written, including the ones already in storage.
 */
const TURNED = '{a} and {b} are {to} now.'
const WENT_OUT = '{a} went out with you.'
const STAYED_IN = '{a} never got out that day.'

/** The fight log's own pace, so both logs in the game type at the same speed. */
const LINE_MS = 850

/**
 * WHAT COLOUR A NAME IS. JP: "make each name color coded."
 *
 * Every cat had the same violet, so a line about two strangers gave the reader
 * nothing to hold on to — the names were the one part of the sentence carrying
 * WHO, and they all looked alike. Each cat now prints in its own background's
 * colour, which is the colour of its tile on the map above. See lib/catink.ts.
 *
 * YOUR OWN CATS STAY GOLD, and that is not an oversight. `mine` is a fact about
 * the reader, not about the cat, and it is the first question anybody asks of a
 * yard full of other people's animals. The map rings them for the same reason.
 * A cat's own colour is the answer to "which one is that"; gold is the answer to
 * "which ones are mine", and the second question is the more urgent one.
 */
const MINE_INK = '#a06a10'
const nameInk = (c: { uid: string; bg?: string | null; mine?: boolean }) =>
  c.mine ? MINE_INK : inkFor(c.uid, c.bg)

export function Yard({
  cats, busy, compact = false, full = false, onFight,
}: {
  cats: YardCat[]
  busy?: boolean
  /**
   * TAKES A CAT OUT, which is the only way a strange mood gets answered.
   *
   * Optional because it depends on where the yard is mounted: the front page
   * sits inside the game and can start a fight, the yard's own page cannot. The
   * ask is shown either way — a cat wanting something is worth seeing even where
   * you cannot act on it — and only the button depends on this.
   */
  onFight?: (uid: string) => void
  /**
   * The front-door version: a short log that opens, and the pair list left for
   * the yard's own page.
   *
   * It is the SAME component rather than a second one. A separate preview would
   * be a second place to fix every bug found in the first — and the map, the
   * furniture and the simulation are identical either way. Only how much of the
   * log is shown differs.
   */
  compact?: boolean
  /**
   * The yard's own page. The whole log, the pair list, and a creature sheet for
   * whichever cat is selected.
   *
   * Still the same component. `full` and `compact` are two ends of one dial
   * rather than two implementations, so a fix to the simulation, the map or the
   * furniture lands in both without being copied.
   */
  full?: boolean
}) {
  const [state, setState] = useState<Visit | null>(null)
  const [peek, setPeek] = useState<YardCat | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  /** Which pair's conversation is open. One at a time — this is a log, not a tree. */
  const [talking, setTalking] = useState<string | null>(null)

  /**
   * HOW MANY LINES HAVE ROLLED IN.
   *
   * JP: "I would like the same automatic text rolling that we get from our
   * gameplay into this text box."
   *
   * The fight log reveals a line at a time on a timer and the yard's arrived all
   * at once, which is the difference between being told what happened and
   * watching it. Same idea, same shape — a count that climbs on a timeout — and
   * the same LINE_MS the fight uses, so the two logs are paced alike.
   */
  const [rolled, setRolled] = useState(0)

  /** Bumped when a mood is answered, so the ask re-derives and disappears. */
  const [answers, setAnswers] = useState(0)

  /** The paper, so it can be scrolled as it fills. */
  const logRef = useRef<HTMLDivElement>(null)

  /** The conversation window's close control, which takes the focus when it opens. */
  const shutRef = useRef<HTMLButtonElement>(null)
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null)

  const byUid = useMemo(() => new Map(cats.map(c => [c.uid, c])), [cats])

  /*
   * ONE VISIT PER LIST, GUARDED BY A REF — not just by the dependency array.
   *
   * `visit()` WRITES: it plays out the absence and stamps the clock. React invokes
   * effects TWICE in development, so the first call ran the nine hours and saved,
   * and the second read the fresh stamp back, found nothing elapsed, and rendered
   * THAT — the history happened and the account of it was thrown away.
   *
   * A dependency array cannot prevent this, because both invocations have the
   * same dependencies. The ref can, and it costs nothing in production where the
   * double invoke does not happen.
   */
  const key = cats.map(c => c.uid).sort().join(',')
  const visited = useRef<string | null>(null)
  useEffect(() => {
    if (!cats.length) { setState(null); visited.current = null; return }
    if (visited.current === key) return
    visited.current = key
    setState(visit(cats, cats.some(c => c.demo) ? DEMO_KEY : undefined))
  }, [key])

  /*
   * ROLL THE LINES IN. Reset whenever the visit changes, then climb to the
   * number of lines there are and stop.
   *
   * LINE_MS matches the fight's 850, so both logs in this game type at one pace.
   * Somebody who asked for less motion gets the whole thing at once — a reveal
   * is motion, and it is the kind that cannot be skipped by scrolling past.
   */
  useEffect(() => { setRolled(0) }, [state])

  useEffect(() => {
    if (!state) return
    const total = Math.min(14, state.happened.length)
    if (rolled >= total) return

    const still = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still) { setRolled(total); return }

    const t = setTimeout(() => setRolled(n => n + 1), LINE_MS)
    return () => clearTimeout(t)
  }, [state, rolled])

  /*
   * FOLLOW THE LAST LINE DOWN, the same one line the fight log uses.
   *
   * Smooth, because the box scrolling is the one thing here that IS a
   * continuous motion — it is the reader being carried, not the world moving,
   * and it is what makes a fixed box read as filling rather than as truncated.
   */
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [rolled])

  /*
   * ESCAPE SHUTS THE CONVERSATION. Bound to the window rather than to the panel,
   * so it works whether or not anything inside it has focus.
   */
  useEffect(() => {
    if (!talking) return
    /*
     * THE WINDOW TAKES THE FOCUS. Without this it stays on the row behind the
     * scrim, so a keyboard is still walking the page underneath a panel that is
     * covering it.
     */
    shutRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTalking(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [talking])

  const show = useCallback((c: YardCat) => {
    if (clear.current) clearTimeout(clear.current)
    setPeek(c)
  }, [])
  const hide = useCallback(() => {
    // A short delay so moving between two names does not flicker the card away.
    if (clear.current) clearTimeout(clear.current)
    clear.current = setTimeout(() => setPeek(null), 120)
  }, [])

  /*
   * TODAY'S STRANGE MOOD, if the yard has one and it has not been answered yet.
   *
   * ABOVE THE EARLY RETURNS, and that is not a style choice. This sat below them
   * first and crashed the page outright — "rendered more hooks than during the
   * previous render" — because `busy` and an empty cast both return before this
   * line, so on those renders the hook simply did not run. Hooks are counted, not
   * named. Anything using one belongs above the first `return`.
   *
   * `state` can still be null here, so the guard moved inside rather than being
   * a reason to move the hook back down.
   *
   * `answers` is in the deps and nowhere in the body, deliberately: `settled`
   * reads localStorage, and storage does not tell React it changed. Bumping the
   * counter is what re-runs this so an answered ask disappears.
   */
  /*
   * WHICH YARD THIS IS. The demo yard and your own are two separate stores, and
   * the chronicle has to follow the same split — a demo's past is not yours.
   */
  const yardKey = cats.some(c => c.demo) ? DEMO_KEY : KEY

  /*
   * WHAT THE YARD REMEMBERS. Read once per render rather than kept in state —
   * it is storage, and `answers` already forces a re-read whenever this session
   * adds to it. Nothing else writes to it while the page is open.
   */
  const past: Entry[] = useMemo(() => history(yardKey), [yardKey, state, answers])

  const raw = state ? moodFor(state.state, cats) : null
  const mood = useMemo(
    () => (state && raw && !settled(state.state, raw) ? raw : null),
    [raw, state, answers],
  )

  const answer = (uid: string) => {
    if (state && raw) {
      settle(state.state, raw)
      /*
       * THE ONE ENTRY THE YARD DOES NOT WRITE FOR ITSELF. Every other line in
       * the chronicle is the simulation crossing a threshold on its own; this
       * one is you. It is also the only one that says the yard and the game are
       * the same game.
       */
      record(yardKey, [{ at: state.state.ticks, what: 'mood', a: uid, answered: true }])
    }
    setAnswers(n => n + 1)
    onFight?.(uid)
  }

  if (busy) return <p style={fine}>reading the yard…</p>
  if (!cats.length) return null

  if (state && waiting(state.state)) {
    return (
      <p style={fine}>
        Only one cat here. Follow somebody who owns one and they will turn up.
      </p>
    )
  }
  if (!state) return <p style={fine}>reading the yard…</p>

  const name = (uid: string) => byUid.get(uid)
  const recent = state.happened.slice(-14).reverse()

  /*
   * ONE LIST, ROLLED IN. There was a short version and a long one with a control
   * between them; the box scrolls now, so the only difference between the front
   * page and the yard's own is how tall the box is.
   */
  const shown = recent

  const pickedCat = picked ? byUid.get(picked) ?? null : null

  /*
   * EVERY PAIR WITH A HISTORY, MOST RECENTLY ACTIVE FIRST.
   *
   * It used to sort by the strongest bond, which is a ranking of VERDICTS. JP:
   * "right now I only see that they're friends, and I don't think that should be
   * what I should be seeing." Who is talking RIGHT NOW is the live thing; who
   * happens to be fondest is a summary of the past.
   */
  const pairs: { a: YardCat; b: YardCat; n: number; last: Memory }[] = []
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      const shared = between(state.state, cats[i].uid, cats[j].uid, 1)
      if (!shared.length) continue
      pairs.push({
        a: cats[i], b: cats[j],
        n: bond(state.state, cats[i].uid, cats[j].uid),
        last: shared[0],
      })
    }
  }
  pairs.sort((x, y) => y.last.tick - x.last.tick)

  /*
   * THE CONVERSATION THAT IS OPEN, found in the list rather than copied out of
   * it. The pair list is rebuilt from the yard every time an hour passes, so a
   * row held in state would leave the window showing a conversation that has
   * since moved on — and it would keep showing it after the memory faded.
   */
  const chat = talking ? pairs.find(q => q.a.uid + q.b.uid === talking) ?? null : null
  const said = chat ? between(state.state, chat.a.uid, chat.b.uid, 20) : []


  return (
    <div style={{ position: 'relative' }}>
      <p style={{ ...fine, marginBottom: 10 }}>
        {state.fresh
          ? `${cats.length} cats in the yard. Come back later and they will have got on with it.`
          : state.hours === 0
            ? 'Nothing new since you last looked in.'
            : `While you were away — ${state.hours} hour${state.hours === 1 ? '' : 's'}${
                state.hours >= MAX_TICKS ? ' (as much as the yard plays out)' : ''}.`}
      </p>

      {/*
        THE MAP SITS ABOVE THE LOG, which is DF's own arrangement: the world
        first, then the announcements about it. The map tells you the SHAPE of
        things — who is stood together, who is off on their own, what there is to
        do out there — and the lines below say what actually happened.
      */}
      <div style={{ marginBottom: 14 }}>
        <YardMap
          mood={mood}
          onAnswer={onFight ? answer : undefined}
          yard={state.state}
          mine={cats.filter(c => c.mine).map(c => c.uid)}
          replay
          picked={full ? picked : undefined}
          onPick={full ? setPicked : undefined}
          onFurnish={prop => {
            const s = furnish(prop, yardKey)
            // Null only before a first visit has been saved, which cannot be
            // reached from here — the map is not rendered until one has.
            if (s) setState({ ...state, state: s })
          }}
        />
      </div>

      {/*
        THE SHEET SITS DIRECTLY UNDER THE MAP, where the tap happened. Putting it
        below the log would mean tapping a cat and watching the answer appear off
        the bottom of the screen.
      */}
      {full && pickedCat && (
        <div style={{ marginBottom: 14 }}>
          <CatSheet
            cat={pickedCat}
            yard={state.state}
            others={cats}
            onClose={() => setPicked(null)}
          />
        </div>
      )}

      {/*
        THE YARD'S LOG IS ON THE SAME PAPER AS THE BATTLE LOG.

        Cradle.tsx states the rule for the fight and it holds here for the same
        reason: "everything else is dark; the log is the one warm surface, and it
        is where the eye should go."

        It also does something the fight log does not have to: the map above is
        dark, so paper underneath separates the WORLD from the ACCOUNT of it
        without a heading or a rule between them. You look at the dark thing to
        see where everyone is and at the warm thing to read what they did.
      */}
      {/*
        ONLY IF THERE IS SOMETHING TO PUT ON IT.

        This asked whether the yard had any history AT ALL, which is not the same
        question as whether anything is about to be drawn. Look in twice within an
        hour and there are no new lines, the preview hides the pair list, and the
        grow control hides itself because there is nothing to grow — so an empty
        sheet of paper rendered under the map.
      */}
      {(shown.length > 0 || pairs.length > 0) && (
        <div ref={logRef} style={{ ...paper, maxHeight: compact ? 190 : 340 }}>
          {shown.slice(0, rolled).map((m, i) => {
            const a = name(m.a), b = name(m.b)
            if (!a || !b) return null
            /*
             * A WATCHED LINE READS DIFFERENTLY, because it IS different: `a`
             * was not in it. Falling back to SAYS when a kind has no watched
             * wording would print the lie rather than nothing, so the line is
             * dropped instead — witnesses only ever carry the three kinds that
             * WATCHED covers, so this cannot silently swallow anything real.
             */
            const line = m.seen ? WATCHED[m.kind] : SAYS[m.kind]
            if (!line) return null
            const [before, mid, after] = line
            const ink = DEED_INK[m.kind]
            /*
             * THE VERB BEATS, THE NAMES DO NOT. The deed is what just happened;
             * the two cats were already there. Moving them as well would turn a
             * beat into the whole line twitching, which is the thing the fight
             * log deliberately does not do.
             */
            const beat = Math.abs(m.delta) >= BEATS_AT ? DEED_BEAT[m.kind] : undefined
            return (
              <Bit
                key={i}
                runs={[
                  { text: before, color: ink, beat },
                  { text: a.name, color: nameInk(a) },
                  { text: mid, color: ink, beat },
                  { text: b.name, color: nameInk(b) },
                  { text: after, color: ink, beat },
                ]}
              />
            )
          })}
          {/*
            THE CARET, exactly as the fight log has one — it says the page is
            still typing rather than finished and short.
          */}
          {rolled < shown.length && <span style={caret}>▌</span>}


          {/*
            WHO IS TALKING sits under the day's lines in the same box. The log is
            what just happened; this is where everybody stands afterwards. The box
            scrolls between them rather than making it a choice.
          */}
          {/*
            WHAT THE YARD REMEMBERS — the half of it that does not fade.
            
            JP asked how the yard could make stories the way a fortress does. The
            log is what just happened and it scrolls away; the pair list is where
            everybody stands right now. Neither of them is a PAST. This is: the
            hours things BECAME true, kept after the memories behind them have
            gone.

            Under the pair list rather than above it, because it is the least
            urgent thing on the page and the most rewarding — you go looking for
            it, the way you go looking for Legends.

            FULL ONLY. The front page is a preview and this is the part that pays
            off after weeks, not the part that sells the first look.
          */}
          {full && past.length > 0 && (
            <>
              <div style={rule}><BitmapText text="WHAT THE YARD REMEMBERS" scale={1} color="#8a8a7a" /></div>
              {past.slice(0, 12).map((e, i) => {
                const a = name(e.a)
                const b = e.what === 'bond' ? name(e.b) : null
                if (!a || (e.what === 'bond' && !b)) return null
                const ago = state.state.ticks - e.at

                /*
                 * BUILT FROM THE TEMPLATE, not from words typed here. Splitting
                 * on the placeholders is what makes TURNED and the two mood
                 * lines the ONLY place the wording lives — edit one and every
                 * entry already in storage changes with it, because the entries
                 * never held any words in the first place.
                 */
                const runs: Run[] = e.what === 'bond'
                  ? (() => {
                      const [head, r1] = TURNED.split('{a}')
                      const [mid, r2] = r1.split('{b}')
                      const [join, tail] = r2.split('{to}')
                      return [
                        { text: head },
                        { text: a.name, color: nameInk(a) },
                        { text: mid },
                        { text: b!.name, color: nameInk(b!) },
                        { text: join },
                        { text: e.to, color: BOND_INK[e.to] ?? INK_FAINT },
                        { text: tail },
                      ]
                    })()
                  : (() => {
                      const [head, tail] = (e.answered ? WENT_OUT : STAYED_IN).split('{a}')
                      return [
                        { text: head },
                        { text: a.name, color: nameInk(a) },
                        { text: tail, color: MOOD_INK },
                      ]
                    })()

                return (
                  <div key={i} style={convoRow}>
                    <Bit runs={runs} />
                    <BitmapText
                      text={ago <= 0 ? 'just now' : `${ago}h`}
                      scale={1}
                      color="#8a8a7a"
                    />
                  </div>
                )
              })}
            </>
          )}

          {pairs.length > 0 && (
            <>
              <div style={rule}><BitmapText text="WHO IS TALKING" scale={1} color="#8a8a7a" /></div>
              {pairs.slice(0, 8).map(({ a, b, n, last }) => {
                const id = a.uid + b.uid
                return (
                  <div key={id}>
                    {/*
                      THE WHOLE LINE OPENS IT, not a chevron at the end. On a phone
                      a row is the target; a separate control is a smaller one for
                      no reason.
                    */}
                    <button
                      onClick={() => setTalking(id)}
                      aria-haspopup="dialog"
                      style={pairRow}
                    >
                      <Bit runs={[
                        { text: a.name, color: nameInk(a) },
                        { text: ' and ' },
                        { text: b.name, color: nameInk(b) },
                        { text: ' ' + TOGETHER[last.kind], color: DEED_INK[last.kind] },
                      ]} />
                      {/*
                        The verdict is kept, but demoted to the end of the line
                        where it belongs — it is the summary, not the news.
                      */}
                      <BitmapText text={reads(n)} scale={1} color={BOND_INK[reads(n)] ?? INK_FAINT} />
                    </button>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/*
        THE CONVERSATION OPENS IN A WINDOW OVER THE YARD.

        JP: "make it so that you can click on the conversations and also open up
        a, like, a little side window or, like, a window within a window, so you
        know what they're talking about."

        It used to unfold UNDER the row, inside the log. That is a disclosure, not
        a window, and the box it lives in scrolls: opening one pushed every other
        pair down, and the row you tapped could slide out from under you while you
        were reading it. DF does not do that either — it draws a panel on top and
        leaves the map exactly where it was.

        FIXED, NOT ABSOLUTE. The yard is a map and a log stacked, which is taller
        than a phone screen. A panel centred inside that block would open above or
        below whatever the reader is actually looking at; fixed to the viewport it
        opens where their eyes already are.

        NOTHING FADES IN. The rule holds here as it does on the map: the window is
        there or it is not.
      */}
      {chat && (
        <>
          <div style={scrim} onClick={() => setTalking(null)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${chat.a.name} and ${chat.b.name}`}
            style={windowBox}
          >
            {/* The title bar is what makes it read as a window rather than a card. */}
            <div style={titleBar}>
              <Bit runs={[
                { text: chat.a.name, color: nameInk(chat.a) },
                { text: ' and ' },
                { text: chat.b.name, color: nameInk(chat.b) },
              ]} />
              <button
                ref={shutRef}
                onClick={() => setTalking(null)}
                aria-label="Close"
                style={shut}
              >
                <BitmapText text="X" scale={1} color="#8a8a7a" />
              </button>
            </div>

            {/*
              THE TWO OF THEM, FACING EACH OTHER, with the verdict between them.
              The row in the log could only NAME the pair. There is room here to
              show who is talking, which is the reason to open a window at all.
            */}
            <div style={facing}>
              <Mug cat={chat.a} />
              <div style={middle}>
                <Bit runs={[{ text: TOGETHER[chat.last.kind], color: DEED_INK[chat.last.kind] }]} />
                <BitmapText
                  text={reads(chat.n)}
                  scale={1}
                  color={BOND_INK[reads(chat.n)] ?? INK_FAINT}
                />
              </div>
              <Mug cat={chat.b} />
            </div>

            {/*
              WHAT PASSED BETWEEN THEM, newest first — the same direction the log
              and the creature sheet read in, so the page never asks anybody to
              turn around halfway through.

              TWENTY, not the eight the row used to unfold. A window has somewhere
              to put them: this scrolls and the frame around it does not move.
            */}
            <div style={windowBody}>
              {said.map((m, i) => {
                const speaker = m.a === chat.a.uid ? chat.a : chat.b
                const other = m.a === chat.a.uid ? chat.b : chat.a
                const t = thoughtOf(m, speaker.uid, other.name)
                const ago = state.state.ticks - m.tick
                return (
                  <div key={i} style={convoRow}>
                    <Bit runs={[
                      { text: speaker.name, color: nameInk(speaker) },
                      { text: ' ' + t.text, color: t.good ? '#2f7a44' : '#a01b1b' },
                    ]} />
                    <BitmapText
                      text={ago <= 0 ? 'just now' : `${ago}h`}
                      scale={1}
                      color="#8a8a7a"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/*
        THE PEEK CARD. Pinned rather than following the cursor: a card that chases
        the pointer cannot exist on a phone, where the same interaction is a tap.
      */}
      {peek && (
        <div style={card} onMouseEnter={() => show(peek)} onMouseLeave={hide}>
          {peek.art
            ? <img src={peek.art} alt="" style={{ width: 64, height: 51, objectFit: 'cover',
                imageRendering: 'pixelated', borderRadius: 6, border: '1px solid #21212f' }} />
            : <div style={{ width: 64, height: 51, background: '#0b0b13', borderRadius: 6 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: peek.mine ? '#ffd166' : '#f0f0f5' }}>{peek.name}</div>
            <div style={{ ...fine, margin: 0 }}>
              {peek.mine ? 'yours' : peek.owner ? `@${peek.owner.username}` : 'somebody you follow'}
              {' · '}{temperOf(peek.face).label}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/*
 * THE SAME PAPER AND INK AS THE FIGHT, copied deliberately rather than imported.
 *
 * Cradle.tsx keeps them as module constants and does not export them, and there
 * is no shared theme file to put them in. Reaching into that file for two colours
 * would couple the yard to the fight screen's internals for no gain — but the
 * VALUES must match, because two nearly-identical papers side by side look like a
 * mistake where one paper looks like a decision.
 */
const PAPER = '#f2eee3'
const INK = '#1a1a1a'
const INK_FAINT = '#6b6b60'

/**
 * WHAT COLOUR EACH DEED IS PRINTED IN.
 *
 * Taken from the fight log's own KIND_INK rather than picked fresh: that palette
 * was already chosen to sit on this exact paper, and a second set of inks would
 * drift away from it. Warm deeds are green and gold, flashy is the crit orange,
 * a snub is the same grey as a miss, and a squabble is the KO red.
 *
 * The mood glyphs on the map are NOT these colours, and that is correct — those
 * sit on a dark tile over cat art, these sit on paper. Same meaning, different
 * ground.
 */
const DEED_INK: Record<Memory['kind'], string> = {
  greet:    '#3f6ea8',
  play:     '#2f7a44',
  share:    '#2f7a44',
  groom:    '#a06a10',
  showoff:  '#c2410c',
  snub:     INK_FAINT,
  squabble: '#a01b1b',
}

/**
 * THE OTHER END OF A DEED'S FLASH.
 *
 * JP: "do the same thing we do in battles with verbs for animated text."
 *
 * The fight's crit line flashes #c2410c against #e0a010 — the ink it is already
 * printed in, against a lighter, hotter version of the same hue. These are that
 * same relationship for each deed, so a squabble flashes red against a brighter
 * red rather than against somebody else's colour.
 */
const DEED_BEAT: Record<Memory['kind'], string> = {
  greet:    '#6f9ed8',
  play:     '#4fb06a',
  share:    '#4fb06a',
  groom:    '#e0a010',
  showoff:  '#e86a2a',
  snub:     '#9a9a90',
  squabble: '#e04040',
}

/**
 * WHICH LINES GET THE BEAT, and why it is not all of them.
 *
 * The fight animates ONE kind of line — the crit — and that is the whole reason
 * it reads as something happening. If every line moved, none of them would.
 *
 * The yard's equivalent of a crit is the size of the thing that just happened,
 * and the yard already has that number: the delta the memory carries. The deed
 * table runs greet 1, showoff 2, share 2, snub -2, play 3, groom 4, squabble -4,
 * so a cut at 4 is the two ends of the scale — the warmest thing two cats do and
 * the worst. A fumbled kind deed lands here too, which is right: a groom that
 * went wrong moved the bond just as far.
 */
const BEATS_AT = 4

/** Keyed by what `reads()` says, so the two cannot disagree. */
const BOND_INK: Record<string, string> = {
  inseparable: '#a06a10',
  friendly:    '#2f7a44',
  wary:        INK_FAINT,
  cold:        '#c2410c',
  enemies:     '#a01b1b',
}

const fine: React.CSSProperties = { color: '#63637d', fontSize: 11, margin: 0, lineHeight: 1.6 }
const say: React.CSSProperties = { color: '#a9a9c0', fontSize: 13, margin: 0, lineHeight: 1.6 }
const label: React.CSSProperties = { fontSize: 10, letterSpacing: 2, color: '#7a7a95', margin: '4px 0 8px' }

/*
 * A FIXED BOX THAT SCROLLS, exactly like the fight's log.
 *
 * JP: "it should be an automatic scroll down instead of show more or show less.
 * I should see the text move instead of it expanding."
 *
 * This used to grow to fit, with a control to open and close it — which made the
 * page jump every time a line landed and put a decision in front of somebody who
 * only wanted to read. The fight log has never done that: it is 320 tall, it
 * types, and it scrolls itself.
 *
 * The same reasoning it was written under applies here now that the yard types
 * too — the box must not resize under the reader while it is filling.
 */
const paper: React.CSSProperties = {
  background: PAPER, color: INK, borderRadius: 14, padding: '16px 16px 14px',
  boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
  marginBottom: 14,
  display: 'flex', flexDirection: 'column', gap: 6,
  /*
   * Shorter than the fight's 320 on the front page, because the yard is a
   * PREVIEW there and sits above everything else on the screen. The yard's own
   * page gives it the room.
   */
  overflowY: 'auto',
}

const line: React.CSSProperties = { color: INK, fontSize: 13, margin: 0, lineHeight: 1.55 }

/* The same caret the fight log shows while it is still typing. */
const caret: React.CSSProperties = { color: '#8a8a7a', fontSize: 14, lineHeight: 1 }

/* A pair, as a row you can open. Printed, not chromed — it sits on the paper. */
const pairRow: React.CSSProperties = {
  display: 'flex', width: '100%', gap: 10, alignItems: 'baseline',
  justifyContent: 'space-between', textAlign: 'left',
  background: 'none', border: 0, padding: '2px 0',
  font: 'inherit', fontSize: 13, color: INK, cursor: 'pointer',
}

const convoRow: React.CSSProperties = {
  display: 'flex', gap: 10, justifyContent: 'space-between',
  alignItems: 'baseline', fontSize: 12.5, lineHeight: 1.45,
}


/*
 * THE SCRIM DIMS THE YARD, IT DOES NOT HIDE IT.
 *
 * The map underneath is what the conversation is ABOUT. Blanking it would break
 * the one connection worth keeping: the two names in the title bar are two tiles
 * still visible behind it.
 */
const scrim: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 40,
  background: 'rgba(6,6,12,0.72)',
}

/*
 * THE WINDOW. Same paper as the log, because it holds the same kind of writing —
 * lifted off the page by a hard frame and a shadow, which is the whole
 * difference between a panel that is ON the page and one that is OVER it.
 *
 * THE BORDER IS STATED IN FULL, AND IT IS 2px. React warns outright when a
 * shorthand and its longhand meet on one element across a state change, and 2 is
 * the width this app actually uses — assuming 1 is the mistake that has already
 * been made here once.
 *
 * overflow hidden on the frame, scrolling on the body inside it: the title bar
 * and the two portraits stay put while the exchange moves under them.
 */
const windowBox: React.CSSProperties = {
  position: 'fixed', zIndex: 41,
  left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
  width: 'min(460px, calc(100vw - 28px))',
  maxHeight: 'min(78vh, 560px)',
  display: 'flex', flexDirection: 'column',
  background: PAPER, color: INK,
  border: '2px solid #171720', borderRadius: 12,
  boxShadow: '0 18px 48px rgba(0,0,0,0.6)',
  overflow: 'hidden',
}

const titleBar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  padding: '10px 12px',
  background: 'rgba(0,0,0,0.05)',
  borderBottom: '2px solid rgba(0,0,0,0.14)',
}

/*
 * 32 SQUARE, WHICH IS A THUMB.
 *
 * It was the glyph's own size plus a few pixels of padding, which is about 14px
 * of target on a phone. The scrim and Escape both close the window as well, but
 * the X is the one people will aim for, and it is the one that has to be hittable.
 */
const shut: React.CSSProperties = {
  background: 'none', border: 0, padding: 0, cursor: 'pointer',
  width: 32, height: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
}

const facing: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  padding: '12px 10px',
  borderBottom: '1px solid rgba(0,0,0,0.10)',
}

/*
 * PINNED TO THE PORTRAIT'S WIDTH, so the column cannot decide its own size.
 *
 * The name and the temperament sit under the portrait, and either can be wider
 * than it is. Left to itself the column would take that width from the text
 * between the two cats, which is the one part with a measured budget.
 */
const mugBox: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
  width: 84, flexShrink: 0, minWidth: 0,
}

/*
 * 84 WIDE, WHICH IS THE ART'S OWN SHAPE AT A SIZE YOU CAN READ A FACE AT.
 *
 * It was 64x51, borrowed from the peek card — but that card is a label beside a
 * name, and this is the reason the window exists. The cats are 250x199, so 84x67
 * holds the ratio exactly and nothing is squashed.
 *
 * 84 AND NOT MORE, AND THAT IS MEASURED. The window is 347 wide on a phone, and
 * two portraits plus the gaps and the padding leave 139 for the column between
 * them.
 *
 * That is a budget, not a guarantee, and the thing spending it is the DEED
 * PHRASE — which is placeholder prose in TOGETHER and will change. Measured
 * across a full demo yard: six of eight pairs fit one line, and the two showing
 * "are chasing each other" take three. That is fine and deliberate. The column
 * is centred and the row is centred with it, so a wrap makes the box taller
 * without making it crooked.
 *
 * 84 is where the SHORT phrases stop wrapping, which is the case worth buying.
 * At 88 even "are not speaking" went over, and that one pushed the names below
 * the portraits and left the row lopsided — a worse trade than four pixels.
 *
 * The border is inside the 84: box-sizing is border-box here, so the drawn
 * portrait is 84x67 even though clientWidth reports 80. Measure this one with
 * getBoundingClientRect or it looks like it is being shrunk.
 */
const mug: React.CSSProperties = {
  width: 84, height: 67,
  objectFit: 'cover', imageRendering: 'pixelated',
  borderRadius: 6, border: '2px solid rgba(0,0,0,0.18)', display: 'block',
}

/* What they are doing, and the verdict, between the two of them. */
const middle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  textAlign: 'center', minWidth: 0,
}

/* The exchange. This is the part that scrolls; the frame around it does not. */
const windowBody: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
  padding: '12px 14px 14px',
  overflowY: 'auto',
}

/* The divider inside the paper. Ruled, the way a printed sheet would be. */
const rule: React.CSSProperties = {
  fontSize: 10, letterSpacing: 2, color: '#8a8a7a',
  margin: '8px 0 2px', paddingTop: 10,
  borderTop: '1px solid rgba(0,0,0,0.10)',
}
/*
 * THE CARD IS AS WIDE AS WHAT IS IN IT.
 *
 * It was full width, and it holds a 64px portrait and two short lines — a name
 * and an owner. Stretched across the column that left most of the box empty and
 * it read as a bar rather than a card, which is what made it look wrong sitting
 * under the map.
 *
 * `fit-content` shrink-wraps it. `maxWidth: 100%` keeps a long username from
 * pushing it past the column, and `minWidth: 0` on the text block inside lets the
 * name ellipsize rather than force the card wider.
 *
 * The bottom margin is not decoration either: sticky pins it 8px off the bottom
 * of the viewport, and without clearance it lands flush against the section's own
 * border and reads as cut off.
 */
const card: React.CSSProperties = {
  position: 'sticky', bottom: 8,
  marginTop: 12, marginBottom: 4,
  width: 'fit-content', maxWidth: '100%',
  display: 'flex', gap: 10, alignItems: 'center',
  background: '#12121c', border: '1px solid #21212f', borderRadius: 10, padding: 8,
  // It floats over the log when pinned, so it needs its own ground and a lift.
  boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
}
