import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getActiveDate } from '../lib/dateUtils'

const TODAY = getActiveDate()
const SCHED_KEY = 'schedule-planner'

function mkId() { return Math.random().toString(36).slice(2, 11) }

// Always returns YYYY-MM-DD regardless of what Claude hands back
function normDate(s) {
  if (!s) return TODAY
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  try {
    const d = new Date(s)
    if (isNaN(d.getTime())) return TODAY
    return d.toISOString().split('T')[0]
  } catch { return TODAY }
}

const HINTS = [
  'bench press 3x8 @ 225',
  'add todo: call dentist',
  '$45 Chipotle food',
  'gym tomorrow morning',
]

export default function ActionChat({ userId }) {
  const [input, setInput]         = useState('')
  const [messages, setMessages]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [exercises, setExercises] = useState([])
  const bottomRef                 = useRef(null)
  const inputRef                  = useRef(null)

  // Load user's exercise library once so the AI can match names
  useEffect(() => {
    if (!userId) return
    supabase.from('exercises').select('id, name').eq('user_id', userId)
      .then(({ data }) => setExercises(data || []))
  }, [userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const msg = (text ?? input).trim()
    if (!msg || loading || !userId) return
    setInput('')
    setLoading(true)
    setMessages(m => [...m, { role: 'user', content: msg }])

    try {
      const res = await fetch('/api/log-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          today: TODAY,
          dayOfWeek: new Date(TODAY + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }),
          exercises: exercises.map(e => e.name),
        }),
      })
      const action = await res.json()
      if (!res.ok) throw new Error(action.error || 'Request failed')

      if (action.type === 'unknown') {
        setMessages(m => [...m, { role: 'assistant', content: action.message, status: 'info' }])
        setLoading(false)
        return
      }

      console.log('[AI Log] parsed action:', action)
      await executeAction(action)
      setMessages(m => [...m, { role: 'assistant', content: action.message, status: 'success' }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Could not log: ${err.message}`, status: 'error' }])
    }

    setLoading(false)
  }

  async function executeAction(action) {
    if (action.type === 'log_workout') {
      const rawName = (action.exercise || '').trim()
      if (!rawName) throw new Error('No exercise name returned')

      // Find closest existing exercise (case-insensitive)
      let ex = exercises.find(e => e.name.toLowerCase() === rawName.toLowerCase())
      if (!ex) {
        // Try partial match
        ex = exercises.find(e =>
          e.name.toLowerCase().includes(rawName.toLowerCase()) ||
          rawName.toLowerCase().includes(e.name.toLowerCase())
        )
      }
      if (!ex) {
        // Create new exercise
        const { data, error } = await supabase.from('exercises').insert({
          user_id: userId, name: rawName, muscle_group: 'Other',
        }).select().single()
        if (error) throw new Error(error.message)
        ex = data
        setExercises(prev => [...prev, ex])
      }

      const date = normDate(action.date)
      const { data: existing } = await supabase
        .from('workout_sets')
        .select('id')
        .eq('exercise_id', ex.id)
        .eq('user_id', userId)
        .eq('logged_date', date)
      const baseSetNum = (existing || []).length

      const sets = action.sets || []
      if (sets.length === 0) throw new Error('No sets parsed')

      await Promise.all(sets.map((s, i) =>
        supabase.from('workout_sets').insert({
          user_id: userId,
          exercise_id: ex.id,
          logged_date: date,
          set_number: baseSetNum + i + 1,
          weight: parseFloat(s.weight) || 0,
          reps: parseInt(s.reps) || 0,
        })
      ))
    }

    else if (action.type === 'add_todo') {
      const { error } = await supabase.from('task_list').insert({
        user_id: userId,
        title: action.title,
        priority: action.priority || 'normal',
        due_date: action.due_date || null,
        notes: null,
        position: 9999,
      })
      if (error) throw new Error(error.message)
    }

    else if (action.type === 'add_transaction') {
      const txType = action.transaction_type === 'income' ? 'income' : 'expense'
      const amount = parseFloat(action.amount)
      if (isNaN(amount) || amount <= 0) throw new Error(`Invalid amount: ${action.amount}`)
      const { error } = await supabase.from('budget_entries').insert({
        user_id: userId,
        type: txType,
        amount,
        category: action.category || 'Other',
        description: action.description || null,
        date: normDate(action.date),
      })
      if (error) throw new Error(`${error.message} (code: ${error.code})`)
    }

    else if (action.type === 'add_schedule') {
      let store = {}
      try { store = JSON.parse(localStorage.getItem(SCHED_KEY) || '{}') } catch {}
      const days = { ...(store.days || {}) }
      const date = normDate(action.date)
      const sec  = action.section || 'morning'
      if (!days[date]) {
        days[date] = { morning: [], work: [], afternoon: [], nightly: [], todo: [] }
      }
      days[date][sec] = [
        ...(days[date][sec] || []),
        { id: mkId(), title: action.title, completed: false, time: action.time || null, tag: null, source: 'ai' },
      ]
      localStorage.setItem(SCHED_KEY, JSON.stringify({ ...store, days }))
    }

    else {
      throw new Error(`Unknown action type: ${action.type}`)
    }
  }

  const displayed = messages.slice(-6)
  const hasMessages = messages.length > 0

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 8px rgba(99,102,241,0.7)',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-light)' }}>
          AI Log
        </span>
        {hasMessages && (
          <button
            onClick={() => setMessages([])}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10, padding: '2px 4px' }}
          >
            clear
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px 12px' }}>

        {/* Hint chips — shown only when no messages */}
        {!hasMessages && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {HINTS.map(h => (
              <button
                key={h}
                onClick={() => send(h)}
                disabled={loading}
                style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.18)',
                  color: 'var(--text-muted)',
                  borderRadius: 20, padding: '4px 10px',
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'border-color .15s, color .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.18)'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                {h}
              </button>
            ))}
          </div>
        )}

        {/* Message thread */}
        {hasMessages && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
            {displayed.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%',
                  padding: '7px 11px',
                  borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                  fontSize: 12.5, lineHeight: 1.45,
                  background: m.role === 'user'
                    ? 'var(--accent)'
                    : m.status === 'success'
                      ? 'rgba(107,227,164,0.1)'
                      : m.status === 'error'
                        ? 'rgba(255,107,107,0.1)'
                        : 'rgba(255,255,255,0.06)',
                  color: m.role === 'user'
                    ? '#fff'
                    : m.status === 'success'
                      ? 'var(--success)'
                      : m.status === 'error'
                        ? 'var(--danger)'
                        : 'var(--text)',
                  border: m.role === 'user'
                    ? 'none'
                    : `1px solid ${m.status === 'success' ? 'rgba(107,227,164,0.2)' : m.status === 'error' ? 'rgba(255,107,107,0.2)' : 'rgba(255,255,255,0.07)'}`,
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '7px 14px',
                  borderRadius: '12px 12px 12px 3px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  fontSize: 16, color: 'var(--text-muted)', letterSpacing: 4,
                }}>
                  ···
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Input row */}
        <div style={{ display: 'flex', gap: 7 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={loading ? 'Logging…' : 'Log a workout, todo, expense, or schedule…'}
            disabled={loading}
            style={{
              flex: 1, fontSize: 13, padding: '9px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 9, color: 'var(--text)',
              fontFamily: 'inherit', minWidth: 0,
              outline: 'none',
              transition: 'border-color .15s',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.5)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              background: 'var(--accent)', border: 'none', borderRadius: 9,
              cursor: 'pointer', width: 38, height: 38, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff',
              opacity: !input.trim() || loading ? 0.35 : 1,
              transition: 'opacity .15s, transform .1s',
            }}
            onMouseEnter={e => { if (!loading && input.trim()) e.currentTarget.style.transform = 'scale(1.08)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
