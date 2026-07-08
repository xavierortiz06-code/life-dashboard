import { useState, useMemo } from 'react'
import { buildOrderFood } from '../lib/restaurantMenus'
import { FoodIcon } from '../lib/foodIcons'

const GREEN = '#10b981'

// Animated counter — the number springs when it changes
function LiveStat({ label, value, unit, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 54 }}>
      <div key={value} style={{
        fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)', lineHeight: 1,
        color, animation: 'rbPop .3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}>
        {value}{unit && <span style={{ fontSize: 11, opacity: 0.6 }}>{unit}</span>}
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-light)', marginTop: 4 }}>
        {label}
      </div>
    </div>
  )
}

export default function RestaurantBuilder({ restaurant, onAdd, onClose }) {
  // selections: { "sectionKey|itemName": count }
  const [selections, setSelections] = useState(() => {
    const init = {}
    // Preselect the first option of required single-choice sections
    for (const sec of restaurant.builder.sections) {
      if (sec.mode === 'single' && sec.required) init[`${sec.key}|${sec.items[0].name}`] = 1
    }
    return init
  })
  const [adding, setAdding] = useState(false)

  const order = useMemo(() => buildOrderFood(restaurant, selections), [restaurant, selections])

  function toggle(sec, it) {
    const key = `${sec.key}|${it.name}`
    setSelections(prev => {
      const next = { ...prev }
      if (sec.mode === 'single') {
        // Clear other picks in this section
        for (const other of sec.items) delete next[`${sec.key}|${other.name}`]
        if (!prev[key]) next[key] = 1
        else if (!sec.required) delete next[key]
        else next[key] = 1
        return next
      }
      // Multi: cycle 0 → 1 → 2 → 0 (double portions supported)
      const cur = prev[key] || 0
      if (cur === 0) next[key] = 1
      else if (cur === 1) next[key] = 2
      else delete next[key]
      return next
    })
  }

  async function handleAdd() {
    if (!order || adding) return
    setAdding(true)
    await onAdd(order)
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 560, maxHeight: '86vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--panel-bg, #0f0f16)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        animation: 'rbIn .3s cubic-bezier(0.22, 1, 0.36, 1)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'linear-gradient(180deg, rgba(167,139,250,0.08) 0%, transparent 100%)',
        }}>
          <FoodIcon category="restaurant" size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>{restaurant.builder.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              Official published nutrition · tap items to add, tap again for double
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, width: 30, height: 30, cursor: 'pointer',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 18px' }}>
          {restaurant.builder.sections.map((sec, si) => (
            <div key={sec.key} style={{ marginBottom: 16, animation: `rbRow .35s ${si * 0.05}s cubic-bezier(0.22,1,0.36,1) both` }}>
              <div style={{
                fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em',
                color: 'var(--text-light)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {sec.title}
                {sec.mode === 'single' && <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: 'none', opacity: 0.6 }}>pick one</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sec.items.map(it => {
                  const count = selections[`${sec.key}|${it.name}`] || 0
                  const on = count > 0
                  return (
                    <button
                      key={it.name}
                      onClick={() => toggle(sec, it)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                        border: `1px solid ${on ? `${GREEN}55` : 'rgba(255,255,255,0.1)'}`,
                        background: on ? `${GREEN}1a` : 'rgba(255,255,255,0.035)',
                        color: on ? GREEN : 'var(--text-muted)',
                        transition: 'all .15s cubic-bezier(0.22,1,0.36,1)',
                        transform: on ? 'scale(1.02)' : 'scale(1)',
                      }}
                    >
                      {on && (
                        <span style={{ display: 'inline-flex', animation: 'rbPop .25s cubic-bezier(0.34,1.56,0.64,1)' }}>
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </span>
                      )}
                      {it.name}
                      {count > 1 && <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 11 }}>×{count}</span>}
                      <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', opacity: 0.65, fontWeight: 700 }}>
                        {it.cal > 0 ? `${it.cal}` : '0'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sticky totals + add */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '14px 20px',
          background: 'rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ display: 'flex', gap: 14, flex: 1 }}>
            <LiveStat label="Calories" value={order?.calories ?? 0} color={GREEN} />
            <LiveStat label="Protein" value={Math.round(order?.protein ?? 0)} unit="g" color="#6366f1" />
            <LiveStat label="Carbs" value={Math.round(order?.carbs ?? 0)} unit="g" color="#f59e0b" />
            <LiveStat label="Fat" value={Math.round(order?.fat ?? 0)} unit="g" color="#ef4444" />
          </div>
          <button
            onClick={handleAdd}
            disabled={!order || adding}
            className="btn btn-primary"
            style={{ padding: '10px 20px', fontSize: 13, opacity: !order ? 0.4 : 1 }}
          >
            {adding ? 'Adding…' : 'Add to log'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes rbIn {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes rbRow {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes rbPop {
          0%   { transform: scale(0.6); }
          60%  { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
