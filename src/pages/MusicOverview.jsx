import { useState, useMemo } from 'react'

// ─── Instrument config ────────────────────────────────────────────────────────
const INST_CFG = {
  guitar: { label: 'Guitar', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  piano:  { label: 'Piano',  color: '#06b6d4', bg: 'rgba(6,182,212,0.12)'  },
  drums:  { label: 'Drums',  color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
}
const INSTS        = ['guitar', 'piano', 'drums']
const SUMMER_START = '2026-06-01'
const SUMMER_END   = '2026-09-15'
const SUMMER_WEEKS = 15

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDateStr(d) {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function fromStr(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function todayStr() { return toDateStr(new Date()) }
function addDays(s, n) {
  const d = fromStr(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}
function dayDiff(a, b) {
  return Math.round((fromStr(b) - fromStr(a)) / 86400000)
}
function formatRelDate(s) {
  if (!s) return '—'
  const diff = dayDiff(s, todayStr())
  if (diff < 0)  return `in ${-diff}d`
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7)  return `${diff}d ago`
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`
  return `${Math.floor(diff / 30)}mo ago`
}
function currentSummerWeek() {
  const diff = dayDiff(SUMMER_START, todayStr())
  return Math.min(Math.max(Math.floor(diff / 7) + 1, 1), SUMMER_WEEKS)
}
function last7Days() {
  const days = []
  for (let i = 6; i >= 0; i--) days.push(addDays(todayStr(), -i))
  return days
}

// ─── Stats helpers ────────────────────────────────────────────────────────────
function getPhase(pct) {
  if (pct === 0)  return 'Not started'
  if (pct < 25)  return 'Foundations'
  if (pct < 50)  return 'Building Skills'
  if (pct < 75)  return 'Advancing'
  if (pct < 100) return 'Mastering'
  return 'Completed'
}

function instStats(tracker, inst, topics) {
  let total = 0, done = 0
  const byTopic = {}
  for (const [t, items] of Object.entries(topics)) {
    const st     = tracker[inst]?.[t] || []
    const tdone  = st.filter(s => s === 'complete').length
    total += items.length
    done  += tdone
    byTopic[t] = { done: tdone, total: items.length, ip: st.some(s => s === 'in-progress') }
  }
  const pct = total > 0 ? done / total * 100 : 0
  return { total, done, pct, byTopic, phase: getPhase(pct) }
}

function computeStreak(sessions, inst) {
  const days  = new Set(sessions.filter(s => s.instrument === inst).map(s => s.date))
  const today = todayStr()
  const yday  = addDays(today, -1)
  if (!days.has(today) && !days.has(yday)) return 0
  let cur    = days.has(today) ? today : yday
  let streak = 0
  while (days.has(cur)) { streak++; cur = addDays(cur, -1) }
  return streak
}

function lastPracticed(sessions, inst) {
  const dates = sessions.filter(s => s.instrument === inst).map(s => s.date).sort()
  return dates.length ? dates[dates.length - 1] : null
}

function avgPerWeek(sessions, inst) {
  const s = sessions.filter(s => s.instrument === inst)
  if (!s.length) return 0
  const earliest = s.map(x => x.date).sort()[0]
  const weeks = Math.max(dayDiff(earliest, todayStr()) / 7, 1)
  return (s.length / weeks).toFixed(1)
}

function buildCombinedPrompt(tracker, topicsMap) {
  const lines = []
  for (const inst of INSTS) {
    const topics = topicsMap[inst] || {}
    for (const [topic, items] of Object.entries(topics)) {
      const st  = tracker[inst]?.[topic] || []
      const idx = st.findIndex(s => s === 'in-progress')
      if (idx >= 0) lines.push(`  • ${INST_CFG[inst].label} / ${topic}: "${items[idx]}"`)
    }
  }
  if (!lines.length) return null
  return `I'm learning multiple instruments and currently working on these specific concepts:\n\n${lines.join('\n')}\n\nFor each topic above, please give me a focused, practical lesson tailored to exactly where I am. For each one include:\n- A clear explanation of the concept\n- Specific exercises I can do right now\n- What to focus on in today's practice session\n- Tips to make it click faster\n\nKeep each lesson concise and actionable.`
}

// ─── Circular progress ring ───────────────────────────────────────────────────
function CircleRing({ pct = 0, color = '#6366f1', size = 84, sw = 7 }) {
  const r    = size / 2 - sw
  const circ = 2 * Math.PI * r
  const dash = circ * Math.min(pct, 100) / 100
  const cx   = size / 2
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke="rgba(255,255,255,0.07)" strokeWidth={sw}/>
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray .5s ease' }}/>
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: Math.round(size * 0.19), fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1 }}>
          {Math.round(pct)}%
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>done</div>
      </div>
    </div>
  )
}

// ─── Summer countdown ─────────────────────────────────────────────────────────
function SummerCountdown() {
  const week = currentSummerWeek()
  const pct  = week / SUMMER_WEEKS * 100
  const left = SUMMER_WEEKS - week
  return (
    <div className="card" style={{ padding: '14px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Summer Progress</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
          Week <span style={{ color: 'var(--text)', fontWeight: 800 }}>{week}</span>
          <span style={{ opacity: .5 }}> / {SUMMER_WEEKS}</span>
        </div>
      </div>
      <div className="progress-wrap" style={{ height: 7, marginBottom: 7 }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--accent) 0%, #06b6d4 100%)',
          borderRadius: 4, transition: 'width .5s ease',
          boxShadow: '0 0 10px rgba(99,102,241,0.35)',
        }}/>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
        <span>Jun 1</span>
        <span style={{ color: 'var(--text-light)' }}>
          {left > 0 ? `${left} week${left !== 1 ? 's' : ''} remaining` : 'Summer complete'}
        </span>
        <span>Sep 15</span>
      </div>
    </div>
  )
}

// ─── Progress section ─────────────────────────────────────────────────────────
function ProgressCard({ inst, tracker, topics, colors }) {
  const cfg   = INST_CFG[inst]
  const stats = instStats(tracker, inst, topics)

  return (
    <div className="card" style={{ padding: '20px', borderTop: `3px solid ${cfg.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{cfg.label}</div>
          <div style={{
            display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '.06em',
            padding: '2px 8px', borderRadius: 4, background: cfg.bg, color: cfg.color,
          }}>
            {stats.phase.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            {stats.done}/{stats.total} items complete
          </div>
        </div>
        <CircleRing pct={stats.pct} color={cfg.color} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {Object.entries(topics).map(([t, items]) => {
          const ts         = stats.byTopic[t]
          if (!ts) return null
          const isComplete  = ts.done === ts.total && ts.total > 0
          const untouched   = ts.done === 0 && !ts.ip
          const pct         = ts.total > 0 ? ts.done / ts.total * 100 : 0
          const tc          = colors[t] || cfg.color

          return (
            <div key={t} style={{ opacity: untouched ? 0.38 : isComplete ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, lineHeight: 1.3,
                  color: isComplete ? 'var(--text-muted)' : 'var(--text-light)',
                  fontWeight: ts.ip ? 600 : 400,
                  textDecoration: isComplete ? 'line-through' : 'none',
                }}>
                  {isComplete && (
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
                      stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                  {ts.ip && !isComplete && (
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: tc, boxShadow: `0 0 5px ${tc}` }}/>
                  )}
                  {t}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                  {ts.done}/{ts.total}
                </span>
              </div>
              <div className="progress-wrap" style={{ height: 3 }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: isComplete ? 'var(--success)' : tc,
                  borderRadius: 2, transition: 'width .4s ease',
                }}/>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Activity section ─────────────────────────────────────────────────────────
function SevenDayRow({ days7, sessions, inst, color }) {
  const practiced = new Set(sessions.filter(s => s.instrument === inst).map(s => s.date))
  const today     = todayStr()
  const DOW       = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {days7.map((d) => {
        const dow     = fromStr(d).getDay()
        const dowIdx  = dow === 0 ? 6 : dow - 1
        const active  = practiced.has(d)
        const isToday = d === today
        return (
          <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ fontSize: 9, color: isToday ? color : 'var(--text-muted)', fontWeight: isToday ? 700 : 400 }}>
              {DOW[dowIdx]}
            </div>
            <div style={{
              width: 22, height: 22, borderRadius: 5,
              background: active ? color : 'rgba(255,255,255,0.06)',
              border: `1px solid ${isToday ? color : 'transparent'}`,
              boxShadow: active ? `0 0 6px ${color}50` : 'none',
              transition: 'background .2s',
            }}/>
          </div>
        )
      })}
    </div>
  )
}

function ActivityCard({ inst, sessions }) {
  const cfg    = INST_CFG[inst]
  const days7  = last7Days()
  const streak = computeStreak(sessions, inst)
  const last   = lastPracticed(sessions, inst)
  const count  = sessions.filter(s => s.instrument === inst).length
  const freq   = avgPerWeek(sessions, inst)

  return (
    <div className="card" style={{ padding: '18px 20px', borderTop: `3px solid ${cfg.color}` }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>{cfg.label}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 14 }}>
        {[
          { label: 'Last practiced', value: formatRelDate(last) },
          { label: 'Streak',         value: streak ? `${streak}d` : '—', accent: streak > 0 },
          { label: 'Sessions',       value: count || '—' },
          { label: 'Avg / week',     value: +freq > 0 ? `${freq}×` : '—' },
        ].map(({ label, value, accent }) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: accent ? cfg.color : 'var(--text)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
        Last 7 days
      </div>
      <SevenDayRow days7={days7} sessions={sessions} inst={inst} color={cfg.color} />
    </div>
  )
}

// ─── Quick access section ─────────────────────────────────────────────────────
function QuickCard({ inst, tracker, topicsMap, colorsMap, onCycle, onJump }) {
  const cfg    = INST_CFG[inst]
  const topics = topicsMap[inst] || {}
  const colors = colorsMap[inst] || {}

  const inProgress = []
  for (const [t, items] of Object.entries(topics)) {
    const st    = tracker[inst]?.[t] || []
    const ipIdx = st.findIndex(s => s === 'in-progress')
    if (ipIdx >= 0) {
      let nextItem = null
      for (let i = ipIdx + 1; i < items.length; i++) {
        if ((st[i] || 'not-started') !== 'complete') { nextItem = items[i]; break }
      }
      inProgress.push({ topic: t, idx: ipIdx, text: items[ipIdx], color: colors[t] || cfg.color, nextItem })
    }
  }

  return (
    <div className="card" style={{ padding: '18px 20px', borderTop: `3px solid ${cfg.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{cfg.label}</div>
        <button
          className="btn btn-sm"
          onClick={() => onJump(inst)}
          style={{
            fontSize: 11, padding: '5px 12px',
            background: cfg.bg, color: cfg.color,
            border: `1px solid ${cfg.color}40`,
          }}
        >
          Jump In →
        </button>
      </div>

      {inProgress.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
          No items in progress — open {cfg.label} to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {inProgress.map(({ topic, idx, text, color, nextItem }) => (
            <div key={topic} style={{
              padding: '10px 12px', borderRadius: 8,
              background: `${color}10`, border: `1px solid ${color}28`,
            }}>
              <div style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 5 }}>
                {topic}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: 'var(--text)' }}>
                    {text}
                  </div>
                  {nextItem && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.35 }}>
                      Up next: {nextItem}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onCycle(inst, topic, idx)}
                  title="Mark complete"
                  style={{
                    flexShrink: 0, padding: '4px 10px', borderRadius: 5,
                    border: `1px solid ${color}50`, background: `${color}18`,
                    color, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Done
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AIPromptBlock({ tracker, topicsMap, isDark }) {
  const [copied, setCopied] = useState(false)
  const [show,   setShow]   = useState(false)
  const prompt = buildCombinedPrompt(tracker, topicsMap)

  const totalActive = INSTS.reduce((n, inst) => {
    const topics = topicsMap[inst] || {}
    return n + Object.keys(topics).filter(t =>
      (tracker[inst]?.[t] || []).some(s => s === 'in-progress')
    ).length
  }, 0)

  async function doCopy() {
    if (!prompt) return
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="card" style={{ padding: '16px 20px', borderLeft: '3px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
            AI Practice Session — All Instruments
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {totalActive} topic{totalActive !== 1 ? 's' : ''} in progress — copy prompt for Claude
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {prompt && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShow(s => !s)} style={{ fontSize: 12 }}>
              {show ? 'Hide' : 'Preview'}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={doCopy}
            disabled={!prompt}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, minWidth: 118 }}
          >
            {copied ? (
              <>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                Copy prompt
              </>
            )}
          </button>
        </div>
      </div>

      {show && prompt && (
        <pre style={{
          marginTop: 14, padding: 14,
          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          border: '1px solid var(--border)', borderRadius: 8,
          fontSize: 12, lineHeight: 1.65, whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', color: 'var(--text-light)',
          fontFamily: 'var(--mono)', overflowX: 'auto',
        }}>
          {prompt}
        </pre>
      )}
      {!prompt && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Mark at least one item as in-progress across any instrument to generate a prompt.
        </div>
      )}
    </div>
  )
}

function RecentCompletions({ completions, topicsMap }) {
  const recent = [...completions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts)
    .slice(0, 5)

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Recently Completed</div>
      {recent.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          No completions logged yet — mark items done to see them here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {recent.map((c, i) => {
            const cfg  = INST_CFG[c.instrument]
            const text = topicsMap[c.instrument]?.[c.topic]?.[c.itemIdx] || 'Unknown item'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: cfg?.color || 'var(--success)',
                  marginTop: 4, flexShrink: 0,
                }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-light)', lineHeight: 1.4 }}>{text}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {cfg?.label} › {c.topic} · {formatRelDate(c.date)}
                  </div>
                </div>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--success)"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Visuals ──────────────────────────────────────────────────────────────────
function CalendarHeatmap({ sessions }) {
  const dayMap = useMemo(() => {
    const m = {}
    for (const s of sessions) {
      if (!m[s.date]) m[s.date] = []
      if (!m[s.date].includes(s.instrument)) m[s.date].push(s.instrument)
    }
    return m
  }, [sessions])

  // Build all days June 1 – Sept 15
  const allDays = []
  let cur = SUMMER_START
  while (cur <= SUMMER_END) { allDays.push(cur); cur = addDays(cur, 1) }

  // Group into calendar weeks (Mon-Sun)
  const weeks = []
  let week = []
  for (const d of allDays) {
    const dow     = fromStr(d).getDay() // 0=Sun
    const dowIdx  = dow === 0 ? 6 : dow - 1 // Mon=0
    if (week.length === 0 && dowIdx !== 0) {
      for (let i = 0; i < dowIdx; i++) week.push(null)
    }
    week.push(d)
    if (dowIdx === 6) { weeks.push(week); week = [] }
  }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week) }

  const today = todayStr()
  const CELL = 13, GAP = 3

  // Month label positions
  const monthLabels = []
  let lastMon = -1
  weeks.forEach((wk, wi) => {
    const first = wk.find(Boolean)
    if (first) {
      const mo = fromStr(first).getMonth()
      if (mo !== lastMon) { monthLabels.push({ wi, label: ['Jun','Jul','Aug','Sep'][mo - 5] }); lastMon = mo }
    }
  })

  return (
    <div className="card" style={{ padding: '18px 20px', overflowX: 'auto' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Practice Calendar</div>

      {/* Month labels */}
      <div style={{ display: 'flex', paddingLeft: 22, marginBottom: 4 }}>
        {weeks.map((_, wi) => {
          const ml = monthLabels.find(m => m.wi === wi)
          return (
            <div key={wi} style={{ width: CELL + GAP, flexShrink: 0, fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>
              {ml ? ml.label : ''}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* Day-of-week labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: 6, paddingTop: 0 }}>
          {['M','','W','','F','','S'].map((l, i) => (
            <div key={i} style={{ width: 14, height: CELL, fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {l}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: 'flex', gap: GAP }}>
          {weeks.map((wk, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
              {wk.map((d, di) => {
                const insts   = d ? (dayMap[d] || []) : []
                const color   = insts.length ? INST_CFG[insts[0]]?.color : null
                const isToday = d === today
                const isFut   = d && d > today
                const title   = d
                  ? (insts.length ? `${d}: ${insts.map(i => INST_CFG[i]?.label).join(', ')}` : d)
                  : ''
                return (
                  <div key={di} title={title} style={{
                    width: CELL, height: CELL, borderRadius: 2,
                    background: color || (d ? (isFut ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)') : 'transparent'),
                    border: `1px solid ${isToday ? 'var(--accent)' : 'transparent'}`,
                    opacity: isFut ? 0.3 : 1,
                    boxShadow: color ? `0 0 4px ${color}40` : 'none',
                    // If multiple instruments, show split via outline
                    outline: insts.length > 1 ? `1px solid ${INST_CFG[insts[1]]?.color}` : 'none',
                    outlineOffset: '-2px',
                  }}/>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        {INSTS.map(inst => (
          <div key={inst} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: INST_CFG[inst].color }}/>
            {INST_CFG[inst].label}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}/>
          No practice
        </div>
      </div>
    </div>
  )
}

function FrequencyChart({ sessions }) {
  const cw = currentSummerWeek()
  const weekData = useMemo(() => {
    return Array.from({ length: cw }, (_, wi) => {
      const ws = addDays(SUMMER_START, wi * 7)
      const we = addDays(SUMMER_START, wi * 7 + 6)
      const counts = {}
      for (const inst of INSTS) {
        counts[inst] = sessions.filter(s => s.instrument === inst && s.date >= ws && s.date <= we).length
      }
      return { week: wi + 1, counts }
    })
  }, [sessions, cw])

  const maxVal  = Math.max(1, ...weekData.flatMap(w => Object.values(w.counts)))
  const BW      = 6, BG = 2, GG = 8
  const groupW  = INSTS.length * (BW + BG) - BG
  const slotW   = groupW + GG
  const PAD_L   = 28, PAD_B = 18, PAD_T = 10, PAD_R = 10
  const CH      = 90
  const svgW    = Math.max(220, PAD_L + weekData.length * slotW + PAD_R)

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Sessions Per Week</div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={svgW} height={CH + PAD_T + PAD_B} style={{ minWidth: 180 }}>
          {[0, .5, 1].map(v => {
            const y = PAD_T + CH - v * CH
            return (
              <g key={v}>
                <line x1={PAD_L} x2={svgW - PAD_R} y1={y} y2={y}
                  stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>
                <text x={PAD_L - 4} y={y + 3} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.28)">
                  {Math.round(v * maxVal)}
                </text>
              </g>
            )
          })}

          {weekData.map((w, wi) => {
            const gx = PAD_L + wi * slotW
            return (
              <g key={wi}>
                {INSTS.map((inst, ii) => {
                  const val  = w.counts[inst]
                  const barH = val === 0 ? 0 : Math.max(3, (val / maxVal) * CH)
                  const bx   = gx + ii * (BW + BG)
                  return (
                    <rect key={inst} x={bx} y={PAD_T + CH - barH}
                      width={BW} height={barH}
                      fill={INST_CFG[inst].color} opacity={val > 0 ? 0.85 : 0} rx={1}/>
                  )
                })}
                <text x={gx + groupW / 2} y={PAD_T + CH + 12}
                  textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.28)">
                  {w.week}
                </text>
              </g>
            )
          })}

          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + CH}
            stroke="rgba(255,255,255,0.1)" strokeWidth={1}/>
          <line x1={PAD_L} y1={PAD_T + CH} x2={svgW - PAD_R} y2={PAD_T + CH}
            stroke="rgba(255,255,255,0.1)" strokeWidth={1}/>
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {INSTS.map(inst => (
          <div key={inst} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: INST_CFG[inst].color }}/>
            {INST_CFG[inst].label}
          </div>
        ))}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>X = week #</span>
      </div>
    </div>
  )
}

function ProgressOverTime({ completions }) {
  const today = todayStr()

  const chartData = useMemo(() => {
    if (!completions.length) return null
    const dates = []
    let d = SUMMER_START
    while (d <= today) { dates.push(d); d = addDays(d, 1) }
    if (dates.length < 2) return null

    const lines = {}
    for (const inst of INSTS) {
      const ic = completions.filter(c => c.instrument === inst).sort((a, b) => a.date.localeCompare(b.date))
      let cum = 0
      lines[inst] = dates.map(date => { cum += ic.filter(c => c.date === date).length; return cum })
    }
    const maxY = Math.max(1, ...Object.values(lines).flatMap(l => l))
    return { dates, lines, maxY }
  }, [completions, today])

  if (!chartData) {
    return (
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Progress Over Time</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Complete checklist items to see your progress over time.
        </div>
      </div>
    )
  }

  const W = 360, H = 110
  const P = { t: 10, r: 10, b: 22, l: 36 }
  const cW = W - P.l - P.r
  const cH = H - P.t - P.b
  const n  = chartData.dates.length

  const tx = i  => P.l + (i / (n - 1)) * cW
  const ty = v  => P.t + cH - (v / chartData.maxY) * cH

  const MON_FIRSTS = { 'Jun': '2026-06-01', 'Jul': '2026-07-01', 'Aug': '2026-08-01', 'Sep': '2026-09-01' }

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Progress Over Time</div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 260, maxWidth: 520 }}>
          {[0, .5, 1].map(v => {
            const y = ty(v * chartData.maxY)
            return (
              <g key={v}>
                <line x1={P.l} x2={W - P.r} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>
                <text x={P.l - 4} y={y + 3} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.28)">
                  {Math.round(v * chartData.maxY)}
                </text>
              </g>
            )
          })}

          {INSTS.map(inst => {
            const pts = chartData.lines[inst].map((v, i) => `${tx(i)},${ty(v)}`).join(' ')
            return <polyline key={inst} points={pts} fill="none"
              stroke={INST_CFG[inst].color} strokeWidth={1.8}
              strokeLinejoin="round" strokeLinecap="round" opacity={0.9}/>
          })}

          <line x1={P.l} y1={P.t} x2={P.l} y2={H - P.b} stroke="rgba(255,255,255,0.1)" strokeWidth={1}/>
          <line x1={P.l} y1={H - P.b} x2={W - P.r} y2={H - P.b} stroke="rgba(255,255,255,0.1)" strokeWidth={1}/>

          {Object.entries(MON_FIRSTS).map(([mon, ds]) => {
            const idx = chartData.dates.indexOf(ds)
            if (idx < 0) return null
            return (
              <text key={mon} x={tx(idx)} y={H - 5}
                textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.28)">{mon}</text>
            )
          })}
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {INSTS.map(inst => (
          <div key={inst} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 18, height: 2, background: INST_CFG[inst].color, borderRadius: 1 }}/>
            {INST_CFG[inst].label}
          </div>
        ))}
      </div>
    </div>
  )
}

function TopicCompletionChart({ tracker, topicsMap, colorsMap }) {
  const [sel, setSel] = useState('guitar')
  const topics = topicsMap[sel] || {}
  const colors = colorsMap[sel] || {}
  const cfg    = INST_CFG[sel]

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Topic Completion</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {INSTS.map(inst => (
            <button key={inst} onClick={() => setSel(inst)} style={{
              padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, transition: 'all .15s',
              background: sel === inst ? INST_CFG[inst].color : 'rgba(255,255,255,0.07)',
              color: sel === inst ? '#fff' : 'var(--text-muted)',
            }}>
              {INST_CFG[inst].label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {Object.entries(topics).map(([t, items]) => {
          const st    = tracker[sel]?.[t] || []
          const done  = st.filter(s => s === 'complete').length
          const pct   = items.length > 0 ? done / items.length * 100 : 0
          const color = colors[t] || cfg.color
          return (
            <div key={t}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{t}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                  {done}/{items.length}
                </span>
              </div>
              <div className="progress-wrap" style={{ height: 7, borderRadius: 4 }}>
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: pct === 100 ? 'var(--success)' : color,
                  borderRadius: 4, transition: 'width .4s ease',
                  boxShadow: pct > 0 ? `0 0 6px ${color}35` : 'none',
                }}/>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
const SL = {
  fontSize: 11, fontWeight: 800, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
  marginBottom: 12,
}

export default function MusicOverview({ tracker, activity, topicsMap, colorsMap, isDark, onCycle, onJump }) {
  const { sessions = [], completions = [] } = activity

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      <SummerCountdown />

      {/* Progress */}
      <section>
        <div style={SL}>Progress</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {INSTS.map(inst => (
            <ProgressCard key={inst} inst={inst} tracker={tracker}
              topics={topicsMap[inst] || {}} colors={colorsMap[inst] || {}} />
          ))}
        </div>
      </section>

      {/* Activity */}
      <section>
        <div style={SL}>Activity</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {INSTS.map(inst => (
            <ActivityCard key={inst} inst={inst} sessions={sessions} />
          ))}
        </div>
      </section>

      {/* Quick Access */}
      <section>
        <div style={SL}>Quick Access</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AIPromptBlock tracker={tracker} topicsMap={topicsMap} isDark={isDark} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {INSTS.map(inst => (
              <QuickCard key={inst} inst={inst} tracker={tracker}
                topicsMap={topicsMap} colorsMap={colorsMap}
                onCycle={onCycle} onJump={onJump} />
            ))}
          </div>
          <RecentCompletions completions={completions} topicsMap={topicsMap} />
        </div>
      </section>

      {/* Visuals */}
      <section>
        <div style={SL}>Visuals</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <CalendarHeatmap sessions={sessions} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            <FrequencyChart sessions={sessions} />
            <TopicCompletionChart tracker={tracker} topicsMap={topicsMap} colorsMap={colorsMap} />
          </div>
          <ProgressOverTime completions={completions} />
        </div>
      </section>

    </div>
  )
}
