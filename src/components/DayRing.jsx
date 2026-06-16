import { useState, useEffect } from 'react'

const WAKE_HOUR  = 8
const SLEEP_HOUR = 24
const CIRCUMFERENCE = 2 * Math.PI * 52

const PALETTE = [
  [255, 216, 158],  // 0%   morning gold
  [255, 205, 121],  // 12.5%
  [255, 227, 143],  // 25%  bright midday
  [255, 183, 106],  // 37.5%
  [255, 149,  89],  // 50%  amber
  [243, 111,  79],  // 62.5%
  [226,  93, 122],  // 75%  sunset pink
  [123,  91, 176],  // 87.5% twilight
  [ 47,  58, 102],  // 100% deep night
]

function lerpColor(pct) {
  const scaled = (pct / 100) * (PALETTE.length - 1)
  const lo = Math.floor(scaled)
  const hi = Math.min(lo + 1, PALETTE.length - 1)
  const t  = scaled - lo
  return PALETTE[lo].map((c, i) => Math.round(c + (PALETTE[hi][i] - c) * t))
}

function fmtClock(now) {
  let h = now.getHours(), m = now.getMinutes()
  const ampm = h < 12 ? 'AM' : 'PM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtRemaining(totalMinutes) {
  const h = Math.floor(Math.abs(totalMinutes) / 60)
  const m = Math.abs(totalMinutes) % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function computeState() {
  const now = new Date()
  const hours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600

  if (hours < WAKE_HOUR) {
    const minsUntil = Math.round((WAKE_HOUR - hours) * 60)
    return {
      pct: 0, color: '#4D4B47', phase: 'SLEEPING',
      status: '😴 Still sleeping',
      remaining: `${fmtRemaining(minsUntil)} until wake-up`,
      clock: fmtClock(now), sleeping: true,
    }
  }
  if (hours >= SLEEP_HOUR) {
    return {
      pct: 100, color: '#E25D7A', phase: 'PAST BEDTIME',
      status: '⚠️ Past bedtime',
      remaining: 'Sleep!',
      clock: fmtClock(now), sleeping: false,
    }
  }

  const pct = ((hours - WAKE_HOUR) / (SLEEP_HOUR - WAKE_HOUR)) * 100
  const [r, g, b] = lerpColor(pct)
  const color = `rgb(${r},${g},${b})`
  const minsLeft = Math.round(((SLEEP_HOUR - hours) * 60))

  let phase, status
  if (pct < 25)      { phase = 'MORNING';   status = '☀️ Morning — fresh start' }
  else if (pct < 50) { phase = 'MIDDAY';    status = '⚡ Midday — keep moving' }
  else if (pct < 75) { phase = 'AFTERNOON'; status = '🔥 Afternoon — push it' }
  else if (pct < 90) { phase = 'EVENING';   status = '⏳ Evening — wrap up' }
  else               { phase = 'BEDTIME';   status = '🌙 Bedtime soon' }

  return { pct, color, phase, status, remaining: `${fmtRemaining(minsLeft)} left`, clock: fmtClock(now), sleeping: false }
}

export default function DayRing() {
  const [state, setState] = useState(computeState)

  useEffect(() => {
    const tick = () => setState(computeState())
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const offset = CIRCUMFERENCE * (1 - state.pct / 100)
  const pctLabel = state.sleeping ? '—' : `${Math.round(state.pct)}%`

  return (
    <div className="day-ring-wrap">
      <div className="day-ring-inner">
        <div className="day-ring-svg-wrap">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <filter id="ringGlow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* Track */}
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="8"
            />
            {/* Fill */}
            <circle
              cx="60" cy="60" r="52"
              fill="none"
              stroke={state.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              filter="url(#ringGlow)"
              style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.7s ease' }}
            />
          </svg>

          <div className="day-ring-overlay">
            <div className="day-ring-pct" style={{ color: state.sleeping ? 'var(--text-light)' : 'var(--text)' }}>
              {pctLabel}
            </div>
            <div className="day-ring-phase">{state.phase}</div>
            <div className="day-ring-clock">{state.clock}</div>
          </div>
        </div>

        <div className="day-ring-status">{state.status}</div>
        <div className="day-ring-remaining">{state.remaining}</div>
      </div>
    </div>
  )
}
