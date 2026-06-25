import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../contexts/AppContext'
import { supabase } from '../lib/supabase'
import FloatingChat from '../components/FloatingChat'
import { getActiveDate } from '../lib/dateUtils'

const TODAY = getActiveDate()
const STORE              = 'schedule-planner'
const ROUTINE_KEY        = 'schedule-routines'
const ROUTINE_ASSIGN_KEY = 'schedule-routine-assign'  // { routineTaskId: secId } — where each To-Do routine item sits
const SYNC_FLAG          = 'schedule-sb-v1'           // set after one-time localStorage → Supabase migration

function loadRoutineAssign() {
  try { return JSON.parse(localStorage.getItem(ROUTINE_ASSIGN_KEY) || '{}') } catch { return {} }
}

// ── Section definitions ───────────────────────────────────────
const WEEKDAY_SECS = [
  { id: 'morning',   label: 'Morning',     timeKey: 'weekday_morning'   },
  { id: 'work',      label: 'During Work', timeKey: 'weekday_work'      },
  { id: 'afternoon', label: 'After Work',  timeKey: 'weekday_afternoon' },
  { id: 'nightly',   label: 'Nightly',     timeKey: 'weekday_nightly'   },
]
const WEEKEND_SECS = [
  { id: 'morning', label: 'Morning', timeKey: 'weekend_morning' },
  { id: 'todo',    label: 'To-Do',   timeKey: 'weekend_todo'    },
  { id: 'nightly', label: 'Nightly', timeKey: 'weekend_nightly' },
]
const DEFAULT_TIMES = {
  weekday_morning:   '6:45 – 9:00 AM',
  weekday_work:      '9:00 AM – 5:00 PM',
  weekday_afternoon: '5:00 PM – 9:00 PM',
  weekday_nightly:   '9:00 PM – 10:30 PM',
  weekend_morning:   '9:00 AM – 12:00 PM',
  weekend_todo:      'Afternoon',
  weekend_nightly:   '9:00 PM – 10:30 PM',
}
const NIGHTLY_DEFAULTS = [
  "Review tomorrow's plan",
  'Protein shake',
  'No screens 30 min before bed',
  'Mouth tape',
]
const TAG_META = {
  workout:   { label: 'Workout',   bg: 'rgba(99,102,241,0.15)',  color: '#6366f1' },
  nutrition: { label: 'Nutrition', bg: 'rgba(16,185,129,0.15)',  color: '#10b981' },
  todo:      { label: 'To-Do',     bg: 'rgba(249,115,22,0.15)',  color: '#f97316' },
}

// ── Pure helpers ──────────────────────────────────────────────
function mkId() { return Math.random().toString(36).slice(2, 11) }

function rowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    time: row.time_slot || null,
    tag: row.tag || null,
    completed: row.completed || false,
    source: row.source_type || 'manual',
    sourceId: row.source_id || null,
    sourceType: row.linked_type || null,
  }
}

function isWeekend(d) {
  const wd = new Date(d + 'T12:00:00').getDay()
  return wd === 0 || wd === 6
}
function getSections(d) { return isWeekend(d) ? WEEKEND_SECS : WEEKDAY_SECS }

function addDays(d, n) {
  const dt = new Date(d + 'T12:00:00')
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}
function getWeekMonday(d) {
  const dt = new Date(d + 'T12:00:00')
  const diff = dt.getDay() === 0 ? -6 : 1 - dt.getDay()
  dt.setDate(dt.getDate() + diff)
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
}
function getWeek(monday) { return Array.from({ length: 7 }, (_, i) => addDays(monday, i)) }

