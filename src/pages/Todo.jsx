import { useState, useEffect, useRef, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, Cell,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { getActiveDate, formatShortDate } from '../lib/dateUtils'
import { cacheGet, cacheSet } from '../lib/cache'
import SkeletonList from '../components/Skeleton'
import { pctColor, pctPhase } from '../components/TodoRing'

const TODAY = getActiveDate()
const YESTERDAY = (() => {
  const d = new Date(TODAY + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
})()

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 }
const PRIORITY_LABEL = { high: 'High', normal: 'Normal', low: 'Low' }
const PRIORITY_COLOR = { high: 'var(--danger)', normal: 'var(--accent)', low: 'var(--text-light)' }

// Classify Supabase errors into human-readable hints
function describeError(error) {
  if (!error) return null
  const msg = error.message || ''
  if (msg.includes('JWT') || msg.includes('token') || msg.includes('session') || msg.includes('not authenticated'))
    return { text: 'Session expired — please sign out and sign back in.', auth: true }
  if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('Could not find the table'))
    return { text: 'Database tables not set up yet. Go to Supabase → SQL Editor → New query, paste supabase-todo-v2.sql, and click Run.', setup: true }
  return { text: msg }
}

function notify() { window.dispatchEvent(new CustomEvent('todos-changed')) }

// ─── Inline editable text ──────────────────────────────────
function EditableText({ value, onSave, style, placeholder }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef(null)
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select() } }, [editing])
  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    else setDraft(value)
  }
  if (editing) return (
    <input
      ref={ref} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
      style={{ ...style, border: 'none', borderBottom: '1px solid var(--accent)', background: 'transparent', padding: '0 0 1px', borderRadius: 0, width: '100%', color: 'var(--text)', fontSize: 'inherit', fontWeight: 'inherit' }}
    />
  )
  return (
    <span onClick={() => setEditing(true)} title="Click to edit"
      style={{ ...style, cursor: 'text', display: 'block' }}>
      {value || <span style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>{placeholder}</span>}
    </span>
  )
}

// ─── Priority badge ────────────────────────────────────────
function PriBadge({ priority }) {
  // Normal is the default — only badge the exceptions (High/Low)
  if (!priority || priority === 'normal') return null
  const colors = {
    high:   { bg: 'var(--danger-light)',  color: 'var(--danger)' },
    normal: { bg: 'var(--accent-light)',  color: 'var(--accent)' },
    low:    { bg: 'var(--surface)', color: 'var(--text-light)' },
  }
  const c = colors[priority] || colors.normal
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: c.bg, color: c.color, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {PRIORITY_LABEL[priority] || 'Normal'}
    </span>
  )
}

