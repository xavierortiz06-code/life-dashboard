import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { getMacroGoals } from '../lib/goals'
import { getActiveDate } from '../lib/dateUtils'
import ActionChat from '../components/ActionChat'

const TODAY = getActiveDate()

// ── Helpers ───────────────────────────────────────────────────────────
function nowHour() { return new Date().getHours() }

function greeting(name) {
  const h = nowHour()
  if (h < 5)  return `Up late, ${name}`
  if (h < 12) return `Good morning, ${name}`
  if (h < 17) return `Good afternoon, ${name}`
  if (h < 21) return `Good evening, ${name}`
  return `Good night, ${name}`
}

function currentSectionId() {
  const h = nowHour()
  if (h < 9)  return 'morning'
  if (h < 17) return 'work'
  if (h < 21) return 'afternoon'
  return 'nightly'
}

function currentSectionLabel() {
  const h = nowHour()
  if (h < 9)  return 'Morning'
  if (h < 17) return 'During Work'
  if (h < 21) return 'After Work'
  return 'Nightly'
}

function dayPct() {
  const now = new Date()
  return Math.round((now.getHours() * 60 + now.getMinutes()) / (24 * 60) * 100)
}

function fmtDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function addDays(s, n) {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function computeDateStreak(dateSet) {
  const yday = addDays(TODAY, -1)
  if (!dateSet.has(TODAY) && !dateSet.has(yday)) return 0
  let cur = dateSet.has(TODAY) ? TODAY : yday, s = 0
  while (dateSet.has(cur)) { s++; cur = addDays(cur, -1) }
  return s
}

// ── Task completion ring ──────────────────────────────────────────────
function TaskRing({ done, total, size = 136 }) {
  const pct  = total > 0 ? Math.round(done / total * 100) : 0
  const SIZE = size, SW = size < 120 ? 7 : 9
  const r    = SIZE / 2 - SW
  const circ = 2 * Math.PI * r
  const dash = circ * pct / 100
  const cx   = SIZE / 2
  const color = pct === 100 ? 'var(--success)' : pct > 50 ? '#6366f1' : '#6366f1'

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={SW} />
        <circle cx={cx} cy={cx} r={r} fill="none"
          stroke={pct === 100 ? 'var(--success)' : 'url(#tGrad)'} strokeWidth={SW}
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray .7s ease' }} />
        <defs>
          <linearGradient id="tGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={SIZE} y2={SIZE}>
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>

      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 2,
      }}>
        <div style={{ fontSize: SIZE < 120 ? 22 : 30, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, letterSpacing: '-0.03em', color }}>
          {done}
        </div>
        <div style={{ fontSize: SIZE < 120 ? 9 : 11, color: 'var(--text-muted)' }}>
          of {total}
        </div>
        {pct > 0 && SIZE >= 120 && (
          <div style={{
            marginTop: 6, fontSize: 10, fontWeight: 700,
            color, fontFamily: 'var(--mono)',
            padding: '2px 8px', borderRadius: 99,
            background: pct === 100 ? 'rgba(107,227,164,0.12)' : 'rgba(99,102,241,0.12)',
          }}>
            {pct}%
          </div>
        )}
      </div>
    </div>
  )
}

// ── Day progress bar ──────────────────────────────────────────────────
function DayBar({ pct }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--accent) 0%, #06b6d4 100%)',
          borderRadius: 2, transition: 'width .5s ease',
          boxShadow: '0 0 6px rgba(99,102,241,0.35)',
        }} />
        <div style={{
          position: 'absolute', top: -2, bottom: -2,
          left: `${pct}%`, transform: 'translateX(-50%)',
          width: 2, background: '#06b6d4', borderRadius: 1,
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: 9, color: 'var(--text-light)' }}>12 AM</span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{pct}% through today</span>
        <span style={{ fontSize: 9, color: 'var(--text-light)' }}>11:59 PM</span>
      </div>
    </div>
  )
}

