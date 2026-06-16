import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { getActiveDate } from '../lib/dateUtils'

export default function GoalTicker() {
  const { user } = useApp()
  const [displayItem, setDisplayItem] = useState({ status: 'empty', text: 'Loading…' })
  const [meta, setMeta] = useState('0/0')
  const [tickKey, setTickKey] = useState(0)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  const itemsRef  = useRef([])
  const idxRef    = useRef(0)
  const intervalRef = useRef(null)

  const advance = useCallback((items) => {
    if (!items.length) return
    const item = items[idxRef.current % items.length]
    idxRef.current++
    setDisplayItem(item)
    setTickKey(k => k + 1)
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    const activeDate = getActiveDate()
    const { data } = await supabase
      .from('focus_tasks')
      .select('id, title, completed')
      .eq('user_id', user.id)
      .eq('focus_date', activeDate)

    const todos   = data || []
    const total   = todos.length
    const done    = todos.filter(t => t.completed).length
    const pending = todos.filter(t => !t.completed)

    setMeta(`${done}/${total}`)

    let items
    if (total === 0) {
      items = [{ status: 'empty', text: 'No goals for today — click here to add one.' }]
    } else if (done === total) {
      items = [{ status: 'done', text: '✓ All goals done — solid day.' }]
    } else {
      items = pending.map(t => ({ status: 'pending', text: t.title }))
    }

    itemsRef.current = items
    idxRef.current   = 0
    advance(items)
  }, [user, advance])

  useEffect(() => {
    load()

    const handleChange = () => { idxRef.current = 0; load() }
    window.addEventListener('todos-changed', handleChange)

    intervalRef.current = setInterval(() => {
      advance(itemsRef.current)
    }, 5000)

    return () => {
      window.removeEventListener('todos-changed', handleChange)
      clearInterval(intervalRef.current)
    }
  }, [load, advance])

  const statusClass =
    displayItem.status === 'done'    ? 'done' :
    displayItem.status === 'pending' ? 'pending' : 'empty'

  const statusGlyph =
    displayItem.status === 'done'    ? '✓' :
    displayItem.status === 'pending' ? '○' : '·'

  async function saveGoal() {
    const title = draft.trim()
    if (!title) { setAdding(false); return }
    await supabase.from('focus_tasks').insert({
      user_id: user.id, title, focus_date: getActiveDate(), completed: false,
    })
    setDraft('')
    setAdding(false)
    window.dispatchEvent(new CustomEvent('todos-changed'))
    load()
  }

  function startAdding() {
    setAdding(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div className="goal-ticker-wrap">
      <div className="goal-ticker">
        <div className="ticker-led" />
        <div className="ticker-label">GOALS</div>
        <div className="ticker-stage">
          {adding ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
              onBlur={saveGoal}
              placeholder="Type a goal, press Enter…"
              style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 'inherit', fontFamily: 'inherit' }}
            />
          ) : (
            <div
              key={tickKey}
              className="ticker-content"
              onClick={startAdding}
              style={{ cursor: 'pointer' }}
              title="Click to add a goal for today"
            >
              <span className={`ticker-status-dot ${statusClass}`}>{statusGlyph}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayItem.text}</span>
            </div>
          )}
        </div>
        <div className="ticker-meta">{meta}</div>
      </div>
    </div>
  )
}
