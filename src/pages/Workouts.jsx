import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceDot, CartesianGrid, Legend,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { getActiveDate } from '../lib/dateUtils'
import { cacheGet, cacheSet } from '../lib/cache'
import { useMacroGoals } from '../lib/goals'
import SkeletonList from '../components/Skeleton'

const MUSCLE_GROUPS = ['Chest','Back','Shoulders','Arms','Legs','Core','Cardio','Full Body','Other']
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ─── Exercise library for autocomplete ───────────────────────────────
const EXERCISE_LIBRARY = [
  // Chest
  { name: 'Bench Press',               group: 'Chest' },
  { name: 'Incline Bench Press',        group: 'Chest' },
  { name: 'Decline Bench Press',        group: 'Chest' },
  { name: 'Dumbbell Bench Press',       group: 'Chest' },
  { name: 'Incline Dumbbell Press',     group: 'Chest' },
  { name: 'Dumbbell Flyes',             group: 'Chest' },
  { name: 'Cable Flyes',                group: 'Chest' },
  { name: 'Pec Dec',                    group: 'Chest' },
  { name: 'Push-ups',                   group: 'Chest' },
  { name: 'Dips',                       group: 'Chest' },
  { name: 'Chest Press Machine',        group: 'Chest' },
  { name: 'Landmine Press',             group: 'Chest' },
  // Back
  { name: 'Deadlift',                   group: 'Back' },
  { name: 'Romanian Deadlift',          group: 'Back' },
  { name: 'Barbell Row',                group: 'Back' },
  { name: 'Dumbbell Row',               group: 'Back' },
  { name: 'Pull-ups',                   group: 'Back' },
  { name: 'Weighted Pull-ups',          group: 'Back' },
  { name: 'Chin-ups',                   group: 'Back' },
  { name: 'Lat Pulldown',               group: 'Back' },
  { name: 'Seated Cable Row',           group: 'Back' },
  { name: 'T-Bar Row',                  group: 'Back' },
  { name: 'Face Pull',                  group: 'Back' },
  { name: 'Rack Pull',                  group: 'Back' },
  { name: 'Good Morning',               group: 'Back' },
  { name: 'Hyperextension',             group: 'Back' },
  // Shoulders
  { name: 'Overhead Press',             group: 'Shoulders' },
  { name: 'OHP',                        group: 'Shoulders' },
  { name: 'Dumbbell Shoulder Press',    group: 'Shoulders' },
  { name: 'Arnold Press',               group: 'Shoulders' },
  { name: 'Lateral Raises',             group: 'Shoulders' },
  { name: 'Front Raises',               group: 'Shoulders' },
  { name: 'Rear Delt Flyes',            group: 'Shoulders' },
  { name: 'Upright Row',                group: 'Shoulders' },
  { name: 'Shrugs',                     group: 'Shoulders' },
  { name: 'Cable Lateral Raises',       group: 'Shoulders' },
  // Arms
  { name: 'Barbell Curl',               group: 'Arms' },
  { name: 'Dumbbell Curl',              group: 'Arms' },
  { name: 'Hammer Curl',                group: 'Arms' },
  { name: 'Preacher Curl',              group: 'Arms' },
  { name: 'Incline Dumbbell Curl',      group: 'Arms' },
  { name: 'Cable Curl',                 group: 'Arms' },
  { name: 'Concentration Curl',         group: 'Arms' },
  { name: 'Reverse Curl',               group: 'Arms' },
  { name: 'Tricep Pushdown',            group: 'Arms' },
  { name: 'Overhead Tricep Extension',  group: 'Arms' },
  { name: 'Skull Crushers',             group: 'Arms' },
  { name: 'Close Grip Bench Press',     group: 'Arms' },
  { name: 'Tricep Kickback',            group: 'Arms' },
  { name: 'Diamond Push-ups',           group: 'Arms' },
  { name: 'Wrist Curl',                 group: 'Arms' },
  // Legs
  { name: 'Squat',                      group: 'Legs' },
  { name: 'Back Squat',                 group: 'Legs' },
  { name: 'Front Squat',                group: 'Legs' },
  { name: 'Goblet Squat',               group: 'Legs' },
  { name: 'Leg Press',                  group: 'Legs' },
  { name: 'Hack Squat',                 group: 'Legs' },
  { name: 'Leg Extension',              group: 'Legs' },
  { name: 'Leg Curl',                   group: 'Legs' },
  { name: 'Romanian Deadlift',          group: 'Legs' },
  { name: 'Stiff Leg Deadlift',         group: 'Legs' },
  { name: 'Bulgarian Split Squat',      group: 'Legs' },
  { name: 'Lunges',                     group: 'Legs' },
  { name: 'Walking Lunges',             group: 'Legs' },
  { name: 'Step-ups',                   group: 'Legs' },
  { name: 'Calf Raises',                group: 'Legs' },
  { name: 'Seated Calf Raises',         group: 'Legs' },
  { name: 'Leg Press Calf Raises',      group: 'Legs' },
  { name: 'Hip Thrust',                 group: 'Legs' },
  { name: 'Glute Bridge',               group: 'Legs' },
  { name: 'Sumo Deadlift',              group: 'Legs' },
  { name: 'Hip Abductor',               group: 'Legs' },
  { name: 'Hip Adductor',               group: 'Legs' },
  // Core
  { name: 'Plank',                      group: 'Core' },
  { name: 'Side Plank',                 group: 'Core' },
  { name: 'Crunches',                   group: 'Core' },
  { name: 'Sit-ups',                    group: 'Core' },
  { name: 'Leg Raises',                 group: 'Core' },
  { name: 'Hanging Leg Raises',         group: 'Core' },
  { name: 'Cable Crunch',               group: 'Core' },
  { name: 'Ab Rollout',                 group: 'Core' },
  { name: 'Russian Twist',              group: 'Core' },
  { name: 'Bicycle Crunch',             group: 'Core' },
  { name: 'Mountain Climbers',          group: 'Core' },
  { name: 'Dead Bug',                   group: 'Core' },
  { name: 'Pallof Press',               group: 'Core' },
  // Cardio / Full Body
  { name: 'Pull-ups',                   group: 'Full Body' },
  { name: 'Muscle-ups',                 group: 'Full Body' },
  { name: 'Clean and Press',            group: 'Full Body' },
  { name: 'Power Clean',                group: 'Full Body' },
  { name: 'Snatch',                     group: 'Full Body' },
  { name: 'Thruster',                   group: 'Full Body' },
  { name: 'Kettlebell Swing',           group: 'Full Body' },
  { name: 'Burpees',                    group: 'Cardio' },
  { name: 'Box Jumps',                  group: 'Cardio' },
  { name: 'Jump Rope',                  group: 'Cardio' },
  { name: 'Rowing Machine',             group: 'Cardio' },
  { name: 'Treadmill',                  group: 'Cardio' },
  { name: 'Stair Climber',              group: 'Cardio' },
]

// ─── Exercise name hygiene ───────────────────────────────────────────
// Split imports bake rep schemes into names ("Preacher Curl- 2x 6-8 1x drop-set").
// parseExerciseName splits those into a clean name + prescription string.
const REP_SCHEME_RE = /[\s,;:()–—-]*(?:\d+\s*[x×]\s*(?:\d+(?:\s*[-–]\s*\d+)?|drop[\s-]?sets?)|drop[\s-]?sets?|amrap|to\s+failure|\d+\s*sets?\b|\d+\s*reps?\b).*$/i

function parseExerciseName(raw) {
  const str = (raw || '').trim()
  const m = str.match(REP_SCHEME_RE)
  if (!m || m.index === 0) return { name: str, prescription: null }
  const name = str.slice(0, m.index).replace(/[\s,;:()–—-]+$/, '').trim()
  const prescription = str.slice(m.index).replace(/^[\s,;:()–—-]+/, '').trim() || null
  return name ? { name, prescription } : { name: str, prescription: null }
}