// ── Nav link ──────────────────────────────────────────────────────────
function GoLink({ to, children }) {
  return (
    <Link to={to} style={{
      fontSize: 10, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none',
      letterSpacing: '.04em',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      {children}
      <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  )
}

// ── Divider ───────────────────────────────────────────────────────────
function Div() {
  return <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', margin: '15px 0' }} />
}

// ── Section header row ────────────────────────────────────────────────
function Sec({ label, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--text-light)' }}>
        {label}
      </span>
      {right}
    </div>
  )
}

// ── Macro bar ─────────────────────────────────────────────────────────
function Bar({ label, val, goal, color }) {
  const pct = goal > 0 ? Math.min(100, val / goal * 100) : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr 52px', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-light)', textAlign: 'right' }}>
        {Math.round(val)}<span style={{ opacity: .3 }}>/{goal}</span>
      </span>
    </div>
  )
}

// ── Stat cell ─────────────────────────────────────────────────────────
function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-light)', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: color || 'var(--text)' }}>
        {value}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
//  Main page
// ─────────────────────────────────────────────────────────────────────
export default function Overview() {
  const { user, settings } = useApp()
  const displayName = settings.display_name || user?.email?.split('@')[0] || 'there'
  const [goals] = useState(getMacroGoals)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const [nut,  setNut]   = useState({ cal: 0, prot: 0, carbs: 0, fat: 0 })
  const [waterMl, setWaterMl]   = useState(0)
  const [tasks,   setTasks]     = useState([])
  const [routineDone,  setRoutineDone]  = useState(0)
  const [routineTotal, setRoutineTotal] = useState(0)
  const [balance, setBalance]   = useState(0)
  const [recent,  setRecent]    = useState([])
  const [todaySets,  setTodaySets]  = useState([])
  const [wDates,     setWDates]     = useState([])
  const [splitDay,   setSplitDay]   = useState(null)
  const [sessions,   setSessions]   = useState([])
  const [schedule,   setSchedule]   = useState({})
  const [bDesc, setBDesc] = useState('')
  const [bAmt,  setBAmt]  = useState('')
  const [bType, setBType] = useState('expense')
  const [bSaving, setBSaving] = useState(false)
  const [loadTick, setLoadTick] = useState(0)

  useEffect(() => {
    if (!user) return
    async function load() {
      const cutoff = new Date(Date.now() - 70 * 86400000).toISOString().split('T')[0]
      const [
        { data: nutData }, { data: taskData }, { data: focusData },
        { data: rtData },  { data: rcData },   { data: budData },
        { data: setsData },{ data: dateData },  { data: splitData },
      ] = await Promise.all([
        supabase.from('nutrition_entries').select('calories,protein,carbs,fat').eq('user_id', user.id).eq('date', TODAY),
        supabase.from('task_list').select('id,title,completed,priority').eq('user_id', user.id),
        supabase.from('focus_tasks').select('id,text,completed').eq('user_id', user.id).eq('date', TODAY),
        supabase.from('routine_tasks').select('id').eq('user_id', user.id),
        supabase.from('routine_completions').select('routine_task_id').eq('user_id', user.id).eq('completed_date', TODAY),
        supabase.from('budget_entries').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(4),
        supabase.from('workout_sets').select('*, exercises(name,muscle_group)').eq('user_id', user.id).eq('logged_date', TODAY),
        supabase.from('workout_sets').select('logged_date').eq('user_id', user.id).gte('logged_date', cutoff),
        supabase.from('workout_splits').select('*').eq('user_id', user.id).order('created_at').limit(7),
      ])

      if (nutData) setNut(nutData.reduce((a, e) => ({ cal: a.cal + (e.calories||0), prot: a.prot + (e.protein||0), carbs: a.carbs + (e.carbs||0), fat: a.fat + (e.fat||0) }), { cal:0, prot:0, carbs:0, fat:0 }))
      setWaterMl(parseInt(localStorage.getItem(`nutrition-water:${TODAY}`)) || 0)
      setTasks([...(taskData||[]).map(t=>({...t,_src:'task'})), ...(focusData||[]).map(t=>({...t,title:t.text,_src:'focus'}))])
      setRoutineTotal((rtData||[]).length)
      setRoutineDone((rcData||[]).length)
      setBalance(parseFloat(localStorage.getItem('actual_balance')) || 0)
      setRecent(budData || [])
      setTodaySets(setsData || [])
      setWDates([...new Set((dateData||[]).map(s=>s.logged_date))])
      if (splitData?.length) {
        const DOW = new Date().getDay()
        const N = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
        setSplitDay(splitData.find(d => d.day_name?.toLowerCase().includes(N[DOW].toLowerCase())) || null)
      }
      try { const a = JSON.parse(localStorage.getItem('music-activity')||'null'); setSessions(a?.sessions||[]) } catch { setSessions([]) }
      try { const p = JSON.parse(localStorage.getItem('schedule-planner')||'{}'); setSchedule(p[TODAY]||{}) } catch { setSchedule({}) }
    }
    load()
  }, [user, loadTick])

  // ── Derived ──────────────────────────────────────────────────────────
  const progress   = dayPct()
  const calPct     = goals.cal > 0 ? Math.round(nut.cal / goals.cal * 100) : 0
  const waterGoal  = parseInt(localStorage.getItem('water-goal-ml')) || 3000
  const wStreak    = computeDateStreak(new Set(wDates))
  const done       = tasks.filter(t => t.completed).length
  const total      = tasks.length
  const high       = tasks.filter(t => !t.completed && t.priority === 'high')
  const exercises  = [...new Set(todaySets.map(s => s.exercises?.name).filter(Boolean))]
  const INST = [
    { key:'guitar', label:'Guitar', color:'#6366f1' },
    { key:'piano',  label:'Piano',  color:'#06b6d4' },
    { key:'drums',  label:'Drums',  color:'#f97316' },
  ]
  const practicedToday = new Set(sessions.filter(s => s.date === TODAY).map(s => s.instrument))
  const totalMinToday  = sessions.filter(s => s.date === TODAY).reduce((n,s) => n+(s.minutes||0), 0)

  const scoreItems = [calPct >= 60 && calPct <= 115, done > 0, todaySets.length > 0, sessions.some(s => s.date === TODAY)]
  const score      = scoreItems.filter(Boolean).length * 25
  const scoreColor = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--accent)'

  const fmtMoney = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function submitBudget(e) {
    e.preventDefault()
    const num = parseFloat(bAmt)
    if (!num || !bDesc.trim()) return
    setBSaving(true)
    await supabase.from('budget_entries').insert({ user_id: user.id, type: bType, amount: Math.abs(num), category: bType === 'income' ? 'Income' : 'Expense', description: bDesc.trim(), date: TODAY })
    localStorage.setItem('actual_balance', String(balance + (bType === 'income' ? Math.abs(num) : -Math.abs(num))))
    setBDesc(''); setBAmt(''); setBSaving(false)
    setLoadTick(t => t + 1)
  }

  const secTasks = (schedule[currentSectionId()] || []).filter(t => !t.completed)
  const secDone  = (schedule[currentSectionId()] || []).filter(t => t.completed).length

  // ── Mobile render ────────────────────────────────────────────────────
  if (isMobile) {
    const calColor = calPct > 110 ? 'var(--danger)' : calPct > 80 ? 'var(--success)' : 'var(--accent)'
    const card = { background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: '14px 14px' }
    const capLabel = { fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-light)' }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 100 }}>

        {/* Header */}
        <div style={{ padding: '14px 16px 10px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(180deg,#fff 0%,#C7C4BC 130%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {greeting(displayName)}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 99, background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.07)' }}>{fmtDate()}</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 99, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)', border: '1px solid rgba(99,102,241,0.2)' }}>{currentSectionLabel()}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: `${scoreColor}15`, color: scoreColor, border: `1px solid ${scoreColor}28` }}>
              <svg width={8} height={8} viewBox="0 0 24 24" fill={scoreColor} stroke={scoreColor} strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              {score}/100
            </span>
          </div>
          <DayBar pct={progress} />
        </div>

        {/* Tasks card */}
        <div style={{ ...card, margin: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <TaskRing done={done} total={total} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, letterSpacing: '-0.03em', color: done === total && total > 0 ? 'var(--success)' : 'var(--text)' }}>
              {done}<span style={{ opacity: 0.3, fontSize: 20 }}>/{total}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>tasks done · {Math.round(done / Math.max(total, 1) * 100)}% complete</div>
            {high.length > 0 && <div style={{ marginTop: 5, fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>{high.length} high priority left</div>}
          </div>
          <GoLink to="/todo">Open</GoLink>
        </div>

        {/* Right Now card */}
        <div style={{ ...card, margin: '0 14px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: secTasks.length > 0 ? 10 : 6 }}>
            <span style={capLabel}>Right Now · {currentSectionLabel()}</span>
            <GoLink to="/schedule">Schedule</GoLink>
          </div>
          {secTasks.length === 0 && secDone === 0
            ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nothing scheduled for this block.</div>
            : secTasks.length === 0
              ? <div style={{ fontSize: 13, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  All {secDone} done
                </div>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {secTasks.slice(0, 4).map((t, i) => (
                    <span key={t.id || i} style={{ fontSize: 12, padding: '4px 11px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', color: 'var(--text-light)', border: '1px solid rgba(255,255,255,0.08)' }}>{t.text}</span>
                  ))}
                  {secTasks.length > 4 && <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>+{secTasks.length - 4}</span>}
                </div>
          }
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '0 14px 10px' }}>

          {/* Nutrition */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={capLabel}>Nutrition</span><GoLink to="/nutrition">Log</GoLink></div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: calColor, letterSpacing: '-0.02em' }}>{calPct}<span style={{ fontSize: 13, opacity: 0.5 }}>%</span></div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{nut.cal >= 1000 ? `${(nut.cal/1000).toFixed(1)}k` : Math.round(nut.cal)} / {goals.cal.toLocaleString()} kcal</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9 }}>
              {[['P', Math.round(nut.prot), goals.prot, '#6366f1'], ['C', Math.round(nut.carbs), goals.carbs, '#f59e0b'], ['F', Math.round(nut.fat), goals.fat, '#ef4444']].map(([l, v, g, c]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', width: 8 }}>{l}</span>
                  <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, g > 0 ? v / g * 100 : 0)}%`, background: c, borderRadius: 1 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={capLabel}>Budget</span><GoLink to="/budget">Details</GoLink></div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: balance >= 0 ? 'var(--success)' : 'var(--danger)', letterSpacing: '-0.02em' }}>{fmtMoney(balance)}</div>
            <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {recent.slice(0, 3).map((e, i) => (
                <div key={e.id||i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                  <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 4 }}>{e.description || e.category}</span>
                  <span style={{ flexShrink: 0, fontFamily: 'var(--mono)', fontWeight: 700, color: e.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>{e.type === 'income' ? '+' : '-'}${parseFloat(e.amount).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Water */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={capLabel}>Water</span></div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: waterMl >= waterGoal ? 'var(--success)' : '#3b82f6', letterSpacing: '-0.02em' }}>
              {(waterMl / 1000).toFixed(1)}<span style={{ fontSize: 13, opacity: 0.5 }}>L</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>of {(waterGoal / 1000).toFixed(1)}L goal</div>
            <div style={{ marginTop: 10, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${Math.min(100, waterGoal > 0 ? waterMl / waterGoal * 100 : 0)}%`, background: waterMl >= waterGoal ? 'var(--success)' : '#3b82f6', borderRadius: 2 }} />
            </div>
          </div>

          {/* Workouts */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={capLabel}>Workouts</span><GoLink to="/workouts">Log</GoLink></div>
            <div style={{ display: 'flex', gap: 14 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: wStreak > 0 ? 'var(--success)' : 'var(--text-light)' }}>{wStreak > 0 ? `${wStreak}d` : '—'}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>streak</div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: todaySets.length > 0 ? 'var(--success)' : 'var(--text-light)' }}>{todaySets.length || '—'}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>sets</div>
              </div>
            </div>
            {splitDay && <div style={{ marginTop: 7, fontSize: 10, color: 'var(--text-muted)' }}>{splitDay.day_name}</div>}
          </div>

          {/* Music */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={capLabel}>Music</span><GoLink to="/music">Practice</GoLink></div>
            {totalMinToday > 0 && <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: 'var(--success)', marginBottom: 8 }}>{totalMinToday}<span style={{ fontSize: 12, opacity: 0.5 }}>m</span></div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {INST.map(({ key, label, color }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: practicedToday.has(key) ? color : 'rgba(255,255,255,0.1)' }} />
                  <span style={{ fontSize: 11, color: practicedToday.has(key) ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* To-Do */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={capLabel}>To-Do</span><GoLink to="/todo">Open</GoLink></div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, color: tasks.every(t => t.completed) && tasks.length > 0 ? 'var(--success)' : 'var(--text)', letterSpacing: '-0.02em' }}>
              {tasks.filter(t => !t.completed).length}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>remaining</div>
            {high.length > 0 && <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: 'var(--danger)' }}>{high.length} high priority</div>}
            {routineTotal > 0 && <div style={{ marginTop: 3, fontSize: 10, color: routineDone === routineTotal ? 'var(--success)' : 'var(--text-muted)' }}>routine {routineDone}/{routineTotal}</div>}
          </div>

        </div>

        {/* Quick add transaction */}
        <div style={{ ...card, margin: '0 14px' }}>
          <div style={{ ...capLabel, marginBottom: 10 }}>Quick Add Transaction</div>
          <form onSubmit={submitBudget} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['expense', 'income'].map(t => (
                <button key={t} type="button" onClick={() => setBType(t)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', background: bType === t ? (t === 'expense' ? 'rgba(255,107,107,0.18)' : 'rgba(107,227,164,0.18)') : 'rgba(255,255,255,0.06)', color: bType === t ? (t === 'expense' ? 'var(--danger)' : 'var(--success)') : 'var(--text-muted)' }}>
                  {t === 'expense' ? 'Expense' : 'Income'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={bDesc} onChange={e => setBDesc(e.target.value)} placeholder="Description" style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '9px 11px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit' }} />
              <input value={bAmt} onChange={e => setBAmt(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="$0" inputMode="decimal" style={{ width: 64, fontSize: 13, padding: '9px 8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--mono)', minWidth: 0 }} />
            </div>
            <button type="submit" disabled={bSaving || !bAmt || !bDesc.trim()} style={{ padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: 'var(--accent)', color: '#fff', opacity: bSaving || !bAmt || !bDesc.trim() ? 0.35 : 1 }}>
              {bSaving ? 'Saving…' : 'Add transaction'}
            </button>
          </form>
        </div>

        {/* AI chat log */}
        <div style={{ margin: '0 14px' }}>
          <ActionChat userId={user?.id} />
        </div>

      </div>
    )
  }

  // ── Desktop render ────────────────────────────────────────────────────
  return (
    <div className="page-body" style={{ paddingBottom: 32 }}>

      {/* ── Header ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em',
            background: 'linear-gradient(180deg,#fff 0%,#C7C4BC 130%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {greeting(displayName)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
              padding: '3px 10px', borderRadius: 99,
              background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>{fmtDate()}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
              padding: '3px 10px', borderRadius: 99,
              background: 'rgba(99,102,241,0.12)', color: 'var(--accent)',
              border: '1px solid rgba(99,102,241,0.2)',
            }}>{currentSectionLabel()}</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
              background: `${scoreColor}15`, color: scoreColor,
              border: `1px solid ${scoreColor}28`,
            }}>
              <svg width={9} height={9} viewBox="0 0 24 24" fill={scoreColor} stroke={scoreColor} strokeWidth="1">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              {score}/100
            </span>
          </div>
        </div>
        <DayBar pct={progress} />
      </div>

      {/* ── Body: ring left, sections right (stacks on mobile) ── */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 22, alignItems: 'flex-start', minWidth: 0 }}>

        {/* Task ring */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', gap: isMobile ? 16 : 10, width: isMobile ? '100%' : 'auto' }}>
          <TaskRing done={done} total={total} size={isMobile ? 96 : 136} />
          {isMobile ? (
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1, letterSpacing: '-0.03em' }}>{done}/{total}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>tasks done today</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{Math.round(done / Math.max(total, 1) * 100)}% complete</div>
            </div>
          ) : (
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'center' }}>
              Tasks Today
            </div>
          )}
        </div>

        {/* Right: all sections */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Right Now */}
          <Sec label={`Right Now · ${currentSectionLabel()}`} right={<GoLink to="/schedule">Schedule</GoLink>} />
          {secTasks.length === 0 && secDone === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Nothing scheduled for this block.</div>
            : secTasks.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  All {secDone} done
                </div>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {secTasks.slice(0, 5).map((t, i) => (
                    <span key={t.id||i} style={{
                      fontSize: 12, padding: '4px 11px', borderRadius: 99,
                      background: 'rgba(255,255,255,0.04)', color: 'var(--text-light)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>{t.text}</span>
                  ))}
                  {secTasks.length > 5 && <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>+{secTasks.length - 5}</span>}
                </div>
          }

          <Div />

          {/* Nutrition + Budget */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '100%' : '220px'}, 1fr))`, gap: isMobile ? 16 : 24 }}>

            {/* Nutrition */}
            <div>
              <Sec label="Nutrition" right={<GoLink to="/nutrition">Log food</GoLink>} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {(() => {
                  const sz = 40, sw = 4, r = sz/2-sw, circ = 2*Math.PI*r
                  const d  = circ * Math.min(calPct,100) / 100, cx = sz/2
                  const cc = calPct > 110 ? '#ef4444' : calPct > 80 ? 'var(--success)' : '#6366f1'
                  return (
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <svg width={sz} height={sz} style={{ transform:'rotate(-90deg)' }}>
                        <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw}/>
                        <circle cx={cx} cy={cx} r={r} fill="none" stroke={cc} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${d} ${circ}`}/>
                      </svg>
                      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                        <span style={{ fontSize:9, fontWeight:800, fontFamily:'var(--mono)', color:cc, lineHeight:1 }}>
                          {nut.cal >= 1000 ? `${(nut.cal/1000).toFixed(1)}k` : Math.round(nut.cal)}
                        </span>
                        <span style={{ fontSize:6, color:'var(--text-muted)' }}>kcal</span>
                      </div>
                    </div>
                  )
                })()}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {calPct}% of {goals.cal.toLocaleString()} goal
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Bar label="Protein" val={Math.round(nut.prot)}  goal={goals.prot}  color="#6366f1" />
                <Bar label="Carbs"   val={Math.round(nut.carbs)} goal={goals.carbs} color="#f59e0b" />
                <Bar label="Fat"     val={Math.round(nut.fat)}   goal={goals.fat}   color="#ef4444" />
                <Bar label="Water"   val={waterMl} goal={waterGoal} color={waterMl >= waterGoal ? 'var(--success)' : '#3b82f6'} />
              </div>
            </div>

            {/* Budget */}
            <div>
              <Sec label="Budget" right={<GoLink to="/budget">Details</GoLink>} />
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--mono)', color: balance >= 0 ? 'var(--success)' : 'var(--danger)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 9 }}>
                {fmtMoney(balance)}
              </div>

              {recent.slice(0, 3).map((e, i) => (
                <div key={e.id||i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '4px 0',
                  borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
                    {e.description || e.category}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', flexShrink: 0, color: e.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                    {e.type === 'income' ? '+' : '-'}${parseFloat(e.amount).toFixed(2)}
                  </span>
                </div>
              ))}

              <form onSubmit={submitBudget} style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['expense','income'].map(t => (
                    <button key={t} type="button" onClick={() => setBType(t)} style={{
                      flex: 1, padding: '3px 0', borderRadius: 4, border: 'none', cursor: 'pointer',
                      fontSize: 10, fontWeight: 700, fontFamily: 'inherit',
                      background: bType === t ? (t === 'expense' ? 'rgba(255,107,107,0.18)' : 'rgba(107,227,164,0.18)') : 'rgba(255,255,255,0.04)',
                      color: bType === t ? (t === 'expense' ? 'var(--danger)' : 'var(--success)') : 'var(--text-muted)',
                    }}>{t === 'expense' ? 'Expense' : 'Income'}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input value={bDesc} onChange={e => setBDesc(e.target.value)} placeholder="Description"
                    style={{ flex:1, minWidth:0, fontSize:11, padding:'5px 8px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:5, color:'var(--text)', fontFamily:'inherit' }} />
                  <input value={bAmt} onChange={e => setBAmt(e.target.value.replace(/[^0-9.]/g,''))} placeholder="$0"
                    inputMode="decimal"
                    style={{ width:52, fontSize:11, padding:'5px 6px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:5, color:'var(--text)', fontFamily:'var(--mono)', minWidth:0 }} />
                </div>
                <button type="submit" disabled={bSaving || !bAmt || !bDesc.trim()}
                  style={{ padding:'4px 0', borderRadius:5, border:'none', cursor:'pointer', fontSize:10, fontWeight:700, fontFamily:'inherit', background:'var(--accent)', color:'#fff', opacity: bSaving || !bAmt || !bDesc.trim() ? 0.35 : 1 }}>
                  {bSaving ? 'Saving…' : 'Add transaction'}
                </button>
              </form>
            </div>

          </div>

          <Div />

          {/* Workouts · Music · To-Do */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '140px' : '160px'}, 1fr))`, gap: isMobile ? 14 : 20 }}>

            {/* Workouts */}
            <div>
              <Sec label="Workouts" right={<GoLink to="/workouts">Log</GoLink>} />
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <Stat label="Streak" value={wStreak > 0 ? `${wStreak}d` : '—'} color={wStreak > 0 ? 'var(--success)' : 'var(--text-light)'} />
                <Stat label="Sets" value={todaySets.length || '—'} color={todaySets.length > 0 ? 'var(--success)' : 'var(--text-light)'} />
              </div>
              {splitDay && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: exercises.length ? 6 : 0 }}>{splitDay.day_name}</div>
              )}
              {exercises.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {exercises.slice(0, 4).map((ex, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.18)', fontWeight: 600 }}>{ex}</span>
                  ))}
                  {exercises.length > 4 && <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>+{exercises.length - 4}</span>}
                </div>
              )}
            </div>

            {/* Music */}
            <div>
              <Sec label={totalMinToday > 0 ? `Music · ${totalMinToday}m today` : 'Music'} right={<GoLink to="/music">Practice</GoLink>} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {INST.map(({ key, label, color }) => {
                  const isDone = practicedToday.has(key)
                  const streak = computeDateStreak(new Set(sessions.filter(s => s.instrument === key).map(s => s.date)))
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: isDone ? color : 'rgba(255,255,255,0.1)', boxShadow: isDone ? `0 0 5px ${color}` : 'none' }} />
                      <span style={{ fontSize: 12, color: isDone ? 'var(--text)' : 'var(--text-muted)', flex: 1 }}>{label}</span>
                      {streak > 0 && <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)', color }}>{streak}d</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* To-Do */}
            <div>
              <Sec label="To-Do" right={<GoLink to="/todo">Open</GoLink>} />
              <div style={{ display: 'flex', gap: 14, marginBottom: high.length ? 8 : 0 }}>
                <Stat label="Left"    value={tasks.filter(t=>!t.completed).length} color={tasks.every(t=>t.completed) && tasks.length > 0 ? 'var(--success)' : 'var(--text)'} />
                <Stat label="High"    value={high.length || '—'} color={high.length > 0 ? 'var(--danger)' : 'var(--text-light)'} />
                <Stat label="Routine" value={routineTotal > 0 ? `${routineDone}/${routineTotal}` : '—'} color={routineDone === routineTotal && routineTotal > 0 ? 'var(--success)' : 'var(--text-light)'} />
              </div>
              {high.slice(0, 2).map((t, i) => (
                <div key={t.id||i} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 0', borderBottom: i===0 && high.length>1 ? '1px solid rgba(255,107,107,0.1)' : 'none' }}>
                  <div style={{ width:4, height:4, borderRadius:'50%', background:'var(--danger)', flexShrink:0 }}/>
                  <span style={{ fontSize:11, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>

      {/* AI Log chat — full width at the bottom */}
      <ActionChat userId={user?.id} />

    </div>
  )
}
