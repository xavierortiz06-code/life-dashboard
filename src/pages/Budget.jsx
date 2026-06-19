import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import FloatingChat from '../components/FloatingChat'
import { cacheGet, cacheSet } from '../lib/cache'
import SkeletonList from '../components/Skeleton'

const INCOME_CATS  = ['Salary', 'Freelance', 'Gift', 'Other']

const BLANK = { type: 'expense', amount: '', category: '', description: '', date: today(), repeat: 'none' }

// ─── Recurring transactions ──────────────────────────────────────────
const REPEAT_OPTIONS = [['none','One-time'],['weekly','Weekly'],['biweekly','Every 2 weeks'],['monthly','Monthly']]

function nextOccurrence(dateStr, freq) {
  const d = new Date(dateStr + 'T12:00:00')
  if (freq === 'weekly')        d.setDate(d.getDate() + 7)
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14)
  else                          d.setMonth(d.getMonth() + 1)
  return d.toISOString().split('T')[0]
}

function loadRecurringRules() {
  try { return JSON.parse(localStorage.getItem('budget-recurring') || '[]') } catch { return [] }
}

// ─── Budget Plan defaults ────────────────────────────────────────────────────
const PLAN_COLORS = [
  '#6366f1','#06b6d4','#10b981','#f59e0b',
  '#ef4444','#8b5cf6','#ec4899','#14b8a6',
  '#f97316','#84cc16',
]

const DEFAULT_PLAN_ROWS = [
  { id: 1, name: 'Housing',          pct: '30' },
  { id: 2, name: 'Food & Groceries', pct: '15' },
  { id: 3, name: 'Transportation',   pct: '10' },
  { id: 4, name: 'Savings',          pct: '20' },
  { id: 5, name: 'Entertainment',    pct: '10' },
  { id: 6, name: 'Healthcare',       pct: '5'  },
  { id: 7, name: 'Clothing',         pct: '5'  },
  { id: 8, name: 'Other',            pct: '5'  },
]

