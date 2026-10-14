'use client'

import { useEffect, useState } from 'react'
import { PageTitle } from '@/components/PageTitle'
import { Ratxecutioner } from '@/components/Ratxecutioner'
import { guestId } from '@/lib/stable'
import { ONLINE, newRoomCode } from '@/lib/ratxNet'

/**
 * RATXECUTIONER — the first-person rat hunt (components/Ratxecutioner).
 * JP, 2026-10-13: a Doom mod with cats, from the 7-Eleven game's Rat King's Lair.
 *
 * The status-bar face is THE PLAYER'S OWN CAT (JP: "just use their cat as the
 * pfp face"): the one last picked on the front page (Cradle keeps it in
 * cradle.lastcat.v1), or, with none, their guest cat — the same picture their
 * guest fights with (/api/fight: cat-art seeded by the guest code).
 *
 * ONLINE (JP: "a timed death match", "finish multiplayer"): a room is a 4-letter
 * code in the address (?room=ABCD). Make one and send the link, or type a friend's
 * code. Up to six cats, five minutes a match (ratx-server). The online box shows
 * only where a room server is set (NEXT_PUBLIC_RATX_WS).
 */
export default function RatxecutionerPage() {
  const [face, setFace] = useState<string | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let img: string | null = null
    try { img = JSON.parse(window.localStorage.getItem('cradle.lastcat.v1') ?? 'null')?.image ?? null } catch {}
    setFace(img ?? `/api/cat-art?seed=${guestId()}`)
    try { setName(window.localStorage.getItem('ratx.name.v1') ?? '') } catch {}
    const r = new URLSearchParams(location.search).get('room')
    if (r && /^[A-Z0-9]{3,8}$/i.test(r)) setRoom(r.toUpperCase())
  }, [])
  const go = (r: string | null) => {
    try { window.localStorage.setItem('ratx.name.v1', name) } catch {}
    const u = new URL(location.href)
    if (r) u.searchParams.set('room', r); else u.searchParams.delete('room')
    history.replaceState(null, '', u)
    setRoom(r)
  }
  const link = room ? `${typeof location === 'undefined' ? '' : location.origin}/ratxecutioner?room=${room}` : ''
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }

  return (
    <main style={st.page}>
      <PageTitle text="RATXECUTIONER" />
      <section className="win98" data-title={room ? `RATXECUTIONER.EXE — ROOM ${room}` : 'RATXECUTIONER.EXE'} style={st.win}>
        {face && <Ratxecutioner key={room ?? 'solo'} face={face} room={room ?? undefined} name={name.trim() || 'CAT'} />}
        <p style={st.p}>
          {room
            ? 'A timed deathmatch: five minutes, up to six cats. Knock out cats and rats for points. Hold Tab for the scoreboard.'
            : 'The rats are loose in the lair. Gold nuggets give ammo and health. Every wave brings more rats.'}
        </p>
      </section>

      {ONLINE && (
        <section className="win98" data-title="PLAY ONLINE" style={st.win}>
          {room ? (
            <div style={st.row}>
              <span style={st.p}>Room <b style={st.code}>{room}</b>. Send this link to your friends:</span>
              <input id="ratx-link" readOnly value={link} style={{ ...st.input, flex: '1 1 260px' }} onFocus={e => e.currentTarget.select()} />
              <button className="plain" style={st.btn} onClick={copy}>{copied ? 'COPIED' : 'COPY LINK'}</button>
              <button className="plain" style={st.btn} onClick={() => go(null)}>LEAVE</button>
            </div>
          ) : (
            <div style={st.col}>
              <div style={st.row}>
                <label htmlFor="ratx-name" style={st.p}>Your name</label>
                <input id="ratx-name" maxLength={16} value={name} placeholder="CAT" onChange={e => setName(e.target.value)} style={{ ...st.input, width: 200 }} />
              </div>
              <div style={st.row}>
                <button className="plain" style={st.btn} onClick={() => go(newRoomCode())}>MAKE A ROOM</button>
                <span style={st.p}>or join one:</span>
                <input id="ratx-code" maxLength={8} value={code} placeholder="ABCD" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} style={{ ...st.input, width: 110 }} />
                <button className="plain" style={st.btn} disabled={code.length < 3} onClick={() => go(code)}>JOIN</button>
              </div>
            </div>
          )}
        </section>
      )}
      <a href="/" style={{ alignSelf: 'center', color: '#000080', fontSize: 18 }}>Back to the cats</a>
    </main>
  )
}

const st: Record<string, React.CSSProperties> = {
  page:  { maxWidth: 960, margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box' },
  win:   { background: '#c0c0c0', padding: 16, color: '#000' },
  p:     { margin: '10px 0 0', fontSize: 18 },
  row:   { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  col:   { display: 'flex', flexDirection: 'column', gap: 10 },
  code:  { color: '#000080', letterSpacing: 2 },
  input: { fontSize: 18, fontFamily: 'inherit', padding: '6px 8px', border: 0, background: '#fff', boxShadow: 'inset 1px 1px 0 #808080, inset 2px 2px 0 #0a0a0a, inset -1px -1px 0 #fff, inset -2px -2px 0 #dfdfdf', minWidth: 0 },
  btn:   { padding: '8px 14px', fontSize: 18, fontFamily: 'inherit', color: '#000', background: '#c0c0c0', border: 0, cursor: 'pointer', boxShadow: 'inset -1px -1px 0 0 #0a0a0a, inset 1px 1px 0 0 #ffffff, inset -2px -2px 0 0 #808080, inset 2px 2px 0 0 #dfdfdf' },
}
