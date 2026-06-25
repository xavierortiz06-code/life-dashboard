import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { getActiveDate } from '../lib/dateUtils'

const CIRCUMFERENCE = 2 * Math.PI * 52

export function pctColor(pct) {
  if (pct >= 100) return 'var(--success)'
  if (pct >= 85)  return '#6BE3A4'  // success-ish
  if (pct >= 60)  return 'var(--accent)'
  if (pct >= 30)  return 'var(--warning)'
  return 'var(--danger)'
}

export function pctPhase(pct, total) {
  if (total === 0) return 'NO TASKS'
  if (pct === 0)   return 'NOT STARTED'
  if (pct < 30)    return 'EARLY'
  if (pct < 60)    return 'GETTING THERE'
  if (pct < 85)    return 'ON TRACK'
  if (pct < 100)   return 'ALMOST DONE'
  return 'COMPLETE'
}

export default function TodoRing() {
  const { user, theme } = useApp()
  const [done,  setDone]  = useState(0)
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    if (!user?.id) return
    const today = getActiveDate()
    const [
      { data: rTasks },
      { data: rComp  },
      { data: sdtData },
    ] = await Promise.all([
      supabase.from('routine_tasks').select('id').eq('user_id', user.id).eq('active', true).not('schedule_block', 'is', null),
      supabase.from('routine_completions').select('routine_task_id').eq('user_id', user.id).eq('completed_date', today),
      supabase.from('schedule_day_tasks').select('id,completed').eq('user_id', user.id).eq('task_date', today),
    ])

    const assignedIds = new Set((rTasks || []).map(t => t.id))
    const rTotal   = assignedIds.size
    const rDone    = (rComp || []).filter(c => assignedIds.has(c.routine_task_id)).length
    const sdtTotal = (sdtData || []).length
    const sdtDone  = (sdtData || []).filter(t => t.completed).length

    setTotal(rTotal + sdtTotal)
    setDone(rDone  + sdtDone)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    load()
    window.addEventListener('todos-changed', load)

    const channel = supabase
      .channel(`ring_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_day_tasks',    filter: `user_id=eq.${user.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_completions',   filter: `user_id=eq.${user.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routine_tasks',         filter: `user_id=eq.${user.id}` }, load)
      .subscribe()

    return () => {
      window.removeEventListener('todos-changed', load)
      supabase.removeChannel(channel)
    }
  }, [load, user?.id])

  const pct    = total > 0 ? Math.round(done / total * 100) : 0
  const offset = CIRCUMFERENCE * (1 - pct / 100)
  const color  = pctColor(pct)
  const phase  = pctPhase(pct, total)

  const statusText =
    total === 0       ? 'Add tasks to get started' :
    pct === 100       ? 'All tasks done — great day' :
    pct >= 85         ? 'Above 85% target' :
    `${total - done} task${total - done !== 1 ? 's' : ''} left`

  return (
    <div className="day-ring-wrap">
      <div className="day-ring-inner">
        <div className="day-ring-svg-wrap">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <filter id="todoGlow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* Track */}
            <circle cx="60" cy="60" r="52" fill="none"
              stroke={theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)'} strokeWidth="8" />
            {/* 85% target marker */}
            {total > 0 && (
              <circle cx="60" cy="60" r="52" fill="none"
                stroke={theme === 'light' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.15)'} strokeWidth="2"
                strokeDasharray={`${CIRCUMFERENCE * 0.85 * 0.04} ${CIRCUMFERENCE * 0.96}`}
                strokeDashoffset={-CIRCUMFERENCE * (1 - 0.85) + CIRCUMFERENCE * 0.85 * 0.02}
                transform="rotate(-90 60 60)"
              />
            )}
            {/* Fill */}
            <circle cx="60" cy="60" r="52" fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              filter="url(#todoGlow)"
              style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.7s ease' }}
            />
          </svg>
          <div className="day-ring-overlay">
            <div className="day-ring-pct" style={{ color }}>
              {pct}%
            </div>
            <div className="day-ring-phase">{phase}</div>
            <div className="day-ring-clock">{done}/{total} done</div>
          </div>
        </div>
        <div className="day-ring-status">{statusText}</div>
      </div>
    </div>
  )
}