// ─── Main Budget page ────────────────────────────────────────────────────────
export default function Budget() {
  const { user } = useApp()
  const [activeTab, setActiveTab]       = useState('transactions')
  const [entries, setEntries]           = useState(() => cacheGet('budget:entries') || [])
  const [recurringRules, setRecurringRules] = useState(loadRecurringRules)
  const [form, setForm]                 = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('budget-plan-rows') || 'null')
      const rows = Array.isArray(stored) && stored.length ? stored : DEFAULT_PLAN_ROWS
      return { ...BLANK, category: rows[0]?.name || '' }
    } catch { return { ...BLANK, category: DEFAULT_PLAN_ROWS[0]?.name || '' } }
  })
  const [monthlyLimit,   setMonthlyLimit]   = useState(2000)
  const [editingLimit,   setEditingLimit]   = useState(false)
  const [limitInput,     setLimitInput]     = useState('')
  const [manualBalance,  setManualBalance]  = useState(() => {
    const v = localStorage.getItem('actual_balance')
    return v !== null ? parseFloat(v) : null
  })
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceInput,   setBalanceInput]   = useState('')
  const [loading, setLoading]           = useState(() => !cacheGet('budget:entries'))
  const [loadError, setLoadError]       = useState('')
  const [showForm, setShowForm]         = useState(false)
  // Lifted so Overview tab can read plan data — loaded from localStorage on init
  const [planRows, setPlanRows] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('budget-plan-rows') || 'null')
      return Array.isArray(stored) && stored.length ? stored : DEFAULT_PLAN_ROWS
    } catch { return DEFAULT_PLAN_ROWS }
  })
  const [planNextId, setPlanNextId] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('budget-plan-rows') || 'null')
      if (Array.isArray(stored) && stored.length) return Math.max(...stored.map(r => r.id)) + 1
    } catch {}
    return DEFAULT_PLAN_ROWS.length + 1
  })
  const [planSaved, setPlanSaved]   = useState(true)
  const [syncError, setSyncError]   = useState('')
  // Snapshot of the last-saved plan — "Unsaved changes" only shows when the
  // current rows actually differ from it (StrictMode/load effects can't trip it)
  const savedRowsRef    = useRef(null)
  const supabaseLoaded  = useRef(false)
  // Lifted savings state — shared between BudgetPlan sub-tab and Overview graphs
  const [savingsGoals, setSavingsGoals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('savings-goals') || '[]') } catch { return [] }
  })
  const [savingsNextId, setSavingsNextId] = useState(() => {
    try {
      const g = JSON.parse(localStorage.getItem('savings-goals') || '[]')
      return g.length ? Math.max(...g.map(x => x.id)) + 1 : 1
    } catch { return 1 }
  })
  // Lifted subscriptions state
  const [subscriptions, setSubscriptions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('budget-subscriptions') || '[]') } catch { return [] }
  })
  const [subsNextId, setSubsNextId] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('budget-subscriptions') || '[]')
      return s.length ? Math.max(...s.map(x => x.id)) + 1 : 1
    } catch { return 1 }
  })

  useEffect(() => { load() }, [])
  useEffect(() => {
    localStorage.setItem('savings-goals', JSON.stringify(savingsGoals))
    if (supabaseLoaded.current) {
      supabase.from('budget_settings')
        .upsert({ user_id: user.id, savings_goals: savingsGoals }, { onConflict: 'user_id' }).select()
    }
  }, [savingsGoals])
  useEffect(() => {
    localStorage.setItem('budget-subscriptions', JSON.stringify(subscriptions))
    if (supabaseLoaded.current) {
      supabase.from('budget_settings')
        .upsert({ user_id: user.id, subscriptions }, { onConflict: 'user_id' }).select()
    }
  }, [subscriptions])
  // Dirty flag by comparison: unsaved only when rows differ from the saved snapshot
  useEffect(() => {
    const json = JSON.stringify(planRows)
    if (savedRowsRef.current === null) { savedRowsRef.current = json; return }
    setPlanSaved(json === savedRowsRef.current)
  }, [planRows])

  async function savePlan() {
    setSyncError('')
    localStorage.setItem('budget-plan-rows', JSON.stringify(planRows))
    localStorage.setItem('savings-goals', JSON.stringify(savingsGoals))
    localStorage.setItem('budget-subscriptions', JSON.stringify(subscriptions))
    const result = await supabase.from('budget_settings').upsert({
      user_id:       user.id,
      plan_rows:     planRows,
      savings_goals: savingsGoals,
      subscriptions,
    }, { onConflict: 'user_id' }).select()
    const { error, data } = result
    if (error) {
      setSyncError(error.message)
    } else if (!data || data.length === 0) {
      setSyncError('Save blocked — check Supabase permissions')
    } else {
      savedRowsRef.current = JSON.stringify(planRows)
      setPlanSaved(true)
    }
  }

  async function load() {
    setLoadError('')
    const [{ data: rows, error: rowsErr }, { data: settingsRows, error: settingsErr }] = await Promise.all([
      supabase.from('budget_entries').select('*').eq('user_id', user.id)
        .order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('budget_settings').select('*').eq('user_id', user.id)
        .order('id', { ascending: false }).limit(1),
    ])
    if (rowsErr) setLoadError('entries: ' + rowsErr.message)
    if (settingsErr) setLoadError('settings: ' + settingsErr.message)
    setEntries(cacheSet('budget:entries', rows || []))
    const settings = settingsRows?.[0] ?? null
    if (settings) {
      if (settings.monthly_limit) setMonthlyLimit(settings.monthly_limit)
      if (settings.actual_balance != null) {
        setManualBalance(parseFloat(settings.actual_balance))
        localStorage.setItem('actual_balance', String(settings.actual_balance))
      }

      // Plan rows — refresh the saved snapshot so loading doesn't trigger "unsaved"
      if (Array.isArray(settings.plan_rows) && settings.plan_rows.length > 0) {
        savedRowsRef.current = JSON.stringify(settings.plan_rows)
        setPlanSaved(true)
        setPlanRows(settings.plan_rows)
        setPlanNextId(Math.max(...settings.plan_rows.map(r => r.id)) + 1)
        localStorage.setItem('budget-plan-rows', JSON.stringify(settings.plan_rows))
      }

      // Savings goals
      if (Array.isArray(settings.savings_goals) && settings.savings_goals.length > 0) {
        setSavingsGoals(settings.savings_goals)
        setSavingsNextId(Math.max(...settings.savings_goals.map(g => g.id)) + 1)
        localStorage.setItem('savings-goals', JSON.stringify(settings.savings_goals))
      }

      // Subscriptions
      if (Array.isArray(settings.subscriptions)) {
        setSubscriptions(settings.subscriptions)
        if (settings.subscriptions.length > 0)
          setSubsNextId(Math.max(...settings.subscriptions.map(s => s.id)) + 1)
        localStorage.setItem('budget-subscriptions', JSON.stringify(settings.subscriptions))
      }
    }
    supabaseLoaded.current = true
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    await supabase.from('budget_entries').insert({
      user_id:     user.id,
      type:        form.type,
      amount,
      category:    form.category,
      description: form.description || null,
      date:        form.date,
    })
    // Keep manual balance in sync: income adds, expense subtracts
    if (manualBalance !== null) {
      const delta      = form.type === 'income' ? amount : -amount
      const newBalance = Math.round((manualBalance + delta) * 100) / 100
      setManualBalance(newBalance)
      localStorage.setItem('actual_balance', String(newBalance))
      supabase.from('budget_settings')
        .upsert({ user_id: user.id, actual_balance: newBalance }, { onConflict: 'user_id' })
    }
    // Register a recurring rule so future occurrences auto-post
    if (form.repeat && form.repeat !== 'none') {
      const rule = {
        id: Date.now(),
        type: form.type, amount, category: form.category,
        description: form.description || null,
        freq: form.repeat, last_posted: form.date,
      }
      setRecurringRules(rs => {
        const next = [...rs, rule]
        localStorage.setItem('budget-recurring', JSON.stringify(next))
        return next
      })
    }
    setForm({ ...BLANK, category: planRows[0]?.name || '' })
    setShowForm(false)
    load()
  }

  function deleteRecurringRule(id) {
    setRecurringRules(rs => {
      const next = rs.filter(r => r.id !== id)
      localStorage.setItem('budget-recurring', JSON.stringify(next))
      return next
    })
  }

  // Auto-post any recurrences that have come due since last visit
  const recurringProcessed = useRef(false)
  useEffect(() => {
    if (loading || recurringProcessed.current) return
    recurringProcessed.current = true
    ;(async () => {
      const rules = loadRecurringRules()
      const todayStr = today()
      let posted = 0
      let balanceDelta = 0
      for (const r of rules) {
        let next = nextOccurrence(r.last_posted, r.freq)
        while (next <= todayStr) {
          await supabase.from('budget_entries').insert({
            user_id: user.id, type: r.type, amount: r.amount,
            category: r.category, description: r.description, date: next,
          })
          balanceDelta += r.type === 'income' ? r.amount : -r.amount
          r.last_posted = next
          posted++
          next = nextOccurrence(next, r.freq)
        }
      }
      if (posted > 0) {
        localStorage.setItem('budget-recurring', JSON.stringify(rules))
        setRecurringRules(rules)
        if (manualBalance !== null) {
          const newBalance = Math.round((manualBalance + balanceDelta) * 100) / 100
          setManualBalance(newBalance)
          localStorage.setItem('actual_balance', String(newBalance))
          supabase.from('budget_settings')
            .upsert({ user_id: user.id, actual_balance: newBalance }, { onConflict: 'user_id' })
        }
        load()
      }
    })()
  }, [loading])

  async function remove(id) {
    // Reverse the transaction's effect on manual balance before deleting
    if (manualBalance !== null) {
      const entry = entries.find(x => x.id === id)
      if (entry) {
        const delta      = entry.type === 'income' ? -parseFloat(entry.amount) : parseFloat(entry.amount)
        const newBalance = Math.round((manualBalance + delta) * 100) / 100
        setManualBalance(newBalance)
        localStorage.setItem('actual_balance', String(newBalance))
        supabase.from('budget_settings')
          .upsert({ user_id: user.id, actual_balance: newBalance }, { onConflict: 'user_id' })
      }
    }
    await supabase.from('budget_entries').delete().eq('id', id)
    setEntries(e => e.filter(x => x.id !== id))
  }

  async function saveLimit() {
    const val = parseFloat(limitInput)
    if (isNaN(val) || val <= 0) return
    setMonthlyLimit(val)
    setEditingLimit(false)
    await supabase.from('budget_settings')
      .upsert({ user_id: user.id, monthly_limit: val }, { onConflict: 'user_id' }).select()
  }

  async function saveBalance() {
    const val = parseFloat(balanceInput)
    if (isNaN(val)) return
    setManualBalance(val)
    setEditingBalance(false)
    localStorage.setItem('actual_balance', String(val))
    await supabase.from('budget_settings')
      .upsert({ user_id: user.id, actual_balance: val }, { onConflict: 'user_id' }).select()
  }

  async function resetBalance() {
    setManualBalance(null)
    setEditingBalance(false)
    localStorage.removeItem('actual_balance')
    await supabase.from('budget_settings')
      .upsert({ user_id: user.id, actual_balance: null }, { onConflict: 'user_id' }).select()
  }

  const monthPrefix = new Date().toISOString().slice(0, 7)
  const monthRows   = entries.filter(e => e.date.startsWith(monthPrefix))
  const monthExp    = monthRows.filter(e => e.type === 'expense').reduce((s, e) => s + +e.amount, 0)
  const monthInc    = monthRows.filter(e => e.type === 'income').reduce((s, e) => s + +e.amount, 0)
  const totalInc    = entries.filter(e => e.type === 'income').reduce((s, e) => s + +e.amount, 0)
  const totalExp    = entries.filter(e => e.type === 'expense').reduce((s, e) => s + +e.amount, 0)
  const balance     = totalInc - totalExp
  const pct         = monthlyLimit > 0 ? Math.min((monthExp / monthlyLimit) * 100, 100) : 0
  const barClass    = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : ''

  // Actual weekly income from transactions (this week Mon–Sun)
  const currentWeekKey  = weekKey(today())
  const weeklyIncome    = entries
    .filter(e => e.type === 'income' && weekKey(e.date) === currentWeekKey)
    .reduce((s, e) => s + +e.amount, 0)
  const weeklySpent     = entries
    .filter(e => e.type === 'expense' && weekKey(e.date) === currentWeekKey)
    .reduce((s, e) => s + +e.amount, 0)

  // Snapshot state — lifted here so Budget Plan tab also gets effective income
  const [snapshotChecking, setSnapshotChecking] = useState(() => {
    let v = localStorage.getItem('overview-snapshot-checking')
    if (v === null) v = localStorage.getItem('overview-snapshot')
    return v !== null ? parseFloat(v) : null
  })
  const [snapshotSavings, setSnapshotSavings] = useState(() => {
    const v = localStorage.getItem('overview-snapshot-savings')
    return v !== null ? parseFloat(v) : null
  })

  // If checking is set, backsolve income: checking + spent = what paycheck covered
  const effectivePlanIncome = snapshotChecking !== null
    ? snapshotChecking + weeklySpent
    : weeklyIncome

  // LocalStorage quick-add expenses (used by Overview spending tracker)
  const [lsExpenses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('expenses') || '[]') } catch { return [] }
  })
  const lsWeekExp   = lsExpenses.filter(e => weekKey(e.date) === currentWeekKey)
  const lsWeekSpent = lsWeekExp.reduce((s, e) => s + (e.amount || 0), 0)
  const catSpend    = {}
  lsWeekExp.forEach(e => { catSpend[e.category] = (catSpend[e.category] || 0) + (e.amount || 0) })

  // Global AI context — covers all tabs
  const aiContext = [
    `Today: ${today()}`,
    '',
    '== This Week ==',
    `Weekly income: $${weeklyIncome.toFixed(2)}`,
    `Total spent this week: $${lsWeekSpent.toFixed(2)}`,
    `Remaining: $${(weeklyIncome - lsWeekSpent).toFixed(2)}`,
    '',
    '== Weekly Budget Plan ==',
    ...planRows.map(r => {
      const budget = (parseFloat(r.pct) || 0) / 100 * weeklyIncome
      const spent  = catSpend[r.name] || 0
      const flag   = spent > budget ? ' OVER' : ''
      return `  ${r.name}: $${spent.toFixed(2)} / $${budget.toFixed(2)} (${r.pct}%)${flag}`
    }),
    '',
    '== This Month ==',
    `Income: $${monthInc.toFixed(2)}`,
    `Expenses: $${monthExp.toFixed(2)}`,
    `Saved: $${(monthInc - monthExp).toFixed(2)}`,
    '',
    '== Recent Transactions ==',
    ...(entries.length > 0
      ? entries.slice(0, 10).map(e => `  ${e.date}  ${e.type === 'income' ? '+' : '-'}$${Number(e.amount).toFixed(2)}  ${e.description || e.category}`)
      : ['  (none yet)']),
  ].join('\n')

  const aiSystemPrompt = `You are a friendly, knowledgeable personal finance advisor embedded in a budget dashboard. You have access to the user's weekly income, budget plan, spending, and monthly transactions. Help them understand their finances, flag concerns, and suggest improvements.

Guidelines:
- Be conversational and encouraging, not robotic
- Always reference their actual numbers when answering
- Keep answers concise (2-4 sentences) unless detail genuinely helps
- Flag overspending clearly but constructively`

  const [confirmReset, setConfirmReset] = useState(false)

  async function resetAllMoney() {
    if (!confirmReset) { setConfirmReset(true); return }
    setConfirmReset(false)
    // Clear manual balance
    setManualBalance(null)
    localStorage.removeItem('actual_balance')
    supabase.from('budget_settings').upsert({ user_id: user.id, actual_balance: null }, { onConflict: 'user_id' })
    // Clear account snapshots
    setSnapshotChecking(null)
    setSnapshotSavings(null)
    localStorage.removeItem('overview-snapshot-checking')
    localStorage.removeItem('overview-snapshot')
    localStorage.removeItem('overview-snapshot-savings')
    // Zero out savings-goal amounts (keep names/targets/percentages)
    setSavingsGoals(gs => gs.map(g => ({ ...g, saved: 0, adjustments: [] })))
    // Delete all transactions — this is what drives Balance, Month Income/Expenses
    setEntries([])
    await supabase.from('budget_entries').delete().eq('user_id', user.id)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Budget</h1>
        {activeTab === 'transactions' && (
          <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
            {showForm ? 'Cancel' : '+ Add entry'}
          </button>
        )}
      </div>

      <div className="page-body">
        {/* Tab bar */}
        <div className="filter-row" style={{ marginBottom: 4 }}>
          {[
            ['overview',     'Overview'],
            ['transactions', 'Transactions'],
            ['income',       'Income'],
            ['reports',      'Monthly Reports'],
            ['plan',         'Budget Plan'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`filter-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => { setActiveTab(key); setShowForm(false) }}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' ? (
          <Overview
            planRows={planRows} entries={entries} savingsGoals={savingsGoals}
            snapshotChecking={snapshotChecking} setSnapshotChecking={setSnapshotChecking}
            snapshotSavings={snapshotSavings}   setSnapshotSavings={setSnapshotSavings}
          />
        ) : activeTab === 'income' ? (
          <Income entries={entries} loading={loading} />
        ) : activeTab === 'reports' ? (
          <MonthlyReports entries={entries} loading={loading} />
        ) : activeTab === 'transactions' ? (
          <>
            {/* Summary stats */}
            <div className="stats-row">
              <div className="stat-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <div className="stat-label" style={{ marginBottom: 0 }}>Balance</div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 10, padding: '1px 6px', marginLeft: 4 }}
                    onClick={() => { setEditingBalance(true); setBalanceInput(String(manualBalance ?? balance.toFixed(2))) }}
                  >Edit</button>
                </div>
                {editingBalance ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    <input
                      type="number" step="0.01"
                      value={balanceInput}
                      onChange={e => setBalanceInput(e.target.value)}
                      style={{ width: '100%' }}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveBalance(); if (e.key === 'Escape') setEditingBalance(false) }}
                    />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={saveBalance}>Save</button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setEditingBalance(false)}>Cancel</button>
                      {manualBalance !== null && (
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--text-muted)' }} onClick={resetBalance}>Reset to calculated</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="stat-value" style={{ color: (manualBalance ?? balance) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {(manualBalance ?? balance) >= 0 ? '+' : ''}{fmt(manualBalance ?? balance)}
                  </div>
                )}
              </div>
              <div className="stat-card">
                <div className="stat-label">Month Income</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(monthInc)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Month Expenses</div>
                <div className="stat-value" style={{ color: 'var(--danger)' }}>{fmt(monthExp)}</div>
              </div>
            </div>

            {/* Monthly budget progress */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Monthly budget</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {fmt(monthExp)} of {fmt(monthlyLimit)} spent
                    {pct >= 80 && (
                      <span style={{ marginLeft: 8, color: pct >= 100 ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>
                        {pct >= 100 ? 'Over budget!' : 'Near limit'}
                      </span>
                    )}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditingLimit(true); setLimitInput(String(monthlyLimit)) }}>
                  Edit limit
                </button>
              </div>

              {editingLimit && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <input
                    type="number" min="1"
                    value={limitInput}
                    onChange={e => setLimitInput(e.target.value)}
                    style={{ width: 140 }}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveLimit()}
                  />
                  <button className="btn btn-primary btn-sm" onClick={saveLimit}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingLimit(false)}>Cancel</button>
                </div>
              )}

              <div className="progress-wrap">
                <div className={`progress-fill ${barClass}`} style={{ width: `${pct}%` }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
                {pct.toFixed(0)}%
              </div>
            </div>

            {/* Add form */}
            {showForm && (
              <div className="card">
                <h2 style={{ marginBottom: 16 }}>Add entry</h2>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="form-row form-row-2">
                    <div className="form-group">
                      <label>Type</label>
                      <select
                        value={form.type}
                        onChange={e => setForm(f => ({
                          ...f,
                          type: e.target.value,
                          category: e.target.value === 'income' ? 'Salary' : planRows[0]?.name || '',
                        }))}
                      >
                        <option value="expense">Expense</option>
                        <option value="income">Income</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Amount ($) *</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={form.amount}
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-row form-row-2">
                    <div className="form-group">
                      <label>Category</label>
                      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                        {(form.type === 'income' ? INCOME_CATS : planRows.map(r => r.name)).map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Date *</label>
                      <input
                        type="date"
                        value={form.date}
                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-row form-row-2">
                    <div className="form-group">
                      <label>Description (optional)</label>
                      <input
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="e.g. Grocery run"
                      />
                    </div>
                    <div className="form-group">
                      <label>Repeats</label>
                      <select value={form.repeat} onChange={e => setForm(f => ({ ...f, repeat: e.target.value }))}>
                        {REPEAT_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <button className="btn btn-primary" type="submit">Add entry</button>
                  </div>
                </form>
              </div>
            )}

            {/* Recurring rules */}
            {recurringRules.length > 0 && (
              <div className="card">
                <h2 style={{ marginBottom: 10 }}>Recurring</h2>
                {recurringRules.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.description || r.category}
                      <span style={{ color: 'var(--text-light)', marginLeft: 8, fontSize: 11 }}>
                        {REPEAT_OPTIONS.find(([v]) => v === r.freq)?.[1]} · next {fmtDate(nextOccurrence(r.last_posted, r.freq))}
                      </span>
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: r.type === 'income' ? 'var(--success)' : 'var(--danger)', flexShrink: 0 }}>
                      {r.type === 'income' ? '+' : '-'}{fmt(r.amount)}
                    </span>
                    <button className="del-btn" onClick={() => deleteRecurringRule(r.id)} title="Stop repeating (existing entries stay)">
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Transactions list */}
            <div className="card">
              <h2 style={{ marginBottom: 14 }}>Transactions</h2>
              {loading ? (
                <SkeletonList rows={3} lines={1} />
              ) : entries.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon"><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg></div>
                  <p>No entries yet. Log your first income or expense!</p>
                </div>
              ) : (
                entries.map(e => (
                  <div className="item-row" key={e.id}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 700,
                      background: e.type === 'income' ? 'var(--success-light)' : 'var(--danger-light)',
                      color:      e.type === 'income' ? '#15803d' : 'var(--danger)',
                    }}>
                      {e.type === 'income' ? '↑' : '↓'}
                    </div>

                    <div className="item-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className="item-title">{e.description || e.category}</span>
                        <span className="badge badge-gray">{e.category}</span>
                      </div>
                      <div className="item-meta">{fmtDate(e.date)}</div>
                    </div>

                    <div style={{
                      fontWeight: 600, marginRight: 8,
                      color: e.type === 'income' ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {e.type === 'income' ? '+' : '−'}{fmt(e.amount)}
                    </div>

                    <button className="del-btn" onClick={() => remove(e.id)}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
          {loadError && (
            <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12 }}>
              Cloud load error: <strong>{loadError}</strong>
            </div>
          )}
          <BudgetPlan
            planRows={planRows} setPlanRows={setPlanRows}
            planNextId={planNextId} setPlanNextId={setPlanNextId}
            planIncome={effectivePlanIncome}
            entries={entries}
            savingsGoals={savingsGoals} setSavingsGoals={setSavingsGoals}
            savingsNextId={savingsNextId} setSavingsNextId={setSavingsNextId}
            subscriptions={subscriptions} setSubscriptions={setSubscriptions}
            subsNextId={subsNextId} setSubsNextId={setSubsNextId}
            onSave={savePlan} planSaved={planSaved} syncError={syncError}
            snapshotSavings={snapshotSavings}
          />
          </>
        )}

        {/* Danger zone — tucked at the bottom of Overview, away from daily controls */}
        {activeTab === 'overview' && (
          <div style={{ marginTop: 28, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            {confirmReset ? (
              <>
                <span style={{ fontSize: 11, color: 'var(--danger)' }}>
                  This permanently deletes ALL transactions, zeros every savings goal, and clears your balance and account snapshots. Plan percentages, goal targets, and settings are kept. This cannot be undone.
                </span>
                <button className="btn btn-sm" style={{ fontSize: 11, background: 'var(--danger)', color: '#fff', border: 'none', flexShrink: 0 }} onClick={resetAllMoney}>Yes, wipe it all</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => setConfirmReset(false)}>Cancel</button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--text-light)' }} onClick={resetAllMoney}>
                Reset all money to $0…
              </button>
            )}
          </div>
        )}
      </div>
      <FloatingChat
        title="Budget Assistant"
        placeholder="Ask about your budget…"
        systemPrompt={aiSystemPrompt}
        context={aiContext}
        emptyTitle="Ask me about your finances"
        emptyHints={["Where am I overspending this week?", "How much did I save this month?", "What should I adjust in my budget?"]}
      />
    </div>
  )
}

// ─── Income component (weekly view) ─────────────────────────────────────────
function Income({ entries, loading }) {
  const incomeEntries = entries.filter(e => e.type === 'income')

  function getWeekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDay()
    const diff = day >= 5 ? -(day - 5) : -(day + 2)
    d.setDate(d.getDate() + diff)
    return localDate(d)
  }

  function fmtWeekRange(friStr) {
    const start = new Date(friStr + 'T00:00:00')
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const opts = { month: 'short', day: 'numeric' }
    return `Fri ${start.toLocaleDateString('en-US', opts)} – Thu ${end.toLocaleDateString('en-US', opts)}`
  }

  const weeklyMap = {}
  const weekEntriesMap = {}
  incomeEntries.forEach(e => {
    const wk = getWeekKey(e.date)
    weeklyMap[wk] = (weeklyMap[wk] || 0) + +e.amount
    if (!weekEntriesMap[wk]) weekEntriesMap[wk] = []
    weekEntriesMap[wk].push(e)
  })

  const todayMondayStr = getWeekKey(today())
  const lastMondayDate = new Date(todayMondayStr + 'T00:00:00')
  lastMondayDate.setDate(lastMondayDate.getDate() - 7)
  const lastMondayStr  = lastMondayDate.toISOString().split('T')[0]

  const thisWeekTotal = weeklyMap[todayMondayStr] || 0
  const lastWeekTotal = weeklyMap[lastMondayStr]  || 0

  const thisMonth = new Date().toISOString().slice(0, 7)
  const thisMonthIncome = incomeEntries
    .filter(e => e.date.startsWith(thisMonth))
    .reduce((s, e) => s + +e.amount, 0)
  const avgWeekly = thisMonthIncome / 4

  const [viewWeek, setViewWeek] = useState(todayMondayStr)
  const isCurrentWeek = viewWeek === todayMondayStr

  function offsetWeek(n) {
    const d = new Date(viewWeek + 'T00:00:00')
    d.setDate(d.getDate() + n * 7)
    setViewWeek(d.toISOString().split('T')[0])
  }

  const viewEntries = weekEntriesMap[viewWeek] || []
  const viewTotal   = weeklyMap[viewWeek] || 0

  // Last 8 weeks bar chart
  const last8Weeks = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date(todayMondayStr + 'T00:00:00')
    d.setDate(d.getDate() - i * 7)
    const wk = d.toISOString().split('T')[0]
    last8Weeks.push({ wk, amt: weeklyMap[wk] || 0 })
  }
  const maxWeekAmt = Math.max(...last8Weeks.map(w => w.amt), 1)

  const catMap = {}
  viewEntries.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + +e.amount })
  const cats   = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const maxCat = cats.length ? cats[0][1] : 1
  const CAT_COLORS = { Salary: '#6be3a4', Freelance: '#6366f1', Gift: '#f2c063', Other: '#94a3b8' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">This Week</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(thisWeekTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Week</div>
          <div className="stat-value">{fmt(lastWeekTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Weekly (This Month)</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{fmt(avgWeekly)}</div>
        </div>
      </div>

      {/* ── 8-week history ──────────────────────────────────────────────── */}
      <div className="card">
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-light)', marginBottom: 16 }}>
          8-Week Income History
        </div>
        {loading ? (
          <SkeletonList rows={3} lines={1} />
        ) : last8Weeks.every(w => w.amt === 0) ? (
          <div className="empty"><div className="empty-icon"><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div><p>No income entries yet.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {last8Weeks.map(({ wk, amt }) => {
              const barPct = (amt / maxWeekAmt) * 100
              const isCur  = wk === todayMondayStr
              return (
                <div key={wk}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: isCur ? 700 : 500, color: isCur ? 'var(--text)' : 'var(--text-muted)' }}>
                      {fmtWeekRange(wk)}
                      {isCur && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>this week</span>}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: amt > 0 ? 'var(--success)' : 'var(--text-light)' }}>
                      {amt > 0 ? fmt(amt) : '—'}
                    </span>
                  </div>
                  <div className="progress-wrap">
                    <div style={{
                      height: '100%', width: `${barPct}%`,
                      background: isCur ? 'var(--success)' : 'rgba(107,227,164,0.4)',
                      borderRadius: 'var(--radius-sm, 3px)',
                      transition: 'width .35s ease',
                      boxShadow: isCur ? '0 0 8px rgba(107,227,164,0.4)' : 'none',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Weekly detail with nav ───────────────────────────────────────── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-light)', flex: 1 }}>
            Weekly Detail
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => offsetWeek(-1)}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          <span style={{ fontWeight: 600, fontSize: 12, minWidth: 160, textAlign: 'center' }}>{fmtWeekRange(viewWeek)}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => offsetWeek(1)} disabled={isCurrentWeek}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>

        {viewEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No income logged for this week.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[...viewEntries].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)', width: 80, flexShrink: 0 }}>
                  {fmtDate(e.date)}
                </div>
                <div style={{ flex: 1, fontSize: 13 }}>{e.description || e.category}</div>
                <span className="badge badge-gray" style={{ flexShrink: 0 }}>{e.category}</span>
                <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--success)', flexShrink: 0 }}>
                  +{fmt(e.amount)}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>Week total</span>
              <span style={{ fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--success)' }}>{fmt(viewTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Income by source ────────────────────────────────────────────── */}
      {cats.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-light)', marginBottom: 16 }}>
            Income by Source — {fmtWeekRange(viewWeek)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cats.map(([cat, amt]) => {
              const barPct = (amt / maxCat) * 100
              const color  = CAT_COLORS[cat] || '#94a3b8'
              return (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{cat}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                        {viewTotal > 0 ? ((amt / viewTotal) * 100).toFixed(1) : 0}%
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--success)' }}>{fmt(amt)}</span>
                    </div>
                  </div>
                  <div className="progress-wrap">
                    <div style={{
                      height: '100%', width: `${barPct}%`,
                      background: color,
                      borderRadius: 'var(--radius-sm, 3px)',
                      transition: 'width .35s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Monthly Reports component ───────────────────────────────────────────────
function MonthlyReports({ entries, loading }) {
  const [viewMonth, setViewMonth] = useState(today().slice(0, 7))

  function fmtMonth(ym) {
    const [y, m] = ym.split('-')
    return new Date(+y, +m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  function offsetMonth(n) {
    const [y, m] = viewMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + n)
    setViewMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const isCurrentMonth = viewMonth === today().slice(0, 7)
  const monthEntries   = entries.filter(e => e.date.startsWith(viewMonth))
  const income  = monthEntries.filter(e => e.type === 'income').reduce((s, e) => s + +e.amount, 0)
  const spent   = monthEntries.filter(e => e.type === 'expense').reduce((s, e) => s + +e.amount, 0)
  const saved   = income - spent
  const savingsRate = income > 0 ? (saved / income) * 100 : 0

  const catMap = {}
  monthEntries.filter(e => e.type === 'expense').forEach(e => {
    catMap[e.category] = (catMap[e.category] || 0) + +e.amount
  })
  const cats   = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const maxCat = cats.length ? cats[0][1] : 1

  // 6-month trend
  const trend = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const es = entries.filter(e => e.date.startsWith(ym))
    const inc = es.filter(e => e.type === 'income').reduce((s, e) => s + +e.amount, 0)
    const exp = es.filter(e => e.type === 'expense').reduce((s, e) => s + +e.amount, 0)
    trend.push({ ym, inc, exp, saved: inc - exp })
  }
  const maxTrend = Math.max(...trend.map(t => Math.max(t.inc, t.exp)), 1)

  const CAT_COLORS = {
    Food: '#ef4444', Transport: '#f59e0b', Housing: '#6366f1',
    Entertainment: '#8b5cf6', Health: '#10b981', Clothing: '#ec4899',
    Subscriptions: '#06b6d4', Other: '#94a3b8',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => offsetMonth(-1)}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span style={{ fontWeight: 600, fontSize: 14, minWidth: 140, textAlign: 'center' }}>{fmtMonth(viewMonth)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => offsetMonth(1)} disabled={isCurrentMonth}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
      </div>

      {/* Stat cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Income</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(income)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Expenses</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{fmt(spent)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Saved</div>
          <div className="stat-value" style={{ color: saved >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {saved >= 0 ? '+' : ''}{fmt(saved)}
          </div>
          {income > 0 && (
            <div style={{ fontSize: 11, marginTop: 4, color: savingsRate >= 20 ? 'var(--success)' : savingsRate >= 10 ? 'var(--warning)' : 'var(--danger)' }}>
              {savingsRate.toFixed(1)}% saved
            </div>
          )}
        </div>
      </div>

      {/* Spending breakdown */}
      <div className="card">
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-light)', marginBottom: 16 }}>
          Spending Breakdown — {fmtMonth(viewMonth)}
        </div>
        {loading ? (
          <SkeletonList rows={3} lines={1} />
        ) : cats.length === 0 ? (
          <div className="empty"><div className="empty-icon"><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg></div><p>No expenses recorded for {fmtMonth(viewMonth)}.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cats.map(([cat, amt]) => {
              const barPct = (amt / maxCat) * 100
              const color  = CAT_COLORS[cat] || '#94a3b8'
              return (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{cat}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                        {spent > 0 ? ((amt / spent) * 100).toFixed(1) : 0}%
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--danger)' }}>{fmt(amt)}</span>
                    </div>
                  </div>
                  <div className="progress-wrap">
                    <div style={{
                      height: '100%', width: `${barPct}%`,
                      background: color,
                      borderRadius: 'var(--radius-sm, 3px)',
                      transition: 'width .35s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 6-month trend */}
      <div className="card">
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-light)', marginBottom: 16 }}>
          6-Month Trend
        </div>
        {loading ? (
          <SkeletonList rows={3} lines={1} />
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {trend.map(({ ym, inc, exp, saved: sav }) => {
                const incPct = (inc / maxTrend) * 100
                const expPct = (exp / maxTrend) * 100
                const isCur  = ym === today().slice(0, 7)
                return (
                  <div key={ym}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: isCur ? 700 : 500, color: isCur ? 'var(--text)' : 'var(--text-muted)' }}>
                        {fmtMonth(ym)}
                        {isCur && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>current</span>}
                      </span>
                      <div style={{ display: 'flex', gap: 10, fontSize: 12, fontFamily: 'var(--mono)' }}>
                        <span style={{ color: 'var(--success)' }}>+{fmt(inc)}</span>
                        <span style={{ color: 'var(--danger)' }}>−{fmt(exp)}</span>
                        <span style={{ color: sav >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                          {sav >= 0 ? '+' : ''}{fmt(sav)}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div className="progress-wrap">
                        <div style={{ height: '100%', width: `${incPct}%`, background: 'var(--success)', opacity: isCur ? 1 : 0.45, borderRadius: 'var(--radius-sm, 3px)', transition: 'width .35s ease' }} />
                      </div>
                      <div className="progress-wrap">
                        <div style={{ height: '100%', width: `${expPct}%`, background: 'var(--danger)', opacity: isCur ? 1 : 0.45, borderRadius: 'var(--radius-sm, 3px)', transition: 'width .35s ease' }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, paddingTop: 12, marginTop: 4, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 6, borderRadius: 2, background: 'var(--success)' }} /> Income
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 6, borderRadius: 2, background: 'var(--danger)' }} /> Expenses
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Budget Plan component ───────────────────────────────────────────────────
function BudgetPlan({ planRows, setPlanRows, planNextId, setPlanNextId, planIncome, entries = [], savingsGoals, setSavingsGoals, savingsNextId, setSavingsNextId, subscriptions, setSubscriptions, subsNextId, setSubsNextId, onSave, planSaved, syncError, snapshotSavings, setSnapshotSavings }) {
  const income  = planIncome
  const rows    = planRows
  const setRows = setPlanRows
  const nextId  = planNextId
  const setNextId = setPlanNextId
  const [subTab, setSubTab]   = useState('plan')
  const [amtEdits, setAmtEdits] = useState({})  // { [rowId]: rawString } while user is typing a $ amount

  // Find savings row and compute checking (spending) money
  const savingsRowData  = rows.find(r => /sav/i.test(r.name) && !/subscri|subs/i.test(r.name))
  const savingsPct      = savingsRowData ? (parseFloat(savingsRowData.pct) || 0) : 0
  const savingsWeekly   = savingsPct / 100 * income
  const checkingAmount  = income - savingsWeekly

  const totalPct = rows.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0)
  const balanced = Math.abs(totalPct - 100) < 0.1
  const over     = totalPct > 100.1
  const rowStatus = balanced ? 'ok' : over ? 'over' : 'under'

  // Linked totals — used to annotate matching allocation rows
  const monthlySubsTotal = subscriptions
    .filter(s => s.active !== false)
    .reduce((sum, s) => sum + toMonthly(s.cost, s.cycle), 0)
  const weeklySubsNeeded  = monthlySubsTotal / 4.33
  const totalSavingsRemaining = savingsGoals.reduce(
    (s, g) => s + Math.max((parseFloat(g.target) || 0) - (parseFloat(g.saved) || 0), 0), 0
  )

  // Auto-sync: whenever subscription costs or income change, push the exact pct
  // into any row whose name matches "subscr/subs"
  useEffect(() => {
    if (income <= 0) return
    const neededPct = Math.round(weeklySubsNeeded / income * 1000) / 10
    setRows(rs => {
      if (!rs.some(r => /subscri|subs/.test(r.name.toLowerCase()))) return rs
      let changed = false
      const next = rs.map(r => {
        if (!/subscri|subs/.test(r.name.toLowerCase())) return r
        if (Math.abs((parseFloat(r.pct) || 0) - neededPct) < 0.05) return r
        changed = true
        return { ...r, pct: String(neededPct) }
      })
      return changed ? next : rs
    })
  }, [monthlySubsTotal, income])

  function setRowField(id, field, value) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function addRow() {
    const id = nextId
    setRows(rs => [...rs, { id, name: 'New Category', pct: '0' }])
    setNextId(n => n + 1)
  }

  function deleteRow(id) {
    setRows(rs => rs.filter(r => r.id !== id))
  }

  // Toggle lock on a row
  function toggleLock(id) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, locked: !r.locked } : r))
  }

  // Pick a percentage for one row; only redistribute among *unlocked* other rows
  function setPct(id, newPct) {
    setRows(rs => {
      const lockedOthers   = rs.filter(r => r.id !== id && r.locked)
      const unlockedOthers = rs.filter(r => r.id !== id && !r.locked)
      const lockedSum      = lockedOthers.reduce((s, r) => s + (parseFloat(r.pct) || 0), 0)
      const remaining      = 100 - newPct - lockedSum

      if (unlockedOthers.length === 0) {
        return rs.map(r => r.id === id ? { ...r, pct: String(newPct) } : r)
      }
      // Clamp to 0 — locked rows may already consume ≥100%, never push unlocked negative
      const safeRemaining = Math.max(0, remaining)
      const perOther = safeRemaining / unlockedOthers.length
      const rounded  = Math.round(perOther * 1000) / 1000
      const sumBase  = rounded * (unlockedOthers.length - 1)
      const lastVal  = Math.max(0, Math.round((safeRemaining - sumBase) * 1000) / 1000)
      const lastId   = unlockedOthers[unlockedOthers.length - 1].id
      return rs.map(r => {
        if (r.id === id) return { ...r, pct: String(newPct) }
        if (r.locked) return r
        return { ...r, pct: String(r.id === lastId ? lastVal : rounded) }
      })
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Income + allocation overview */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          {/* Income — pulled live from this week's transactions */}
          <div>
            <div style={labelStyle}>Weekly Income</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{
                fontSize: 28, fontWeight: 800, color: income > 0 ? 'var(--success)' : 'var(--text-light)',
                fontFamily: 'var(--mono)', letterSpacing: '-0.02em',
              }}>
                {fmt(income)}
              </span>
              {income === 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>log income in Transactions</span>
              )}
            </div>
          </div>

          {/* Allocated % */}
          <div style={{ textAlign: 'right' }}>
            <div style={labelStyle}>Allocated</div>
            <div style={{
              fontSize: 28, fontWeight: 800, marginTop: 4,
              fontFamily: 'var(--mono)', letterSpacing: '-0.02em',
              color: balanced ? 'var(--success)' : over ? 'var(--danger)' : 'var(--warning)',
            }}>
              {totalPct.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Checking / spending money breakdown */}
        {income > 0 && (
          <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-light)', marginBottom: 4 }}>
                Savings (this week)
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                {fmt(savingsWeekly)}
              </div>
              {savingsPct > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{savingsPct}% of income</div>
              )}
            </div>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-light)', marginBottom: 4 }}>
                Checking / Spending
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--mono)', color: checkingAmount >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmt(checkingAmount)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>available to spend</div>
            </div>
          </div>
        )}

        {/* Allocation bar */}
        <div className="progress-wrap" style={{ marginTop: income > 0 ? 14 : 0 }}>
          <div
            className={`progress-fill${over ? ' danger' : !balanced ? ' warning' : ''}`}
            style={{ width: `${Math.min(totalPct, 100)}%` }}
          />
        </div>

        {/* Save row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {syncError && (
            <span style={{ fontSize: 11, color: 'var(--danger, #ef4444)', display: 'flex', alignItems: 'center', gap: 5, maxWidth: 300, wordBreak: 'break-word' }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Sync error: {syncError}
            </span>
          )}
          {!syncError && !planSaved && (
            <span style={{ fontSize: 11, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Unsaved changes
            </span>
          )}
          {!syncError && planSaved && (
            <span style={{ fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved
            </span>
          )}
          <button
            className={planSaved && !syncError ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
            onClick={() => {
              // Auto-deposit weekly savings into each goal
              const todayStr = today()
              if (savingsWeekly > 0) {
                setSavingsGoals(gs => gs.map(g => {
                  const allocPct  = parseFloat(g.allocPct) || 0
                  const weeklyAmt = Math.round((allocPct / 100) * savingsWeekly * 100) / 100
                  if (weeklyAmt <= 0) return g
                  const newSaved  = (parseFloat(g.saved) || 0) + weeklyAmt
                  const logEntry  = { date: todayStr, note: 'Weekly allocation', type: 'deposit', amount: weeklyAmt }
                  const prevLog   = g.adjustments || []
                  return { ...g, saved: newSaved, adjustments: [logEntry, ...prevLog].slice(0, 100) }
                }))
              }
              onSave()
            }}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save plan
          </button>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="filter-row" style={{ marginBottom: 0 }}>
        {[['plan', 'Budget Allocation'], ['savings', 'Savings Goals'], ['subscriptions', 'Subscriptions']].map(([key, label]) => (
          <button
            key={key}
            className={`filter-btn ${subTab === key ? 'active' : ''}`}
            onClick={() => setSubTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'plan' && !balanced && (
        <div style={{
          padding: '9px 14px', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 500,
          background: over ? 'var(--danger-light)' : 'var(--warning-light)',
          border: `1px solid ${over ? 'rgba(255,107,107,0.25)' : 'rgba(242,192,99,0.25)'}`,
          color: over ? 'var(--danger)' : 'var(--warning)',
        }}>
          {over
            ? `Over-allocated by ${(totalPct - 100).toFixed(1)}% — reduce by ${fmtAmt((totalPct - 100) / 100 * income)}`
            : `${(100 - totalPct).toFixed(1)}% unallocated — ${fmtAmt((100 - totalPct) / 100 * income)} not budgeted yet`
          }
        </div>
      )}

      {/* Spreadsheet table — Budget Allocation tab */}
      {subTab === 'plan' && <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>

          {/* Header row */}
          <div style={{ ...gridRow, padding: '9px 18px', borderBottom: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.025)' }}>
            <div />
            <div style={{ ...colHeader, paddingLeft: 10 }}>Category</div>
            <div style={{ ...colHeader, textAlign: 'right' }}>Weekly $ <span style={{ opacity: 0.55, textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}>(editable)</span></div>
            <div style={{ ...colHeader, textAlign: 'right', paddingRight: 18 }}>% of Income</div>
            <div style={{ ...colHeader, textAlign: 'center' }}>Status</div>
            <div style={{ ...colHeader, textAlign: 'center' }}>Lock</div>
            <div />
          </div>

          {/* Data rows */}
          {rows.map((row, idx) => {
            const color  = PLAN_COLORS[idx % PLAN_COLORS.length]
            const pct    = parseFloat(row.pct) || 0
            const amount = (pct / 100) * income

            // Detect which tab this row is linked to
            const nameLower    = row.name.toLowerCase()
            const isSubsRow    = /subscri|subs/.test(nameLower)
            const isSavingsRow = nameLower.includes('sav') && !isSubsRow
            const isLinked     = isSubsRow || isSavingsRow

            // Subscriptions: does this week's allocation cover the monthly cost?
            const subsCovered  = amount * 4.33 >= monthlySubsTotal - 0.01
            const syncSubsPct  = income > 0 ? Math.ceil(weeklySubsNeeded / income * 1000) / 10 : 0

            return (
              <div
                key={row.id}
                style={{ ...gridRow, padding: isLinked ? '7px 18px' : '5px 18px', borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.022)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                {/* Color accent bar */}
                <div style={{ width: 3, height: isLinked ? 42 : 30, borderRadius: 2, background: color, flexShrink: 0 }} />

                {/* Category name + linked indicator */}
                <div style={{ paddingLeft: 10, paddingRight: 8 }}>
                  <input
                    value={row.name}
                    onChange={e => setRowField(row.id, 'name', e.target.value)}
                    style={{ ...cellInput }}
                    onFocus={e => e.target.style.borderColor = 'var(--border-strong)'}
                    onBlur={e => e.target.style.borderColor = 'transparent'}
                  />

                  {/* Subscriptions link badge */}
                  {isSubsRow && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, paddingLeft: 7 }}>
                      {monthlySubsTotal > 0 ? (
                        <>
                          <span style={{ fontSize: 10, color: subsCovered ? 'var(--success)' : 'var(--warning)', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              {subsCovered ? <polyline points="20 6 9 17 4 12" /> : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
                            </svg>
                            {fmt(monthlySubsTotal)}/mo in Subscriptions tab
                            {!subsCovered && ` · needs ${fmt(weeklySubsNeeded)}/wk`}
                          </span>
                          {income > 0 && (
                            <button
                              onMouseDown={e => { e.preventDefault(); setPct(row.id, syncSubsPct) }}
                              style={{ fontSize: 9, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', lineHeight: 1, flexShrink: 0 }}
                            >sync %</button>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>No subscriptions tracked yet</span>
                      )}
                    </div>
                  )}

                  {/* Savings link badge */}
                  {isSavingsRow && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, paddingLeft: 7 }}>
                      {savingsGoals.length > 0 ? (
                        <span style={{ fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                          {savingsGoals.length} goal{savingsGoals.length !== 1 ? 's' : ''} · {fmt(totalSavingsRemaining)} remaining
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>No savings goals tracked yet</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Weekly amount — editable; typing a $ value auto-updates the % */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', paddingRight: 6, gap: 2 }}>
                  {isSubsRow && monthlySubsTotal > 0 ? (
                    // Subscriptions row: read-only (auto-synced from Subscriptions tab)
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', color: income > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                      {income > 0 ? fmt(weeklySubsNeeded) : '—'}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)', flexShrink: 0 }}>$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={amtEdits[row.id] !== undefined
                          ? amtEdits[row.id]
                          : (income > 0 ? amount.toFixed(2) : '')}
                        onChange={e => setAmtEdits(m => ({ ...m, [row.id]: e.target.value }))}
                        onFocus={e => {
                          e.target.select()
                          if (amtEdits[row.id] === undefined)
                            setAmtEdits(m => ({ ...m, [row.id]: income > 0 ? amount.toFixed(2) : '0' }))
                        }}
                        onBlur={e => {
                          const val = parseFloat(e.target.value)
                          if (!isNaN(val) && val >= 0 && income > 0)
                            setPct(row.id, Math.round(val / income * 100000) / 1000)
                          setAmtEdits(m => { const n = { ...m }; delete n[row.id]; return n })
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                        placeholder={income > 0 ? '0.00' : '—'}
                        disabled={income <= 0}
                        title={income <= 0 ? 'Log income in Transactions first' : 'Type a dollar amount — % updates automatically'}
                        style={{
                          ...cellInput,
                          textAlign: 'right',
                          width: 84,
                          fontFamily: 'var(--mono)',
                          fontWeight: 600,
                          fontSize: 13,
                          border: '1px solid var(--border)',
                          padding: '3px 6px',
                          color: income > 0 ? 'var(--text)' : 'var(--text-muted)',
                        }}
                        onMouseEnter={e => { if (document.activeElement !== e.target) e.target.style.borderColor = 'var(--border-strong)' }}
                        onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.borderColor = 'var(--border)' }}
                      />
                    </div>
                  )}
                  {isSubsRow && monthlySubsTotal > 0 && income > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                      {fmt(monthlySubsTotal)}/mo
                    </span>
                  )}
                </div>

                {/* Percentage — auto for subscriptions row, drum-roll for others */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  {isSubsRow && income > 0 && monthlySubsTotal > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.08)' }}>
                      <span style={{ fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--accent)', minWidth: 30, textAlign: 'right' }}>
                        {(parseFloat(row.pct) || 0).toFixed(1)}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 1 }}>
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                    </div>
                  ) : (
                    <PctPicker value={row.pct} onChange={v => setPct(row.id, v)} />
                  )}
                </div>

                {/* Status dot */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {pct === 0 ? (
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--text-light)', opacity: 0.4 }} />
                  ) : (
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: rowStatus === 'ok' ? 'var(--success)' : rowStatus === 'over' ? 'var(--danger)' : 'var(--warning)',
                      boxShadow: rowStatus === 'ok'
                        ? '0 0 6px rgba(107,227,164,0.7)'
                        : rowStatus === 'over'
                          ? '0 0 6px rgba(255,107,107,0.7)'
                          : '0 0 6px rgba(242,192,99,0.6)',
                    }} />
                  )}
                </div>

                {/* Lock */}
                <button
                  onClick={() => toggleLock(row.id)}
                  title={row.locked ? 'Locked — click to unlock' : 'Click to lock (% won\'t change when others are adjusted)'}
                  style={{
                    background: row.locked ? 'rgba(99,102,241,0.12)' : 'none',
                    border: row.locked ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                    cursor: 'pointer',
                    padding: '4px 5px',
                    borderRadius: 5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: row.locked ? 'var(--accent)' : 'var(--text-light)',
                    opacity: row.locked ? 1 : 0.35,
                    transition: 'opacity .12s, background .12s, border-color .12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={e => { if (!row.locked) e.currentTarget.style.opacity = '0.35' }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    {row.locked
                      ? <path d="M7 11V7a5 5 0 0110 0v4" />
                      : <path d="M7 11V7a5 5 0 019.9-1" />
                    }
                  </svg>
                </button>

                {/* Delete */}
                <button
                  onClick={() => deleteRow(row.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 12, padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-light)'}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )
          })}

          {/* Totals row */}
          <div style={{ ...gridRow, padding: '10px 18px', borderTop: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.025)' }}>
            <div />
            <div style={{ paddingLeft: 10, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total</div>
            <div style={{ textAlign: 'right', paddingRight: 6, fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)' }}>
              {fmtAmt(totalPct / 100 * income)}
            </div>
            <div style={{
              textAlign: 'right', paddingRight: 18,
              fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)',
              color: balanced ? 'var(--success)' : over ? 'var(--danger)' : 'var(--warning)',
            }}>
              {totalPct.toFixed(1)}%
            </div>
            <div />
            <div />
            <div />
          </div>

          {/* Add row footer */}
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
            <button onClick={addRow} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
              + Add category
            </button>
          </div>
        </div>
      </div>}

      {/* ── Savings Goals sub-tab ──────────────────────────────────── */}
      {subTab === 'savings' && (
        <SavingsSheet
          goals={savingsGoals} setGoals={setSavingsGoals}
          nextId={savingsNextId} setNextId={setSavingsNextId}
          income={income} planRows={rows} entries={entries}
          snapshotSavings={snapshotSavings} setSnapshotSavings={setSnapshotSavings}
        />
      )}

      {/* ── Subscriptions sub-tab ──────────────────────────────────── */}
      {subTab === 'subscriptions' && (
        <SubscriptionsSheet
          subs={subscriptions} setSubs={setSubscriptions}
          nextId={subsNextId} setNextId={setSubsNextId}
        />
      )}
    </div>
  )
}

// ─── Savings Sheet (spreadsheet-style savings goals) ─────────────────────────
const savingsGrid = {
  display: 'grid',
  gridTemplateColumns: '4px 1fr 110px 140px 160px 28px 28px',
  alignItems: 'center',
  gap: 0,
  minWidth: 640,
}

const allocGrid = {
  display: 'grid',
  gridTemplateColumns: '4px 1fr 100px 100px 130px 30px',
  alignItems: 'center',
  gap: 0,
  minWidth: 540,
}


function SavingsSheet({ goals, setGoals, nextId, setNextId, income, planRows, entries = [], snapshotSavings, setSnapshotSavings }) {
  const [editCells,    setEditCells]   = useState({})
  const [expandedGoal, setExpandedGoal] = useState(null)
  const [mgmtMode,     setMgmtMode]    = useState('set')
  const [mgmtAmt,      setMgmtAmt]     = useState('')
  const [mgmtNote,     setMgmtNote]    = useState('')
  const [mgmtDate,     setMgmtDate]    = useState(() => today())
  // Reset form whenever user opens a different goal panel
  useEffect(() => {
    setMgmtAmt(''); setMgmtNote(''); setMgmtDate(today()); setMgmtMode('set')
  }, [expandedGoal])

  const savingsRow   = planRows.find(r => /sav/i.test(r.name) && !/subscri|subs/i.test(r.name))
  const weeklyBudget = savingsRow ? (parseFloat(savingsRow.pct) || 0) / 100 * income : 0

  // Only count actually deposited amounts — no phantom income tracking
  function goalEffectiveSaved(goal) {
    return parseFloat(goal.saved) || 0
  }

  const totalTarget = goals.reduce((s, g) => s + (parseFloat(g.target) || 0), 0)
  const totalSaved  = goals.reduce((s, g) => s + (parseFloat(g.saved)  || 0), 0)
  const totalPct    = totalTarget > 0 ? Math.min((totalSaved / totalTarget) * 100, 100) : 0

  // Savings allocation
  const allocTotal    = goals.reduce((s, g) => s + (parseFloat(g.allocPct) || 0), 0)
  const allocBalanced = Math.abs(allocTotal - 100) < 0.1
  const allocOver     = allocTotal > 100.1

  function setAllocPct(id, newPct) {
    setGoals(gs => {
      const lockedOthers   = gs.filter(g => g.id !== id && g.allocLocked)
      const unlockedOthers = gs.filter(g => g.id !== id && !g.allocLocked)
      const lockedSum      = lockedOthers.reduce((s, g) => s + (parseFloat(g.allocPct) || 0), 0)
      const remaining      = 100 - newPct - lockedSum
      if (unlockedOthers.length === 0) return gs.map(g => g.id === id ? { ...g, allocPct: String(newPct) } : g)
      const perOther = remaining / unlockedOthers.length
      const rounded  = Math.round(perOther * 10) / 10
      const sumBase  = rounded * (unlockedOthers.length - 1)
      const lastVal  = Math.round((remaining - sumBase) * 10) / 10
      const lastId   = unlockedOthers[unlockedOthers.length - 1].id
      return gs.map(g => {
        if (g.id === id) return { ...g, allocPct: String(newPct) }
        if (g.allocLocked) return g
        return { ...g, allocPct: String(g.id === lastId ? lastVal : rounded) }
      })
    })
  }

  function toggleAllocLock(id) {
    setGoals(gs => gs.map(g => g.id === id ? { ...g, allocLocked: !g.allocLocked } : g))
  }

  function projectedDate(remaining, weeklyContrib) {
    if (weeklyContrib <= 0 || remaining <= 0) return null
    const weeks = Math.ceil(remaining / weeklyContrib)
    if (weeks > 5200) return null
    const d = new Date()
    d.setDate(d.getDate() + weeks * 7)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  function addGoal() {
    const id = nextId
    setGoals(gs => [...gs, {
      id,
      name: 'New Goal',
      target: 1000,
      saved: 0,
      adjustments: [],
      targetDate: '',
      color: PLAN_COLORS[gs.length % PLAN_COLORS.length],
    }])
    setNextId(n => n + 1)
  }

  function applyMgmt(goalId) {
    const goal = goals.find(g => g.id === goalId)
    if (!goal) return
    const amount = parseFloat(mgmtAmt)
    if (isNaN(amount)) return
    if (mgmtMode === 'set' && amount < 0) return

    const currentSaved = parseFloat(goal.saved) || 0
    let newSaved, logEntry
    if (mgmtMode === 'set') {
      newSaved  = amount
      logEntry  = { date: mgmtDate, note: mgmtNote.trim() || 'Balance set', type: 'set', amount: amount - currentSaved, setTo: amount }
    } else {
      if (amount === 0) return
      newSaved  = Math.max(0, currentSaved + amount)
      logEntry  = { date: mgmtDate, note: mgmtNote.trim() || null, type: 'adjust', amount }
    }

    const prevLog = goal.adjustments || []
    setGoals(gs => gs.map(g => g.id === goalId
      ? { ...g, saved: newSaved, adjustments: [logEntry, ...prevLog].slice(0, 100) }
      : g
    ))
    setMgmtAmt('')
    setMgmtNote('')
  }

  function updateGoal(id, field, value) {
    setGoals(gs => gs.map(g => g.id === id ? { ...g, [field]: value } : g))
  }

  function getCell(id, field, fallback) {
    const key = `${id}-${field}`
    return editCells[key] !== undefined ? editCells[key] : String(fallback ?? '')
  }

  function startEdit(id, field, raw) {
    setEditCells(c => ({ ...c, [`${id}-${field}`]: raw }))
  }

  function commitEdit(id, field, raw) {
    setEditCells(c => { const n = { ...c }; delete n[`${id}-${field}`]; return n })
    if (field === 'name') {
      const trimmed = raw.trim()
      if (trimmed) updateGoal(id, 'name', trimmed)
    } else {
      const v = parseFloat(raw)
      if (!isNaN(v) && v >= 0) updateGoal(id, field, v)
    }
  }

  function projected(remaining, weeklyContrib) {
    if (weeklyContrib <= 0 || remaining <= 0) return null
    const weeks = Math.ceil(remaining / weeklyContrib)
    if (weeks > 2600) return null
    const d = new Date()
    d.setDate(d.getDate() + weeks * 7)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Summary stats */}
      {goals.length > 0 && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Total Saved</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(totalSaved)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Target</div>
            <div className="stat-value">{fmt(totalTarget)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Overall Progress</div>
            <div className="stat-value" style={{ color: totalPct >= 100 ? 'var(--success)' : 'var(--accent)' }}>
              {totalPct.toFixed(1)}%
            </div>
          </div>
          {weeklyBudget > 0 && (
            <div className="stat-card">
              <div className="stat-label">Wk Savings Budget</div>
              <div className="stat-value" style={{ color: 'var(--accent)' }}>{fmt(weeklyBudget)}</div>
            </div>
          )}
        </div>
      )}

      {/* Spreadsheet table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>

          {/* Header */}
          <div style={{ ...savingsGrid, padding: '9px 18px', borderBottom: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.025)' }}>
            <div />
            <div style={{ ...colHeader, paddingLeft: 10 }}>Goal</div>
            <div style={{ ...colHeader, textAlign: 'right' }}>Target</div>
            <div style={{ ...colHeader, textAlign: 'right' }}>Saved</div>
            <div style={{ ...colHeader, paddingLeft: 10 }}>Progress</div>
            <div />
            <div />
          </div>

          {/* Empty state */}
          {goals.length === 0 && (
            <div className="empty" style={{ padding: '36px 20px' }}>
              <div className="empty-icon"><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></div>
              <p>No savings goals yet. Click "+ Add goal" below to start.</p>
            </div>
          )}

          {/* Goal rows */}
          {goals.map((goal, idx) => {
            const color       = goal.color || PLAN_COLORS[idx % PLAN_COLORS.length]
            const totalGoal   = goalEffectiveSaved(goal)
            const target      = parseFloat(goal.target) || 0
            const remaining   = Math.max(target - totalGoal, 0)
            const pct         = target > 0 ? Math.min((totalGoal / target) * 100, 100) : 0
            const complete    = totalGoal >= target && target > 0
            const weeklyContrib = (parseFloat(goal.allocPct) || 0) / 100 * weeklyBudget
            const projDate    = projected(remaining, weeklyContrib)
            const allocPct    = parseFloat(goal.allocPct) || 0
            const isExpanded  = expandedGoal === goal.id
            const adjLog      = goal.adjustments || []

            return (
              <React.Fragment key={goal.id}>
                {/* Main row */}
                <div
                  style={{ ...savingsGrid, padding: '5px 18px', borderBottom: isExpanded ? 'none' : '1px solid var(--border)', transition: 'background .1s', background: isExpanded ? 'rgba(99,102,241,0.04)' : '' }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.022)' }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '' }}
                >
                  {/* Color swatch */}
                  <div style={{ width: 3, height: 30, borderRadius: 2, background: color, flexShrink: 0 }} />

                  {/* Goal name */}
                  <div style={{ paddingLeft: 10, paddingRight: 8 }}>
                    <input
                      value={getCell(goal.id, 'name', goal.name)}
                      onChange={e => startEdit(goal.id, 'name', e.target.value)}
                      onFocus={() => startEdit(goal.id, 'name', goal.name)}
                      onBlur={e => commitEdit(goal.id, 'name', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                      style={{ ...cellInput }}
                      onMouseEnter={e => e.target.style.borderColor = 'var(--border)'}
                      onMouseLeave={e => e.target.style.borderColor = 'transparent'}
                    />
                    {!complete && weeklyBudget > 0 && weeklyContrib === 0 && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 1, paddingLeft: 7 }}>
                        set allocation % below to project
                      </div>
                    )}
                    {projDate && !complete && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, paddingLeft: 7 }}>
                        <span style={{ color: 'var(--text-light)' }}>{fmt(weeklyContrib)}/wk</span>
                        {' → '}
                        <span style={{ color: 'var(--accent)' }}>{projDate}</span>
                      </div>
                    )}
                    {complete && (
                      <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700, marginTop: 1, paddingLeft: 7 }}>✓ Complete!</div>
                    )}
                  </div>

                  {/* Target */}
                  <div style={{ textAlign: 'right', paddingRight: 8 }}>
                    <input
                      type="number" min="0" step="any"
                      value={getCell(goal.id, 'target', goal.target)}
                      onChange={e => startEdit(goal.id, 'target', e.target.value)}
                      onFocus={() => startEdit(goal.id, 'target', String(goal.target))}
                      onBlur={e => commitEdit(goal.id, 'target', e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                      style={{ ...cellInput, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}
                    />
                  </div>

                  {/* Saved — combined total (deposited + auto-tracked) */}
                  <div style={{ textAlign: 'right', paddingRight: 8 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)',
                      color: complete ? 'var(--success)' : 'var(--text)',
                      padding: '2px 6px',
                    }}>
                      {fmt(totalGoal)}
                    </div>
                  </div>

                  {/* Progress bar + % */}
                  <div style={{ paddingLeft: 10, paddingRight: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                        <div style={{
                          position: 'absolute', left: 0, top: 0, height: '100%',
                          width: `${pct}%`,
                          background: complete ? 'var(--success)' : color,
                          borderRadius: 3,
                          boxShadow: pct > 0 ? `0 0 6px ${color}88` : 'none',
                          transition: 'width .35s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: complete ? 'var(--success)' : 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Edit button */}
                  <button
                    onClick={() => setExpandedGoal(isExpanded ? null : goal.id)}
                    title={isExpanded ? 'Close' : 'Edit saved amount'}
                    style={{
                      background: isExpanded ? 'rgba(99,102,241,0.15)' : 'none',
                      border: isExpanded ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                      cursor: 'pointer', padding: '4px 5px', borderRadius: 5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isExpanded ? 'var(--accent)' : 'var(--text-light)',
                      opacity: isExpanded ? 1 : 0.4,
                      transition: 'opacity .12s, background .12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; if (!isExpanded) e.currentTarget.style.background = 'rgba(99,102,241,0.08)' }}
                    onMouseLeave={e => { if (!isExpanded) { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.background = 'none' } }}
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setGoals(gs => gs.filter(g => g.id !== goal.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 12, padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-light)'}
                  ><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>

                {/* ── Edit panel ── */}
                {isExpanded && (
                  <div style={{
                    padding: '14px 20px 16px',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: `3px solid ${color}`,
                    background: 'rgba(99,102,241,0.04)',
                  }}>
                    {/* Mode toggle */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                      {[['set', 'Set Balance'], ['adjust', 'Adjust (±)']].map(([m, label]) => (
                        <button key={m} className={`filter-btn${mgmtMode === m ? ' active' : ''}`}
                          onClick={() => { setMgmtMode(m); setMgmtAmt('') }} style={{ fontSize: 12 }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                          {mgmtMode === 'set' ? 'Current balance ($)' : 'Amount (±$)'}
                        </div>
                        <input
                          type="number" step="0.01" min={mgmtMode === 'set' ? '0' : undefined}
                          value={mgmtAmt}
                          onChange={e => setMgmtAmt(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && applyMgmt(goal.id)}
                          placeholder={mgmtMode === 'set' ? 'e.g. 500' : 'e.g. −200 or 150'}
                          style={{ width: 130 }}
                          autoFocus
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Note (optional)</div>
                        <input
                          value={mgmtNote}
                          onChange={e => setMgmtNote(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && applyMgmt(goal.id)}
                          placeholder="e.g. Correction, withdrawal…"
                          style={{ width: 220 }}
                        />
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => applyMgmt(goal.id)}
                        disabled={!mgmtAmt || isNaN(parseFloat(mgmtAmt)) || (mgmtMode === 'set' && parseFloat(mgmtAmt) < 0)}
                        style={{ alignSelf: 'flex-end' }}
                      >
                        {mgmtMode === 'set' ? 'Set Balance' : 'Apply'}
                      </button>
                    </div>

                    {/* History log */}
                    {adjLog.length > 0 && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-light)', marginBottom: 6 }}>History</div>
                        {adjLog.slice(0, 8).map((a, i) => (
                          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: i < Math.min(adjLog.length - 1, 7) ? '1px solid var(--border)' : 'none' }}>
                            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--mono)', width: 84, flexShrink: 0, fontSize: 11 }}>{a.date || '—'}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, width: 90, flexShrink: 0, color: a.type === 'set' ? 'var(--accent)' : (a.amount || 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {a.type === 'set' ? `= ${fmt(a.setTo)}` : (a.amount || 0) >= 0 ? `+${fmt(a.amount)}` : `−${fmt(Math.abs(a.amount))}`}
                            </span>
                            <span style={{ color: 'var(--text-muted)', flex: 1, fontStyle: a.note ? 'normal' : 'italic' }}>
                              {a.note || (a.type === 'set' ? 'Balance set' : a.type === 'deposit' ? 'Deposit' : 'Adjustment')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            )
          })}

          {/* Totals row */}
          {goals.length > 0 && (
            <div style={{ ...savingsGrid, padding: '10px 18px', borderTop: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.025)' }}>
              <div />
              <div style={{ paddingLeft: 10, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total</div>
              <div style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)' }}>{fmtAmt(totalTarget)}</div>
              <div style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--success)' }}>{fmtAmt(totalSaved)}</div>
              <div style={{ paddingLeft: 10, paddingRight: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${totalPct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width .35s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>{totalPct.toFixed(0)}%</span>
                </div>
              </div>
              <div />
              <div />
            </div>
          )}

          {/* Add row footer */}
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={addGoal} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
              + Add goal
            </button>
            {goals.some(g => (parseFloat(g.saved) || 0) > 0 || (g.adjustments || []).length > 0) && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, color: 'var(--text-muted)' }}
                onClick={() => {
                  if (!window.confirm('Reset all saved amounts to $0? This clears all deposits and history. Targets, percentages, and goal names stay the same.')) return
                  setGoals(gs => gs.map(g => ({ ...g, saved: 0, adjustments: [] })))
                }}
              >
                Reset all to $0
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Savings Allocation Grid ──────────────────────────────────── */}
      {goals.length > 0 && weeklyBudget > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={labelStyle}>Weekly Savings Allocation</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(weeklyBudget)}/wk to distribute</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: allocBalanced ? 'var(--success)' : allocOver ? 'var(--danger)' : 'var(--warning)' }}>
              {allocTotal.toFixed(1)}%
            </span>
          </div>

          {/* Balance warning */}
          {!allocBalanced && (
            <div style={{ padding: '8px 14px', fontSize: 12, fontWeight: 500, background: allocOver ? 'var(--danger-light)' : 'var(--warning-light)', color: allocOver ? 'var(--danger)' : 'var(--warning)', borderBottom: '1px solid var(--border)' }}>
              {allocOver
                ? `Over-allocated by ${(allocTotal - 100).toFixed(1)}%`
                : `${(100 - allocTotal).toFixed(1)}% unallocated — ${fmt((100 - allocTotal) / 100 * weeklyBudget)}/wk unassigned`
              }
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            {/* Header row */}
            <div style={{ ...allocGrid, padding: '9px 18px', borderBottom: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.025)' }}>
              <div />
              <div style={{ ...colHeader, paddingLeft: 10 }}>Goal</div>
              <div style={{ ...colHeader, textAlign: 'right' }}>Weekly $</div>
              <div style={{ ...colHeader, textAlign: 'right', paddingRight: 14 }}>% of Savings</div>
              <div style={{ ...colHeader, paddingLeft: 10 }}>Projected Done</div>
              <div style={{ ...colHeader, textAlign: 'center' }}>Lock</div>
            </div>

            {/* Goal rows */}
            {goals.map((goal, idx) => {
              const color      = goal.color || PLAN_COLORS[idx % PLAN_COLORS.length]
              const allocPct   = parseFloat(goal.allocPct) || 0
              const weeklyAmt  = (allocPct / 100) * weeklyBudget
              const saved      = parseFloat(goal.saved) || 0
              const remaining  = Math.max((parseFloat(goal.target) || 0) - saved, 0)
              const proj       = projectedDate(remaining, weeklyAmt)

              return (
                <div
                  key={goal.id}
                  style={{ ...allocGrid, padding: '5px 18px', borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.022)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <div style={{ width: 3, height: 30, borderRadius: 2, background: color, flexShrink: 0 }} />

                  <div style={{ paddingLeft: 10, paddingRight: 8, fontSize: 13, fontWeight: 500 }}>
                    {goal.name}
                  </div>

                  <div style={{ textAlign: 'right', paddingRight: 8, fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', color: weeklyAmt > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                    {allocPct > 0 ? fmt(weeklyAmt) : '—'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <PctPicker value={goal.allocPct || '0'} onChange={v => setAllocPct(goal.id, v)} />
                  </div>

                  <div style={{ paddingLeft: 10, fontSize: 12, fontStyle: !proj ? 'italic' : 'normal', color: proj ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {proj || (allocPct === 0 ? 'set % to project' : '—')}
                  </div>

                  <button
                    onClick={() => toggleAllocLock(goal.id)}
                    title={goal.allocLocked ? 'Locked — click to unlock' : 'Lock this allocation'}
                    style={{
                      background: goal.allocLocked ? 'rgba(99,102,241,0.12)' : 'none',
                      border: goal.allocLocked ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                      cursor: 'pointer', padding: '4px 5px', borderRadius: 5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: goal.allocLocked ? 'var(--accent)' : 'var(--text-light)',
                      opacity: goal.allocLocked ? 1 : 0.35,
                      transition: 'opacity .12s, background .12s, border-color .12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { if (!goal.allocLocked) e.currentTarget.style.opacity = '0.35' }}
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      {goal.allocLocked ? <path d="M7 11V7a5 5 0 0110 0v4" /> : <path d="M7 11V7a5 5 0 019.9-1" />}
                    </svg>
                  </button>
                </div>
              )
            })}

            {/* Totals row */}
            <div style={{ ...allocGrid, padding: '10px 18px', borderTop: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.025)' }}>
              <div />
              <div style={{ paddingLeft: 10, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Total</div>
              <div style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)' }}>
                {fmt(allocTotal / 100 * weeklyBudget)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: allocBalanced ? 'var(--success)' : allocOver ? 'var(--danger)' : 'var(--warning)' }}>
                  {allocTotal.toFixed(1)}%
                </span>
              </div>
              <div />
              <div />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Subscriptions Sheet ─────────────────────────────────────────────────────
const SUB_CYCLES   = ['monthly', 'yearly', 'quarterly', 'weekly']
const SUB_CATS     = ['Entertainment', 'Music & Audio', 'Productivity', 'Cloud & Storage', 'Health & Fitness', 'News & Media', 'Learning', 'Shopping', 'Finance', 'Software', 'Other']

function toMonthly(cost, cycle) {
  const c = parseFloat(cost) || 0
  switch (cycle) {
    case 'weekly':    return c * 52 / 12
    case 'quarterly': return c / 3
    case 'yearly':    return c / 12
    default:          return c  // monthly
  }
}

const subsGrid = {
  display: 'grid',
  gridTemplateColumns: '4px 1fr 90px 120px 96px 130px 110px 42px 30px',
  alignItems: 'center',
  gap: 0,
  minWidth: 760,
}

function SubscriptionsSheet({ subs, setSubs, nextId, setNextId }) {
  const [editCells, setEditCells] = useState({})

  const active       = subs.filter(s => s.active !== false)
  const monthlyTotal = active.reduce((sum, s) => sum + toMonthly(s.cost, s.cycle), 0)
  const annualTotal  = monthlyTotal * 12
  const largest      = active.length ? active.reduce((a, b) => toMonthly(a.cost, a.cycle) > toMonthly(b.cost, b.cycle) ? a : b, active[0]) : null

  function addSub() {
    const id = nextId
    setSubs(ss => [...ss, {
      id,
      name:     'New Subscription',
      cost:     9.99,
      cycle:    'monthly',
      category: 'Entertainment',
      nextDate: '',
      active:   true,
      color:    PLAN_COLORS[ss.length % PLAN_COLORS.length],
    }])
    setNextId(n => n + 1)
  }

  function updateSub(id, field, value) {
    setSubs(ss => ss.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  function getCell(id, field, fallback) {
    const key = `${id}-${field}`
    return editCells[key] !== undefined ? editCells[key] : String(fallback ?? '')
  }

  function startEdit(id, field, raw) {
    setEditCells(c => ({ ...c, [`${id}-${field}`]: raw }))
  }

  function commitEdit(id, field, raw) {
    setEditCells(c => { const n = { ...c }; delete n[`${id}-${field}`]; return n })
    if (field === 'name') {
      const t = raw.trim(); if (t) updateSub(id, 'name', t)
    } else {
      const v = parseFloat(raw); if (!isNaN(v) && v >= 0) updateSub(id, field, v)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Summary stats */}
      {subs.length > 0 && (
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Active</div>
            <div className="stat-value">{active.length}<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}> / {subs.length}</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Monthly Cost</div>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>{fmt(monthlyTotal)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Annual Cost</div>
            <div className="stat-value">{fmt(annualTotal)}</div>
          </div>
          {largest && (
            <div className="stat-card">
              <div className="stat-label">Largest</div>
              <div className="stat-value" style={{ fontSize: 14 }}>{largest.name}</div>
            </div>
          )}
        </div>
      )}

      {/* Spreadsheet */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>

          {/* Header */}
          <div style={{ ...subsGrid, padding: '9px 18px', borderBottom: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.025)' }}>
            <div />
            <div style={{ ...colHeader, paddingLeft: 10 }}>Service</div>
            <div style={{ ...colHeader, textAlign: 'right' }}>Cost</div>
            <div style={{ ...colHeader, paddingLeft: 8 }}>Billing Cycle</div>
            <div style={{ ...colHeader, textAlign: 'right' }}>/ Month</div>
            <div style={{ ...colHeader, paddingLeft: 8 }}>Category</div>
            <div style={{ ...colHeader, textAlign: 'right' }}>Next Billing</div>
            <div style={{ ...colHeader, textAlign: 'center' }}>Active</div>
            <div />
          </div>

          {/* Empty state */}
          {subs.length === 0 && (
            <div className="empty" style={{ padding: '36px 20px' }}>
              <div className="empty-icon"><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>
              <p>No subscriptions yet. Click "+ Add subscription" below.</p>
            </div>
          )}

          {/* Rows */}
          {subs.map((sub, idx) => {
            const color    = sub.color || PLAN_COLORS[idx % PLAN_COLORS.length]
            const monthly  = toMonthly(sub.cost, sub.cycle)
            const inactive = sub.active === false

            return (
              <div
                key={sub.id}
                style={{
                  ...subsGrid,
                  padding: '5px 18px',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background .1s',
                  opacity: inactive ? 0.45 : 1,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.022)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                {/* Color bar */}
                <div style={{ width: 3, height: 30, borderRadius: 2, background: inactive ? 'var(--text-light)' : color, flexShrink: 0 }} />

                {/* Name */}
                <div style={{ paddingLeft: 10, paddingRight: 8 }}>
                  <input
                    value={getCell(sub.id, 'name', sub.name)}
                    onChange={e => startEdit(sub.id, 'name', e.target.value)}
                    onFocus={() => startEdit(sub.id, 'name', sub.name)}
                    onBlur={e => commitEdit(sub.id, 'name', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                    style={{ ...cellInput }}
                    onMouseEnter={e => e.target.style.borderColor = 'var(--border)'}
                    onMouseLeave={e => e.target.style.borderColor = 'transparent'}
                  />
                </div>

                {/* Cost */}
                <div style={{ paddingRight: 8 }}>
                  <input
                    type="number" min="0" step="0.01"
                    value={getCell(sub.id, 'cost', sub.cost)}
                    onChange={e => startEdit(sub.id, 'cost', e.target.value)}
                    onFocus={() => startEdit(sub.id, 'cost', String(sub.cost))}
                    onBlur={e => commitEdit(sub.id, 'cost', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                    style={{ ...cellInput, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600 }}
                  />
                </div>

                {/* Billing cycle */}
                <div style={{ paddingLeft: 8, paddingRight: 8 }}>
                  <select
                    value={sub.cycle}
                    onChange={e => updateSub(sub.id, 'cycle', e.target.value)}
                    style={{ ...cellInput, cursor: 'pointer', fontSize: 12 }}
                  >
                    {SUB_CYCLES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>

                {/* Monthly equiv */}
                <div style={{ textAlign: 'right', paddingRight: 8, fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-muted)', fontWeight: 500 }}>
                  {fmt(monthly)}
                </div>

                {/* Category */}
                <div style={{ paddingLeft: 8, paddingRight: 8 }}>
                  <select
                    value={sub.category || 'Other'}
                    onChange={e => updateSub(sub.id, 'category', e.target.value)}
                    style={{ ...cellInput, cursor: 'pointer', fontSize: 12 }}
                  >
                    {SUB_CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

                {/* Next billing date */}
                <div style={{ paddingRight: 8 }}>
                  <input
                    type="date"
                    value={sub.nextDate || ''}
                    onChange={e => updateSub(sub.id, 'nextDate', e.target.value)}
                    style={{ ...cellInput, fontSize: 12, textAlign: 'right' }}
                  />
                </div>

                {/* Active toggle */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => updateSub(sub.id, 'active', sub.active === false ? true : false)}
                    title={inactive ? 'Paused — click to activate' : 'Active — click to pause'}
                    style={{
                      background: inactive ? 'rgba(255,255,255,0.06)' : `${color}22`,
                      border: `1px solid ${inactive ? 'var(--border)' : color}`,
                      borderRadius: 12,
                      padding: '2px 8px',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.03em',
                      color: inactive ? 'var(--text-muted)' : color,
                      transition: 'all .15s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {inactive ? 'OFF' : 'ON'}
                  </button>
                </div>

                {/* Delete */}
                <button
                  onClick={() => setSubs(ss => ss.filter(s => s.id !== sub.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 12, padding: '4px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-light)'}
                ><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
              </div>
            )
          })}

          {/* Totals row */}
          {subs.length > 0 && (
            <div style={{ ...subsGrid, padding: '10px 18px', borderTop: '1px solid var(--border-strong)', background: 'rgba(255,255,255,0.025)' }}>
              <div />
              <div style={{ paddingLeft: 10, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Active total
              </div>
              <div />
              <div />
              <div style={{ textAlign: 'right', paddingRight: 8, fontWeight: 700, fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--danger)' }}>
                {fmt(monthlyTotal)}
              </div>
              <div />
              <div />
              <div />
              <div />
            </div>
          )}

          {/* Add footer */}
          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
            <button onClick={addSub} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
              + Add subscription
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Overview component ──────────────────────────────────────────────────────
function Overview({ planRows, entries = [], savingsGoals = [], snapshotChecking, setSnapshotChecking, snapshotSavings, setSnapshotSavings }) {
  function getWeekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDay()
    const diff = day >= 5 ? -(day - 5) : -(day + 2)
    d.setDate(d.getDate() + diff)
    return localDate(d)
  }

  function fmtWeekRange(friStr) {
    const start = new Date(friStr + 'T00:00:00')
    const end   = new Date(start)
    end.setDate(end.getDate() + 6)
    const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `Fri ${s} – Thu ${e}`
  }

  const [selectedWeek, setSelectedWeek] = useState(() => getWeekKey(today()))

  const [resetWeeks, setResetWeeks] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('budget-reset-weeks') || '[]')) } catch { return new Set() }
  })
  const isReset = resetWeeks.has(selectedWeek)
  function toggleReset() {
    setResetWeeks(prev => {
      const next = new Set(prev)
      if (next.has(selectedWeek)) next.delete(selectedWeek)
      else next.add(selectedWeek)
      localStorage.setItem('budget-reset-weeks', JSON.stringify([...next]))
      return next
    })
  }

  // ── Snapshot / reality-check state (owned by parent Budget, passed as props) ─
  const [editingField, setEditingField] = useState(null) // 'checking' | 'savings' | null
  const [snapInput,    setSnapInput]    = useState('')

  function saveField(field) {
    const val = parseFloat(snapInput)
    if (isNaN(val) || val < 0) return
    if (field === 'checking') {
      setSnapshotChecking(val)
      localStorage.setItem('overview-snapshot-checking', String(val))
    } else {
      setSnapshotSavings(val)
      localStorage.setItem('overview-snapshot-savings', String(val))
    }
    setEditingField(null)
    setSnapInput('')
  }

  function clearField(field) {
    if (field === 'checking') {
      setSnapshotChecking(null)
      localStorage.removeItem('overview-snapshot-checking')
    } else {
      setSnapshotSavings(null)
      localStorage.removeItem('overview-snapshot-savings')
    }
    setEditingField(null)
  }

  function clearAllSnapshots() {
    setSnapshotChecking(null)
    setSnapshotSavings(null)
    localStorage.removeItem('overview-snapshot-checking')
    localStorage.removeItem('overview-snapshot-savings')
    localStorage.removeItem('overview-snapshot')
    setEditingField(null)
  }

  function offsetWeek(n) {
    const d = new Date(selectedWeek + 'T00:00:00')
    d.setDate(d.getDate() + n * 7)
    setSelectedWeek(d.toISOString().split('T')[0])
  }

  const isCurrentWeek  = selectedWeek === getWeekKey(today())

  // Pull income + expenses for the selected week directly from Supabase entries
  const weekEntries    = entries.filter(e => getWeekKey(e.date) === selectedWeek)
  const weekIncome     = weekEntries.filter(e => e.type === 'income').reduce((s, e) => s + +e.amount, 0)
  const weekExpenses   = weekEntries.filter(e => e.type === 'expense')
  const displayExpenses = isReset ? [] : weekExpenses
  const totalSpent     = displayExpenses.reduce((s, e) => s + +e.amount, 0)

  // Checking snapshot: backsolve effective income so budget bars scale correctly
  // If user has $1,500 in checking after spending $300, effective income ≈ $1,800
  const effectiveIncome = snapshotChecking !== null ? snapshotChecking + totalSpent : weekIncome
  const remaining       = snapshotChecking !== null ? snapshotChecking : effectiveIncome - totalSpent
  const hasSnapshot     = snapshotChecking !== null || snapshotSavings !== null

  // Savings & checking breakdown
  const savingsRowOv   = planRows.find(r => /sav/i.test(r.name) && !/subscri|subs/i.test(r.name))
  const savingsPctOv   = savingsRowOv ? (parseFloat(savingsRowOv.pct) || 0) : 0
  const savingsAmtOv   = savingsPctOv / 100 * effectiveIncome
  const checkingAmtOv  = snapshotChecking !== null ? snapshotChecking : effectiveIncome - savingsAmtOv

  const weekAutoSavings   = savingsPctOv / 100 * effectiveIncome

  // Only count actually deposited amounts — no phantom income tracking
  function goalEffectiveSaved(g) {
    return parseFloat(g.saved) || 0
  }

  const totalTarget  = savingsGoals.reduce((s, g) => s + (parseFloat(g.target) || 0), 0)
  const totalSaved   = savingsGoals.reduce((s, g) => s + (parseFloat(g.saved)  || 0), 0)
  const savedPct     = totalTarget > 0 ? Math.min((totalSaved / totalTarget) * 100, 100) : 0

  const catSpend = {}
  for (const e of displayExpenses) {
    catSpend[e.category] = (catSpend[e.category] || 0) + +e.amount
  }

  // Donut chart
  const r = 70, cx = 90, cy = 90
  const circumference = 2 * Math.PI * r
  const donutData = planRows
    .map((row, idx) => ({ name: row.name, color: PLAN_COLORS[idx % PLAN_COLORS.length], spent: catSpend[row.name] || 0 }))
    .filter(d => d.spent > 0)
  const uncat = displayExpenses.filter(e => !planRows.find(r => r.name === e.category)).reduce((s, e) => s + +e.amount, 0)
  if (uncat > 0) donutData.push({ name: 'Uncategorized', color: '#94a3b8', spent: uncat })

  const segments = []
  let cumOffset = 0
  for (const d of donutData) {
    const dashLen = totalSpent > 0 ? (d.spent / totalSpent) * circumference : 0
    segments.push({ ...d, dashLen, strokeOffset: circumference - cumOffset })
    cumOffset += dashLen
  }

  const weekLabel = fmtWeekRange(selectedWeek)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── My Balances snapshot card ── */}
      <div className="card" style={{
        padding: '16px 20px',
        border: hasSnapshot ? '1px solid rgba(99,102,241,0.45)' : '1px solid var(--border)',
        background: hasSnapshot ? 'rgba(99,102,241,0.05)' : undefined,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.09em', color: hasSnapshot ? 'var(--accent)' : 'var(--text-light)', marginBottom: 2 }}>
              My Balances
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {hasSnapshot ? 'Using your actual balances — budget bars and stats all update' : 'Enter your real balances to override tracked totals'}
            </div>
          </div>
          {hasSnapshot && (
            <button className="btn btn-ghost btn-sm" onClick={clearAllSnapshots} style={{ fontSize: 11 }}>
              Clear all
            </button>
          )}
        </div>

        {/* Two columns: Checking | Savings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* ── Checking ── */}
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: snapshotChecking !== null ? 'rgba(99,102,241,0.08)' : 'var(--bg-raised, rgba(255,255,255,0.03))',
            border: snapshotChecking !== null ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: snapshotChecking !== null ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 6 }}>
              Checking
            </div>
            {editingField === 'checking' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={snapInput}
                    onChange={e => setSnapInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveField('checking'); if (e.key === 'Escape') setEditingField(null) }}
                    placeholder="0.00"
                    style={{ flex: 1, fontSize: 14, fontFamily: 'var(--mono)', fontWeight: 700 }}
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => saveField('checking')} style={{ fontSize: 11, flex: 1 }}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingField(null)} style={{ fontSize: 11 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 20, color: snapshotChecking !== null ? 'var(--text)' : 'var(--text-muted)', marginBottom: 8 }}>
                  {snapshotChecking !== null ? fmt(snapshotChecking) : '—'}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => { setSnapInput(snapshotChecking !== null ? String(snapshotChecking) : ''); setEditingField('checking') }}
                    style={{ fontSize: 11 }}
                  >
                    {snapshotChecking !== null ? 'Change' : 'Enter'}
                  </button>
                  {snapshotChecking !== null && (
                    <button className="btn btn-ghost btn-sm" onClick={() => clearField('checking')} style={{ fontSize: 11 }}>Clear</button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Savings ── */}
          <div style={{
            padding: '12px 14px', borderRadius: 8,
            background: snapshotSavings !== null ? 'rgba(16,185,129,0.07)' : 'var(--bg-raised, rgba(255,255,255,0.03))',
            border: snapshotSavings !== null ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: snapshotSavings !== null ? 'var(--success)' : 'var(--text-muted)', marginBottom: 6 }}>
              Savings
            </div>
            {editingField === 'savings' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={snapInput}
                    onChange={e => setSnapInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveField('savings'); if (e.key === 'Escape') setEditingField(null) }}
                    placeholder="0.00"
                    style={{ flex: 1, fontSize: 14, fontFamily: 'var(--mono)', fontWeight: 700 }}
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => saveField('savings')} style={{ fontSize: 11, flex: 1 }}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingField(null)} style={{ fontSize: 11 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 20, color: snapshotSavings !== null ? 'var(--success)' : 'var(--text-muted)', marginBottom: 8 }}>
                  {snapshotSavings !== null ? fmt(snapshotSavings) : '—'}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => { setSnapInput(snapshotSavings !== null ? String(snapshotSavings) : ''); setEditingField('savings') }}
                    style={{ fontSize: 11 }}
                  >
                    {snapshotSavings !== null ? 'Change' : 'Enter'}
                  </button>
                  {snapshotSavings !== null && (
                    <button className="btn btn-ghost btn-sm" onClick={() => clearField('savings')} style={{ fontSize: 11 }}>Clear</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            Weekly Income
            {snapshotChecking !== null && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />}
          </div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(effectiveIncome)}</div>
          {snapshotChecking !== null ? (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>derived from checking</div>
          ) : null}
        </div>
        {effectiveIncome > 0 && savingsAmtOv > 0 && (
          <div className="stat-card">
            <div className="stat-label">This Week → Savings</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{fmt(weekAutoSavings)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{savingsPctOv}% of income</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {snapshotChecking !== null ? 'To Spend This Week' : 'Checking / Spending'}
            {snapshotChecking !== null && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />}
          </div>
          <div className="stat-value" style={{ color: 'var(--text)' }}>{fmt(checkingAmtOv)}</div>
          {snapshotChecking !== null && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>your checking balance</div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">This Week Spent</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{fmt(totalSpent)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Remaining</div>
          <div className="stat-value" style={{ color: remaining >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {remaining >= 0 ? '+' : ''}{fmt(remaining)}
          </div>
          {snapshotChecking !== null && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>after tracked spend</div>
          )}
        </div>
        {savingsGoals.length > 0 && (
          <div className="stat-card">
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              Total Saved
              {snapshotSavings !== null && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />}
            </div>
            <div className="stat-value" style={{ color: savedPct >= 100 ? 'var(--success)' : '#10b981' }}>
              {fmt(totalSaved)}
            </div>
            {totalTarget > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                {savedPct.toFixed(0)}% of {fmt(totalTarget)} goal
                {snapshotSavings !== null && <span style={{ color: 'var(--success)', marginLeft: 4 }}>actual</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Week selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => offsetWeek(-1)}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span style={{ fontWeight: 600, fontSize: 13, minWidth: 210, textAlign: 'center' }}>
          {weekLabel}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => offsetWeek(1)} disabled={isCurrentWeek}><svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
      </div>

      {/* Category progress bars */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={labelStyle}>Budget vs Actual</span>
            {isReset && (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 6px' }}>
                paused
              </span>
            )}
          </div>
          <button
            onClick={toggleReset}
            style={{
              background: isReset ? 'rgba(107,227,164,0.1)' : 'rgba(255,255,255,0.04)',
              border: isReset ? '1px solid rgba(107,227,164,0.25)' : '1px solid rgba(255,255,255,0.1)',
              color: isReset ? 'var(--success)' : 'var(--text-muted)',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '.02em',
            }}
          >
            {isReset ? 'Restore' : 'Reset bars'}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {planRows.map((row, idx) => {
            const color    = PLAN_COLORS[idx % PLAN_COLORS.length]
            const budget   = (parseFloat(row.pct) || 0) / 100 * effectiveIncome
            const spent    = catSpend[row.name] || 0
            const spentPct = budget > 0 ? (spent / budget) * 100 : 0
            const over     = spentPct > 100
            const warn     = spentPct >= 80 && !over
            const barColor = over ? 'var(--danger)' : warn ? 'var(--warning)' : color

            return (
              <div key={row.id}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{row.name}</span>
                    {over && (
                      <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700, letterSpacing: '.02em' }}>
                        Over by {fmt(spent - budget)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>
                    <span style={{ color: over ? 'var(--danger)' : warn ? 'var(--warning)' : 'var(--text)', fontWeight: 600 }}>
                      {fmt(spent)}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}> / {fmt(budget)}</span>
                  </div>
                </div>
                <div className="progress-wrap">
                  <div style={{
                    height: '100%',
                    width: `${Math.min(spentPct, 100)}%`,
                    background: barColor,
                    borderRadius: 'var(--radius-sm, 3px)',
                    transition: 'width .35s ease',
                    boxShadow: over ? `0 0 8px ${barColor}55` : warn ? `0 0 6px ${barColor}44` : 'none',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: over ? 'var(--danger)' : warn ? 'var(--warning)' : 'var(--text-light)', fontFamily: 'var(--mono)' }}>
                    {spentPct.toFixed(0)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Donut chart */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <div style={{ ...labelStyle, marginBottom: 16 }}>Spending Distribution</div>
        {totalSpent === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg></div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No expenses recorded for this week.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <svg width={180} height={180} style={{ flexShrink: 0 }}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={22} />
              {segments.map((seg, i) => (
                <circle
                  key={i}
                  cx={cx} cy={cy} r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={22}
                  strokeDasharray={`${seg.dashLen} ${circumference}`}
                  strokeDashoffset={seg.strokeOffset}
                  style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
                />
              ))}
              <text x={cx} y={cy - 7} textAnchor="middle"
                style={{ fill: 'var(--text)', fontSize: '15px', fontWeight: 800, fontFamily: 'var(--mono)' }}>
                {fmt(totalSpent)}
              </text>
              <text x={cx} y={cy + 12} textAnchor="middle"
                style={{ fill: 'var(--text-muted)', fontSize: '10px', letterSpacing: '0.06em' }}>
                THIS WEEK
              </text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 180 }}>
              {segments.map((seg, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1 }}>{seg.name}</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                    {((seg.spent / totalSpent) * 100).toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, minWidth: 72, textAlign: 'right' }}>
                    {fmt(seg.spent)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Savings Goals */}
      {savingsGoals.length > 0 && (() => {
        const overallPct  = savedPct
        return (
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={labelStyle}>Savings Goals</div>
              <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-muted)' }}>
                {fmt(totalSaved)} <span style={{ color: 'var(--text-light)' }}>/ {fmt(totalTarget)}</span>
                <span style={{ marginLeft: 10, color: overallPct >= 100 ? 'var(--success)' : 'var(--accent)', fontWeight: 700 }}>
                  {overallPct.toFixed(1)}% overall
                </span>
              </div>
            </div>

            {/* Overall progress bar */}
            <div className="progress-wrap" style={{ marginBottom: 20 }}>
              <div style={{
                height: '100%', width: `${overallPct}%`,
                background: 'var(--accent)',
                borderRadius: 'var(--radius-sm, 3px)',
                transition: 'width .35s ease',
                boxShadow: '0 0 8px rgba(99,102,241,0.4)',
              }} />
            </div>

            {/* Individual goals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {savingsGoals.map((goal, idx) => {
                const color    = goal.color || PLAN_COLORS[idx % PLAN_COLORS.length]
                const saved    = goalEffectiveSaved(goal)
                const target   = parseFloat(goal.target) || 0
                const pct      = target > 0 ? Math.min((saved / target) * 100, 100) : 0
                const complete = saved >= target && target > 0
                const barColor = complete ? 'var(--success)' : color
                const allocPct = parseFloat(goal.allocPct) || 0

                return (
                  <div key={goal.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}80` }} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{goal.name}</span>
                        {snapshotSavings !== null && allocPct > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--success)', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 99, padding: '1px 6px' }}>
                            {allocPct}%
                          </span>
                        )}
                        {complete && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>✓ Done</span>}
                      </div>
                      <div style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>
                        <span style={{ fontWeight: 600, color: complete ? 'var(--success)' : 'var(--text)' }}>{fmt(saved)}</span>
                        <span style={{ color: 'var(--text-muted)' }}> / {fmt(target)}</span>
                      </div>
                    </div>
                    <div className="progress-wrap">
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: barColor,
                        borderRadius: 'var(--radius-sm, 3px)',
                        transition: 'width .35s ease',
                        boxShadow: complete ? '0 0 8px rgba(107,227,164,0.5)' : 'none',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {goal.targetDate
                          ? `target ${new Date(goal.targetDate + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                          : ''}
                      </span>
                      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: complete ? 'var(--success)' : 'var(--text-light)' }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

    </div>
  )
}

// ─── Expenses component ──────────────────────────────────────────────────────
function Expenses({ categories }) {
  const [expenses, setExpenses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('expenses') || '[]') } catch { return [] }
  })
  const [nextId, setNextId] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('expenses') || '[]')
      return stored.length ? Math.max(...stored.map(e => e.id)) + 1 : 1
    } catch { return 1 }
  })
  const [quick, setQuick]       = useState({ date: today(), name: '', amount: '', category: categories[0] || '', notes: '' })
  const [sortBy, setSortBy]     = useState('date')
  const [sortDir, setSortDir]   = useState('desc')
  const [filterCat, setFilterCat] = useState('all')
  const [editId, setEditId]     = useState(null)
  const [editRow, setEditRow]   = useState(null)

  // Persist to localStorage whenever expenses change
  useEffect(() => {
    localStorage.setItem('expenses', JSON.stringify(expenses))
  }, [expenses])

  // Sync quick.category if categories list changes
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(quick.category)) {
      setQuick(q => ({ ...q, category: categories[0] }))
    }
  }, [categories])

  // Auto-populate recurring expenses for this month on mount
  useEffect(() => {
    const thisMonth = today().slice(0, 7)
    const all = JSON.parse(localStorage.getItem('expenses') || '[]')
    const thisMonthNames = new Set(all.filter(e => e.date.startsWith(thisMonth)).map(e => e.name))
    const seen = new Set()
    const toAdd = []
    const sortedDesc = [...all].filter(e => e.recurring).sort((a, b) => b.date.localeCompare(a.date))
    for (const e of sortedDesc) {
      if (!e.date.startsWith(thisMonth) && !thisMonthNames.has(e.name) && !seen.has(e.name)) {
        seen.add(e.name)
        toAdd.push(e)
      }
    }
    if (toAdd.length === 0) return
    const maxId = all.length ? Math.max(...all.map(e => e.id)) : 0
    let id = maxId + 1
    const newExps = toAdd.map(e => ({ ...e, id: id++, date: thisMonth + '-01' }))
    const updated = [...all, ...newExps]
    localStorage.setItem('expenses', JSON.stringify(updated))
    setExpenses(updated)
    setNextId(id)
  }, [])

  function addExpense() {
    if (!quick.name.trim() || !quick.amount) return
    const newExp = {
      id: nextId,
      date: quick.date,
      name: quick.name.trim(),
      amount: parseFloat(quick.amount),
      category: quick.category || categories[0] || '',
      notes: quick.notes,
      recurring: false,
    }
    setExpenses(es => [...es, newExp])
    setNextId(n => n + 1)
    setQuick(q => ({ ...q, name: '', amount: '', notes: '' }))
  }

  function deleteExpense(id) {
    setExpenses(es => es.filter(e => e.id !== id))
  }

  function toggleRecurring(id) {
    setExpenses(es => es.map(e => e.id === id ? { ...e, recurring: !e.recurring } : e))
  }

  function startEdit(exp) {
    setEditId(exp.id)
    setEditRow({ ...exp, amount: String(exp.amount) })
  }

  function saveEdit() {
    setExpenses(es => es.map(e => e.id === editId ? { ...editRow, amount: parseFloat(editRow.amount) || 0 } : e))
    setEditId(null)
    setEditRow(null)
  }

  function toggleSort(key) {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  const sortIcon = key => sortBy !== key ? '' : sortDir === 'asc' ? ' ↑' : ' ↓'

  const filtered = expenses
    .filter(e => filterCat === 'all' || e.category === filterCat)
    .sort((a, b) => {
      let va = a[sortBy], vb = b[sortBy]
      if (sortBy === 'amount') { va = +va; vb = +vb }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const total = filtered.reduce((s, e) => s + e.amount, 0)

  const expCols = [
    { label: 'Date', key: 'date' },
    { label: 'Name', key: 'name' },
    { label: 'Amount', key: 'amount' },
    { label: 'Category', key: 'category' },
    { label: 'Notes', key: 'notes' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Quick Add bar */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ ...labelStyle, marginBottom: 10 }}>Quick Add Expense</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {[
            { label: 'Date', content: <input type="date" value={quick.date} onChange={e => setQuick(q => ({ ...q, date: e.target.value }))} style={{ width: 130 }} /> },
            { label: 'Name', flex: '1 1 140px', content: <input placeholder="Expense name" value={quick.name} onChange={e => setQuick(q => ({ ...q, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addExpense()} /> },
            { label: 'Amount', content: <input type="number" min="0" step="0.01" placeholder="0.00" value={quick.amount} onChange={e => setQuick(q => ({ ...q, amount: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addExpense()} style={{ width: 100 }} /> },
            { label: 'Category', content: (
              <select value={quick.category} onChange={e => setQuick(q => ({ ...q, category: e.target.value }))} style={{ width: 150 }}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            )},
            { label: 'Notes', flex: '1 1 120px', content: <input placeholder="Notes (optional)" value={quick.notes} onChange={e => setQuick(q => ({ ...q, notes: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addExpense()} /> },
          ].map(({ label, flex, content }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: flex || '0 0 auto' }}>
              <span style={{ fontSize: 10, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
              {content}
            </div>
          ))}
          <button
            className="btn btn-primary btn-sm"
            onClick={addExpense}
            disabled={!quick.name.trim() || !quick.amount}
            style={{ flexShrink: 0, alignSelf: 'flex-end', padding: '7px 14px' }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

        {/* Filter + total bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ ...labelStyle, marginRight: 2 }}>Filter:</span>
          <button className={`filter-btn ${filterCat === 'all' ? 'active' : ''}`} onClick={() => setFilterCat('all')}>All</button>
          {categories.map(c => (
            <button key={c} className={`filter-btn ${filterCat === c ? 'active' : ''}`} onClick={() => setFilterCat(c)}>{c}</button>
          ))}
          {filtered.length > 0 && (
            <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--danger)' }}>
              {filtered.length} expense{filtered.length !== 1 ? 's' : ''} · {fmt(total)}
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>

          {/* Header */}
          <div style={{ ...expGrid, padding: '8px 18px', background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid var(--border-strong)' }}>
            {expCols.map(({ label, key }) => (
              <button
                key={key}
                onClick={() => toggleSort(key)}
                style={{
                  ...colHeader, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  textAlign: key === 'amount' ? 'right' : 'left',
                  color: sortBy === key ? 'var(--text)' : undefined,
                }}
              >
                {label}{sortIcon(key)}
              </button>
            ))}
            <div style={{ ...colHeader, textAlign: 'center' }}>Rec.</div>
            <div />
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div className="empty" style={{ padding: '32px 18px' }}>
              <div className="empty-icon"><svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2v20l3-2 2 2 2-2 2 2 2-2 3 2V2l-3 2-2-2-2 2-2-2-2 2-3-2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg></div>
              <p>No expenses yet. Add one above!</p>
            </div>
          ) : filtered.map(exp => (
            editId === exp.id ? (
              <div key={exp.id} style={{ ...expGrid, padding: '6px 18px', borderBottom: '1px solid var(--border)', background: 'rgba(99,102,241,0.06)' }}>
                <input type="date" value={editRow.date} onChange={e => setEditRow(r => ({ ...r, date: e.target.value }))} style={{ fontSize: 12 }} />
                <input value={editRow.name} onChange={e => setEditRow(r => ({ ...r, name: e.target.value }))} style={{ ...cellInput }} />
                <input type="number" min="0" step="0.01" value={editRow.amount} onChange={e => setEditRow(r => ({ ...r, amount: e.target.value }))}
                  style={{ ...cellInput, textAlign: 'right', fontFamily: 'var(--mono)' }} />
                <select value={editRow.category} onChange={e => setEditRow(r => ({ ...r, category: e.target.value }))} style={{ fontSize: 12 }}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
                <input value={editRow.notes} onChange={e => setEditRow(r => ({ ...r, notes: e.target.value }))} style={{ ...cellInput }} placeholder="Notes" />
                <div />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveEdit} style={{ fontSize: 11, padding: '3px 8px' }}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditId(null); setEditRow(null) }} style={{ fontSize: 11, padding: '3px 8px' }}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>
              </div>
            ) : (
              <div
                key={exp.id}
                style={{ ...expGrid, padding: '8px 18px', borderBottom: '1px solid var(--border)', transition: 'background .1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.022)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
                onDoubleClick={() => startEdit(exp)}
              >
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{fmtDate(exp.date)}</div>
                <div style={{ fontSize: 13, fontWeight: 500, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.name}</div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--danger)', paddingRight: 6 }}>{fmt(exp.amount)}</div>
                <div><span className="badge badge-gray">{exp.category}</span></div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.notes}</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    title={exp.recurring ? 'Recurring — click to toggle off' : 'Click to mark as recurring'}
                    onClick={e => { e.stopPropagation(); toggleRecurring(exp.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '2px 4px',
                      opacity: exp.recurring ? 1 : 0.2, color: exp.recurring ? 'var(--accent)' : 'var(--text-muted)' }}
                  >⟳</button>
                </div>
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  <button
                    onClick={e => { e.stopPropagation(); startEdit(exp) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 12, padding: '3px 5px', borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-light)'}
                  ><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteExpense(exp.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: 12, padding: '3px 5px', borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-light)'}
                  ><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Shared style objects ────────────────────────────────────────────────────
const expGrid = {
  display: 'grid',
  gridTemplateColumns: '110px 1fr 100px 130px 1fr 36px 64px',
  alignItems: 'center',
  columnGap: 6,
  minWidth: 620,
}

const gridRow = {
  display: 'grid',
  gridTemplateColumns: '4px 1fr 130px 100px 56px 30px 30px',
  alignItems: 'center',
  gap: 0,
  minWidth: 520,
}

const colHeader = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--text-light)',
  textTransform: 'uppercase', letterSpacing: '.07em',
}

const labelStyle = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--text-light)',
  textTransform: 'uppercase', letterSpacing: '.07em',
}

const cellInput = {
  background: 'transparent',
  border: '1px solid transparent',
  padding: '3px 6px',
  borderRadius: 4,
  fontSize: 13, fontWeight: 500,
  width: '100%',
  color: 'var(--text)',
  transition: 'border-color .12s',
}

// ─── Percentage drum-roll picker ─────────────────────────────────────────────
const PCT_LIST = Array.from({ length: 101 }, (_, i) => i) // 0 … 100

function PctPicker({ value, onChange }) {
  const [open, setOpen]   = useState(false)
  const wrapRef           = useRef(null)
  const listRef           = useRef(null)
  const itemRefs          = useRef({})
  const curFloat          = parseFloat(value) || 0        // actual stored value (may be decimal)
  const cur               = Math.round(curFloat)          // nearest integer for dropdown highlight

  // Close on outside click
  useEffect(() => {
    function onOut(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  // Scroll to current value when dropdown opens
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = itemRefs.current[cur]
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          cursor: 'pointer', padding: '4px 8px',
          borderRadius: 6,
          border: `1px solid ${open ? 'var(--border-strong)' : 'var(--border)'}`,
          background: open ? 'rgba(255,255,255,0.06)' : 'transparent',
          transition: 'background .12s, border-color .12s',
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border-strong)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <span style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 600, minWidth: 30, textAlign: 'right' }}>
          {curFloat.toFixed(1)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
        <span style={{ fontSize: 9, color: 'var(--text-light)', marginLeft: 2, lineHeight: 1 }}><svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
      </div>
      {open && (
        <div ref={listRef} style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          width: 90, zIndex: 300,
          background: '#18181f',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          maxHeight: 216, overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          scrollbarWidth: 'thin',
        }}>
          {PCT_LIST.map(p => {
            const isSel = cur === p
            return (
              <div
                key={p}
                ref={el => { itemRefs.current[p] = el }}
                onMouseDown={e => { e.preventDefault(); onChange(p); setOpen(false) }}
                style={{
                  padding: '7px 12px',
                  cursor: 'pointer',
                  textAlign: 'right',
                  background: isSel ? 'var(--accent)' : 'transparent',
                  color: isSel ? '#fff' : 'var(--text-muted)',
                  fontFamily: 'var(--mono)',
                  fontWeight: isSel ? 700 : 400,
                  fontSize: 13,
                  transition: 'background .08s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
              >
                {p}%
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function today() {
  // Use local date parts — toISOString() returns UTC and can be a day ahead in US timezones
  return localDate(new Date())
}
function weekKey(dateStr) {
  // Weeks run Friday → Thursday; rewind to most recent Friday
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay() // 0=Sun,1=Mon,...,5=Fri,6=Sat
  const diff = day >= 5 ? -(day - 5) : -(day + 2)
  d.setDate(d.getDate() + diff)
  return localDate(d)
}
function fmt(n)        { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtAmt(n)     { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d)    { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