function dayShort(d)  { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) }
function dayNum(d)    { return new Date(d + 'T12:00:00').getDate() }
function monthShort(d){ return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }) }
function fmtFull(d)   { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }
function fmtShort(d)  { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

function getAllTasks(dayData) {
  if (!dayData) return []
  return Object.values(dayData).flat()
}
function computeStreak(days) {
  let count = 0, d = TODAY
  for (let i = 0; i < 90; i++) {
    const tasks = getAllTasks(days[d])
    if (!tasks.some(t => t.completed)) break
    count++
    d = addDays(d, -1)
  }
  return count
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        days:        parsed.days        || {},
        times:       { ...DEFAULT_TIMES, ...(parsed.times || {}) },
        weeklyGoals: parsed.weeklyGoals || {},
      }
    }
  } catch {}
  return { days: {}, times: { ...DEFAULT_TIMES }, weeklyGoals: {} }
}
function loadRoutines() {
  try {
    const raw = localStorage.getItem(ROUTINE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { morning: [], work: [], afternoon: [], nightly: [], todo: [] }
}

function defaultDayTasks() {
  return NIGHTLY_DEFAULTS.map(title => ({
    id: mkId(), title, completed: false, time: null, tag: null, source: 'nightly-default'
  }))
}
function ensureDay(days, d) {
  if (days[d]) return days
  const nightly = isWeekend(d)
    ? [...defaultDayTasks()]
    : [...defaultDayTasks()]
  return {
    ...days,
    [d]: { morning: [], work: [], afternoon: [], nightly, todo: [] },
  }
}

// ══════════════════════════════════════════════════════════════
export default function Schedule() {
  const { theme, user } = useApp()
  const isDark  = theme !== 'light'

  const [subTab,    setSubTab]   = useState('overview')
  const [viewDate,  setViewDate] = useState(TODAY)
  const [weekBase,  setWeekBase] = useState(() => getWeekMonday(TODAY))
  const [data,      setDataRaw]  = useState(loadStore)
  const [collapsed, setCollapsed]= useState({})
  const [addingIn,  setAddingIn] = useState(null)
  const [addDraft,  setAddDraft] = useState({ title: '', time: '', tag: '' })
  const [editTKey,  setEditTKey] = useState(null)
  const [editTVal,  setEditTVal] = useState('')
  const [dragFrom,  setDragFrom] = useState(null)
  const [dragOver,  setDragOver] = useState(null)
  const [focusTasks,     setFocusTasks]     = useState([])
  const [workoutDates,   setWorkoutDates]   = useState({})   // { dateStr: 'morning'|'afternoon' }
  const [nutritionDates, setNutritionDates] = useState(new Set())
  const [weeklyPlan,       setWeeklyPlan]       = useState({})   // { 0..6: { day_name, exercises[] } }
  const [pickerOpen,       setPickerOpen]       = useState(false)
  const [pickerTasks,      setPickerTasks]      = useState([])
  const [pickerLoading,    setPickerLoading]    = useState(false)
  const [addingGoal,       setAddingGoal]       = useState(false)
  const [newGoalText,      setNewGoalText]      = useState('')
  const [weekGoalsOpen,    setWeekGoalsOpen]    = useState(true)
  const [planPanelOpen,    setPlanPanelOpen]    = useState(false)
  const [planTasks,        setPlanTasks]        = useState([])
  const [planLoading,      setPlanLoading]      = useState(false)
  const [dragTask,         setDragTask]         = useState(null)   // task chip being dragged
  const [dragOverTarget,   setDragOverTarget]   = useState(null)   // { d, secId }
  const [routines,       setRoutinesRaw]   = useState(loadRoutines)
  const [routineAdding,  setRoutineAdding]  = useState(null)   // secId being added to
  const [routineDraft,   setRoutineDraft]   = useState('')
  const [routineSaveState, setRoutineSaveState] = useState('idle') // 'idle' | 'saving' | 'saved'
  // To-Do data surfaced into Schedule
  const [taskListItems,  setTaskListItems]  = useState([])     // To-Do "Task List" backlog
  const [todoRoutines,   setTodoRoutines]   = useState([])     // To-Do "Daily Routine" items
  const [routineAssign,  setRoutineAssignRaw] = useState(loadRoutineAssign)
  // Drag state for the Day tab (kind: 'todo' new chip | 'task' existing day task)
  const [dayDrag,        setDayDrag]        = useState(null)
  const [dayDragOverSec, setDayDragOverSec] = useState(null)
  // Drag state for the Routine tab
  const [routineDrag,       setRoutineDrag]       = useState(null)
  const [routineDragOverSec, setRoutineDragOverSec] = useState(null)
  const [todoTrayOpen,   setTodoTrayOpen]   = useState(false)
  const addInputRef    = useRef(null)
  const newGoalRef     = useRef(null)
  const routineAddRef  = useRef(null)

  // Persist
  function setData(upd) {
    setDataRaw(prev => {
      const next = typeof upd === 'function' ? upd(prev) : upd
      localStorage.setItem(STORE, JSON.stringify(next))
      return next
    })
  }

  // ── Supabase cross-device sync ─────────────────────────────
  // Migration: check if Supabase is empty for this user, and if so push
  // whatever localStorage has. No flag needed — checking Supabase directly
  // avoids the flag-stuck problem.
  async function ensureSupabaseSync() {
    if (!user?.id) return
    try {
      // Check if Supabase already has data for this user
      const { count, error: countErr } = await supabase
        .from('schedule_day_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      if (countErr) return  // table may not exist yet
      if (count > 0) return  // already has data — skip migration

      // Supabase empty: push from localStorage
      const stored = loadStore()
      const rows = []
      for (const [d, day] of Object.entries(stored.days || {})) {
        for (const [secId, tasks] of Object.entries(day)) {
          if (!Array.isArray(tasks)) continue
          tasks.forEach((task, pos) => {
            if (!task.title) return
            rows.push({
              id: crypto.randomUUID(),
              user_id: user.id,
              task_date: d,
              section_id: secId,
              title: task.title,
              time_slot: task.time || null,
              tag: task.tag || null,
              completed: task.completed || false,
              completed_at: task.completed ? new Date().toISOString() : null,
              position: pos,
              source_type: task.source || 'manual',
              source_id: null,
              linked_type: task.sourceType || null,
            })
          })
        }
      }
      if (!rows.length) return
      const CHUNK = 50
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase.from('schedule_day_tasks').insert(rows.slice(i, i + CHUNK))
        if (error) { console.warn('Schedule migration error:', error.message); return }
      }
      console.log(`Schedule: migrated ${rows.length} tasks to Supabase`)
    } catch (e) {
      console.warn('Schedule migration failed:', e.message)
    }
  }

  // Load a week's tasks from Supabase and merge into local state.
  // Days that have Supabase rows replace their sections; days with no rows keep localStorage.
  async function loadWeekTasksFromSupabase(monday) {
    if (!user?.id) return
    try {
      const weekEnd = addDays(monday, 6)
      const { data: rows, error } = await supabase
        .from('schedule_day_tasks')
        .select('*')
        .eq('user_id', user.id)
        .gte('task_date', monday)
        .lte('task_date', weekEnd)
        .order('position')
      if (error) return  // table doesn't exist yet
      if (!rows?.length) return
      const byDate = {}
      for (const row of rows) {
        if (!byDate[row.task_date]) byDate[row.task_date] = { morning: [], work: [], afternoon: [], nightly: [], todo: [] }
        const sec = byDate[row.task_date][row.section_id]
        if (Array.isArray(sec)) sec.push(rowToTask(row))
      }
      setDataRaw(prev => {
        const days = { ...prev.days }
        for (const [d, secData] of Object.entries(byDate)) {
          days[d] = { ...(days[d] || {}), ...secData }
        }
        const next = { ...prev, days }
        localStorage.setItem(STORE, JSON.stringify(next))
        return next
      })
    } catch {}
  }

  // Real-time: apply changes from other devices immediately
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`sdt_${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'schedule_day_tasks',
        filter: `user_id=eq.${user.id}`,
      }, ({ eventType, new: nr, old: or }) => {
        if (eventType === 'INSERT') {
          setDataRaw(prev => {
            const d = nr.task_date, secId = nr.section_id
            if ((prev.days[d]?.[secId] || []).some(t => t.id === nr.id)) return prev
            const days = ensureDay(prev.days, d)
            const next = {
              ...prev, days: {
                ...days,
                [d]: { ...days[d], [secId]: [...(days[d][secId] || []), rowToTask(nr)] }
              }
            }
            localStorage.setItem(STORE, JSON.stringify(next)); return next
          })
        } else if (eventType === 'UPDATE') {
          setDataRaw(prev => {
            const d = nr.task_date, secId = nr.section_id
            if (!prev.days[d]) return prev
            const next = {
              ...prev, days: {
                ...prev.days,
                [d]: { ...prev.days[d], [secId]: (prev.days[d][secId] || []).map(t => t.id === nr.id ? rowToTask(nr) : t) }
              }
            }
            localStorage.setItem(STORE, JSON.stringify(next)); return next
          })
        } else if (eventType === 'DELETE') {
          setDataRaw(prev => {
            const d = or.task_date, secId = or.section_id
            if (!prev.days[d]) return prev
            const next = {
              ...prev, days: {
                ...prev.days,
                [d]: { ...prev.days[d], [secId]: (prev.days[d][secId] || []).filter(t => t.id !== or.id) }
              }
            }
            localStorage.setItem(STORE, JSON.stringify(next)); return next
          })
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user?.id])

  // Load today's focus tasks + task-list backlog + daily routine from To-Do
  useEffect(() => {
    if (!user?.id) return
    supabase.from('focus_tasks')
      .select('*').eq('user_id', user.id).eq('focus_date', TODAY).eq('completed', false)
      .then(({ data: d }) => setFocusTasks(d || []))
    supabase.from('task_list')
      .select('id, title, priority').eq('user_id', user.id).eq('completed', false)
      .order('position').order('created_at', { ascending: false })
      .then(({ data: d }) => setTaskListItems(d || []))
    supabase.from('routine_tasks')
      .select('id, title, position, schedule_block').eq('user_id', user.id).eq('active', true)
      .order('position').order('created_at')
      .then(({ data: d, error }) => {
        if (error) {
          // schedule_block column not added yet — fall back to basic select
          return supabase.from('routine_tasks')
            .select('id, title, position').eq('user_id', user.id).eq('active', true)
            .order('position').order('created_at')
            .then(({ data: d2 }) => setTodoRoutines(d2 || []))
        }
        setTodoRoutines(d || [])
        const dbAssign = {}
        ;(d || []).forEach(rt => { if (rt.schedule_block) dbAssign[rt.id] = rt.schedule_block })
        if (Object.keys(dbAssign).length > 0) setRoutineAssignRaw(dbAssign)
      })
    // Migrate localStorage → Supabase on first run, then load current week
    ensureSupabaseSync().then(() => loadWeekTasksFromSupabase(getWeekMonday(TODAY)))
  }, [user?.id])

  function setRoutineAssign(upd) {
    setRoutineAssignRaw(prev => {
      const next = typeof upd === 'function' ? upd(prev) : upd
      localStorage.setItem(ROUTINE_ASSIGN_KEY, JSON.stringify(next))
      return next
    })
  }

  // Tell the rest of the app (To-Do counters, etc.) that completion state changed
  function notifyTodos(detail) { window.dispatchEvent(new CustomEvent('todos-changed', { detail: detail || null })) }

  // ── Two-way sync with To-Do ────────────────────────────────
  // Schedule keeps local copies of imported/dropped tasks; reconcile their
  // `completed` flag against the To-Do source of truth in Supabase.
  const reconcileFromTodo = useCallback(async () => {
    if (!user?.id) return
    const [{ data: f }, { data: tl }] = await Promise.all([
      supabase.from('focus_tasks').select('id, completed').eq('user_id', user.id).eq('focus_date', TODAY),
      supabase.from('task_list').select('id, completed').eq('user_id', user.id),
    ])
    const fMap = Object.fromEntries((f || []).map(r => [r.id, r.completed]))
    const tMap = Object.fromEntries((tl || []).map(r => [r.id, r.completed]))
    setData(prev => {
      let changed = false
      const days = {}
      for (const [d, day] of Object.entries(prev.days)) {
        const nd = { ...day }
        for (const sec of Object.keys(nd)) {
          if (!Array.isArray(nd[sec])) continue
          nd[sec] = nd[sec].map(t => {
            let target
            if (t.sourceType === 'focus' && t.sourceId in fMap) target = fMap[t.sourceId]
            else if (t.sourceType === 'task' && t.sourceId in tMap) target = tMap[t.sourceId]
            if (target !== undefined && target !== t.completed) { changed = true; return { ...t, completed: target } }
            return t
          })
        }
        days[d] = nd
      }
      return changed ? { ...prev, days } : prev
    })
  }, [user?.id])

  // Routine completion lives in routine_completions (per task + date)
  const reconcileRoutine = useCallback(async (d) => {
    if (!user?.id) return
    const { data: rc } = await supabase.from('routine_completions')
      .select('routine_task_id').eq('user_id', user.id).eq('completed_date', d)
    const checks = {}
    ;(rc || []).forEach(r => { checks[r.routine_task_id] = true })
    setData(prev => {
      const days = ensureDay(prev.days, d)
      return { ...prev, days: { ...days, [d]: { ...days[d], routineChecks: checks } } }
    })
  }, [user?.id])

  useEffect(() => { reconcileFromTodo() }, [reconcileFromTodo])
  useEffect(() => { reconcileRoutine(viewDate) }, [viewDate, reconcileRoutine])
  useEffect(() => { if (user?.id) loadWeekTasksFromSupabase(weekBase) }, [weekBase, user?.id])
  useEffect(() => {
    const h = () => { reconcileFromTodo(); reconcileRoutine(viewDate) }
    window.addEventListener('todos-changed', h)
    return () => window.removeEventListener('todos-changed', h)
  }, [reconcileFromTodo, reconcileRoutine, viewDate])

  // Fix 1 — Seed today's nightly defaults on first Schedule visit
  useEffect(() => {
    if (!localStorage.getItem('nightly_defaults_seeded')) {
      setData(prev => ({ ...prev, days: ensureDay(prev.days, TODAY) }))
      localStorage.setItem('nightly_defaults_seeded', '1')
    }
  }, [])

  // Fix 2 & 3 — Fetch workout sessions and nutrition logs from Supabase
  useEffect(() => {
    if (!user?.id) return
    const cutoff = addDays(TODAY, -60)
    supabase
      .from('workout_sets')
      .select('logged_date, created_at')
      .eq('user_id', user.id)
      .gte('logged_date', cutoff)
      .then(({ data: d }) => {
        if (!d) return
        const map = {}
        d.forEach(row => {
          if (!map[row.logged_date]) {
            const hour = new Date(row.created_at).getHours()
            // Weekends → morning; weekdays → morning if before noon, else after work
            map[row.logged_date] = isWeekend(row.logged_date)
              ? 'morning'
              : hour < 12 ? 'morning' : 'afternoon'
          }
        })
        setWorkoutDates(map)
      })
    supabase
      .from('nutrition_entries')
      .select('date')
      .eq('user_id', user.id)
      .gte('date', cutoff)
      .then(({ data: d }) => {
        setNutritionDates(new Set((d || []).map(r => r.date)))
      })
    supabase
      .from('weekly_split')
      .select('day_of_week, day_name, exercises')
      .eq('user_id', user.id)
      .then(({ data: d }) => {
        const plan = {}
        for (let i = 0; i < 7; i++) plan[i] = { day_name: 'Rest', exercises: [] }
        ;(d || []).forEach(row => {
          plan[row.day_of_week] = { day_name: row.day_name || 'Rest', exercises: row.exercises || [] }
        })
        setWeeklyPlan(plan)
      })
  }, [user?.id])

  // Focus the add input when addingIn changes
  useEffect(() => {
    if (addingIn) setTimeout(() => addInputRef.current?.focus(), 50)
  }, [addingIn])

  // ── Data mutations ─────────────────────────────────────────
  function getSection(d, secId) {
    return (data.days[d] || {})[secId] || []
  }

  function mutDay(d, fn) {
    setData(prev => {
      const days = ensureDay(prev.days, d)
      return { ...prev, days: { ...days, [d]: fn(days[d]) } }
    })
  }

  function addTask(d, secId) {
    const title = addDraft.title.trim()
    if (!title) return
    const newId = crypto.randomUUID()
    const task = {
      id: newId, title,
      time: addDraft.time.trim() || null,
      tag:  addDraft.tag  || null,
      completed: false, source: 'manual'
    }
    mutDay(d, day => ({ ...day, [secId]: [...(day[secId] || []), task] }))
    setAddDraft({ title: '', time: '', tag: '' })
    setAddingIn(null)
    supabase.from('schedule_day_tasks').insert({
      id: newId, user_id: user.id, task_date: d, section_id: secId,
      title, time_slot: task.time, tag: task.tag, completed: false,
      position: getSection(d, secId).length, source_type: 'manual',
    }).then(({ error }) => { if (error) console.warn('Schedule sync:', error.message) })
  }

  function toggleTask(d, secId, taskId) {
    const cur = (data.days[d]?.[secId] || []).find(t => t.id === taskId)
    if (!cur) return
    const completed = !cur.completed
    mutDay(d, day => ({
      ...day,
      [secId]: (day[secId] || []).map(t => t.id === taskId ? { ...t, completed } : t)
    }))
    notifyTodos({ doneDelta: completed ? 1 : -1 })
    supabase.from('schedule_day_tasks')
      .update({ completed, completed_at: completed ? new Date().toISOString() : null })
      .eq('id', taskId).eq('user_id', user.id)
      .then(({ error }) => { if (error) console.warn('Schedule sync:', error.message) })
    if (cur.sourceId && cur.sourceType) {
      const req = cur.sourceType === 'focus'
        ? supabase.from('focus_tasks').update({ completed }).eq('id', cur.sourceId)
        : supabase.from('task_list').update({ completed, completed_at: completed ? new Date().toISOString() : null }).eq('id', cur.sourceId)
      req.then(() => notifyTodos())
    }
  }

  function deleteTask(d, secId, taskId) {
    mutDay(d, day => ({
      ...day,
      [secId]: (day[secId] || []).filter(t => t.id !== taskId)
    }))
    supabase.from('schedule_day_tasks').delete()
      .eq('id', taskId).eq('user_id', user.id)
      .then(({ error }) => { if (error) console.warn('Schedule sync:', error.message) })
  }

  function updateTaskTitle(d, secId, taskId, title) {
    mutDay(d, day => ({
      ...day,
      [secId]: (day[secId] || []).map(t => t.id === taskId ? { ...t, title } : t)
    }))
    supabase.from('schedule_day_tasks').update({ title })
      .eq('id', taskId).eq('user_id', user.id)
      .then(({ error }) => { if (error) console.warn('Schedule sync:', error.message) })
  }

  function updateSectionTime(key, val) {
    setData(prev => ({ ...prev, times: { ...prev.times, [key]: val } }))
    setEditTKey(null)
  }

  function reorderTask(d, secId, fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    mutDay(d, day => {
      const arr = [...(day[secId] || [])]
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      return { ...day, [secId]: arr }
    })
  }

  function importFocusTasks(d, secId) {
    const existing = getSection(d, secId).map(t => t.sourceId)
    const basePos = getSection(d, secId).length
    const toAdd = focusTasks
      .filter(ft => !existing.includes(ft.id))
      .map((ft, i) => ({
        id: crypto.randomUUID(), title: ft.title, time: null,
        tag: 'todo', completed: false,
        source: 'todo-import', sourceId: ft.id, sourceType: 'focus'
      }))
    if (!toAdd.length) return
    mutDay(d, day => ({ ...day, [secId]: [...(day[secId] || []), ...toAdd] }))
    supabase.from('schedule_day_tasks').insert(
      toAdd.map((t, i) => ({
        id: t.id, user_id: user.id, task_date: d, section_id: secId,
        title: t.title, completed: false, position: basePos + i,
        source_type: 'todo-import', source_id: t.sourceId, linked_type: 'focus', tag: 'todo',
      }))
    ).then(({ error }) => { if (error) console.warn('Schedule sync:', error.message) })
  }

  // Focus new-goal input when row opens
  useEffect(() => {
    if (addingGoal) setTimeout(() => newGoalRef.current?.focus(), 50)
  }, [addingGoal])

  useEffect(() => {
    if (routineAdding) setTimeout(() => routineAddRef.current?.focus(), 50)
  }, [routineAdding])

  // ── Weekly goal mutations ──────────────────────────────────
  function addWeeklyGoal(monday, title, sourceId = null) {
    if (!title.trim()) return
    const goal = { id: mkId(), title: title.trim(), completed: false, sourceId }
    setData(prev => ({
      ...prev,
      weeklyGoals: {
        ...(prev.weeklyGoals || {}),
        [monday]: [...((prev.weeklyGoals || {})[monday] || []), goal],
      },
    }))
  }

  function toggleWeeklyGoal(monday, goalId) {
    setData(prev => ({
      ...prev,
      weeklyGoals: {
        ...(prev.weeklyGoals || {}),
        [monday]: ((prev.weeklyGoals || {})[monday] || []).map(g =>
          g.id === goalId ? { ...g, completed: !g.completed } : g
        ),
      },
    }))
  }

  function deleteWeeklyGoal(monday, goalId) {
    setData(prev => ({
      ...prev,
      weeklyGoals: {
        ...(prev.weeklyGoals || {}),
        [monday]: ((prev.weeklyGoals || {})[monday] || []).filter(g => g.id !== goalId),
      },
    }))
  }

  // ── Routine mutations ──────────────────────────────────────
  function saveRoutines(updated) {
    setRoutinesRaw(updated)
    localStorage.setItem(ROUTINE_KEY, JSON.stringify(updated))
  }
  function addRoutineTask(secId, title) {
    if (!title.trim()) return
    const task = { id: mkId(), title: title.trim() }
    saveRoutines({ ...routines, [secId]: [...(routines[secId] || []), task] })
    setRoutineDraft('')
    setRoutineAdding(null)
  }
  function deleteRoutineTask(secId, taskId) {
    saveRoutines({ ...routines, [secId]: (routines[secId] || []).filter(t => t.id !== taskId) })
  }
  function toggleRoutineCheck(d, routineId) {
    const checked = !((data.days[d]?.routineChecks || {})[routineId])
    mutDay(d, day => ({
      ...day,
      routineChecks: { ...(day.routineChecks || {}), [routineId]: checked }
    }))
    notifyTodos({ doneDelta: checked ? 1 : -1 })
    const req = checked
      ? supabase.from('routine_completions').insert({ user_id: user.id, routine_task_id: routineId, completed_date: d })
      : supabase.from('routine_completions').delete().eq('routine_task_id', routineId).eq('completed_date', d)
    req.then(() => notifyTodos())
  }

  async function openPicker() {
    setPickerOpen(true)
    if (pickerTasks.length > 0) return   // already loaded
    setPickerLoading(true)
    const [r1, r2] = await Promise.all([
      // Focus tasks planned for this week
      supabase.from('focus_tasks')
        .select('id, title, focus_date, priority')
        .eq('user_id', user.id).eq('completed', false)
        .gte('focus_date', weekBase).lte('focus_date', addDays(weekBase, 6)),
      // General backlog tasks
      supabase.from('task_list')
        .select('id, title, priority')
        .eq('user_id', user.id).eq('completed', false)
        .order('created_at', { ascending: false }).limit(40),
    ])
    const focusItems = (r1.data || []).map(t => ({ ...t, _src: 'plan' }))
    const taskItems  = (r2.data || []).map(t => ({ ...t, _src: 'backlog' }))
    const seen = new Set()
    const merged = [...focusItems, ...taskItems].filter(t => {
      if (seen.has(t.id)) return false
      seen.add(t.id); return true
    })
    setPickerTasks(merged)
    setPickerLoading(false)
  }

  // ── Week planner panel ─────────────────────────────────────
  async function openPlanPanel() {
    setPlanPanelOpen(true)
    if (planTasks.length > 0) return
    setPlanLoading(true)
    const [r1, r2] = await Promise.all([
      supabase.from('focus_tasks').select('id, title, priority')
        .eq('user_id', user.id).eq('completed', false),
      supabase.from('task_list').select('id, title, priority')
        .eq('user_id', user.id).eq('completed', false)
        .order('created_at', { ascending: false }),
    ])
    const seen = new Set()
    const merged = [
      ...(r1.data || []).map(t => ({ ...t, _src: 'focus' })),
      ...(r2.data || []).map(t => ({ ...t, _src: 'task'  })),
    ].filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
    setPlanTasks(merged)
    setPlanLoading(false)
  }

  function dropTaskOnDay(d, secId) {
    if (!dragTask) return
    const existing = (data.days[d]?.[secId] || []).map(t => t.sourceId)
    if (existing.includes(dragTask.id)) { setDragTask(null); setDragOverTarget(null); return }
    const newId = crypto.randomUUID()
    const linkedType = dragTask._src === 'task' ? 'task' : 'focus'
    const newTask = {
      id: newId, title: dragTask.title,
      time: null, tag: 'todo',
      completed: false, source: 'week-plan', sourceId: dragTask.id,
      sourceType: linkedType,
    }
    mutDay(d, day => ({ ...day, [secId]: [...(day[secId] || []), newTask] }))
    setDragTask(null)
    setDragOverTarget(null)
    supabase.from('schedule_day_tasks').insert({
      id: newId, user_id: user.id, task_date: d, section_id: secId,
      title: newTask.title, completed: false,
      position: getSection(d, secId).length,
      source_type: 'week-plan', source_id: dragTask.id, linked_type: linkedType, tag: 'todo',
    }).then(({ error }) => { if (error) console.warn('Schedule sync:', error.message) })
  }

  // ── Day tab drag & drop ────────────────────────────────────
  // Drop a To-Do chip OR move an existing day task into a time section.
  function dropOnDaySection(secId) {
    const dd = dayDrag
    setDayDrag(null); setDayDragOverSec(null)
    if (!dd) return
    if (dd.kind === 'todo') {
      const existing = (data.days[viewDate]?.[secId] || []).map(t => t.sourceId)
      if (dd.task.sourceId && existing.includes(dd.task.sourceId)) return
      const newId = crypto.randomUUID()
      const linkedType = dd.task._src === 'task' ? 'task' : 'focus'
      const newTask = {
        id: newId, title: dd.task.title, time: null, tag: 'todo',
        completed: false, source: 'todo-drop', sourceId: dd.task.id,
        sourceType: linkedType,
      }
      mutDay(viewDate, day => ({ ...day, [secId]: [...(day[secId] || []), newTask] }))
      supabase.from('schedule_day_tasks').insert({
        id: newId, user_id: user.id, task_date: viewDate, section_id: secId,
        title: newTask.title, completed: false,
        position: getSection(viewDate, secId).length,
        source_type: 'todo-drop', source_id: dd.task.id, linked_type: linkedType, tag: 'todo',
      }).then(({ error }) => { if (error) console.warn('Schedule sync:', error.message) })
    } else if (dd.kind === 'task' && dd.fromSec !== secId) {
      mutDay(viewDate, day => {
        const moving = (day[dd.fromSec] || []).find(t => t.id === dd.task.id)
        if (!moving) return day
        return {
          ...day,
          [dd.fromSec]: (day[dd.fromSec] || []).filter(t => t.id !== dd.task.id),
          [secId]:      [...(day[secId] || []), moving],
        }
      })
      supabase.from('schedule_day_tasks').update({ section_id: secId })
        .eq('id', dd.task.id).eq('user_id', user.id)
        .then(({ error }) => { if (error) console.warn('Schedule sync:', error.message) })
    }
  }

  // ── Routine tab drag & drop — assign a To-Do routine item to a block ──
  function dropRoutineOnSection(secId) {
    const rd = routineDrag
    setRoutineDrag(null); setRoutineDragOverSec(null)
    if (!rd) return
    setRoutineAssign(prev => ({ ...prev, [rd.id]: secId }))
  }
  function unassignRoutine(routineId) {
    setRoutineAssign(prev => { const n = { ...prev }; delete n[routineId]; return n })
  }

  async function saveRoutineSchedule() {
    if (routineSaveState === 'saving') return
    setRoutineSaveState('saving')
    // Always save to localStorage first
    localStorage.setItem(ROUTINE_ASSIGN_KEY, JSON.stringify(routineAssign))
    // Best-effort Supabase sync — silently skips if schedule_block column doesn't exist yet
    try {
      await Promise.all(todoRoutines.map(rt =>
        supabase.from('routine_tasks')
          .update({ schedule_block: routineAssign[rt.id] || null })
          .eq('id', rt.id).eq('user_id', user.id)
      ))
    } catch {}
    setRoutineSaveState('saved')
    setTimeout(() => setRoutineSaveState('idle'), 2000)
  }

  // To-Do chips available to drag onto the Day view (not already placed that day)
  const dayPlacedSourceIds = new Set(getAllTasks(data.days[viewDate]).map(t => t.sourceId).filter(Boolean))
  const dayTodoChips = [
    ...focusTasks.map(t => ({ id: t.id, title: t.title, _src: 'focus' })),
    ...taskListItems.map(t => ({ id: t.id, title: t.title, _src: 'task' })),
  ].filter(t => !dayPlacedSourceIds.has(t.id))

  // ── AI context builder ─────────────────────────────────────
  function buildAIContext() {
    const secs = getSections(viewDate)
    const dayData = data.days[viewDate] || {}
    const lines = [`Today: ${fmtFull(viewDate)}\n`]
    secs.forEach(s => {
      const tasks = dayData[s.id] || []
      if (!tasks.length) { lines.push(`${s.label}: empty`); return }
      lines.push(`${s.label} (${data.times[s.timeKey] || DEFAULT_TIMES[s.timeKey]}):`)
      tasks.forEach(t => lines.push(`  ${t.completed ? '[done]' : '[pending]'} ${t.title}${t.time ? ' @ ' + t.time : ''}${t.tag ? ' [' + t.tag + ']' : ''}`))
    })
    lines.push('\nThis week:')
    getWeek(weekBase).forEach(d => {
      const tasks = getAllTasks(data.days[d])
      const done = tasks.filter(t => t.completed).length
      lines.push(`${dayShort(d)} ${fmtShort(d)}: ${tasks.length ? `${done}/${tasks.length} done` : 'no tasks'}`)
    })
    const streak = computeStreak(data.days)
    lines.push(`\nStreak: ${streak} day${streak !== 1 ? 's' : ''} in a row`)
    return lines.join('\n')
  }

  // ── Shared styles ──────────────────────────────────────────
  const sLabel = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-light)', marginBottom: 12 }

  // ── Sub-tab: Overview ──────────────────────────────────────
  const todayAll   = getAllTasks(data.days[TODAY])
  const todayDone  = todayAll.filter(t => t.completed).length
  const todayTotal = todayAll.length
  const todayPct   = todayTotal > 0 ? Math.round(todayDone / todayTotal * 100) : 0
  const ringC      = 2 * Math.PI * 28
  const ringColor  = todayPct >= 85 ? '#6BE3A4' : todayPct >= 50 ? '#6366f1' : '#F2C063'
  const streak     = computeStreak(data.days)
  const todaySecs  = getSections(TODAY)
  const weekDays   = getWeek(getWeekMonday(TODAY))

  // Next 3 upcoming uncompleted tasks from today + tomorrow
  const upcoming = (() => {
    const result = []
    for (const d of [TODAY, addDays(TODAY, 1)]) {
      const secs = getSections(d)
      secs.forEach(s => {
        const tasks = ((data.days[d] || {})[s.id] || []).filter(t => !t.completed)
        tasks.forEach(t => result.push({ ...t, date: d, secLabel: s.label }))
      })
    }
    return result.slice(0, 3)
  })()

  // ── Sub-tab: Week section task summary ────────────────────
  const weekDaysForView = getWeek(weekBase)

  // ── Render ─────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <h1>Schedule</h1>
      </div>

      <div className="page-body">

        {/* Sub-tab bar */}
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          {['overview', 'day', 'week', 'routine'].map(t => (
            <button key={t}
              className={`tab-btn${subTab === t ? ' active' : ''}`}
              onClick={() => setSubTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════
            OVERVIEW
        ══════════════════════════════════════════════ */}
        {subTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Today's Snapshot */}
            <div className="card">
              <div style={sLabel}>Today's Snapshot</div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

                {/* Ring */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{ position: 'relative', width: 70, height: 70 }}>
                    <svg viewBox="0 0 70 70" width={70} height={70}>
                      <circle cx="35" cy="35" r="28" fill="none"
                        stroke={isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}
                        strokeWidth="6" />
                      {todayTotal > 0 && (
                        <circle cx="35" cy="35" r="28" fill="none"
                          stroke={ringColor} strokeWidth="6"
                          strokeLinecap="round" strokeDasharray={ringC}
                          strokeDashoffset={ringC * (1 - todayPct / 100)}
                          transform="rotate(-90 35 35)"
                          style={{ transition: 'stroke-dashoffset .7s ease' }}
                        />
                      )}
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 800, color: ringColor, lineHeight: 1 }}>
                        {todayTotal === 0 ? '—' : `${todayPct}%`}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-light)' }}>
                    {todayDone}/{todayTotal}
                  </div>
                </div>

                {/* Date + section status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
                    {fmtFull(TODAY)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {todaySecs.map(s => {
                      const tasks = ((data.days[TODAY] || {})[s.id] || [])
                      const done  = tasks.filter(t => t.completed).length
                      const total = tasks.length
                      const pct   = total > 0 ? done / total : 0
                      const dotColor = total === 0 ? 'var(--border)' : pct === 1 ? 'var(--success)' : pct > 0 ? 'var(--accent)' : 'var(--text-light)'
                      return (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{s.label}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--mono)' }}>
                            {total === 0 ? '—' : `${done}/${total}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Fix 3 — Nutrition indicator on today's snapshot */}
                  {!nutritionDates.has(TODAY) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(16,185,129,0.55)', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: 'var(--text-light)' }}>Nutrition not logged today</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Week at a Glance */}
            <div className="card">
              <div style={sLabel}>Week at a Glance</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {weekDays.map(d => {
                  const tasks = getAllTasks(data.days[d])
                  const done  = tasks.filter(t => t.completed).length
                  const total = tasks.length
                  const isToday = d === TODAY
                  const allDone = total > 0 && done === total
                  return (
                    <button key={d}
                      onClick={() => { setViewDate(d); setSubTab('day') }}
                      style={{
                        flex: 1, minWidth: 0, padding: '8px 4px', textAlign: 'center',
                        background: isToday ? 'rgba(99,102,241,0.12)' : 'transparent',
                        border: `1px solid ${isToday ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                        borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'var(--surface-hov)' }}
                      onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: isToday ? 'var(--accent)' : 'var(--text-light)', marginBottom: 3 }}>
                        {dayShort(d)}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 800, lineHeight: 1, color: allDone ? 'var(--success)' : 'var(--text)' }}>
                        {total === 0 ? '–' : done}
                      </div>
                      {total > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--text-light)', marginTop: 2 }}>/{total}</div>
                      )}
                      {/* Fix 2 — Workout indicator dot */}
                      {workoutDates[d] && (
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1', margin: '3px auto 0', boxShadow: '0 0 5px rgba(99,102,241,0.55)' }} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Upcoming + Streak (side by side) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>

              {/* Upcoming */}
              <div className="card">
                <div style={sLabel}>Upcoming</div>
                {upcoming.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-light)', fontStyle: 'italic' }}>
                    Nothing pending — or add tasks to get started.
                  </div>
                ) : upcoming.map((t, i) => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0',
                    borderBottom: i < upcoming.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>
                        {t.date === TODAY ? 'Today' : 'Tomorrow'} · {t.secLabel}
                        {t.time && ` · ${t.time}`}
                      </div>
                    </div>
                    {t.tag && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: TAG_META[t.tag]?.bg, color: TAG_META[t.tag]?.color, flexShrink: 0 }}>
                        {TAG_META[t.tag]?.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Streak — a day counts when at least one scheduled task is completed */}
              <div className="card" style={{ minWidth: 130, textAlign: 'center', padding: '20px 16px' }} title="A day counts toward the streak when you complete at least one scheduled task.">
                <div style={sLabel}>Streak</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 42, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: streak > 0 ? 'var(--success)' : 'var(--text-light)' }}>
                  {streak}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6, lineHeight: 1.4 }}>
                  {streak === 1 ? 'day in a row' : 'days in a row'}
                </div>
                {(() => {
                  const todayDone = getAllTasks(data.days[TODAY]).some(t => t.completed)
                  return (
                    <div style={{ fontSize: 10, marginTop: 6, lineHeight: 1.4, color: todayDone ? 'var(--success)' : 'var(--warning)' }}>
                      {todayDone
                        ? 'Today counts — task completed'
                        : streak > 0 ? 'Complete any task today to keep it' : 'Complete any task to start one'}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            DAY VIEW
        ══════════════════════════════════════════════ */}
        {subTab === 'day' && (() => {
          const viewDow      = new Date(viewDate + 'T12:00:00').getDay()
          const workoutForDay = weeklyPlan[viewDow] || { day_name: 'Rest', exercises: [] }
          const workoutIsPlanned = workoutForDay.day_name && workoutForDay.day_name !== 'Rest'
          // Section to show workout in: use logged section if known, else default
          const workoutSecId = workoutDates[viewDate] || (isWeekend(viewDate) ? 'morning' : 'afternoon')

          const allDayTasks      = getAllTasks(data.days[viewDate])
          const daySecs          = getSections(viewDate)
          // Routine items come from To-Do, placed into blocks via the Routine tab
          const routineForSec    = secId => todoRoutines.filter(rt => routineAssign[rt.id] === secId)
          const routineTasksDay  = daySecs.flatMap(s => routineForSec(s.id))
          const routineChecksDay = data.days[viewDate]?.routineChecks || {}
          const routineDoneDay   = routineTasksDay.filter(rt => routineChecksDay[rt.id]).length
          const allDone  = allDayTasks.filter(t => t.completed).length + routineDoneDay
          const allTotal = allDayTasks.length + routineTasksDay.length
          const dayPct   = allTotal > 0 ? Math.round(allDone / allTotal * 100) : 0

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* ── Nav bar ─────────────────────────── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setViewDate(d => addDays(d, -1))} className="btn btn-ghost btn-sm"
                  style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtFull(viewDate)}</div>
                </div>
                <button onClick={() => setViewDate(d => addDays(d, 1))} className="btn btn-ghost btn-sm"
                  style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
                {viewDate !== TODAY && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setViewDate(TODAY)} style={{ fontSize: 11, flexShrink: 0 }}>
                    Today
                  </button>
                )}
                {viewDate === TODAY && focusTasks.length > 0 && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => importFocusTasks(TODAY, isWeekend(TODAY) ? 'todo' : 'afternoon')}
                    title="Import today's focus tasks"
                    style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                  >
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                    </svg>
                    Import ({focusTasks.length})
                  </button>
                )}
              </div>

              {/* ── Day progress bar ─────────────────── */}
              {allTotal > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-light)' }}>
                      {allDone} of {allTotal} complete
                    </span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: dayPct === 100 ? 'var(--success)' : 'var(--text-light)' }}>
                      {dayPct}%
                    </span>
                  </div>
                  <div style={{ height: 3, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${dayPct}%`, background: dayPct === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 99, transition: 'width .5s ease' }} />
                  </div>
                </div>
              )}

              {/* ── To-Do tray — drag any of these into a time block ── */}
              {dayTodoChips.length > 0 && (
                <div className="card" style={{ padding: '12px 14px' }}>
                  <button
                    onClick={() => setTodoTrayOpen(o => !o)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', padding: 0 }}
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 700, flex: 1, textAlign: 'left' }}>Your to-dos</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>drag into a block below</span>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: 'var(--text-muted)', transition: 'transform .2s', transform: todoTrayOpen ? 'rotate(0)' : 'rotate(-90deg)' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {todoTrayOpen && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                      {dayTodoChips.map(chip => (
                        <div
                          key={`${chip._src}-${chip.id}`}
                          draggable
                          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDayDrag({ kind: 'todo', task: chip }) }}
                          onDragEnd={() => { setDayDrag(null); setDayDragOverSec(null) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8,
                            background: dayDrag?.task?.id === chip.id && dayDrag?.kind === 'todo' ? 'rgba(99,102,241,0.18)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                            border: `1px solid ${dayDrag?.task?.id === chip.id && dayDrag?.kind === 'todo' ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                            fontSize: 12, cursor: 'grab', userSelect: 'none', color: 'var(--text)',
                          }}
                        >
                          <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
                            <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/>
                            <circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
                          </svg>
                          {chip.title}
                          {chip._src === 'focus' && <span style={{ fontSize: 8, fontWeight: 700, color: '#6366f1' }}>FOCUS</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Section blocks ───────────────────── */}
              {getSections(viewDate).map(sec => {
                const colKey          = `${viewDate}-${sec.id}`
                const tasks           = getSection(viewDate, sec.id)
                const done            = tasks.filter(t => t.completed).length
                const secTime         = data.times[sec.timeKey] || DEFAULT_TIMES[sec.timeKey]
                const isAdding        = addingIn === colKey
                const showWorkout     = workoutIsPlanned && sec.id === workoutSecId
                const secRoutineTasks = routineForSec(sec.id)
                const secRoutineDone  = secRoutineTasks.filter(rt => !!(data.days[viewDate]?.routineChecks?.[rt.id])).length
                const hasContent      = tasks.length > 0 || showWorkout || secRoutineTasks.length > 0
                const isDropTarget    = !!dayDrag
                const isOver          = dayDragOverSec === sec.id

                return (
                  <div key={sec.id} className="card"
                    style={{
                      padding: 0, overflow: 'hidden',
                      border: isOver ? '1px solid var(--accent)' : undefined,
                      boxShadow: isOver ? '0 0 0 1px var(--accent)' : undefined,
                      transition: 'box-shadow .12s, border-color .12s',
                    }}
                    onDragOver={isDropTarget ? (e => { e.preventDefault(); setDayDragOverSec(sec.id) }) : undefined}
                    onDragLeave={isDropTarget ? (e => { if (e.currentTarget === e.target) return; }) : undefined}
                    onDrop={isDropTarget ? (e => { e.preventDefault(); dropOnDaySection(sec.id) }) : undefined}
                  >

                    {/* Section header — read-only, no collapse */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      background: isOver ? 'rgba(99,102,241,0.08)' : undefined,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{sec.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{secTime}</div>
                      </div>
                      {(tasks.length > 0 || secRoutineTasks.length > 0) && (
                        <span style={{
                          fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
                          color: (done + secRoutineDone) === (tasks.length + secRoutineTasks.length) ? 'var(--success)' : 'var(--text-light)',
                        }}>
                          {done + secRoutineDone}/{tasks.length + secRoutineTasks.length}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div>

                      {/* Workout card */}
                      {showWorkout && (
                        <div style={{
                          margin: '10px 12px 6px',
                          padding: '12px 14px',
                          background: isDark ? 'rgba(99,102,241,0.09)' : 'rgba(99,102,241,0.06)',
                          border: '1px solid rgba(99,102,241,0.22)',
                          borderRadius: 10,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: workoutForDay.exercises.length > 0 ? 8 : 0 }}>
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <path d="M6.5 6.5h11M6.5 17.5h11M3 10h18M3 14h18"/>
                            </svg>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#6366f1', flex: 1, lineHeight: 1.2 }}>
                              {workoutForDay.day_name}
                            </span>
                            {workoutDates[viewDate] && (
                              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(107,227,164,0.15)', color: '#6BE3A4', flexShrink: 0 }}>
                                Logged
                              </span>
                            )}
                          </div>
                          {workoutForDay.exercises.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {workoutForDay.exercises.slice(0, 6).map((ex, i) => (
                                <span key={i} style={{ fontSize: 12, color: 'var(--text-light)', paddingLeft: 2 }}>· {ex}</span>
                              ))}
                              {workoutForDay.exercises.length > 6 && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', paddingLeft: 2 }}>
                                  +{workoutForDay.exercises.length - 6} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Routine tasks for this section */}
                      {secRoutineTasks.map(rt => (
                        <RoutineRow
                          key={rt.id}
                          task={rt}
                          isDark={isDark}
                          checked={!!(data.days[viewDate]?.routineChecks?.[rt.id])}
                          onToggle={() => toggleRoutineCheck(viewDate, rt.id)}
                        />
                      ))}

                      {/* Task list */}
                      {tasks.map(task => (
                        <DayTaskRow
                          key={task.id}
                          task={task}
                          isDark={isDark}
                          dragging={dayDrag?.kind === 'task' && dayDrag?.task?.id === task.id}
                          onDragStart={() => setDayDrag({ kind: 'task', task, fromSec: sec.id })}
                          onDragEnd={() => { setDayDrag(null); setDayDragOverSec(null) }}
                          onToggle={() => toggleTask(viewDate, sec.id, task.id)}
                          onDelete={() => deleteTask(viewDate, sec.id, task.id)}
                        />
                      ))}

                      {/* Empty placeholder */}
                      {!hasContent && !isAdding && (
                        <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Nothing planned
                        </div>
                      )}

                      {/* Quick-add */}
                      {isAdding ? (
                        <div style={{
                          display: 'flex', gap: 6, padding: '8px 12px',
                          borderTop: hasContent ? '1px solid var(--border)' : 'none',
                        }}>
                          <input
                            ref={addInputRef}
                            value={addDraft.title}
                            onChange={e => setAddDraft(d => ({ ...d, title: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') addTask(viewDate, sec.id)
                              if (e.key === 'Escape') { setAddingIn(null); setAddDraft({ title: '', time: '', tag: '' }) }
                            }}
                            placeholder="Add a task…"
                            style={{ flex: 1, fontSize: 13 }}
                          />
                          <button className="btn btn-primary btn-sm" onClick={() => addTask(viewDate, sec.id)} disabled={!addDraft.title.trim()}>
                            Add
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setAddingIn(null); setAddDraft({ title: '', time: '', tag: '' }) }}
                            style={{ display: 'flex', alignItems: 'center' }}>
                            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingIn(colKey)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                            padding: '8px 16px', background: 'none', border: 'none',
                            cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12,
                            fontFamily: 'inherit',
                            borderTop: hasContent ? '1px solid var(--border)' : 'none',
                            transition: 'color .15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                          Add task
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* ══════════════════════════════════════════════
            WEEK VIEW
        ══════════════════════════════════════════════ */}
        {subTab === 'week' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Week navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setWeekBase(m => addDays(m, -7))} className="btn btn-ghost btn-sm"
                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600 }}>
                {fmtShort(weekBase)} – {fmtShort(addDays(weekBase, 6))}
              </div>
              <button onClick={() => setWeekBase(m => addDays(m, 7))} className="btn btn-ghost btn-sm"
                style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
              {weekBase !== getWeekMonday(TODAY) && (
                <button className="btn btn-ghost btn-sm" onClick={() => setWeekBase(getWeekMonday(TODAY))} style={{ fontSize: 11, flexShrink: 0 }}>
                  This week
                </button>
              )}
              <button
                className={`btn btn-sm${planPanelOpen ? ' btn-primary' : ' btn-ghost'}`}
                onClick={() => planPanelOpen ? setPlanPanelOpen(false) : openPlanPanel()}
                style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
              >
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Plan Week
              </button>
            </div>

            {/* ── Plan Panel ───────────────────────── */}
            {planPanelOpen && (() => {
              // Tasks already placed anywhere this week
              const placedIds = new Set(
                getWeek(weekBase).flatMap(d =>
                  Object.values(data.days[d] || {}).flat().map(t => t.sourceId).filter(Boolean)
                )
              )
              return (
                <div className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Schedule tasks</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Drag a task onto a day — then pick the time slot
                      </div>
                    </div>
                    <button
                      onClick={() => setPlanPanelOpen(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: '4px 6px', borderRadius: 4 }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >✕</button>
                  </div>

                  {planLoading ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Loading tasks…</div>
                  ) : planTasks.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                      No active tasks found in To-Do.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {planTasks.map(task => {
                        const placed = placedIds.has(task.id)
                        return (
                          <div
                            key={task.id}
                            draggable={!placed}
                            onDragStart={placed ? undefined : e => { e.dataTransfer.effectAllowed = 'move'; setDragTask(task) }}
                            onDragEnd={placed ? undefined : () => { setDragTask(null); setDragOverTarget(null) }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '6px 11px',
                              borderRadius: 8,
                              background: dragTask?.id === task.id
                                ? 'rgba(99,102,241,0.18)'
                                : placed
                                ? (isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)')
                                : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                              border: `1px solid ${dragTask?.id === task.id ? 'rgba(99,102,241,0.5)' : placed ? 'rgba(107,227,164,0.2)' : 'var(--border)'}`,
                              fontSize: 12,
                              cursor: placed ? 'default' : 'grab',
                              userSelect: 'none',
                              color: placed ? 'var(--text-muted)' : 'var(--text)',
                              opacity: placed ? 0.5 : 1,
                              transition: 'background .12s, border .12s',
                            }}
                          >
                            {placed ? (
                              <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            ) : (
                              <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
                                <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/>
                                <circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
                              </svg>
                            )}
                            {task.title}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {dragTask && (
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="19 12 12 19 5 12"/><polyline points="19 5 12 12 5 5"/>
                      </svg>
                      Drop onto a day and time slot below
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── Weekly Goals ─────────────────────── */}
            {(() => {
              const weekGoals = (data.weeklyGoals || {})[weekBase] || []
              const goalsDone = weekGoals.filter(g => g.completed).length
              const alreadyAdded = new Set(weekGoals.map(g => g.sourceId).filter(Boolean))

              return (
                <div className="card" style={{ padding: '12px 14px' }}>
                  {/* Header — matches Day to-do tray style */}
                  <button
                    onClick={() => setWeekGoalsOpen(o => !o)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', padding: 0 }}
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 700, flex: 1, textAlign: 'left' }}>Weekly Goals</span>
                    {weekGoals.length > 0 && (
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: goalsDone === weekGoals.length ? 'var(--success)' : 'var(--text-muted)', marginRight: 4 }}>
                        {goalsDone}/{weekGoals.length}
                      </span>
                    )}
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: 'var(--text-muted)', transition: 'transform .2s', transform: weekGoalsOpen ? 'rotate(0)' : 'rotate(-90deg)', flexShrink: 0 }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {weekGoalsOpen && (
                    <div style={{ marginTop: 10 }}>
                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: weekGoals.length ? 10 : 0 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={openPicker}
                          style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="8 17 12 21 16 17"/><line x1="12" y1="3" x2="12" y2="21"/>
                          </svg>
                          Import from To-Do
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setAddingGoal(true); setPickerOpen(false) }}
                          style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                          Add goal
                        </button>
                      </div>

                      {/* Goal rows */}
                      {weekGoals.map(goal => (
                        <GoalRow
                          key={goal.id}
                          goal={goal}
                          isDark={isDark}
                          onToggle={() => toggleWeeklyGoal(weekBase, goal.id)}
                          onDelete={() => deleteWeeklyGoal(weekBase, goal.id)}
                        />
                      ))}

                      {/* Empty state */}
                      {weekGoals.length === 0 && !addingGoal && !pickerOpen && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No goals set — import from To-Do or add one manually.
                        </div>
                      )}

                      {/* Manual add row */}
                      {addingGoal && (
                        <div style={{ display: 'flex', gap: 6, marginTop: weekGoals.length ? 8 : 0 }}>
                          <input
                            ref={newGoalRef}
                            value={newGoalText}
                            onChange={e => setNewGoalText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { addWeeklyGoal(weekBase, newGoalText); setNewGoalText(''); setAddingGoal(false) }
                              if (e.key === 'Escape') { setAddingGoal(false); setNewGoalText('') }
                            }}
                            placeholder="Goal for this week…"
                            style={{ flex: 1, fontSize: 13 }}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={!newGoalText.trim()}
                            onClick={() => { addWeeklyGoal(weekBase, newGoalText); setNewGoalText(''); setAddingGoal(false) }}
                          >Add</button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setAddingGoal(false); setNewGoalText('') }}
                            style={{ display: 'flex', alignItems: 'center' }}
                          >
                            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* To-Do picker */}
                      {pickerOpen && (
                    <div style={{
                      marginTop: 12,
                      border: '1px solid var(--border)',
                      borderRadius: 10, overflow: 'hidden',
                    }}>
                      <div style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Pick tasks to add as goals</span>
                        <button
                          onClick={() => setPickerOpen(false)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: '2px 4px' }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                        >✕</button>
                      </div>
                      {pickerLoading ? (
                        <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div className="skeleton" style={{ width: '70%', height: 10 }} />
                          <div className="skeleton" style={{ width: '55%', height: 10 }} />
                        </div>
                      ) : pickerTasks.length === 0 ? (
                        <div style={{ padding: '14px 12px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No active tasks found in To-Do.
                        </div>
                      ) : (
                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                          {pickerTasks.map((task, i) => {
                            const added = alreadyAdded.has(task.id)
                            return (
                              <div
                                key={task.id}
                                onClick={() => {
                                  if (!added) {
                                    addWeeklyGoal(weekBase, task.title, task.id)
                                  }
                                }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '9px 12px',
                                  borderBottom: i < pickerTasks.length - 1 ? '1px solid var(--border)' : 'none',
                                  cursor: added ? 'default' : 'pointer',
                                  opacity: added ? 0.45 : 1,
                                  transition: 'background .12s',
                                }}
                                onMouseEnter={e => { if (!added) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                              >
                                <span style={{ fontSize: 13, flex: 1, color: 'var(--text)' }}>{task.title}</span>
                                <span style={{
                                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                                  background: task._src === 'plan' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.07)',
                                  color: task._src === 'plan' ? '#6366f1' : 'var(--text-muted)',
                                  flexShrink: 0,
                                }}>
                                  {task._src === 'plan' ? 'This week' : 'Backlog'}
                                </span>
                                {added ? (
                                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                ) : (
                                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                  </svg>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 7-column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, overflowX: 'auto' }}>
              {weekDaysForView.map(d => {
                const isToday = d === TODAY
                const tasks   = getAllTasks(data.days[d])
                const done    = tasks.filter(t => t.completed).length
                const secs    = getSections(d)
                const dayData = data.days[d] || {}

                const isDraggingNow = !!dragTask
                return (
                  <div
                    key={d}
                    onClick={() => { if (isDraggingNow) return; setViewDate(d); setSubTab('day') }}
                    onDragOver={e => { if (isDraggingNow) e.preventDefault() }}
                    style={{
                      border: `1px solid ${isToday ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-lg)',
                      background: isToday ? 'rgba(99,102,241,0.06)' : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                      padding: '10px 10px 8px',
                      cursor: isDraggingNow ? 'default' : 'pointer',
                      minWidth: 100,
                      transition: 'background .15s',
                    }}
                    onMouseEnter={e => { if (!isToday && !isDraggingNow) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                    onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = isToday ? 'rgba(99,102,241,0.06)' : isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
                  >
                    {/* Day header — always visible */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: isToday ? 'var(--accent)' : 'var(--text-light)' }}>
                        {dayShort(d)}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 800, lineHeight: 1.1, color: isToday ? 'var(--accent)' : 'var(--text)' }}>
                        {dayNum(d)}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text-light)' }}>{monthShort(d)}</div>
                    </div>

                    {isDraggingNow ? (
                      /* ── Drop zones: one per section ── */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {secs.map(sec => {
                          const isOver = dragOverTarget?.d === d && dragOverTarget?.secId === sec.id
                          return (
                            <div
                              key={sec.id}
                              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverTarget({ d, secId: sec.id }) }}
                              onDragLeave={e => { e.stopPropagation(); if (dragOverTarget?.d === d && dragOverTarget?.secId === sec.id) setDragOverTarget(null) }}
                              onDrop={e => { e.preventDefault(); e.stopPropagation(); dropTaskOnDay(d, sec.id) }}
                              style={{
                                padding: '6px 5px',
                                borderRadius: 6,
                                border: `1px dashed ${isOver ? 'var(--accent)' : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                                background: isOver ? 'rgba(99,102,241,0.14)' : 'transparent',
                                fontSize: 9, fontWeight: isOver ? 700 : 400,
                                textAlign: 'center', lineHeight: 1.3,
                                color: isOver ? 'var(--accent)' : 'var(--text-muted)',
                                transition: 'all .1s',
                                userSelect: 'none',
                              }}
                            >
                              {sec.label}
                              {(dayData[sec.id] || []).length > 0 && (
                                <div style={{ fontSize: 8, opacity: 0.6, marginTop: 1 }}>
                                  {(dayData[sec.id] || []).length} task{(dayData[sec.id] || []).length !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      /* ── Normal content ── */
                      <>
                        {tasks.length > 0 && (
                          <div style={{ height: 3, borderRadius: 99, background: 'var(--border)', marginBottom: 8, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round(done / tasks.length * 100)}%`, background: done === tasks.length ? 'var(--success)' : 'var(--accent)', borderRadius: 99, transition: 'width .4s' }} />
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {tasks.length > 0 && (
                            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text-muted)', marginBottom: 2 }}>
                              {tasks.length} task{tasks.length !== 1 ? 's' : ''}
                            </div>
                          )}
                          {secs.map(s => {
                            const secTasks = dayData[s.id] || []
                            if (!secTasks.length) return null
                            const secDone = secTasks.filter(t => t.completed).length
                            return (
                              <div key={s.id} style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.label}</span>
                                <span style={{ fontFamily: 'var(--mono)', flexShrink: 0, color: secDone === secTasks.length ? 'var(--success)' : 'var(--text-light)' }}>
                                  {secDone}/{secTasks.length}
                                </span>
                              </div>
                            )
                          })}
                          {!secs.some(s => (dayData[s.id] || []).length > 0) && (
                            <div style={{ fontSize: 10, color: 'var(--text-light)', fontStyle: 'italic' }}>No tasks</div>
                          )}
                          {workoutDates[d] && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
                              <span style={{ fontSize: 9, color: '#6366f1', fontWeight: 600 }}>Workout</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ROUTINE
        ══════════════════════════════════════════════ */}
        {subTab === 'routine' && (() => {
          const unassigned = todoRoutines.filter(rt => !WEEKDAY_SECS.some(s => s.id === routineAssign[rt.id]))
          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                These are your To-Do <strong>Daily Routine</strong> tasks. Drag each one into the time block when you want to do it — they'll show up in your Day view every day.
              </div>
              <button
                onClick={saveRoutineSchedule}
                disabled={routineSaveState === 'saving'}
                style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: routineSaveState === 'saving' ? 'default' : 'pointer',
                  fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  background: routineSaveState === 'saved' ? 'rgba(107,227,164,0.15)' : 'var(--accent)',
                  color: routineSaveState === 'saved' ? 'var(--success)' : '#fff',
                  opacity: routineSaveState === 'saving' ? 0.6 : 1,
                  transition: 'background .2s, color .2s',
                }}
              >
                {routineSaveState === 'saved' ? (
                  <>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Saved
                  </>
                ) : routineSaveState === 'saving' ? 'Saving…' : 'Save Routine'}
              </button>
            </div>

            {/* Unassigned tray */}
            <div
              className="card"
              onDragOver={routineDrag ? (e => { e.preventDefault(); setRoutineDragOverSec('__tray') }) : undefined}
              onDrop={routineDrag ? (e => { e.preventDefault(); unassignRoutine(routineDrag.id); setRoutineDrag(null); setRoutineDragOverSec(null) }) : undefined}
              style={{
                padding: '12px 14px',
                border: routineDragOverSec === '__tray' ? '1px solid var(--accent)' : undefined,
                boxShadow: routineDragOverSec === '__tray' ? '0 0 0 1px var(--accent)' : undefined,
              }}
            >
              <div style={{ ...sLabel, marginBottom: unassigned.length ? 10 : 0 }}>
                Unscheduled routine{unassigned.length ? ` (${unassigned.length})` : ''}
              </div>
              {todoRoutines.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No routine tasks yet — add them in the To-Do tab's Daily Routine.
                </div>
              ) : unassigned.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  All routine tasks are scheduled. Drag one back here to unschedule it.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {unassigned.map(rt => (
                    <div
                      key={rt.id}
                      draggable
                      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setRoutineDrag(rt) }}
                      onDragEnd={() => { setRoutineDrag(null); setRoutineDragOverSec(null) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8,
                        background: routineDrag?.id === rt.id ? 'rgba(99,102,241,0.18)' : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                        border: `1px solid ${routineDrag?.id === rt.id ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
                        fontSize: 12, cursor: 'grab', userSelect: 'none', color: 'var(--text)',
                      }}
                    >
                      <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round">
                        <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/>
                        <circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
                      </svg>
                      {rt.title}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Time-block drop zones */}
            {WEEKDAY_SECS.map(sec => {
              const secTasks = todoRoutines.filter(rt => routineAssign[rt.id] === sec.id)
              const isOver   = routineDragOverSec === sec.id
              return (
                <div key={sec.id} className="card"
                  onDragOver={routineDrag ? (e => { e.preventDefault(); setRoutineDragOverSec(sec.id) }) : undefined}
                  onDrop={routineDrag ? (e => { e.preventDefault(); dropRoutineOnSection(sec.id) }) : undefined}
                  style={{
                    padding: 0, overflow: 'hidden',
                    border: isOver ? '1px solid var(--accent)' : undefined,
                    boxShadow: isOver ? '0 0 0 1px var(--accent)' : undefined,
                    transition: 'box-shadow .12s, border-color .12s',
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderBottom: '1px solid var(--border)',
                    background: isOver ? 'rgba(99,102,241,0.08)' : undefined,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{sec.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{DEFAULT_TIMES[sec.timeKey]}</div>
                    </div>
                    {secTasks.length > 0 && (
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-light)' }}>
                        {secTasks.length} task{secTasks.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div>
                    {secTasks.map(rt => (
                      <div
                        key={rt.id}
                        draggable
                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setRoutineDrag(rt) }}
                        onDragEnd={() => { setRoutineDrag(null); setRoutineDragOverSec(null) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', cursor: 'grab' }}
                      >
                        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.4 }}>
                          <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/>
                          <circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
                        </svg>
                        <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>{rt.title}</span>
                        <button onClick={() => unassignRoutine(rt.id)} className="goal-del" title="Unschedule" style={{ flexShrink: 0, opacity: 0.5 }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>×</button>
                      </div>
                    ))}
                    {secTasks.length === 0 && (
                      <div style={{ padding: '10px 16px', fontSize: 12, color: isOver ? 'var(--accent)' : 'var(--text-muted)', fontStyle: 'italic' }}>
                        {isOver ? 'Drop here' : 'Drag routine tasks here'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          )
        })()}


      </div>

      {/* AI Assistant */}
      <FloatingChat
        title="Schedule Assistant"
        placeholder="Plan my day, reschedule tasks…"
        systemPrompt={`You are a schedule assistant for a personal life dashboard. Help the user plan their day, reschedule tasks, suggest time management strategies, and answer questions about their schedule. Keep replies concise and actionable. Today is ${fmtFull(TODAY)}.`}
        context={buildAIContext()}
        emptyTitle="Plan your schedule"
        emptyHints={[
          'Plan my day',
          "What's on my plate this week?",
          'Add a dentist appointment Friday at 2pm',
        ]}
      />
    </div>
  )
}

// ── TaskRow sub-component ─────────────────────────────────────
function TaskRow({ task, idx, total, isDark, dragging, dragOver, onToggle, onDelete, onSaveTitle, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(task.title)
  const inputRef = useRef(null)

  useEffect(() => { if (editing) { setDraft(task.title); setTimeout(() => inputRef.current?.focus(), 30) } }, [editing])

  function commit() {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== task.title) onSaveTitle(v)
    else setDraft(task.title)
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px 7px 10px',
        opacity: task.completed ? 0.5 : 1,
        background: dragOver ? (isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.05)') : 'transparent',
        borderTop: dragOver ? '2px solid var(--accent)' : '1px solid transparent',
        transition: 'opacity .2s',
        cursor: dragging ? 'grabbing' : 'default',
      }}
    >
      {/* Drag handle */}
      <span style={{ cursor: 'grab', color: 'var(--text-light)', opacity: 0.4, fontSize: 11, letterSpacing: '-1px', flexShrink: 0, userSelect: 'none' }}>⋮⋮</span>

      {/* Checkbox */}
      <input type="checkbox" className="goal-check" checked={task.completed} onChange={onToggle} style={{ flexShrink: 0 }} />

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(task.title) } }}
            style={{ fontSize: 13, width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent)', borderRadius: 0, padding: '0 0 1px', color: 'var(--text)' }}
          />
        ) : (
          <span
            onClick={() => setEditing(true)}
            style={{
              fontSize: 13, fontWeight: 500, cursor: 'text', display: 'block',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: task.completed ? 'line-through' : 'none',
              textDecorationColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
              color: task.completed ? 'var(--text-muted)' : 'var(--text)',
            }}
          >
            {task.title}
          </span>
        )}
      </div>

      {/* Time badge */}
      {task.time && (
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text-light)', flexShrink: 0 }}>
          {task.time}
        </span>
      )}

      {/* Tag badge */}
      {task.tag && TAG_META[task.tag] && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: TAG_META[task.tag].bg, color: TAG_META[task.tag].color, flexShrink: 0 }}>
          {TAG_META[task.tag].label}
        </span>
      )}

      {/* Delete */}
      <button
        onClick={onDelete}
        className="goal-del"
        style={{ opacity: 0.35, flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
        onMouseLeave={e => e.currentTarget.style.opacity = '0.35'}
      >×</button>
    </div>
  )
}

// ── DayTaskRow — clean read-focused row for Day view ──────────
function DayTaskRow({ task, isDark, onToggle, onDelete, dragging, onDragStart, onDragEnd }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 16px',
        opacity: dragging ? 0.4 : task.completed ? 0.48 : 1,
        transition: 'opacity .15s',
        borderBottom: '1px solid transparent',
        cursor: onDragStart ? 'grab' : 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {onDragStart && (
        <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: hovered ? 0.7 : 0.3 }}>
          <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/>
          <circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
        </svg>
      )}
      <input type="checkbox" className="goal-check" checked={task.completed} onChange={onToggle} style={{ flexShrink: 0 }} />
      <span style={{
        fontSize: 14, flex: 1, lineHeight: 1.4,
        textDecoration: task.completed ? 'line-through' : 'none',
        textDecorationColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
        color: task.completed ? 'var(--text-muted)' : 'var(--text)',
        wordBreak: 'break-word',
      }}>
        {task.title}
      </span>
      {task.time && (
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-muted)', flexShrink: 0 }}>
          {task.time}
        </span>
      )}
      {task.tag && TAG_META[task.tag] && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: TAG_META[task.tag].bg, color: TAG_META[task.tag].color, flexShrink: 0 }}>
          {TAG_META[task.tag].label}
        </span>
      )}
      {hovered && (
        <button
          onClick={onDelete}
          className="goal-del"
          style={{ opacity: 0.4, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
        >×</button>
      )}
    </div>
  )
}

// ── RoutineRow — recurring task row (definition + day-check mode) ─
function RoutineRow({ task, isDark, checked, onToggle, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const isDay = typeof checked !== 'undefined'   // day-view mode has a daily checkbox
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 16px',
        opacity: (isDay && checked) ? 0.48 : 1,
        transition: 'opacity .15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {isDay ? (
        <input type="checkbox" className="goal-check" checked={!!checked} onChange={onToggle} style={{ flexShrink: 0 }} />
      ) : (
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(99,102,241,0.5)', flexShrink: 0 }} />
      )}
      <span style={{
        fontSize: isDay ? 14 : 13, flex: 1, lineHeight: 1.4,
        textDecoration: (isDay && checked) ? 'line-through' : 'none',
        textDecorationColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
        color: (isDay && checked) ? 'var(--text-muted)' : 'var(--text)',
        wordBreak: 'break-word',
      }}>
        {task.title}
      </span>
      {isDay && (
        <span style={{
          fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
          fontWeight: 600, color: 'rgba(99,102,241,0.55)', flexShrink: 0,
        }}>
          routine
        </span>
      )}
      {!isDay && hovered && onDelete && (
        <button
          onClick={onDelete}
          className="goal-del"
          style={{ opacity: 0.4, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
        >×</button>
      )}
    </div>
  )
}

// ── GoalRow — weekly goals checklist item ─────────────────────
function GoalRow({ goal, isDark, onToggle, onDelete }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        opacity: goal.completed ? 0.48 : 1,
        transition: 'opacity .15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <input type="checkbox" className="goal-check" checked={goal.completed} onChange={onToggle} style={{ flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize: 13, lineHeight: 1.4,
        textDecoration: goal.completed ? 'line-through' : 'none',
        textDecorationColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
        color: goal.completed ? 'var(--text-muted)' : 'var(--text)',
        wordBreak: 'break-word',
      }}>
        {goal.title}
      </span>
      {goal.sourceId && (
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic', flexShrink: 0 }}>to-do</span>
      )}
      {hovered && (
        <button
          onClick={onDelete}
          className="goal-del"
          style={{ opacity: 0.4, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
        >×</button>
      )}
    </div>
  )
}
