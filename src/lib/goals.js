import { useState, useEffect } from 'react'

// Single source of truth for daily macro goals.
// Stored in localStorage (synced to Supabase user_settings by the Nutrition page);
// every consumer reads through here and live-updates via the change event,
// so Nutrition, the Workouts "Today's Fuel" card, and anything else always agree.
const KEYS = { cal: 'calorie_goal', prot: 'protein_goal', carbs: 'carb_goal', fat: 'fat_goal' }
export const MACRO_DEFAULTS = { cal: 4500, prot: 180, carbs: 500, fat: 120 }

const EVT = 'macro-goals-changed'

export function getMacroGoals() {
  const out = {}
  for (const [k, lsKey] of Object.entries(KEYS)) {
    const v = parseInt(localStorage.getItem(lsKey))
    out[k] = Number.isFinite(v) && v > 0 ? v : MACRO_DEFAULTS[k]
  }
  return out
}

export function setMacroGoals(goals) {
  for (const [k, lsKey] of Object.entries(KEYS)) {
    if (Number.isFinite(goals[k]) && goals[k] > 0) localStorage.setItem(lsKey, String(goals[k]))
  }
  window.dispatchEvent(new CustomEvent(EVT))
}

export function useMacroGoals() {
  const [goals, setGoals] = useState(getMacroGoals)
  useEffect(() => {
    const update = () => setGoals(getMacroGoals())
    window.addEventListener(EVT, update)
    return () => window.removeEventListener(EVT, update)
  }, [])
  return goals
}