// ─── Segmented bar (routine progress) ─────────────────────
function SegBar({ total, done }) {
  if (!total) return null
  return (
    <div style={{ display: 'flex', gap: 4, height: 5, marginBottom: 16 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, borderRadius: 99, background: i < done ? 'var(--success)' : 'var(--border)', transition: 'background .3s', boxShadow: i < done ? '0 0 6px rgba(107,227,164,0.35)' : 'none' }} />
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
export default function Todo() {
  const { user, theme } = useApp()
  const [tab, setTab] = useState('routine')
  const todoCache = cacheGet(`todo:${TODAY}`)

  // ── Routine state ──
  const [routineTasks,   setRoutineTasks]   = useState(todoCache?.routineTasks ?? [])
  const [completedToday, setCompletedToday] = useState(() => new Set(todoCache?.completedToday ?? [])) // routine_task_id set
  const [routineInput,   setRoutineInput]   = useState('')
  const [routineDragFrom, setRoutineDragFrom] = useState(null)
  const [routineDragOver, setRoutineDragOver] = useState(null)

  // ── Task list state ──
  const [taskItems,      setTaskItems]      = useState(todoCache?.taskItems ?? [])
  const [showCompleted,  setShowCompleted]  = useState(false)
  const [showAddTask,    setShowAddTask]    = useState(false)
  const [taskForm,       setTaskForm]       = useState({ title: '', priority: 'normal', due_date: '', notes: '' })
  const [expandedTask,   setExpandedTask]   = useState(null)

  // ── Smart Import (dump box) ──
  const [showDump,     setShowDump]     = useState(false)
  const [dumpText,     setDumpText]     = useState('')
  const [parsedTasks,  setParsedTasks]  = useState(null)   // null=not parsed, []=parsed (possibly empty)
  const [parseLoading, setParseLoading] = useState(false)
  const [parseError,   setParseError]   = useState(null)

  // ── Focus state ──
  const [focusTasks,     setFocusTasks]     = useState(todoCache?.focusTasks ?? [])
  const [focusInput,     setFocusInput]     = useState('')
  const [focusPri,       setFocusPri]       = useState('normal')
  const [carryover,      setCarryover]      = useState([])       // yesterday's unfinished
  const [carryoverSel,   setCarryoverSel]   = useState(new Set())
  const [showCarryover,  setShowCarryover]  = useState(false)

  const [loading, setLoading] = useState(!todoCache)
  const [dbError, setDbError] = useState(null)
  const [weekData, setWeekData] = useState(todoCache?.weekData ?? [])

  // ── AI Today ordering ──
  const [aiTodayOrder,   setAiTodayOrder]   = useState(null)   // null=not fetched; string[] of 'src:id'
  const [aiTodayLoading, setAiTodayLoading] = useState(false)
  const aiOrderFetchedRef = useRef(false)

  // ── Completion animation ──
  const [completing, setCompleting] = useState(new Set())
  function completeTask(id, fn) {
    setCompleting(s => new Set([...s, id]))
    setTimeout(() => { fn(); setCompleting(s => { const n = new Set(s); n.delete(id); return n }) }, 300)
  }

  // ─────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    // Only show the skeleton on the very first load — cached revisits refresh silently
    if (!cacheGet(`todo:${TODAY}`)) setLoading(true)
    setDbError(null)
    aiOrderFetchedRef.current = false

    const [
      { data: rTasks,  error: e1 },
      { data: rComp,   error: e2 },
      { data: tItems,  error: e3 },
      { data: fTasks,  error: e4 },
      { data: yFocus,  error: e5 },
    ] = await Promise.all([
      supabase.from('routine_tasks').select('*').eq('user_id', user.id).eq('active', true).order('position').order('created_at'),
      supabase.from('routine_completions').select('routine_task_id').eq('user_id', user.id).eq('completed_date', TODAY),
      supabase.from('task_list').select('*').eq('user_id', user.id).order('position').order('created_at'),
      supabase.from('focus_tasks').select('*').eq('user_id', user.id).eq('focus_date', TODAY).order('position').order('created_at'),
      supabase.from('focus_tasks').select('*').eq('user_id', user.id).eq('focus_date', YESTERDAY).eq('completed', false),
    ])

    const firstError = e1 || e2 || e3 || e4 || e5
    if (firstError) {
      setDbError(describeError(firstError))
      setLoading(false)
      return
    }

    setRoutineTasks(rTasks || [])
    setCompletedToday(new Set((rComp || []).map(r => r.routine_task_id)))
    setTaskItems(tItems || [])
    setFocusTasks(fTasks || [])

    const yItems = yFocus || []
    // Tasks linked to the task list go back automatically — only offer carryover
    // for focus tasks the user added manually (no task_list_id)
    const manualUnfinished = yItems.filter(t => !t.task_list_id)
    if (manualUnfinished.length > 0) {
      setCarryover(manualUnfinished)
      setCarryoverSel(new Set(manualUnfinished.map(t => t.id)))
      setShowCarryover(true)
    }

    // ── Weekly completion data (last 7 days — routine + focus tasks) ──
    const weekDays = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(TODAY + 'T00:00:00')
      d.setDate(d.getDate() - i)
      weekDays.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)
    }
    const [{ data: weekComp }, { data: weekFocus }] = await Promise.all([
      supabase
        .from('routine_completions')
        .select('completed_date')
        .eq('user_id', user.id)
        .gte('completed_date', weekDays[0])
        .lte('completed_date', TODAY),
      supabase
        .from('focus_tasks')
        .select('focus_date, completed')
        .eq('user_id', user.id)
        .gte('focus_date', weekDays[0])
        .lte('focus_date', TODAY),
    ])

    const compPerDay = {}
    for (const c of weekComp || []) {
      compPerDay[c.completed_date] = (compPerDay[c.completed_date] || 0) + 1
    }
    const focusDonePerDay = {}
    const focusTotalPerDay = {}
    for (const f of weekFocus || []) {
      focusTotalPerDay[f.focus_date] = (focusTotalPerDay[f.focus_date] || 0) + 1
      if (f.completed) focusDonePerDay[f.focus_date] = (focusDonePerDay[f.focus_date] || 0) + 1
    }
    const rTotal = (rTasks || []).length
    const week = weekDays.map(date => {
      const rDone  = compPerDay[date] || 0
      const fDone  = focusDonePerDay[date] || 0
      const fTotal = focusTotalPerDay[date] || 0
      const total  = rTotal + fTotal
      const done   = rDone + fDone
      return {
        date,
        label: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
        pct:   total > 0 ? Math.round(done / total * 100) : 0,
        isToday: date === TODAY,
      }
    })
    setWeekData(week)

    cacheSet(`todo:${TODAY}`, {
      routineTasks:   rTasks || [],
      completedToday: (rComp || []).map(r => r.routine_task_id),
      taskItems:      tItems || [],
      focusTasks:     fTasks || [],
      weekData:       week,
    })
    setLoading(false)
    notify()
  }, [user.id])

  useEffect(() => { load() }, [load])

  // ─────────────────────────────────────────────────────────
  // ROUTINE mutations
  // ─────────────────────────────────────────────────────────
  async function addRoutineTask() {
    const title = routineInput.trim()
    if (!title) return
    const position = routineTasks.length
    const { data, error } = await supabase.from('routine_tasks')
      .insert({ user_id: user.id, title, position }).select().single()
    if (error) { setDbError(describeError(error)); return }
    if (data) setRoutineTasks(t => [...t, data])
    setRoutineInput('')
  }

  async function deleteRoutineTask(id) {
    await supabase.from('routine_tasks').update({ active: false }).eq('id', id)
    setRoutineTasks(t => t.filter(r => r.id !== id))
  }

  async function saveRoutineTitle(id, title) {
    await supabase.from('routine_tasks').update({ title }).eq('id', id)
    setRoutineTasks(t => t.map(r => r.id === id ? { ...r, title } : r))
  }

  async function saveRoutineNote(id, note) {
    await supabase.from('routine_tasks').update({ note }).eq('id', id)
    setRoutineTasks(t => t.map(r => r.id === id ? { ...r, note } : r))
  }

  async function toggleRoutine(taskId) {
    const done = completedToday.has(taskId)
    if (done) {
      await supabase.from('routine_completions')
        .delete().eq('routine_task_id', taskId).eq('completed_date', TODAY)
      setCompletedToday(s => { const n = new Set(s); n.delete(taskId); return n })
    } else {
      await supabase.from('routine_completions')
        .insert({ user_id: user.id, routine_task_id: taskId, completed_date: TODAY })
      setCompletedToday(s => new Set([...s, taskId]))
    }
    notify()
  }

  function routineDragStart(e, idx) { setRoutineDragFrom(idx); e.dataTransfer.effectAllowed = 'move' }
  function routineDragOver_(e, idx) { e.preventDefault(); setRoutineDragOver(idx) }
  async function routineDrop(e, idx) {
    e.preventDefault()
    if (routineDragFrom === null || routineDragFrom === idx) { setRoutineDragOver(null); return }
    const next = [...routineTasks]
    const [moved] = next.splice(routineDragFrom, 1)
    next.splice(idx, 0, moved)
    setRoutineTasks(next)
    setRoutineDragFrom(null); setRoutineDragOver(null)
    next.forEach((t, i) => supabase.from('routine_tasks').update({ position: i }).eq('id', t.id))
  }

  // ─────────────────────────────────────────────────────────
  // TASK LIST mutations
  // ─────────────────────────────────────────────────────────
  async function addTaskItem() {
    const title = taskForm.title.trim()
    if (!title) return
    const payload = {
      user_id: user.id,
      title,
      priority: taskForm.priority || 'normal',
      due_date: taskForm.due_date || null,
      notes: taskForm.notes || null,
      position: taskItems.filter(t => !t.completed).length,
    }
    const { data, error } = await supabase.from('task_list').insert(payload).select().single()
    if (error) { setDbError(describeError(error)); return }
    if (data) setTaskItems(t => [...t, data])
    setTaskForm({ title: '', priority: 'normal', due_date: '', notes: '' })
    setShowAddTask(false)
  }

  async function toggleTaskItem(id, done) {
    const updates = { completed: !done, completed_at: !done ? new Date().toISOString() : null }
    await supabase.from('task_list').update(updates).eq('id', id)
    setTaskItems(t => t.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  async function deleteTaskItem(id) {
    await supabase.from('task_list').delete().eq('id', id)
    setTaskItems(t => t.filter(item => item.id !== id))
  }

  async function updateTaskField(id, field, value) {
    await supabase.from('task_list').update({ [field]: value }).eq('id', id)
    setTaskItems(t => t.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  // ─────────────────────────────────────────────────────────
  // SMART IMPORT
  // ─────────────────────────────────────────────────────────

  // Robust JSON extractor — handles truncated responses gracefully
  function extractTasksJSON(reply) {
    let raw = reply.trim()
    // Strip markdown fences
    raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
    // Slice to the outermost array
    const start = raw.indexOf('[')
    if (start >= 0) {
      raw = raw.slice(start)
      const end = raw.lastIndexOf(']')
      if (end >= 0) raw = raw.slice(0, end + 1)
    }
    // Try direct parse first
    try { return JSON.parse(raw) } catch {}
    // Fallback: pull out every complete {...} object even if array was truncated mid-way
    const objMatches = [...raw.matchAll(/\{(?:[^{}"]|"(?:[^"\\]|\\.)*")*\}/g)].map(m => m[0])
    if (objMatches.length) {
      try { return JSON.parse('[' + objMatches.join(',') + ']') } catch {}
    }
    throw new Error('Could not read the AI response — please try again')
  }

  async function runParseAI() {
    if (!dumpText.trim()) return
    setParseLoading(true)
    setParseError(null)
    try {
      const res = await fetch('/api/chat-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: dumpText }],
          systemPrompt: `You are a task extraction assistant. Parse the input text and extract every distinct actionable task. Return ONLY a raw JSON array — no markdown fences, no explanation, just the array. Each element must have exactly these fields: {"title":"short action phrase, max 60 chars","priority":"high"|"normal"|"low","due_date":"YYYY-MM-DD or null","notes":"any extra context, or empty string"}. Today is ${TODAY}. Urgency words like asap/urgent/critical/today/tomorrow → high. Words like eventually/someday/later/optional → low. Everything else → normal. Deduplicate. Keep titles concise and actionable.`,
          context: '',
          maxTokens: 2048,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      const tasks = extractTasksJSON(data.reply)
      if (!Array.isArray(tasks)) throw new Error('Unexpected response format')
      setParsedTasks(
        tasks
          .map(t => ({
            title:    String(t.title   || '').trim().slice(0, 120),
            priority: ['high','normal','low'].includes(t.priority) ? t.priority : 'normal',
            due_date: t.due_date && t.due_date !== 'null' ? String(t.due_date) : '',
            notes:    String(t.notes   || '').trim(),
          }))
          .filter(t => t.title)
      )
    } catch (err) {
      setParseError(`Could not parse tasks: ${err.message}`)
    }
    setParseLoading(false)
  }

  async function confirmParsedTasks() {
    if (!parsedTasks || parsedTasks.length === 0) return
    const basePos = taskItems.filter(t => !t.completed).length
    const payload = parsedTasks.map((t, i) => ({
      user_id:  user.id,
      title:    t.title,
      priority: t.priority,
      due_date: t.due_date || null,
      notes:    t.notes    || null,
      position: basePos + i,
    }))
    const { data, error } = await supabase.from('task_list').insert(payload).select()
    if (error) { setDbError(describeError(error)); return }
    if (data)  setTaskItems(items => [...items, ...data])
    closeDump()
  }

  function closeDump() {
    setShowDump(false); setDumpText(''); setParsedTasks(null)
    setParseError(null); setParseLoading(false)
  }

  function updateParsedTask(i, field, value) {
    setParsedTasks(tasks => tasks.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }
  function removeParsedTask(i) {
    setParsedTasks(tasks => tasks.filter((_, idx) => idx !== i))
  }

  async function addToFocus(task) {
    // Avoid duplicates for today
    if (focusTasks.some(f => f.task_list_id === task.id && !f.completed)) return
    const { data, error } = await supabase.from('focus_tasks').insert({
      user_id: user.id,
      title: task.title,
      priority: task.priority,
      notes: task.notes,
      focus_date: TODAY,
      task_list_id: task.id,
      position: focusTasks.length,
    }).select().single()
    if (error) { setDbError(describeError(error)); return }
    if (data) setFocusTasks(f => [...f, data])
    notify()
  }

  // ─────────────────────────────────────────────────────────
  // AI TODAY ORDERING
  // ─────────────────────────────────────────────────────────
  async function runAITodayOrder(candidates) {
    if (!candidates || candidates.length === 0) { setAiTodayOrder([]); return }
    setAiTodayLoading(true)
    try {
      const lines = candidates.map((t, i) => {
        const src = t._src === 'focus' ? "Today's Plan" : t._src === 'routine' ? 'Routine' : 'Task'
        const pri = t.priority && t.priority !== 'normal' ? ` [${t.priority}]` : ''
        const due = t.due_date === TODAY ? ' [due today]' : (t.due_date && t.due_date < TODAY) ? ' [overdue]' : ''
        return `${i + 1}. [${src}] ${t.title}${pri}${due}`
      }).join('\n')

      const res = await fetch('/api/chat-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: lines }],
          systemPrompt: `You are a productivity assistant. Organize the following tasks into the best order for the user to tackle today. Return ONLY a JSON array of 1-based integers (the task numbers) in recommended order. Example for 5 tasks: [3,1,5,2,4]. Consider: overdue and due-today tasks first, then high-priority, cognitively heavy work while fresh, lighter tasks later, routines can bookend the day. No explanation, no markdown — just the JSON array.`,
          context: '',
          maxTokens: 150,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      let raw = json.reply.trim().replace(/```[a-z]*\n?/gi, '').replace(/\n?```/g, '').trim()
      const bStart = raw.indexOf('['), bEnd = raw.lastIndexOf(']')
      if (bStart >= 0 && bEnd > bStart) raw = raw.slice(bStart, bEnd + 1)
      const parsed = JSON.parse(raw)

      if (Array.isArray(parsed)) {
        const toId = n => {
          const idx = Number(n) - 1
          if (idx < 0 || idx >= candidates.length) return null
          const t = candidates[idx]
          return `${t._src}:${t.id}`
        }
        const ordered = parsed.map(toId).filter(Boolean)
        const orderedSet = new Set(ordered)
        const missing = candidates.map(t => `${t._src}:${t.id}`).filter(id => !orderedSet.has(id))
        setAiTodayOrder([...ordered, ...missing])
      }
    } catch {
      setAiTodayOrder(null)
    }
    setAiTodayLoading(false)
  }

  // ─────────────────────────────────────────────────────────
  // FOCUS mutations
  // ─────────────────────────────────────────────────────────
  async function addFocusTask() {
    const title = focusInput.trim()
    if (!title) return
    const { data, error } = await supabase.from('focus_tasks').insert({
      user_id: user.id,
      title,
      priority: focusPri,
      focus_date: TODAY,
      position: focusTasks.length,
    }).select().single()
    if (error) { setDbError(describeError(error)); return }
    if (data) setFocusTasks(f => [...f, data])
    setFocusInput('')
    setFocusPri('normal')
    notify()
  }

  async function toggleFocus(id, done) {
    await supabase.from('focus_tasks').update({ completed: !done }).eq('id', id)
    setFocusTasks(f => f.map(t => t.id === id ? { ...t, completed: !done } : t))
    notify()
  }

  async function deleteFocusTask(id) {
    await supabase.from('focus_tasks').delete().eq('id', id)
    setFocusTasks(f => f.filter(t => t.id !== id))
    notify()
  }

  async function updateFocusField(id, field, value) {
    await supabase.from('focus_tasks').update({ [field]: value }).eq('id', id)
    setFocusTasks(f => f.map(t => t.id === id ? { ...t, [field]: value } : t))
  }

  // Carryover
  async function doCarryover() {
    const toCarry = carryover.filter(t => carryoverSel.has(t.id))
    for (const t of toCarry) {
      const { data } = await supabase.from('focus_tasks').insert({
        user_id: user.id,
        title: t.title,
        priority: t.priority,
        notes: t.notes,
        focus_date: TODAY,
        task_list_id: t.task_list_id,
        position: focusTasks.length,
      }).select().single()
      if (data) setFocusTasks(f => [...f, data])
    }
    setShowCarryover(false)
    notify()
  }

  // ─────────────────────────────────────────────────────────
  // Computed
  // ─────────────────────────────────────────────────────────
  const routineDone  = routineTasks.filter(t => completedToday.has(t.id))
  const routinePend  = routineTasks.filter(t => !completedToday.has(t.id))
  const routineAll   = [...routinePend, ...routineDone]

  const activeTasks  = taskItems.filter(t => !t.completed)
  const doneTasks    = taskItems.filter(t => t.completed)
  const sortedActive = [...activeTasks].sort((a, b) => {
    const aToday = a.due_date === TODAY
    const bToday = b.due_date === TODAY
    if (aToday !== bToday) return aToday ? -1 : 1
    return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
  })

  const focusDone    = focusTasks.filter(t => t.completed).length
  const focusTotal   = focusTasks.length
  const focusPending = focusTasks.filter(t => !t.completed)
  const focusDoneList = focusTasks.filter(t => t.completed)

  // ── Overall ring ──
  const ringTotal = routineTasks.length + focusTotal
  const ringDone  = routineDone.length  + focusDone
  const ringPct   = ringTotal > 0 ? Math.round(ringDone / ringTotal * 100) : 0
  const RING_C    = 2 * Math.PI * 52

  // ── Today's candidates — only what's actually planned for today ──
  const todayCandidates = [
    ...focusPending.map(t => ({ ...t, _src: 'focus' })),
    ...routinePend.map(t => ({ ...t, _src: 'routine' })),
  ].slice(0, 15)

  // ── AI-ordered display list (fallback: focus → task → routine, by priority) ──
  const aiOrderedTasks = (() => {
    if (!aiTodayOrder) {
      const srcRank = { focus: 0, task: 1, routine: 2 }
      return [...todayCandidates].sort((a, b) => {
        if (srcRank[a._src] !== srcRank[b._src]) return srcRank[a._src] - srcRank[b._src]
        return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
      })
    }
    const idMap = new Map(todayCandidates.map(t => [`${t._src}:${t.id}`, t]))
    const ordered = aiTodayOrder.map(id => idMap.get(id)).filter(Boolean)
    const orderedSet = new Set(aiTodayOrder)
    const newTasks = todayCandidates.filter(t => !orderedSet.has(`${t._src}:${t.id}`))
    return [...ordered, ...newTasks]
  })()

  // ── Auto-fetch AI order once after data loads ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loading && !dbError && !aiOrderFetchedRef.current) {
      aiOrderFetchedRef.current = true
      runAITodayOrder(todayCandidates)
    }
  }, [loading, dbError])

  // ─────────────────────────────────────────────────────────
  // Shared styles
  // ─────────────────────────────────────────────────────────
  const sectionLabel = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.16em', color: 'var(--text-light)', marginBottom: 12,
  }

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <h1>To-Do</h1>
      </div>

      <div className="page-body">

        {/* ── Tab bar — at the top, consistent with every other page ── */}
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          <button className={`tab-btn${tab === 'routine' ? ' active' : ''}`} onClick={() => setTab('routine')}>
            Daily Routine
          </button>
          <button className={`tab-btn${tab === 'tasks' ? ' active' : ''}`} onClick={() => setTab('tasks')}>
            Task List
          </button>
          <button className={`tab-btn${tab === 'focus' ? ' active' : ''}`} onClick={() => setTab('focus')}>
            Today's Focus
            {focusPending.length > 0 && (
              <span style={{ marginLeft: 6, background: theme === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)', borderRadius: 99, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                {focusPending.length}
              </span>
            )}
          </button>
        </div>

        {/* ════════════════════════════════════════════
            OVERVIEW — ring + ranked list + weekly chart
        ════════════════════════════════════════════ */}
        {!loading && !dbError && (
          <>
            {/* Row 1: ring + ranked tasks */}
            <div className="overview-grid" style={{ display: 'grid', gridTemplateColumns: '196px 1fr', gap: 16, alignItems: 'start' }}>

              {/* Progress ring */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '22px 16px 18px', gap: 10 }}>
                <div style={{ position: 'relative', width: 130, height: 130 }}>
                  <svg viewBox="0 0 120 120" width="130" height="130">
                    <defs>
                      <filter id="ovRingGlow">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    {/* track */}
                    <circle cx="60" cy="60" r="52" fill="none" stroke={theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)'} strokeWidth="8" />
                    {/* 85% target tick */}
                    <circle cx="60" cy="60" r="52" fill="none"
                      stroke={theme === 'light' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.22)'} strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`3 ${RING_C - 3}`}
                      strokeDashoffset={-(RING_C * 0.85 - 1.5)}
                      transform="rotate(-90 60 60)"
                    />
                    {/* fill */}
                    {ringTotal > 0 && (
                      <circle cx="60" cy="60" r="52" fill="none"
                        stroke={pctColor(ringPct)}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={RING_C}
                        strokeDashoffset={RING_C * (1 - ringPct / 100)}
                        transform="rotate(-90 60 60)"
                        filter="url(#ovRingGlow)"
                        style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.7s ease' }}
                      />
                    )}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: pctColor(ringPct) }}>
                      {ringPct}%
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-light)', marginTop: 3 }}>
                      {pctPhase(ringPct, ringTotal)}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-light)', marginTop: 2 }}>
                      {ringDone}/{ringTotal}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                  {ringTotal === 0 ? 'Add tasks to start' :
                   ringPct === 100 ? '✓ All done — great day' :
                   ringPct >= 85 ? '⚡ Above 85% target' :
                   `${ringTotal - ringDone} left to hit target`}
                </div>
              </div>

              {/* Today's To-Do — AI ordered */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ ...sectionLabel, marginBottom: 0 }}>Today's To-Do</div>
                  <button
                    onClick={() => runAITodayOrder(todayCandidates)}
                    disabled={aiTodayLoading}
                    title={aiTodayOrder ? 'Re-organize with AI' : 'Organize with AI'}
                    style={{
                      background: 'none', border: 'none', cursor: aiTodayLoading ? 'default' : 'pointer',
                      color: aiTodayOrder ? 'var(--accent)' : 'var(--text-light)',
                      padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      opacity: aiTodayLoading ? 0.55 : 1, fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { if (!aiTodayLoading) e.currentTarget.style.color = 'var(--accent)' }}
                    onMouseLeave={e => { if (!aiTodayLoading) e.currentTarget.style.color = aiTodayOrder ? 'var(--accent)' : 'var(--text-light)' }}
                  >
                    {aiTodayLoading ? (
                      <>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                        organizing
                      </>
                    ) : (
                      <>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 4 1 10 7 10"/>
                          <path d="M3.51 15a9 9 0 1 0 .49-4.84"/>
                        </svg>
                        {aiTodayOrder ? 'ai sorted' : 'organize'}
                      </>
                    )}
                  </button>
                </div>

                {aiOrderedTasks.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-light)', fontStyle: 'italic', padding: '8px 0' }}>
                    {ringTotal === 0 ? 'No tasks added yet' : 'All caught up — nothing left to do!'}
                  </div>
                ) : (
                  <div style={{
                    maxHeight: 168,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    scrollbarWidth: 'thin',
                    scrollbarColor: theme === 'light' ? 'rgba(0,0,0,0.2) transparent' : 'rgba(255,255,255,0.12) transparent',
                    marginRight: -4,
                    paddingRight: 4,
                  }}>
                    {aiOrderedTasks.map((task, i) => {
                      const srcLabel = task._src === 'focus' ? "Today's Plan" : task._src === 'routine' ? 'Daily Routine' : 'Task List'
                      const srcColor = task._src === 'focus' ? 'var(--accent)' : task._src === 'routine' ? '#3b82f6' : 'var(--text-light)'

                      const ovKey = `${task._src}:${task.id}`
                      function handleComplete() {
                        if (task._src === 'routine') toggleRoutine(task.id)
                        else if (task._src === 'focus') toggleFocus(task.id, false)
                        else toggleTaskItem(task.id, false)
                      }

                      return (
                        <SwipeRow key={ovKey} onComplete={() => completeTask(ovKey, handleComplete)}>
                          <div
                            className={completing.has(ovKey) ? 'task-completing' : undefined}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '9px 0',
                              borderBottom: i < aiOrderedTasks.length - 1 ? '1px solid var(--border)' : 'none',
                            }}
                          >
                            <button
                              onClick={() => completeTask(ovKey, handleComplete)}
                              title="Mark done"
                              style={{
                                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                border: '1.5px solid var(--border)', background: 'transparent',
                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', padding: 0, transition: 'border-color .15s, background .15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--success)'; e.currentTarget.style.background = 'rgba(107,227,164,0.12)' }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent' }}
                            >
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 700, color: 'var(--text-light)', lineHeight: 1 }}>
                                {i + 1}
                              </span>
                            </button>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.title}
                              </div>
                              <div style={{ fontSize: 11, color: srcColor, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span>{srcLabel}</span>
                                {task.due_date === TODAY && <span style={{ color: 'var(--warning)' }}>· Due today</span>}
                                {task.due_date && task.due_date < TODAY && <span style={{ color: 'var(--danger)' }}>· Overdue</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              {task._src !== 'routine' && <PriBadge priority={task.priority || 'normal'} />}
                              <span style={{ fontSize: 10, color: theme === 'light' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.18)', userSelect: 'none' }}>›</span>
                            </div>
                          </div>
                        </SwipeRow>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: weekly chart */}
            <WeeklyChart data={weekData} />
          </>
        )}

        {/* ── Error banner ── */}
        {dbError && (
          <div style={{
            padding: '12px 16px', borderRadius: 'var(--radius)',
            background: dbError.setup ? 'rgba(242,192,99,0.1)' : 'var(--danger-light)',
            border: `1px solid ${dbError.setup ? 'rgba(242,192,99,0.3)' : 'rgba(255,107,107,0.3)'}`,
            borderLeft: `3px solid ${dbError.setup ? 'var(--warning)' : 'var(--danger)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <span style={{ fontSize: 13, color: dbError.setup ? 'var(--warning)' : 'var(--danger)', lineHeight: 1.5 }}>
              {dbError.setup ? '⚠ ' : '✕ '}{dbError.text}
            </span>
            <button onClick={() => setDbError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 16, flexShrink: 0, padding: '0 4px' }}>×</button>
          </div>
        )}

        {loading ? (
          <SkeletonList rows={4} lines={1} />
        ) : (
          <>
            {/* ══════════════════════════════════════════════
                TAB 1 — DAILY ROUTINE
            ══════════════════════════════════════════════ */}
            {tab === 'routine' && (
              <div className="card">
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={sectionLabel}>Daily Routine — {formatShortDate(TODAY)}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', color: routineDone.length === routineTasks.length && routineTasks.length > 0 ? 'var(--success)' : 'var(--text)', lineHeight: 1 }}>
                        {routineDone.length}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--text-light)' }}>/ {routineTasks.length}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: routineDone.length === routineTasks.length && routineTasks.length > 0 ? 'var(--success)' : 'var(--text-light)', marginLeft: 4 }}>
                        {routineTasks.length === 0 ? 'no tasks yet' : routineDone.length === routineTasks.length ? 'all done' : 'done today'}
                      </span>
                    </div>
                  </div>
                </div>

                <SegBar total={routineTasks.length} done={routineDone.length} />

                {routineTasks.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-light)', fontStyle: 'italic', padding: '8px 0 14px' }}>
                    No routine tasks yet — add things you want to do every day.
                  </div>
                ) : (
                  routineAll.map((task, idx) => {
                    const done = completedToday.has(task.id)
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => routineDragStart(e, idx)}
                        onDragOver={e => routineDragOver_(e, idx)}
                        onDragLeave={() => setRoutineDragOver(null)}
                        onDrop={e => routineDrop(e, idx)}
                        onDragEnd={() => { setRoutineDragFrom(null); setRoutineDragOver(null) }}
                        className={`goal-row${completing.has(task.id) ? ' task-completing' : ''}`}
                        style={{
                          opacity: done ? 0.52 : 1,
                          background: done ? 'rgba(107,227,164,0.04)' : undefined,
                          borderTopWidth: routineDragOver === idx ? 2 : 1,
                          borderTopColor: routineDragOver === idx ? 'var(--accent)' : undefined,
                        }}
                      >
                        <span className="drag-handle">⋮⋮</span>
                        <input type="checkbox" className="goal-check" checked={done}
                          onChange={() => {
                            if (!done) completeTask(task.id, () => toggleRoutine(task.id))
                            else toggleRoutine(task.id)
                          }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <EditableText
                            value={task.title}
                            onSave={v => saveRoutineTitle(task.id, v)}
                            style={{ fontSize: 13.5, fontWeight: 500, color: done ? 'var(--text-muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', textDecorationColor: theme === 'light' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)' }}
                          />
                          {task.note && (
                            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>{task.note}</div>
                          )}
                          {!task.note && !done && (
                            <EditableText
                              value=""
                              onSave={v => saveRoutineNote(task.id, v)}
                              placeholder="Add a note…"
                              style={{ fontSize: 11 }}
                            />
                          )}
                        </div>
                        <button className="goal-del" onClick={() => deleteRoutineTask(task.id)}>×</button>
                      </div>
                    )
                  })
                )}

                {/* Add row */}
                <div className="goal-add-row">
                  <input
                    value={routineInput}
                    onChange={e => setRoutineInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addRoutineTask()}
                    placeholder="Add a daily routine task…"
                  />
                  <button className="btn btn-white btn-sm" onClick={addRoutineTask}>+ Add</button>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════
                TAB 2 — TASK LIST
            ══════════════════════════════════════════════ */}
            {tab === 'tasks' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Button row — shown when no form is open */}
                {!showAddTask && !showDump && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAddTask(true)}>
                      + New Task
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => setShowDump(true)}
                    >
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                        <line x1="12" y1="11" x2="12" y2="17"/>
                        <line x1="9"  y1="14" x2="15" y2="14"/>
                      </svg>
                      Smart Import
                    </button>
                  </div>
                )}

                {/* Add task form */}
                {showAddTask && (
                  <div className="card" style={{ borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' }}>
                    <div style={sectionLabel}>New Task</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input
                        autoFocus
                        value={taskForm.title}
                        onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addTaskItem()}
                        placeholder="Task name…"
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div style={{ ...sectionLabel, marginBottom: 5 }}>Priority</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {['high', 'normal', 'low'].map(p => (
                              <button
                                key={p}
                                onClick={() => setTaskForm(f => ({ ...f, priority: p }))}
                                style={{
                                  flex: 1, padding: '5px 0', borderRadius: 'var(--radius)',
                                  border: `1px solid ${taskForm.priority === p ? PRIORITY_COLOR[p] : 'var(--border)'}`,
                                  background: taskForm.priority === p ? `${PRIORITY_COLOR[p]}22` : 'transparent',
                                  color: taskForm.priority === p ? PRIORITY_COLOR[p] : 'var(--text-muted)',
                                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                  textTransform: 'uppercase', letterSpacing: '0.06em',
                                }}
                              >{p}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ ...sectionLabel, marginBottom: 5 }}>Due Date</div>
                          <input
                            type="date"
                            value={taskForm.due_date}
                            onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
                            style={{ padding: '5px 8px', fontSize: 13 }}
                          />
                        </div>
                      </div>
                      <textarea
                        value={taskForm.notes}
                        onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Notes (optional)…"
                        style={{ minHeight: 56, fontSize: 13 }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddTask(false); setTaskForm({ title: '', priority: 'normal', due_date: '', notes: '' }) }}>Cancel</button>
                        <button className="btn btn-primary btn-sm" onClick={addTaskItem} disabled={!taskForm.title.trim()}>Add Task</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Smart Import dump box ── */}
                {showDump && (
                  <div className="card" style={{ borderColor: 'var(--accent)', boxShadow: '0 0 0 1px rgba(99,102,241,0.35)' }}>

                    {/* Step 1: paste text */}
                    {parsedTasks === null && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
                                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                              </svg>
                              Smart Import
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                              Paste anything — notes, messages, lists, brain dumps. AI organizes it into tasks.
                            </div>
                          </div>
                          <button onClick={closeDump} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, padding: '2px 6px', lineHeight: 1, flexShrink: 0 }}>×</button>
                        </div>

                        <textarea
                          autoFocus
                          value={dumpText}
                          onChange={e => setDumpText(e.target.value)}
                          placeholder={"Paste notes, messages, or a brain dump — AI sorts it into tasks."}
                          style={{ minHeight: 140, fontSize: 13, resize: 'vertical', width: '100%', boxSizing: 'border-box', marginBottom: 10, lineHeight: 1.6 }}
                        />

                        {parseError && (
                          <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8, padding: '6px 10px', background: 'var(--danger-light)', borderRadius: 6 }}>
                            {parseError}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={closeDump}>Cancel</button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={runParseAI}
                            disabled={!dumpText.trim() || parseLoading}
                            style={{ minWidth: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            {parseLoading ? (
                              <>
                                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                  strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                                </svg>
                                Organizing…
                              </>
                            ) : 'Organize →'}
                          </button>
                        </div>
                      </>
                    )}

                    {/* Step 2: review parsed tasks */}
                    {parsedTasks !== null && (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>Review Tasks</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                              {parsedTasks.length === 0
                                ? 'No tasks found — try adding more detail'
                                : `${parsedTasks.length} task${parsedTasks.length !== 1 ? 's' : ''} found — edit, remove, then add all`}
                            </div>
                          </div>
                          <button onClick={closeDump} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, padding: '2px 6px', lineHeight: 1, flexShrink: 0 }}>×</button>
                        </div>

                        {parsedTasks.length === 0 ? (
                          <div style={{ padding: '16px 0', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Nothing extracted. Try pasting more specific text with clear actions.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                            {parsedTasks.map((t, i) => (
                              <div key={i} style={{
                                padding: '10px 12px', borderRadius: 'var(--radius)',
                                background: theme === 'light' ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.04)',
                                border: '1px solid var(--border)',
                                borderLeft: `3px solid ${PRIORITY_COLOR[t.priority]}`,
                              }}>
                                {/* Title row */}
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: (t.due_date || t.notes) ? 7 : 0 }}>
                                  <input
                                    value={t.title}
                                    onChange={e => updateParsedTask(i, 'title', e.target.value)}
                                    style={{ flex: 1, fontSize: 13, fontWeight: 500, background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0, padding: '1px 0', color: 'var(--text)' }}
                                  />
                                  <select
                                    value={t.priority}
                                    onChange={e => updateParsedTask(i, 'priority', e.target.value)}
                                    style={{ fontSize: 11, padding: '3px 6px', width: 80, borderRadius: 5, flexShrink: 0 }}
                                  >
                                    <option value="high">High</option>
                                    <option value="normal">Normal</option>
                                    <option value="low">Low</option>
                                  </select>
                                  <button
                                    onClick={() => removeParsedTask(i)}
                                    title="Remove"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 17, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                                  >×</button>
                                </div>

                                {/* Meta row */}
                                {(t.due_date !== undefined || t.notes) && (
                                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Due</span>
                                      <input
                                        type="date"
                                        value={t.due_date || ''}
                                        onChange={e => updateParsedTask(i, 'due_date', e.target.value)}
                                        style={{ fontSize: 11, padding: '2px 5px', width: 130 }}
                                      />
                                    </div>
                                    {t.notes && (
                                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {t.notes}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setParsedTasks(null)} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            ← Edit text
                          </button>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-ghost btn-sm" onClick={closeDump}>Cancel</button>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={confirmParsedTasks}
                              disabled={parsedTasks.length === 0}
                            >
                              Add {parsedTasks.length} Task{parsedTasks.length !== 1 ? 's' : ''}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Active tasks */}
                <div className="card">
                  <div style={sectionLabel}>
                    Tasks — {sortedActive.length} active
                  </div>

                  {sortedActive.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-light)', fontStyle: 'italic', padding: '8px 0 4px' }}>
                      All caught up — no active tasks.
                    </div>
                  ) : (
                    sortedActive.map(task => {
                      const isToday = task.due_date === TODAY
                      const isOverdue = task.due_date && task.due_date < TODAY
                      const expanded = expandedTask === task.id
                      const alreadyInFocus = focusTasks.some(f => f.task_list_id === task.id && !f.completed)
                      return (
                        <div key={task.id}
                          className={completing.has(task.id) ? 'task-completing' : undefined}
                          style={{
                            padding: '12px 14px', marginBottom: 8,
                            background: isToday ? 'rgba(242,192,99,0.07)' : theme === 'light' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${isToday ? 'rgba(242,192,99,0.25)' : isOverdue ? 'rgba(255,107,107,0.2)' : theme === 'light' ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.07)'}`,
                            borderLeft: `3px solid ${isToday ? 'var(--warning)' : isOverdue ? 'var(--danger)' : PRIORITY_COLOR[task.priority]}`,
                            borderRadius: 'var(--radius)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="checkbox" className="goal-check" checked={false}
                              onChange={() => completeTask(task.id, () => toggleTaskItem(task.id, false))}
                              style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <EditableText
                                value={task.title}
                                onSave={v => updateTaskField(task.id, 'title', v)}
                                style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                <PriBadge priority={task.priority} />
                                {task.due_date && (
                                  <span style={{ fontSize: 11, color: isOverdue ? 'var(--danger)' : isToday ? 'var(--warning)' : 'var(--text-light)', fontWeight: 600 }}>
                                    {isToday ? '📌 Due today' : isOverdue ? `⚠ ${formatShortDate(task.due_date)}` : formatShortDate(task.due_date)}
                                  </span>
                                )}
                                {task.notes && (
                                  <button onClick={() => setExpandedTask(expanded ? null : task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 11, fontFamily: 'inherit', padding: 0 }}>
                                    {expanded ? '▴ hide notes' : '▾ notes'}
                                  </button>
                                )}
                              </div>
                              {expanded && task.notes && (
                                <div style={{ marginTop: 8, padding: '8px 10px', background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                  {task.notes}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <button
                                onClick={() => addToFocus(task)}
                                title={alreadyInFocus ? "Already on today's plan" : "Add to today's plan"}
                                disabled={alreadyInFocus}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 5,
                                  padding: '5px 11px', fontSize: 11, fontWeight: 700,
                                  borderRadius: 'var(--radius)', fontFamily: 'inherit',
                                  cursor: alreadyInFocus ? 'default' : 'pointer',
                                  border: `1px solid ${alreadyInFocus ? 'var(--success)' : 'var(--accent)'}`,
                                  background: alreadyInFocus
                                    ? 'var(--success-light)'
                                    : 'rgba(99,102,241,0.12)',
                                  color: alreadyInFocus ? 'var(--success)' : 'var(--accent)',
                                  transition: 'all .15s',
                                }}
                                onMouseEnter={e => { if (!alreadyInFocus) e.currentTarget.style.background = 'rgba(99,102,241,0.22)' }}
                                onMouseLeave={e => { if (!alreadyInFocus) e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
                              >
                                {alreadyInFocus ? (
                                  <>
                                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                    On Plan
                                  </>
                                ) : (
                                  <>
                                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                      <line x1="16" y1="2" x2="16" y2="6"/>
                                      <line x1="8"  y1="2" x2="8"  y2="6"/>
                                      <line x1="3"  y1="10" x2="21" y2="10"/>
                                      <line x1="12" y1="15" x2="12" y2="19"/>
                                      <line x1="10" y1="17" x2="14" y2="17"/>
                                    </svg>
                                    Plan Today
                                  </>
                                )}
                              </button>
                              <button className="goal-del" onClick={() => deleteTaskItem(task.id)} style={{ opacity: 0.5 }}>×</button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}

                  {/* Completed section */}
                  {doneTasks.length > 0 && (
                    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <button
                        onClick={() => setShowCompleted(s => !s)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        {showCompleted ? '▴' : '▾'} Completed ({doneTasks.length})
                      </button>
                      {showCompleted && doneTasks.map(task => (
                        <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 4, background: theme === 'light' ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', opacity: 0.55 }}>
                          <input type="checkbox" className="goal-check" checked onChange={() => toggleTaskItem(task.id, true)} />
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)', textDecoration: 'line-through' }}>{task.title}</span>
                          <button className="goal-del" onClick={() => deleteTaskItem(task.id)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════
                TAB 3 — TODAY'S FOCUS
            ══════════════════════════════════════════════ */}
            {tab === 'focus' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Carryover banner */}
                {showCarryover && carryover.length > 0 && (
                  <div style={{
                    padding: '14px 16px',
                    background: 'rgba(242,192,99,0.08)',
                    border: '1px solid rgba(242,192,99,0.28)',
                    borderRadius: 'var(--radius-lg)',
                    borderLeft: '3px solid var(--warning)',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warning)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      ↪ {carryover.length} unfinished task{carryover.length > 1 ? 's' : ''} from yesterday
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                      {carryover.map(t => (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={carryoverSel.has(t.id)}
                            onChange={() => setCarryoverSel(s => {
                              const n = new Set(s)
                              if (n.has(t.id)) n.delete(t.id); else n.add(t.id)
                              return n
                            })}
                            style={{ flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t.title}</span>
                          <PriBadge priority={t.priority} />
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-white btn-sm"
                        onClick={doCarryover}
                        disabled={carryoverSel.size === 0}
                      >
                        Carry Over ({carryoverSel.size})
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowCarryover(false)}>Dismiss</button>
                    </div>
                  </div>
                )}

                {/* Focus card */}
                <div className={`card${focusDone === focusTotal && focusTotal > 0 ? ' all-done' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={sectionLabel}>Today's Focus — {formatShortDate(TODAY)}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span className="progress-num" style={{ color: focusDone === focusTotal && focusTotal > 0 ? 'var(--success)' : undefined }}>
                          {focusDone}
                        </span>
                        <span className="progress-denom">/ {focusTotal}</span>
                        <span className="progress-label" style={{ marginLeft: 4, color: focusDone === focusTotal && focusTotal > 0 ? 'var(--success)' : undefined }}>
                          {focusTotal === 0 ? 'nothing yet' : focusDone === focusTotal ? 'all done' : 'complete'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <SegBar total={focusTotal} done={focusDone} />

                  {focusTotal === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text-light)', fontStyle: 'italic', padding: '8px 0 14px' }}>
                      Add tasks you want to focus on today, or pull them in from the Task List.
                    </div>
                  ) : (
                    <>
                      {/* Pending */}
                      {focusPending.map(task => (
                        <FocusRow
                          key={task.id}
                          task={task}
                          onToggle={() => toggleFocus(task.id, task.completed)}
                          onDelete={() => deleteFocusTask(task.id)}
                          onUpdate={(field, val) => updateFocusField(task.id, field, val)}
                        />
                      ))}
                      {/* Done */}
                      {focusDoneList.map(task => (
                        <FocusRow
                          key={task.id}
                          task={task}
                          onToggle={() => toggleFocus(task.id, task.completed)}
                          onDelete={() => deleteFocusTask(task.id)}
                          onUpdate={(field, val) => updateFocusField(task.id, field, val)}
                        />
                      ))}
                    </>
                  )}

                  {/* Add row */}
                  <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)', marginTop: 4, display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    <input
                      value={focusInput}
                      onChange={e => setFocusInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addFocusTask()}
                      placeholder="Add a focus task…"
                      style={{ flex: 1 }}
                    />
                    <select
                      value={focusPri}
                      onChange={e => setFocusPri(e.target.value)}
                      style={{ width: 88, fontSize: 12, padding: '8px 6px' }}
                    >
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                    <button className="btn btn-white btn-sm" onClick={addFocusTask}>+ Add</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}

// ── Swipeable row (swipe right to complete) ──────────────────
function SwipeRow({ onComplete, children }) {
  const [offsetX, setOffsetX] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [gone, setGone] = useState(false)
  const startRef  = useRef({ x: 0, y: 0 })
  const dirRef    = useRef(null)   // 'h' | 'v' | null
  const THRESHOLD = 72

  function onTouchStart(e) {
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    dirRef.current   = null
    setTransitioning(false)
  }

  function onTouchMove(e) {
    if (gone) return
    const dx = e.touches[0].clientX - startRef.current.x
    const dy = e.touches[0].clientY - startRef.current.y

    // Lock direction on first real movement
    if (!dirRef.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      dirRef.current = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
    }
    if (dirRef.current !== 'h') return

    // Only allow rightward swipe
    const next = Math.max(0, Math.min(dx, 180))
    setOffsetX(next)
  }

  function onTouchEnd() {
    if (dirRef.current !== 'h') return
    setTransitioning(true)
    if (offsetX >= THRESHOLD) {
      // Fly off to the right, then fire callback
      setOffsetX(480)
      setTimeout(() => {
        setGone(true)
        onComplete()
      }, 300)
    } else {
      // Snap back
      setOffsetX(0)
    }
  }

  if (gone) return null

  const revealOpacity = Math.min(offsetX / THRESHOLD, 1)

  return (
    <div style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {/* Reveal layer */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'var(--success-light)',
        display: 'flex', alignItems: 'center', gap: 8,
        paddingLeft: 20,
        opacity: revealOpacity,
        transition: transitioning ? 'opacity 0.3s' : 'none',
        borderRadius: 'inherit',
      }}>
        <span style={{ fontSize: 18, color: 'var(--success)', fontWeight: 700 }}>✓</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Done</span>
      </div>
      {/* Sliding content */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: transitioning ? 'transform 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none',
          position: 'relative', zIndex: 1,
          touchAction: 'pan-y',
          background: 'var(--bg)',
          borderRadius: 'inherit',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ── Weekly completion chart ──────────────────────────────────
function WeeklyChart({ data }) {
  const { theme } = useApp()
  const isDark = theme !== 'light'
  if (!data.length) return null

  const pastBar   = isDark ? 'rgba(255,255,255,0.1)'  : 'rgba(0,0,0,0.1)'
  const refStroke = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.2)'
  const refFill   = isDark ? 'rgba(255,255,255,0.35)' : 'var(--text-light)'
  const cursorFill  = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
  const tooltipBg   = isDark ? '#18181f' : 'rgba(255,255,255,0.98)'
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'
  const tooltipText   = isDark ? '#FAFAFA' : 'var(--text)'

  return (
    <div className="card">
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.16em', color: 'var(--text-light)', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>Weekly Completion</span>
        <span style={{ color: refFill, fontSize: 9 }}>— 85% target</span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 0, left: -28, bottom: 0 }} barCategoryGap="28%">
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--text-light)', fontSize: 11, fontWeight: 600 }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={[0, 100]} tickCount={3}
            tick={{ fill: 'var(--text-light)', fontSize: 10 }}
            axisLine={false} tickLine={false}
            tickFormatter={v => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: cursorFill }}
            contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8, fontSize: 12, color: tooltipText }}
            formatter={(value, _name, entry) => [`${value}%`, entry.payload.isToday ? 'Today' : 'Completion']}
            labelStyle={{ color: 'var(--text-muted)' }}
          />
          <ReferenceLine
            y={85} stroke={refStroke} strokeDasharray="4 3" strokeWidth={1.5}
            label={{ value: '85%', position: 'right', fill: refFill, fontSize: 10 }}
          />
          <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((entry, i) => (
              <Cell key={i}
                fill={entry.isToday
                  ? (entry.pct >= 85 ? '#6BE3A4' : entry.pct >= 60 ? 'var(--accent)' : entry.pct >= 30 ? 'var(--warning)' : 'var(--danger)')
                  : pastBar}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Focus task row (sub-component) ──────────────────────────
function FocusRow({ task, onToggle, onDelete, onUpdate }) {
  const { theme } = useApp()
  const [showNote,   setShowNote]   = useState(false)
  const [completing, setCompleting] = useState(false)
  const done = task.completed

  function handleCheck() {
    if (!done) {
      setCompleting(true)
      setTimeout(() => { onToggle(); setCompleting(false) }, 300)
    } else {
      onToggle()
    }
  }

  return (
    <div
      className={`goal-row${completing ? ' task-completing' : ''}`}
      style={{
        opacity: done ? 0.52 : 1,
        background: done ? 'rgba(107,227,164,0.04)' : undefined,
        borderLeft: `3px solid ${PRIORITY_COLOR[task.priority] || 'var(--accent)'}`,
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 0,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" className="goal-check" checked={done} onChange={handleCheck} />
        <EditableText
          value={task.title}
          onSave={v => onUpdate('title', v)}
          style={{
            flex: 1, fontSize: 13.5, fontWeight: 500,
            color: done ? 'var(--text-muted)' : 'var(--text)',
            textDecoration: done ? 'line-through' : 'none',
            textDecorationColor: theme === 'light' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)',
          }}
        />
        <PriBadge priority={task.priority} />
        <button
          onClick={() => setShowNote(s => !s)}
          title="Notes"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: task.notes ? 'var(--accent)' : 'var(--text-light)', fontSize: 13, opacity: 0.7, padding: '2px 4px', flexShrink: 0 }}
        >
          {task.notes ? '📝' : '○'}
        </button>
        <button className="goal-del" onClick={onDelete}>×</button>
      </div>
      {(showNote || task.notes) && (
        <div style={{ marginTop: 8, paddingLeft: 30 }}>
          <textarea
            defaultValue={task.notes || ''}
            onBlur={e => onUpdate('notes', e.target.value)}
            placeholder="Add a note…"
            style={{ fontSize: 12, minHeight: 48, padding: '6px 8px', resize: 'vertical' }}
          />
        </div>
      )}
    </div>
  )
}