// Case/hyphen/whitespace-insensitive canonical form for duplicate matching
function normalizeExName(name) {
  return (name || '').toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const LIB_BY_NORM = new Map(EXERCISE_LIBRARY.map(e => [normalizeExName(e.name), e.group]))

// Ordered keyword rules — first match wins, so specific terms come before generic ones
// (e.g. "leg curl" must hit Legs before Arms' "curl").
const CATEGORY_RULES = [
  ['Cardio',    ['treadmill','rowing machine','stair','elliptical','bike','cycling','jump rope','burpee','sprint','running','box jump']],
  ['Legs',      ['leg curl','leg extension','leg press','squat','rdl','romanian','stiff leg','sumo deadlift','lunge','calf','glute','hip thrust','hamstring','quad','adductor','abductor','step up','nordic']],
  ['Core',      ['plank','crunch','sit up','situp','leg raise','knee raise','russian twist','dead bug','pallof','ab rollout','ab wheel','mountain climber','hollow','oblique']],
  ['Shoulders', ['rear delt','lateral raise','side raise','front raise','shoulder press','ohp','overhead press','arnold','shrug','delt','upright row']],
  ['Back',      ['face pull','pull up','pullup','chin up','chinup','pulldown','pull down','lat','row','deadlift','rack pull','good morning','hyperextension','back extension','muscle up']],
  ['Chest',     ['bench','pec','chest','fly','flye','push up','pushup','dip','landmine']],
  ['Arms',      ['curl','tricep','bicep','skull','pushdown','push down','kickback','extension','wrist','forearm','preacher']],
  ['Full Body', ['clean','snatch','thruster','kettlebell','farmer','carry','turkish']],
]

function categorizeExercise(name) {
  const n = normalizeExName(parseExerciseName(name).name)
  if (!n) return 'Other'
  if (LIB_BY_NORM.has(n)) return LIB_BY_NORM.get(n)
  for (const [group, kws] of CATEGORY_RULES) {
    if (kws.some(k => n.includes(k))) return group
  }
  return 'Other'
}

// ─── Autocomplete combobox ────────────────────────────────────────────
function ExerciseCombobox({ value, onChange, onSelect, placeholder, style }) {
  const { theme } = useApp()
  const isDark = theme !== 'light'
  const [open, setOpen]       = useState(false)
  const [focused, setFocused] = useState(false)
  const wrapRef               = useRef(null)

  const suggestions = value.trim().length === 0 ? [] :
    EXERCISE_LIBRARY.filter(e =>
      e.name.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 8)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setFocused(true); setOpen(true) }}
        onBlur={() => setFocused(false)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && suggestions.length === 0) setOpen(false)
        }}
        placeholder={placeholder || 'Exercise name…'}
        style={{ width: '100%' }}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, zIndex: 200,
          background: isDark ? '#18181f' : 'rgba(255,255,255,0.98)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.14)',
        }}>
          {suggestions.map((ex, i) => (
            <div
              key={i}
              onMouseDown={e => {
                e.preventDefault() // prevent input blur before click
                onChange(ex.name)
                onSelect && onSelect(ex)
                setOpen(false)
              }}
              style={{
                padding: '9px 14px',
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{ex.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {ex.group}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Weight range picker ──────────────────────────────────────────────
// Scrollable list in 5 lb steps, auto-centred on last used weight
const WEIGHT_STEP = 5
const WEIGHT_MIN  = 5
const WEIGHT_MAX  = 500
const WEIGHT_LIST = Array.from(
  { length: Math.floor((WEIGHT_MAX - WEIGHT_MIN) / WEIGHT_STEP) + 1 },
  (_, i) => WEIGHT_MIN + i * WEIGHT_STEP
) // [5, 10, 15 … 500]

function WeightPicker({ value, onChange, lastWeight, style, onKeyDown }) {
  const [open, setOpen]   = useState(false)
  const wrapRef           = useRef(null)
  const listRef           = useRef(null)
  const itemRefs          = useRef({})

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Scroll to anchor weight whenever the list opens
  useEffect(() => {
    if (!open || !listRef.current) return
    const anchor = parseFloat(value) || lastWeight
    if (!anchor) return
    const closest = WEIGHT_LIST.reduce((p, c) =>
      Math.abs(c - anchor) < Math.abs(p - anchor) ? c : p
    )
    const el = itemRefs.current[closest]
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [open])

  const selectedNum = parseFloat(value)

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="lbs"
        min={WEIGHT_MIN}
        step={WEIGHT_STEP}
        style={{ width: '100%' }}
      />
      {open && (
        <div ref={listRef} style={{
          position: 'absolute', top: '100%', left: 0,
          width: 140, marginTop: 4, zIndex: 200,
          background: '#18181f',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          maxHeight: 252, overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          scrollbarWidth: 'thin',
        }}>
          {WEIGHT_LIST.map(w => {
            const isSel  = selectedNum === w
            const isLast = lastWeight  === w
            return (
              <div
                key={w}
                ref={el => { itemRefs.current[w] = el }}
                onMouseDown={e => { e.preventDefault(); onChange(String(w)); setOpen(false) }}
                style={{
                  padding: '9px 14px',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: isSel ? 'var(--accent)' : isLast ? 'rgba(99,102,241,0.13)' : 'transparent',
                  borderLeft: isLast && !isSel ? '3px solid var(--accent)' : '3px solid transparent',
                  color: isSel ? '#fff' : isLast ? '#fff' : 'var(--text-muted)',
                  fontFamily: 'var(--mono)',
                  fontWeight: isSel || isLast ? 700 : 400,
                  fontSize: 13,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = isLast ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.07)' }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isLast ? 'rgba(99,102,241,0.13)' : 'transparent' }}
              >
                <span>{w}</span>
                <span style={{ fontSize: 10, opacity: isSel ? 0.75 : 0.4, fontFamily: 'inherit' }}>lbs</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Reps combobox (tap to see common counts) ─────────────────────────
function NumberCombobox({ value, onChange, suggestions = [], placeholder, style, min, step, unit, onKeyDown }) {
  const [open,      setOpen]      = useState(false)
  const [filtering, setFiltering] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setFiltering(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const shown = filtering
    ? suggestions.filter(s => String(s).startsWith(String(value)))
    : suggestions

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <input
        type="number"
        value={value}
        onChange={e => { setFiltering(true); onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setFiltering(false); setOpen(true) }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        min={min} step={step}
        style={{ width: '100%' }}
      />
      {open && shown.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0,
          minWidth: 110, marginTop: 4, zIndex: 200,
          background: '#18181f',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {shown.map((s, i) => (
            <div
              key={i}
              onMouseDown={e => { e.preventDefault(); onChange(String(s)); setOpen(false) }}
              style={{
                padding: '8px 14px', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span>{s}</span>
              {unit && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'inherit', fontWeight: 500 }}>{unit}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function today() {
  const n = new Date()
  // Use local date parts — toISOString() returns UTC which can be a day ahead
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
}
function epley(weight, reps) {
  if (!weight || !reps) return 0
  return reps === 1 ? +weight : Math.round(+weight * (1 + reps / 30))
}

// ─── Main ────────────────────────────────────────────────────────────
export default function Workouts() {
  const [tab, setTab] = useState('today')
  // Tabs stay mounted after first visit (hidden with CSS) so switching back
  // is instant — each tab refreshes its data in the background when re-shown.
  const [visited, setVisited] = useState({ today: true })

  function go(key) {
    setTab(key)
    setVisited(v => v[key] ? v : { ...v, [key]: true })
  }

  return (
    <div>
      <div className="page-header"><h1>Workouts</h1></div>
      <div className="page-body">
        <div className="tab-bar">
          {[['today','Today'],['lifts','My Lifts'],['split','My Split'],['body','Body']].map(([key,label]) => (
            <button
              key={key}
              className={`tab-btn${tab === key ? ' active' : ''}`}
              onClick={() => go(key)}
            >{label}</button>
          ))}
        </div>
        {visited.today && <div style={tab === 'today' ? undefined : { display: 'none' }}><TodayTab active={tab === 'today'} /></div>}
        {visited.lifts && <div style={tab === 'lifts' ? undefined : { display: 'none' }}><LiftsTab active={tab === 'lifts'} /></div>}
        {visited.split && <div style={tab === 'split' ? undefined : { display: 'none' }}><SplitTab active={tab === 'split'} /></div>}
        {visited.body  && <div style={tab === 'body'  ? undefined : { display: 'none' }}><BodyTab  active={tab === 'body'} /></div>}
      </div>
    </div>
  )
}

// ─── TODAY TAB ───────────────────────────────────────────────────────
function TodayTab({ active = true }) {
  const { user, theme } = useApp()
  const isDark = theme !== 'light'
  const activeDate   = getActiveDate()
  const todayDow     = new Date(activeDate + 'T12:00:00').getDay() // 0=Sun
  const cacheKey     = `workouts:today:${activeDate}`
  const cached       = cacheGet(cacheKey)

  const [splitDay,      setSplitDay]      = useState(cached?.splitDay ?? null)
  const [todaySets,     setTodaySets]     = useState(cached?.todaySets ?? [])
  const [nutrition,     setNutrition]     = useState(cached?.nutrition ?? [])
  const [recoverMuscles, setRecoverMuscles] = useState(cached?.recoverMuscles ?? [])
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [modalExercises, setModalExercises] = useState('')
  const [modalName,      setModalName]     = useState('')
  const [modalSaving,    setModalSaving]   = useState(false)
  const [exercises,   setExercises]   = useState(cached?.exercises ?? [])
  const [loading,     setLoading]     = useState(!cached)
  const [streak,      setStreak]      = useState(cached?.streak ?? 0)

  const load = useCallback(async () => {
    const cutoff48 = new Date()
    cutoff48.setHours(cutoff48.getHours() - 48)
    const cutoff48str = cutoff48.toISOString().split('T')[0]

    const [
      { data: splitData },
      { data: setsData },
      { data: nutritionData },
      { data: recentSets },
      { data: exercisesData },
      { data: allSets },
    ] = await Promise.all([
      supabase.from('weekly_split').select('*').eq('user_id', user.id).eq('day_of_week', todayDow).single(),
      supabase.from('workout_sets').select('*, exercises(name, muscle_group)').eq('user_id', user.id).eq('logged_date', activeDate).order('created_at'),
      supabase.from('nutrition_entries').select('*').eq('user_id', user.id).eq('date', activeDate),
      supabase.from('workout_sets').select('*, exercises(muscle_group)').eq('user_id', user.id).gte('logged_date', cutoff48str),
      supabase.from('exercises').select('*').eq('user_id', user.id).order('name'),
      supabase.from('workout_sets').select('logged_date').eq('user_id', user.id).gte('logged_date', new Date(Date.now() - 70 * 86400000).toISOString().split('T')[0]),
    ])

    setSplitDay(splitData)
    setTodaySets(setsData || [])
    setNutrition(nutritionData || [])
    setExercises(exercisesData || [])

    // Recovery: unique muscle groups from last 48h
    const muscles = [...new Set((recentSets || []).map(s => s.exercises?.muscle_group).filter(Boolean))]
    setRecoverMuscles(muscles)

    // Streak
    const datesWithSets = new Set((allSets || []).map(s => s.logged_date))
    let count = 0
    const d = new Date(activeDate + 'T12:00:00')
    for (let i = 0; i < 70; i++) {
      d.setDate(d.getDate() - 1)
      const ds = d.toISOString().split('T')[0]
      if (datesWithSets.has(ds)) count++
      else break
    }
    setStreak(count)

    cacheSet(cacheKey, {
      splitDay: splitData,
      todaySets: setsData || [],
      nutrition: nutritionData || [],
      exercises: exercisesData || [],
      recoverMuscles: muscles,
      streak: count,
    })
    setLoading(false)
  }, [user.id, activeDate, todayDow, cacheKey])

  useEffect(() => { if (active) load() }, [load, active])

  const totalCal  = nutrition.reduce((s, e) => s + e.calories, 0)
  const totalProt = nutrition.reduce((s, e) => s + (e.protein_g || 0), 0)
  const { cal: calorieGoal, prot: proteinGoal } = useMacroGoals()

  // Group today's sets by exercise
  const setsByExercise = {}
  todaySets.forEach(s => {
    const key = s.exercises?.name || s.exercise_id
    if (!setsByExercise[key]) setsByExercise[key] = []
    setsByExercise[key].push(s)
  })

  const hasWorkout = todaySets.length > 0

  const DAY_COLORS = ['#9b59b6','#e67e22','#3498db','#2ecc71','#e74c3c','#1abc9c','#f39c12']
  const dayColor = DAY_COLORS[todayDow]

  async function saveSplitModal() {
    setModalSaving(true)
    const exercises = modalExercises.split('\n').map(s => s.trim()).filter(Boolean)
    await supabase.from('weekly_split').upsert({
      user_id: user.id, day_of_week: todayDow,
      day_name: modalName, exercises,
    }, { onConflict: 'user_id,day_of_week' })
    setSplitDay(s => ({ ...s, day_name: modalName, exercises }))
    setModalSaving(false)
    setShowSplitModal(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Fullscreen split modal */}
      {showSplitModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(5,5,6,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          overflowY: 'auto',
          padding: '24px 20px 60px',
        }}>
          {/* Back arrow */}
          <button
            onClick={() => setShowSplitModal(false)}
            style={{
              position: 'fixed', top: 20, left: 20,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', width: 42, height: 42,
              borderRadius: '50%', fontSize: 20, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 1001,
            }}
          >←</button>

          <div style={{ maxWidth: 520, margin: '56px auto 0' }}>
            {/* Day label */}
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
              {DAYS[todayDow]} — Today
            </div>

            {/* Editable day name */}
            <input
              value={modalName}
              onChange={e => setModalName(e.target.value)}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: `3px solid ${dayColor}`,
                borderRadius: 0, fontSize: 32, fontWeight: 800,
                color: '#fff', padding: '4px 0 8px', marginBottom: 28,
                width: '100%',
              }}
            />

            {/* Exercise bullet list preview */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>
              Exercises
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
              {modalExercises.split('\n').filter(Boolean).map((ex, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 15, color: '#fff', fontWeight: 500 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dayColor, flexShrink: 0 }} />
                  {ex}
                </li>
              ))}
            </ul>

            {/* Editable textarea */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
              Edit exercises (one per line)
            </div>
            <textarea
              value={modalExercises}
              onChange={e => setModalExercises(e.target.value)}
              style={{ width: '100%', minHeight: 160, fontSize: 14, color: '#fff', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 14, resize: 'vertical' }}
            />

            <button
              className="btn btn-primary"
              onClick={saveSplitModal}
              disabled={modalSaving}
              style={{ marginTop: 16, width: '100%', padding: 14, fontSize: 15 }}
            >
              {modalSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Streak + today's split card */}
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="stat-card" style={{ flex: '0 0 auto', minWidth: 130 }} title="A day counts toward the streak when you log at least one set.">
          <div className="stat-label">Streak</div>
          <div className="stat-value" style={{ fontSize: 28, color: 'var(--text)' }}>
            {streak}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}> days</span>
          </div>
          <div style={{ fontSize: 10, marginTop: 5, lineHeight: 1.4, color: todaySets.length > 0 ? 'var(--success)' : 'var(--warning)' }}>
            {todaySets.length > 0
              ? 'Today counts — set logged'
              : streak > 0 ? 'Log a set today to keep it' : 'Log a set to start one'}
          </div>
        </div>

        {/* Today's split — clickable card */}
        <div
          onClick={() => {
            setModalName(splitDay?.day_name || '')
            setModalExercises((splitDay?.exercises || []).join('\n'))
            setShowSplitModal(true)
          }}
          style={{
            flex: 1, cursor: 'pointer',
            background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
            border: `1px solid ${dayColor}55`,
            borderLeft: `4px solid ${dayColor}`,
            borderRadius: 'var(--radius-lg)',
            padding: '14px 16px',
            transition: 'background 0.15s, border-color 0.15s',
            position: 'relative',
          }}
          onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'}
        >
          {/* Expand hint */}
          <span style={{ position: 'absolute', top: 12, right: 14, fontSize: 14, color: 'var(--text-light)' }}>↗</span>

          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-light)', marginBottom: 6 }}>
            {DAYS[todayDow]} — Today
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>
            {loading ? '…' : splitDay?.day_name || 'No split set — tap to add'}
          </div>

          {splitDay?.exercises?.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {splitDay.exercises.map((ex, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dayColor, flexShrink: 0 }} />
                  {ex}
                </li>
              ))}
            </ul>
          )}
          {!splitDay?.exercises?.length && !loading && (
            <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic' }}>Tap to set up today's workout</div>
          )}
        </div>
      </div>

      {/* Nutrition summary */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-light)', marginBottom: 8 }}>
          Today's Fuel
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <NutritionPill label="Calories" value={totalCal} goal={calorieGoal} unit="kcal" />
          <NutritionPill label="Protein" value={Math.round(totalProt)} goal={proteinGoal} unit="g"
            warn={hasWorkout && totalProt < proteinGoal * 0.6} />
        </div>
        {hasWorkout && totalProt < proteinGoal * 0.6 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--warning)', fontWeight: 500 }}>
            ⚠ You're under on protein after logging a session — consider a protein meal.
          </div>
        )}
        {totalProt >= proteinGoal && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>
            You've hit your protein goal today — you're fueled.
          </div>
        )}
      </div>

      {/* Recovery indicator */}
      {recoverMuscles.length > 0 && (
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-light)', marginBottom: 8 }}>
            Recovery (last 48h)
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MUSCLE_GROUPS.filter(m => m !== 'Other').map(m => {
              const recovering = recoverMuscles.includes(m)
              return (
                <span key={m} style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 8px',
                  borderRadius: 20,
                  background: recovering ? 'rgba(255,107,107,0.15)' : 'rgba(107,227,164,0.12)',
                  color: recovering ? 'var(--danger)' : 'var(--success)',
                  border: `1px solid ${recovering ? 'rgba(255,107,107,0.3)' : 'rgba(107,227,164,0.25)'}`,
                }}>
                  {recovering ? '● ' : '○ '}{m}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Exercise logger */}
      <ExerciseLogger
        splitDay={splitDay}
        exercises={exercises}
        todaySets={todaySets}
        setsByExercise={setsByExercise}
        userId={user.id}
        activeDate={activeDate}
        onSaved={load}
      />
    </div>
  )
}

function NutritionPill({ label, value, goal, unit, warn }) {
  const pct = Math.min(100, Math.round((value / goal) * 100))
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: warn ? 'var(--warning)' : 'var(--text)' }}>
        {value.toLocaleString()}<span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 2 }}>{unit}</span>
      </div>
      <div style={{ height: 3, background: 'var(--border-strong)', borderRadius: 99, marginTop: 4, width: 90 }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: warn ? 'var(--warning)' : 'var(--accent)', transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

function ExerciseLogger({ splitDay, exercises, todaySets, setsByExercise, userId, activeDate, onSaved }) {
  const [selectedExercise, setSelectedExercise] = useState('')
  const [weight, setWeight]     = useState('')
  const [reps, setReps]         = useState('')
  const [saving, setSaving]     = useState(false)
  const [timerOn, setTimerOn]   = useState(false)
  const [timeLeft, setTimeLeft] = useState(90)
  const [lastSet, setLastSet] = useState(null)

  // When exercise is explicitly chosen (chip or dropdown), fetch last set & auto-fill
  async function selectExercise(name) {
    setSelectedExercise(name)
    setLastSet(null)
    if (!name) return
    const ex = exercises.find(e => e.name.toLowerCase() === name.toLowerCase())
    if (!ex?.id) return
    const { data } = await supabase.from('workout_sets')
      .select('*').eq('exercise_id', ex.id).eq('user_id', userId)
      .order('logged_date', { ascending: false }).order('set_number', { ascending: false })
      .limit(1)
    const s = data?.[0] || null
    setLastSet(s)
    if (s) { setWeight(String(s.weight)); setReps(String(s.reps)) }
  }

  // Rest timer
  useEffect(() => {
    if (!timerOn) return
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setTimerOn(false); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [timerOn])

  function startTimer(secs) {
    setTimeLeft(secs)
    setTimerOn(true)
  }

  async function logSet() {
    if (!selectedExercise || !weight || !reps) return
    setSaving(true)

    // Find or create exercise — match on the cleaned, normalized name so
    // split labels like "Preacher Curl- 2x 6-8" reuse the "Preacher Curl" record
    const parsed = parseExerciseName(selectedExercise)
    const wanted = normalizeExName(parsed.name)
    let exerciseId
    let ex = exercises.find(e => normalizeExName(parseExerciseName(e.name).name) === wanted)
    if (!ex) {
      const { data } = await supabase.from('exercises').insert({
        user_id: userId, name: parsed.name, muscle_group: categorizeExercise(parsed.name)
      }).select().single()
      ex = data
    }
    exerciseId = ex.id

    // Find next set number for this exercise today
    const existingSets = (setsByExercise[ex.name] || [])
    const setNum = existingSets.length + 1

    await supabase.from('workout_sets').insert({
      user_id: userId, exercise_id: exerciseId,
      logged_date: activeDate, set_number: setNum,
      weight: parseFloat(weight), reps: parseInt(reps),
    })

    setWeight(''); setReps('')
    setSaving(false)
    onSaved()
  }

  // Exercises to show in quick-pick: split exercises + any already logged today
  const splitExercises = splitDay?.exercises || []
  const loggedNames = Object.keys(setsByExercise)
  const quickPick = [...new Set([...splitExercises, ...loggedNames])]

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2>Log Sets</h2>
        {/* Rest timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {timerOn ? (
            <>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: timeLeft < 10 ? 'var(--danger)' : 'var(--accent)' }}>
                {mins}:{String(secs).padStart(2,'0')}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setTimerOn(false)}>Stop</button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-light)', alignSelf: 'center', marginRight: 4 }}>Rest:</span>
              {[60, 90, 120, 180].map(s => (
                <button key={s} className="btn btn-ghost btn-sm" style={{ padding: '3px 7px', fontSize: 11 }}
                  onClick={() => startTimer(s)}>
                  {s < 60 ? `${s}s` : `${s/60}m`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick pick chips */}
      {quickPick.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {quickPick.map(name => (
            <button
              key={name}
              onClick={() => selectExercise(name)}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                background: selectedExercise === name ? 'var(--accent)' : 'var(--surface)',
                color: selectedExercise === name ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${selectedExercise === name ? 'transparent' : 'var(--border)'}`,
                fontWeight: 600, transition: 'all 0.15s',
              }}
            >{name}</button>
          ))}
        </div>
      )}

      {/* Log row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <ExerciseCombobox
          value={selectedExercise}
          onChange={setSelectedExercise}
          onSelect={ex => selectExercise(ex.name)}
          placeholder="Exercise name…"
          style={{ flex: 2, minWidth: 140 }}
        />
        <WeightPicker
          value={weight}
          onChange={setWeight}
          lastWeight={lastSet?.weight}
          style={{ width: 80 }}
        />
        <NumberCombobox
          value={reps}
          onChange={setReps}
          suggestions={[1, 3, 5, 6, 8, 10, 12, 15, 20]}
          placeholder="reps"
          min={1}
          unit="reps"
          style={{ width: 80 }}
          onKeyDown={e => e.key === 'Enter' && logSet()}
        />
        <button className="btn btn-primary" onClick={logSet} disabled={saving || !selectedExercise || !weight || !reps}>
          {saving ? '…' : '+ Log Set'}
        </button>
      </div>

      {/* Last-session suggestion + weight adjusters */}
      {lastSet && (
        <div style={{
          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          padding: '8px 12px', marginBottom: 4,
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.22)',
          borderRadius: 8, fontSize: 12,
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Last session:</span>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text)' }}>
            {lastSet.weight} lbs × {lastSet.reps} reps
          </span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => { setWeight(String(lastSet.weight)); setReps(String(lastSet.reps)) }}
          >↩ Use</button>
          <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontSize: 11 }}>Adjust:</span>
          {[-5, -2.5, 2.5, 5].map(adj => (
            <button
              key={adj}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, padding: '2px 7px', minWidth: 34 }}
              onClick={() => setWeight(w => {
                const cur = parseFloat(w) || lastSet.weight
                return String(Math.max(0, cur + adj))
              })}
            >{adj > 0 ? `+${adj}` : adj}</button>
          ))}
        </div>
      )}

      {/* Today's sets grouped by exercise */}
      {Object.keys(setsByExercise).length > 0 ? (
        Object.entries(setsByExercise).map(([name, sets]) => {
          const best = Math.max(...sets.map(s => epley(s.weight, s.reps)))
          return (
            <div key={name} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Est. 1RM: <strong style={{ color: 'var(--accent)' }}>{best} lbs</strong></span>
              </div>
              {sets.map((s, i) => (
                <div key={s.id} style={{
                  display: 'flex', gap: 10, alignItems: 'center',
                  padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
                }}>
                  <span style={{ color: 'var(--text-light)', width: 40 }}>Set {s.set_number}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{s.weight} lbs</span>
                  <span style={{ color: 'var(--text-muted)' }}>×</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{s.reps} reps</span>
                  <span style={{ color: 'var(--text-light)', fontSize: 11, marginLeft: 'auto' }}>{epley(s.weight, s.reps)} e1RM</span>
                  <DeleteSetBtn id={s.id} onDeleted={async () => {
                    await supabase.from('workout_sets').delete().eq('id', s.id)
                    onSaved()
                  }} />
                </div>
              ))}
            </div>
          )
        })
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic' }}>
          No sets logged yet today. Pick an exercise above and start logging.
        </div>
      )}
    </div>
  )
}

function DeleteSetBtn({ id, onDeleted }) {
  return (
    <button onClick={onDeleted} style={{
      background: 'none', border: 'none', color: 'var(--text-light)',
      cursor: 'pointer', fontSize: 14, opacity: 0, transition: 'opacity 0.15s',
      padding: '0 2px',
    }}
      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
      onMouseLeave={e => e.currentTarget.style.opacity = '0'}
    >×</button>
  )
}

// ─── MY LIFTS TAB ────────────────────────────────────────────────────
function LiftsTab({ active = true }) {
  const { user, theme } = useApp()
  const isDark = theme !== 'light'
  const [view,         setView]         = useState('exercises') // 'exercises' | 'history'
  const [exercises,    setExercises]    = useState(() => cacheGet('lifts:exercises') || [])
  const [filter,       setFilter]       = useState('All')
  const [selectedId,   setSelectedId]   = useState(null)
  const [loading,      setLoading]      = useState(() => !cacheGet('lifts:exercises'))
  const [showAddForm,  setShowAddForm]  = useState(false)
  const [newName,      setNewName]      = useState('')
  const [newGroup,     setNewGroup]     = useState('Chest')
  const [cleaning,     setCleaning]     = useState(false)
  const [cleanMsg,     setCleanMsg]     = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('exercises').select('*').eq('user_id', user.id).order('name')
    setExercises(cacheSet('lifts:exercises', data || []))
    setLoading(false)
  }, [user.id])

  useEffect(() => { if (active) load() }, [load, active])

  async function addExercise() {
    const name = newName.trim()
    if (!name) return
    const { data } = await supabase.from('exercises').insert({
      user_id: user.id, name, muscle_group: newGroup
    }).select().single()
    setExercises(e => [...e, data])
    setNewName(''); setShowAddForm(false)
  }

  async function deleteExercise(id) {
    await supabase.from('exercises').delete().eq('id', id)
    setExercises(e => e.filter(x => x.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function updateGroup(id, group) {
    setExercises(es => cacheSet('lifts:exercises', es.map(e => e.id === id ? { ...e, muscle_group: group } : e)))
    await supabase.from('exercises').update({ muscle_group: group }).eq('id', id)
  }

  // Merge duplicate exercises (case/hyphen/rep-scheme variants), pull rep schemes
  // out of names, and auto-categorize anything stuck on "Other".
  const cleanupExercises = useCallback(async (silent = false) => {
    setCleaning(true)
    const [{ data: exs }, { data: sets }] = await Promise.all([
      supabase.from('exercises').select('*').eq('user_id', user.id),
      supabase.from('workout_sets').select('id, exercise_id').eq('user_id', user.id),
    ])
    const countByEx = {}
    ;(sets || []).forEach(x => { countByEx[x.exercise_id] = (countByEx[x.exercise_id] || 0) + 1 })

    const dupGroups = new Map()
    for (const e of exs || []) {
      const parsed = parseExerciseName(e.name)
      const key = normalizeExName(parsed.name)
      if (!dupGroups.has(key)) dupGroups.set(key, [])
      dupGroups.get(key).push({ ...e, cleanName: parsed.name, parsedRx: parsed.prescription })
    }

    let merged = 0, recategorized = 0, renamed = 0
    for (const list of dupGroups.values()) {
      // Keeper: most logged sets, then oldest record
      list.sort((a, b) => (countByEx[b.id] || 0) - (countByEx[a.id] || 0) || String(a.created_at).localeCompare(String(b.created_at)))
      const keeper = list[0]
      for (const dupe of list.slice(1)) {
        await supabase.from('workout_sets').update({ exercise_id: keeper.id }).eq('exercise_id', dupe.id)
        await supabase.from('exercises').delete().eq('id', dupe.id)
        merged++
      }
      const updates = {}
      if (keeper.cleanName && keeper.cleanName !== keeper.name) { updates.name = keeper.cleanName; renamed++ }
      const grp = categorizeExercise(keeper.cleanName)
      if ((!keeper.muscle_group || keeper.muscle_group === 'Other') && grp !== 'Other') { updates.muscle_group = grp; recategorized++ }
      if (Object.keys(updates).length) {
        await supabase.from('exercises').update(updates).eq('id', keeper.id)
      }
      // prescription column may not exist until the SQL migration runs — ignore failure
      const rx = list.map(l => l.parsedRx).find(Boolean)
      if (rx && !keeper.prescription) {
        supabase.from('exercises').update({ prescription: rx }).eq('id', keeper.id).then(() => {})
      }
    }
    await load()
    setCleaning(false)
    if (!silent) setCleanMsg(`Merged ${merged} duplicate${merged !== 1 ? 's' : ''}, categorized ${recategorized}, cleaned ${renamed} name${renamed !== 1 ? 's' : ''}`)
  }, [user.id, load])

  // One-time automatic cleanup per browser
  useEffect(() => {
    if (active && !localStorage.getItem('exercise-cleanup-v1')) {
      localStorage.setItem('exercise-cleanup-v1', '1')
      cleanupExercises(true)
    }
  }, [active, cleanupExercises])

  const groups  = ['All', ...MUSCLE_GROUPS]
  const filtered = filter === 'All' ? exercises : exercises.filter(e => e.muscle_group === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* View toggle */}
      <div className="tab-bar">
        <button className={`tab-btn${view === 'exercises' ? ' active' : ''}`} onClick={() => setView('exercises')}>Exercises</button>
        <button className={`tab-btn${view === 'history'   ? ' active' : ''}`} onClick={() => setView('history')}>History</button>
      </div>

      {/* ── Workout History ── */}
      {view === 'history' && <WorkoutHistory userId={user.id} />}

      {/* ── Exercises list ── */}
      {view === 'exercises' && <>
        {/* Filter + Add */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {groups.map(g => (
              <button key={g}
                className={`filter-btn${filter === g ? ' active' : ''}`}
                onClick={() => setFilter(g)}
              >{g}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" disabled={cleaning} onClick={() => cleanupExercises(false)} title="Merge duplicate exercises and auto-categorize">
            {cleaning ? 'Cleaning…' : 'Merge duplicates'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(s => !s)}>
            {showAddForm ? 'Cancel' : '+ New Lift'}
          </button>
        </div>
        {cleanMsg && (
          <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            {cleanMsg}
          </div>
        )}

        {showAddForm && (
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ExerciseCombobox
                value={newName}
                onChange={v => {
                  setNewName(v)
                  const g = categorizeExercise(v)
                  if (g !== 'Other') setNewGroup(g)
                }}
                onSelect={ex => setNewGroup(ex.group)}
                placeholder="Search exercises or type custom…"
                style={{ flex: 1, minWidth: 160 }}
              />
              <select value={newGroup} onChange={e => setNewGroup(e.target.value)} style={{ width: 130 }}>
                {MUSCLE_GROUPS.map(g => <option key={g}>{g}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={addExercise}>Add</button>
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonList rows={3} />
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: 13, fontStyle: 'italic' }}>
            No lifts yet. Add your first exercise above.
          </div>
        ) : (
          filtered.map(ex => (
            <div key={ex.id}>
              <div
                className="card"
                style={{ cursor: 'pointer', transition: 'border-color 0.15s', borderColor: selectedId === ex.id ? 'var(--accent)' : undefined }}
                onClick={() => setSelectedId(selectedId === ex.id ? null : ex.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {ex.name}
                      {ex.prescription && (
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-light)', marginLeft: 8, fontFamily: 'var(--mono)' }}>{ex.prescription}</span>
                      )}
                    </div>
                    <select
                      value={ex.muscle_group || 'Other'}
                      onClick={e => e.stopPropagation()}
                      onChange={e => updateGroup(ex.id, e.target.value)}
                      style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      {MUSCLE_GROUPS.map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{selectedId === ex.id ? '▲' : '▼'} history</span>
                    <button className="goal-del" onClick={e => { e.stopPropagation(); deleteExercise(ex.id) }}>×</button>
                  </div>
                </div>
              </div>
              {selectedId === ex.id && <ExerciseDetail exercise={ex} userId={user.id} />}
            </div>
          ))
        )}
      </>}
    </div>
  )
}

const CHART_METRICS = [
  ['e1rm',   'Est. 1RM'],
  ['top',    'Top Set'],
  ['volume', 'Volume'],
]

function ExerciseDetail({ exercise, userId }) {
  const { theme }   = useApp()
  const isDark      = theme !== 'light'
  const ckey        = `lifts:sets:${exercise.id}`
  const [sets, setSets]     = useState(() => cacheGet(ckey) || [])
  const [loading, setLoading] = useState(() => !cacheGet(ckey))
  const [metric, setMetric]   = useState('e1rm')

  useEffect(() => {
    supabase.from('workout_sets').select('*')
      .eq('exercise_id', exercise.id)
      .order('logged_date').order('set_number')
      .then(({ data }) => { setSets(cacheSet(ckey, data || [])); setLoading(false) })
  }, [exercise.id, ckey])

  if (loading) return <div className="skeleton-card"><div className="skeleton" style={{ width: '40%', height: 12 }} /><div className="skeleton" style={{ width: '100%', height: 120 }} /></div>
  if (!sets.length) return (
    <div className="card" style={{ color: 'var(--text-light)', fontSize: 13, fontStyle: 'italic' }}>
      No sets logged for {exercise.name} yet. Log your first set in the Today tab.
    </div>
  )

  // Build chart data per date for the selected metric:
  //   e1rm — best estimated 1RM, top — heaviest set weight, volume — total lbs lifted
  const byDate = {}
  sets.forEach(s => {
    const cur = byDate[s.logged_date] || { e1rm: 0, top: 0, volume: 0 }
    cur.e1rm   = Math.max(cur.e1rm, epley(s.weight, s.reps))
    cur.top    = Math.max(cur.top, s.weight || 0)
    cur.volume = cur.volume + (s.weight || 0) * (s.reps || 0)
    byDate[s.logged_date] = cur
  })
  let maxSoFar = 0
  const chartData = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).map(([date, vals]) => {
    const value = Math.round(vals[metric])
    const isPR = metric !== 'volume' && value > maxSoFar
    if (isPR) maxSoFar = value
    return { date: date.slice(5), e1rm: value, isPR, fullDate: date }
  })

  // 30-day progress
  const now = chartData[chartData.length - 1]?.e1rm
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  const past = chartData.find(d => d.fullDate >= cutoffStr)
  const progressText = now && past && past.e1rm !== now
    ? `${now > past.e1rm ? '▲ Up' : '▼ Down'} ${Math.abs(Math.round(((now - past.e1rm) / past.e1rm) * 100))}% on ${exercise.name} over the last 30 days`
    : null

  // Group sets by date for history
  const byDateSets = {}
  sets.forEach(s => {
    if (!byDateSets[s.logged_date]) byDateSets[s.logged_date] = []
    byDateSets[s.logged_date].push(s)
  })
  const dates = Object.keys(byDateSets).sort((a,b) => b.localeCompare(a)).slice(0,5)

  return (
    <div className="card" style={{ marginTop: 2, borderTop: '2px solid var(--accent)' }}>
      {/* Progress blurb */}
      {progressText && (
        <div style={{ fontSize: 12, fontWeight: 600, color: now > (past?.e1rm || 0) ? 'var(--success)' : 'var(--danger)', marginBottom: 12 }}>
          {progressText}
        </div>
      )}

      {/* Progression graph */}
      {chartData.length > 1 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {CHART_METRICS.find(([k]) => k === metric)[1]} over time
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {CHART_METRICS.map(([key, label]) => (
                <button
                  key={key}
                  className={`filter-btn${metric === key ? ' active' : ''}`}
                  style={{ fontSize: 10, padding: '2px 9px' }}
                  onClick={() => setMetric(key)}
                >{label}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: isDark ? '#0F0F14' : 'rgba(255,255,255,0.98)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}`, borderRadius: 8, color: isDark ? '#FAFAFA' : 'var(--text)', fontSize: 12 }}
                formatter={(v) => [`${v.toLocaleString()} lbs`, CHART_METRICS.find(([k]) => k === metric)[1]]}
              />
              <Line type="monotone" dataKey="e1rm" stroke="var(--accent)" strokeWidth={2} dot={false} />
              {chartData.filter(d => d.isPR).map(d => (
                <ReferenceDot key={d.date} x={d.date} y={d.e1rm} r={5} fill="var(--warning)" stroke="none">
                </ReferenceDot>
              ))}
            </LineChart>
          </ResponsiveContainer>
          {metric !== 'volume' && (
            <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warning)', display: 'inline-block' }} />
              Personal record
            </div>
          )}
        </div>
      )}

      {/* Recent session history */}
      <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Recent Sessions
      </div>
      {dates.map(date => (
        <div key={date} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
            {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          {byDateSets[date].map(s => (
            <div key={s.id} style={{ fontSize: 12, padding: '2px 0', color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
              <span style={{ color: 'var(--text-light)', width: 36 }}>Set {s.set_number}</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text)' }}>{s.weight} lbs × {s.reps}</span>
              <span style={{ color: 'var(--text-light)' }}>{epley(s.weight, s.reps)} e1RM</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── MY SPLIT TAB ────────────────────────────────────────────────────
function SplitTab({ active = true }) {
  const { user, theme } = useApp()
  const isDark = theme !== 'light'
  const [split,    setSplit]    = useState(() => cacheGet('workouts:split') || {}) // { "0": { name, exercises[] }, ... }
  const [loading,  setLoading]  = useState(() => !cacheGet('workouts:split'))
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [aiMsg,    setAiMsg]    = useState('')
  const [aiLoading,setAiLoading]= useState(false)
  const [aiError,  setAiError]  = useState('')


  const load = useCallback(async () => {
    const { data } = await supabase.from('weekly_split').select('*').eq('user_id', user.id).order('day_of_week')
    const built = {}
    DAYS.forEach((_, i) => { built[i] = { name: 'Rest', exercises: [] } })
    ;(data || []).forEach(row => {
      built[row.day_of_week] = { name: row.day_name, exercises: row.exercises || [] }
    })
    setSplit(cacheSet('workouts:split', built))
    setLoading(false)
  }, [user.id])

  useEffect(() => { if (active) load() }, [load, active])

  async function saveSplit() {
    setSaving(true)
    const rows = Object.entries(split).map(([day, data]) => ({
      user_id: user.id,
      day_of_week: parseInt(day),
      day_name: data.name || 'Rest',
      exercises: data.exercises || [],
    }))
    await supabase.from('weekly_split').upsert(rows, { onConflict: 'user_id,day_of_week' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function updateDay(dayIdx, field, value) {
    setSplit(s => ({ ...s, [dayIdx]: { ...s[dayIdx], [field]: value } }))
  }

  function updateExercises(dayIdx, text) {
    const exList = text.split('\n').map(s => s.trim()).filter(Boolean)
    updateDay(dayIdx, 'exercises', exList)
  }

  // Detect if text is a full multi-day paste and parse it locally — no AI needed
  function parsePastedSplit(text) {
    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
    const dayAbbr  = ['sun','mon','tue','wed','thu','fri','sat']
    const found = dayNames.filter(d => text.toLowerCase().includes(d)).length
    if (found < 2) return null // single-day command — send to AI

    const result = {}
    DAYS.forEach((_, i) => { result[i] = { name: 'Rest', exercises: [] } })

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    let currentDay = null
    let currentName = ''
    let currentExercises = []

    function flush() {
      if (currentDay !== null) {
        result[currentDay] = { name: currentName.trim() || 'Rest', exercises: currentExercises.filter(Boolean) }
      }
    }

    for (const line of lines) {
      let matchedIdx = -1
      let afterDay = ''
      for (let i = 0; i < dayNames.length; i++) {
        const re = new RegExp(`^(?:${dayNames[i]}|${dayAbbr[i]})\\b\\s*[:–\\-/]?\\s*(.*)`, 'i')
        const m = line.match(re)
        if (m) { matchedIdx = i; afterDay = m[1].trim(); break }
      }

      if (matchedIdx >= 0) {
        flush()
        currentDay = matchedIdx
        currentExercises = []
        const nameWords = ['day','push','pull','legs','upper','lower','full','rest','cardio','climb','run','body','hypertrophy']
        if (afterDay.includes(',')) {
          const parts = afterDay.split(',').map(p => p.trim()).filter(Boolean)
          const firstIsName = nameWords.some(w => parts[0].toLowerCase().includes(w)) || parts[0].length > 14
          if (firstIsName && parts.length > 1) {
            currentName = parts[0]
            currentExercises = parts.slice(1)
          } else {
            currentName = DAYS[matchedIdx]
            currentExercises = parts
          }
        } else if (afterDay) {
          const isName = nameWords.some(w => afterDay.toLowerCase().includes(w))
          if (isName) { currentName = afterDay }
          else { currentName = DAYS[matchedIdx]; currentExercises = [afterDay] }
        } else {
          currentName = DAYS[matchedIdx]
        }
      } else if (currentDay !== null) {
        const cleaned = line.replace(/^[-•*\d.]+\s*/, '').trim()
        if (cleaned.includes(',')) {
          cleaned.split(',').map(e => e.trim()).filter(Boolean).forEach(e => currentExercises.push(e))
        } else if (cleaned) {
          currentExercises.push(cleaned)
        }
      }
    }
    flush()
    return result
  }

  // AI assistant — routes to paste parser or AI depending on content
  async function askAI() {
    const msg = aiMsg.trim()
    if (!msg) return

    // Full split paste? Parse locally — keeps your exact exercise names
    const pasted = parsePastedSplit(msg)
    if (pasted) {
      setSplit(pasted)
      setAiMsg('')
      setAiError('')
      return
    }

    // Single-day command — use AI
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch('/api/split-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, currentSplit: split }),
      })
      const json = await res.json()
      if (!res.ok) {
        const updated = localSplitParser(msg, split)
        if (updated) { setSplit(updated); setAiMsg('') }
        else setAiError(json.hint || json.error || 'AI not available. Add ANTHROPIC_API_KEY to Vercel to enable.')
      } else {
        setSplit(json.updatedSplit)
        setAiMsg('')
      }
    } catch {
      const updated = localSplitParser(msg, split)
      if (updated) { setSplit(updated); setAiMsg('') }
      else setAiError('AI assistant requires Anthropic API key. Set ANTHROPIC_API_KEY in Vercel.')
    }
    setAiLoading(false)
  }

  const isFullPaste = parsePastedSplit(aiMsg) !== null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* AI / Paste assistant */}
      <div className="card">
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-light)', marginBottom: 10 }}>
          Split Assistant
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          <strong>Paste your full split</strong> to fill all 7 days at once, or type a single command like <em>"swap bench for incline on Monday"</em>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea
            value={aiMsg}
            onChange={e => setAiMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), askAI())}
            placeholder={'Paste your full split here, e.g.:\nMonday: Push Day\n- Incline Bench, OHP, Lateral Raises\nTuesday: Pull Day\n...\n\nOr type: "make Wednesday rest"'}
            style={{ flex: 1, minHeight: 72, fontSize: 13, resize: 'vertical' }}
          />
          <button
            className="btn btn-primary"
            onClick={askAI}
            disabled={aiLoading || aiMsg.length === 0}
            style={{ whiteSpace: 'nowrap' }}
          >
            {aiLoading ? '…' : isFullPaste ? 'Apply Split' : 'Update'}
          </button>
        </div>
        {isFullPaste && aiMsg.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 8, fontWeight: 500 }}>
            ✓ Full split detected — will fill all days with your exact exercises
          </div>
        )}
        {aiError && <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 8 }}>{aiError}</div>}
      </div>

      {/* 7-day grid — Mon first, today highlighted */}
      {loading ? (
        <SkeletonList rows={3} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {[1,2,3,4,5,6,0].map(i => {
            const DAY_COLORS = ['#9b59b6','#e67e22','#3498db','#2ecc71','#e74c3c','#1abc9c','#f39c12']
            const todayDow = new Date(getActiveDate() + 'T12:00:00').getDay()
            const isToday = i === todayDow
            const data    = split[i] || { name: '', exercises: [] }
            const isRest  = !data.name || data.name.toLowerCase().includes('rest')
            const color   = isRest ? 'var(--border-strong)' : DAY_COLORS[i]
            const exCount = (data.exercises || []).length

            return (
              <div key={i} style={{
                background: isToday ? (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)') : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                border: isToday ? `2px solid ${color === 'var(--border-strong)' ? (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)') : color}` : '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                gridRow: isToday ? 'span 2' : undefined,
                boxShadow: isToday ? `0 0 20px ${color === 'var(--border-strong)' ? 'rgba(255,255,255,0.05)' : color + '33'}` : 'none',
              }}>
                {/* Colored header strip */}
                <div style={{
                  background: color,
                  padding: isToday ? '12px 14px' : '8px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <span style={{ fontSize: isToday ? 13 : 11, fontWeight: 800, letterSpacing: '0.12em', color: '#fff' }}>
                      {DAY_SHORT[i].toUpperCase()}
                    </span>
                    {isToday && (
                      <span style={{
                        marginLeft: 8, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                        background: 'rgba(255,255,255,0.3)', color: '#fff',
                        borderRadius: 99, padding: '2px 6px', textTransform: 'uppercase',
                      }}>
                        Today
                      </span>
                    )}
                  </div>
                  {exCount > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, background: 'rgba(0,0,0,0.25)',
                      color: '#fff', borderRadius: 99, padding: '1px 7px',
                    }}>
                      {exCount} exercises
                    </span>
                  )}
                </div>

                {/* Card body */}
                <div style={{ padding: '12px 12px 10px' }}>
                  {/* Editable day name */}
                  <input
                    value={data.name}
                    onChange={e => updateDay(i, 'name', e.target.value)}
                    placeholder="Rest"
                    style={{
                      width: '100%', fontSize: 14, fontWeight: 700,
                      background: 'transparent', border: 'none',
                      borderBottom: `2px solid ${color}55`,
                      borderRadius: 0, padding: '2px 0 6px',
                      marginBottom: 10, color: 'var(--text)',
                    }}
                  />

                  {isRest ? (
                    <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic', marginBottom: 8 }}>
                      Rest / Recovery
                    </div>
                  ) : (
                    <>
                      {/* Exercise list preview */}
                      {exCount > 0 && (
                        <ul style={{ margin: '0 0 8px', padding: 0, listStyle: 'none' }}>
                          {(data.exercises || []).map((ex, j) => (
                            <li key={j} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                              {ex}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Edit textarea */}
                      <textarea
                        value={(data.exercises || []).join('\n')}
                        onChange={e => updateExercises(i, e.target.value)}
                        placeholder={'Bench Press\nOHP\nLateral Raises'}
                        style={{
                          fontSize: 11, minHeight: 60, borderRadius: 6,
                          opacity: 0.5, width: '100%', resize: 'vertical',
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" onClick={saveSplit} disabled={saving}>
          {saving ? 'Saving…' : 'Save Split'}
        </button>
        {saved && <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 500 }}>✓ Saved!</span>}
      </div>
    </div>
  )
}

// ─── WORKOUT HISTORY ────────────────────────────────────────────────
function getWeekStart(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00')
  const day = d.getDay() // 0=Sun
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)) // rewind to Monday
  return d.toISOString().split('T')[0]
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function WorkoutHistory({ userId }) {
  const cached = cacheGet('workouts:history')
  const [allSets,       setAllSets]       = useState(cached || [])
  const [loading,       setLoading]       = useState(!cached)
  const [expandedWeeks, setExpandedWeeks] = useState(() =>
    cached?.length ? new Set([getWeekStart(cached[0].logged_date)]) : new Set()
  )

  useEffect(() => {
    supabase.from('workout_sets')
      .select('*, exercises(name, muscle_group)')
      .eq('user_id', userId)
      .order('logged_date', { ascending: false })
      .order('set_number')
      .then(({ data }) => {
        const sets = cacheSet('workouts:history', data || [])
        setAllSets(sets)
        setLoading(false)
        if (sets.length > 0) {
          setExpandedWeeks(prev => prev.size ? prev : new Set([getWeekStart(sets[0].logged_date)]))
        }
      })
  }, [userId])

  function toggleWeek(week) {
    setExpandedWeeks(prev => {
      const next = new Set(prev)
      next.has(week) ? next.delete(week) : next.add(week)
      return next
    })
  }

  if (loading) return <SkeletonList rows={3} />
  if (!allSets.length) return (
    <div className="card" style={{ textAlign: 'center', color: 'var(--text-light)', fontSize: 13, fontStyle: 'italic', padding: '28px 16px' }}>
      No workout history yet — log sets in the Today tab and they'll appear here organised by week.
    </div>
  )

  // Group: weekStart → date → exerciseName → set[]
  const byWeek = {}
  allSets.forEach(s => {
    const wk  = getWeekStart(s.logged_date)
    const ex  = s.exercises?.name || 'Unknown'
    if (!byWeek[wk])              byWeek[wk]              = {}
    if (!byWeek[wk][s.logged_date]) byWeek[wk][s.logged_date] = {}
    if (!byWeek[wk][s.logged_date][ex]) byWeek[wk][s.logged_date][ex] = []
    byWeek[wk][s.logged_date][ex].push(s)
  })

  const weeks = Object.keys(byWeek).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {weeks.map(week => {
        const isExpanded = expandedWeeks.has(week)
        const dates      = Object.keys(byWeek[week]).sort((a, b) => b.localeCompare(a))
        const totalSets  = dates.reduce((s, d) =>
          s + Object.values(byWeek[week][d]).reduce((n, arr) => n + arr.length, 0), 0)
        const totalEx    = dates.reduce((s, d) => s + Object.keys(byWeek[week][d]).length, 0)

        return (
          <div key={week} className="card" style={{ padding: 0, overflow: 'hidden' }}>

            {/* ── Week header ── */}
            <button
              onClick={() => toggleWeek(week)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', padding: '12px 16px',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)',
                borderBottom: isExpanded ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Week of {fmtDate(week)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {dates.length} day{dates.length !== 1 ? 's' : ''} · {totalSets} sets · {totalEx} exercises
                </span>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
            </button>

            {/* ── Days ── */}
            {isExpanded && dates.map((date, di) => {
              const exByName = byWeek[week][date]
              const exNames  = Object.keys(exByName)
              const daySets  = exNames.reduce((s, n) => s + exByName[n].length, 0)
              const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'short', day: 'numeric',
              })

              return (
                <div key={date} style={{ borderBottom: di < dates.length - 1 ? '1px solid var(--border)' : 'none' }}>

                  {/* Day header */}
                  <div style={{
                    padding: '10px 16px 6px', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.025)',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{dayLabel}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {exNames.length} exercise{exNames.length !== 1 ? 's' : ''} · {daySets} sets
                    </span>
                  </div>

                  {/* Exercise rows */}
                  <div style={{ padding: '4px 16px 14px' }}>
                    {exNames.map(exName => {
                      const sets    = exByName[exName]
                      const bestE1RM = Math.max(...sets.map(s => epley(s.weight, s.reps)))
                      return (
                        <div key={exName} style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{exName}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              e1RM <strong style={{ color: 'var(--accent)' }}>{bestE1RM} lbs</strong>
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {sets.map((s, si) => (
                              <span key={s.id || si} style={{
                                fontSize: 11, padding: '3px 9px', borderRadius: 20,
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid var(--border)',
                                fontFamily: 'var(--mono)', fontWeight: 600,
                                color: 'var(--text-muted)',
                              }}>
                                {s.weight} × {s.reps}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// Simple local command parser — works without API key
function localSplitParser(msg, currentSplit) {
  const lower = msg.toLowerCase()
  const updated = JSON.parse(JSON.stringify(currentSplit))

  const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 }
  let targetDay = null
  for (const [key, idx] of Object.entries(dayMap)) {
    if (lower.includes(key)) { targetDay = idx; break }
  }
  if (targetDay === null) return null

  // Detect "rest day" command
  if (lower.includes('rest')) {
    updated[targetDay] = { name: 'Rest', exercises: [] }
    return updated
  }

  // Detect "rename/make X day = Y" — capture text after "make [day]" or similar
  const nameMatch = msg.match(/(?:make|set|rename)\s+\w+\s+(?:day\s+)?(?:a\s+)?(.+?)(?:\s+with\s+|\s+including\s+|$)/i)
  if (nameMatch) {
    updated[targetDay].name = nameMatch[1].trim()
  }

  // Detect "with/add [exercises]"
  const exMatch = msg.match(/(?:with|add|including)\s+(.+)$/i)
  if (exMatch) {
    const exList = exMatch[1].split(/,|\band\b/).map(e => e.trim()).filter(Boolean)
    // Capitalise first letter of each word
    updated[targetDay].exercises = exList.map(e => e.replace(/\b\w/g, c => c.toUpperCase()))
  }

  return updated
}

// ─── BODY TAB ────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0] }

function BodyTab({ active = true }) {
  const { user, theme } = useApp()
  const isDark = theme !== 'light'
  const [measurements, setMeasurements] = useState(() => cacheGet('workouts:body') || [])
  const [loading,      setLoading]      = useState(() => !cacheGet('workouts:body'))
  const [showForm,     setShowForm]     = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [form, setForm] = useState({
    logged_date: todayStr(), weight_lbs: '', chest_in: '', waist_in: '', arms_in: '', legs_in: '', notes: '',
  })

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('body_measurements').select('*')
      .eq('user_id', user.id)
      .order('logged_date', { ascending: true })
    setMeasurements(cacheSet('workouts:body', data || []))
    setLoading(false)
  }, [user.id])

  useEffect(() => { if (active) load() }, [load, active])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('body_measurements').insert({
      user_id:     user.id,
      logged_date: form.logged_date,
      weight_lbs:  form.weight_lbs ? parseFloat(form.weight_lbs) : null,
      chest_in:    form.chest_in   ? parseFloat(form.chest_in)   : null,
      waist_in:    form.waist_in   ? parseFloat(form.waist_in)   : null,
      arms_in:     form.arms_in    ? parseFloat(form.arms_in)    : null,
      legs_in:     form.legs_in    ? parseFloat(form.legs_in)    : null,
      notes:       form.notes      || null,
    })
    setForm({ logged_date: todayStr(), weight_lbs: '', chest_in: '', waist_in: '', arms_in: '', legs_in: '', notes: '' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function deleteMeasurement(id) {
    await supabase.from('body_measurements').delete().eq('id', id)
    setMeasurements(m => m.filter(x => x.id !== id))
  }

  const weightData = measurements.filter(m => m.weight_lbs).map(m => ({
    date: m.logged_date.slice(5), weight: m.weight_lbs,
  }))

  const latest = measurements[measurements.length - 1]
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  const month30 = measurements.find(m => m.logged_date >= cutoffStr)
  const weightChange = latest?.weight_lbs && month30?.weight_lbs
    ? (latest.weight_lbs - month30.weight_lbs).toFixed(1) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Log button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? '✕ Cancel' : '+ Log entry'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>New measurement</h2>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group" style={{ maxWidth: 180 }}>
              <label>Date</label>
              <input type="date" value={form.logged_date}
                onChange={e => setForm(f => ({ ...f, logged_date: e.target.value }))} />
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label>Body weight (lbs)</label>
                <input type="number" step="0.1" value={form.weight_lbs}
                  onChange={e => setForm(f => ({ ...f, weight_lbs: e.target.value }))} placeholder="175.0" />
              </div>
              <div className="form-group">
                <label>Waist (in)</label>
                <input type="number" step="0.25" value={form.waist_in}
                  onChange={e => setForm(f => ({ ...f, waist_in: e.target.value }))} placeholder="32.0" />
              </div>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label>Chest (in)</label>
                <input type="number" step="0.25" value={form.chest_in}
                  onChange={e => setForm(f => ({ ...f, chest_in: e.target.value }))} placeholder="40.0" />
              </div>
              <div className="form-group">
                <label>Arms (in)</label>
                <input type="number" step="0.25" value={form.arms_in}
                  onChange={e => setForm(f => ({ ...f, arms_in: e.target.value }))} placeholder="15.0" />
              </div>
              <div className="form-group">
                <label>Legs (in)</label>
                <input type="number" step="0.25" value={form.legs_in}
                  onChange={e => setForm(f => ({ ...f, legs_in: e.target.value }))} placeholder="24.0" />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. morning, fasted" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save entry'}
            </button>
          </form>
        </div>
      )}

      {/* Latest stats */}
      {latest && (
        <div className="stats-row">
          {latest.weight_lbs && (
            <div className="stat-card">
              <div className="stat-label">Current weight</div>
              <div className="stat-value">{latest.weight_lbs}</div>
              <div className="stat-sub">lbs
                {weightChange !== null && (
                  <span style={{ marginLeft: 6, color: parseFloat(weightChange) < 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                    {parseFloat(weightChange) > 0 ? '+' : ''}{weightChange} (30d)
                  </span>
                )}
              </div>
            </div>
          )}
          {latest.waist_in && (
            <div className="stat-card">
              <div className="stat-label">Waist</div>
              <div className="stat-value">{latest.waist_in}"</div>
            </div>
          )}
          {latest.chest_in && (
            <div className="stat-card">
              <div className="stat-label">Chest</div>
              <div className="stat-value">{latest.chest_in}"</div>
            </div>
          )}
          {latest.arms_in && (
            <div className="stat-card">
              <div className="stat-label">Arms</div>
              <div className="stat-value">{latest.arms_in}"</div>
            </div>
          )}
        </div>
      )}

      {/* Weight trend */}
      {weightData.length > 1 && (
        <div className="card">
          <h2 style={{ marginBottom: 12 }}>Weight trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weightData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-light)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-light)' }} domain={['auto','auto']} />
              <Tooltip
                contentStyle={{ background: isDark ? '#0F0F14' : 'rgba(255,255,255,0.98)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}`, borderRadius: 8, color: isDark ? '#FAFAFA' : 'var(--text)', fontSize: 12 }}
                formatter={v => [`${v} lbs`, 'Weight']}
              />
              <Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* History */}
      <div className="card">
        <h2 style={{ marginBottom: 14 }}>History</h2>
        {loading ? (
          <SkeletonList rows={3} />
        ) : measurements.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic' }}>
            No entries yet — hit "+ Log entry" above to record your first measurement.
          </div>
        ) : (
          [...measurements].reverse().map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 0', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {new Date(m.logged_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                  {m.weight_lbs && <span><strong style={{ color: 'var(--text)' }}>{m.weight_lbs}</strong> lbs</span>}
                  {m.waist_in   && <span>Waist <strong style={{ color: 'var(--text)' }}>{m.waist_in}"</strong></span>}
                  {m.chest_in   && <span>Chest <strong style={{ color: 'var(--text)' }}>{m.chest_in}"</strong></span>}
                  {m.arms_in    && <span>Arms  <strong style={{ color: 'var(--text)' }}>{m.arms_in}"</strong></span>}
                  {m.legs_in    && <span>Legs  <strong style={{ color: 'var(--text)' }}>{m.legs_in}"</strong></span>}
                  {m.notes      && <span style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>{m.notes}</span>}
                </div>
              </div>
              <button className="goal-del" onClick={() => deleteMeasurement(m.id)}>×</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
