import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import { cacheGet, cacheSet } from '../lib/cache'
import { MACRO_DEFAULTS, setMacroGoals } from '../lib/goals'
import SkeletonList from '../components/Skeleton'
import { getActiveDate, formatShortDate } from '../lib/dateUtils'
import { BarcodeDetector as BarcodeDetectorPolyfill } from 'barcode-detector'
import { searchFoods, lookupBarcode as offLookupBarcode, getCustomFoods, saveCustomFood, deleteCustomFood, macrosFor } from '../lib/foodApi'

// Photo AI needs a real backend — keep the UI but disable until one exists
const PHOTO_AI_ENABLED = false

// ── Constants ──────────────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch'     },
  { key: 'dinner',    label: 'Dinner'    },
  { key: 'snacks',    label: 'Snacks'    },
]

// Defaults live in lib/goals.js — the shared source of truth for macro goals
const DEFAULT_CAL   = MACRO_DEFAULTS.cal
const DEFAULT_PROT  = MACRO_DEFAULTS.prot
const DEFAULT_CARBS = MACRO_DEFAULTS.carbs
const DEFAULT_FAT   = MACRO_DEFAULTS.fat

const GREEN  = '#10b981'
const BLUE   = '#3b82f6'
const AMBER  = '#f59e0b'
const PURPLE = '#a855f7'
const RED    = '#ef4444'

const RING_R    = 80
const RING_CIRC = 2 * Math.PI * RING_R

const SERVING_OPTIONS = [
  { label: '¼',  value: 0.25  },
  { label: '⅓',  value: 0.333 },
  { label: '½',  value: 0.5   },
  { label: '⅔',  value: 0.667 },
  { label: '¾',  value: 0.75  },
  { label: '1',  value: 1     },
  { label: '1½', value: 1.5   },
  { label: '2',  value: 2     },
  { label: '2½', value: 2.5   },
  { label: '3',  value: 3     },
  { label: '4',  value: 4     },
  { label: '5',  value: 5     },
]

const AI_SYSTEM = `You are a friendly, plain-spoken nutrition coach embedded in a food tracker. Speak simply and conversationally — like texting a knowledgeable friend. Keep responses to 1-3 sentences max. When asked about food, describe what's in it naturally. You have access to what the user has eaten today.`

// ── Helpers ────────────────────────────────────────────────────────────────────
function extractJSON(text) {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0, end = -1
  for (let i = start; i < text.length; i++) {
    if      (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

function shiftDate(dateStr, delta) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().split('T')[0]
}

function fmtNavDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const planKey = date => `nut-plan-${date}`

function loadPlan(date) {
  try { return JSON.parse(localStorage.getItem(planKey(date)) || '[]') } catch { return [] }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Nutrition() {
  const { user } = useApp()
  const today    = getActiveDate()

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(today)
  const isToday    = selectedDate === today
  const isFuture   = selectedDate > today

  // Data
  const nutCache = cacheGet(`nutrition:${selectedDate}`)
  const [entries,      setEntries]      = useState(nutCache?.entries ?? [])
  const [loading,      setLoading]      = useState(!nutCache)
  const [workoutToday, setWorkoutToday] = useState(nutCache?.workoutToday ?? false)

  // Planned meals (localStorage per day)
  const [plannedMeals, setPlannedMeals] = useState(() => loadPlan(today))

  // Goals
  const [calGoal,  setCalGoal]  = useState(() => parseInt(localStorage.getItem('calorie_goal')  || DEFAULT_CAL))
  const [protGoal, setProtGoal] = useState(() => parseInt(localStorage.getItem('protein_goal')  || DEFAULT_PROT))
  const [carbGoal, setCarbGoal] = useState(() => parseInt(localStorage.getItem('carb_goal')     || DEFAULT_CARBS))
  const [fatGoal,  setFatGoal]  = useState(() => parseInt(localStorage.getItem('fat_goal')      || DEFAULT_FAT))
  const [goalsEditing, setGoalsEditing] = useState(false)
  const [goalsDraft,   setGoalsDraft]   = useState({ cal: '', prot: '', carbs: '', fat: '' })

  // Section UI
  const [expanded,  setExpanded]  = useState({ breakfast: true, lunch: false, dinner: false, snacks: false })
  const [addingTo,  setAddingTo]  = useState(null)
  const [planMode,  setPlanMode]  = useState(false)

  // Inline entry edit
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({ food_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '' })

  // Search
  const [searchQuery,  setSearchQuery]  = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching,    setSearching]    = useState(false)
  const [searchError,  setSearchError]  = useState('')

  // Live database suggestions (USDA autocomplete)
  const [suggestions,    setSuggestions]    = useState([])
  const [suggestsOpen,   setSuggestsOpen]   = useState(false)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const suggestTimeout = useRef(null)
  const suggestReqId   = useRef(0)

  // Saved meals (quick single-food saves)
  const [savedMeals, setSavedMeals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nutrition-saved-meals') || '[]') } catch { return [] }
  })

  // Custom meals (multi-ingredient meal creator)
  const [customMeals, setCustomMeals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nutrition-custom-meals') || '[]') } catch { return [] }
  })
  const [mealCreatorOpen,  setMealCreatorOpen]  = useState(false)
  const [newMealName,      setNewMealName]      = useState('')
  const [newMealItems,     setNewMealItems]     = useState([])
  const [mealIngSearch,    setMealIngSearch]    = useState('')
  const [mealIngResult,    setMealIngResult]    = useState(null)
  const [mealIngSearching, setMealIngSearching] = useState(false)
  const [logMealSection,   setLogMealSection]   = useState({}) // { mealId: sectionKey }
  const [editMealId,       setEditMealId]       = useState(null) // for expanding meal detail

  // Serving size controls (reset on each new search result)
  const [servings,   setServings]   = useState(1)
  const [gramsInput, setGramsInput] = useState('')
  const [qtyMode,    setQtyMode]    = useState('servings')
  const [measureIdx, setMeasureIdx] = useState(0)
  const [suggestFailed, setSuggestFailed] = useState(false)

  // Add-panel source tabs + custom food / quick add forms
  const [foodTab,        setFoodTab]        = useState('all') // all | recent | frequent | myfoods | meals
  const [customFoodOpen, setCustomFoodOpen] = useState(false)
  const [customDraft,    setCustomDraft]    = useState({ name: '', brand: '', label: '', grams: '', cal: '', prot: '', carbs: '', fat: '' })
  const [quickOpen,      setQuickOpen]      = useState(false)
  const [quickDraft,     setQuickDraft]     = useState({ name: '', cal: '', prot: '', carbs: '', fat: '' })
  const [myFoods,        setMyFoods]        = useState(getCustomFoods)
  const [, setUsageTick] = useState(0) // re-render after recording recent/frequent use

  const recentFoods = (() => {
    try { return JSON.parse(localStorage.getItem('nutrition-recent-foods') || '[]') } catch { return [] }
  })()
  const frequentFoods = (() => {
    try {
      const counts = JSON.parse(localStorage.getItem('nutrition-food-counts') || '{}')
      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 15).map(x => ({ ...x.food, _count: x.count }))
    } catch { return [] }
  })()

  // Macro panel
  const [panelOpen, setPanelOpen] = useState(false)
  const panelRef = useRef(null)

  // MFP screenshot import
  const [mfpOpen,    setMfpOpen]    = useState(false)
  const [mfpImage,   setMfpImage]   = useState(null)   // { base64, mediaType, preview }
  const [mfpParsing, setMfpParsing] = useState(false)
  const [mfpItems,   setMfpItems]   = useState(null)   // null = not parsed yet
  const [mfpSel,     setMfpSel]     = useState(new Set())
  const [mfpLogging, setMfpLogging] = useState(false)
  const [mfpError,   setMfpError]   = useState(null)
  const mfpFileRef = useRef(null)

  // MFP CSV import
  const [csvOpen,    setCsvOpen]    = useState(false)
  const [csvItems,   setCsvItems]   = useState(null)   // parsed rows grouped by date
  const [csvSel,     setCsvSel]     = useState(new Set())
  const [csvLogging, setCsvLogging] = useState(false)
  const [csvError,   setCsvError]   = useState(null)
  const csvFileRef = useRef(null)

  // Camera / scanner mode ('search' | 'barcode' | 'photo')
  const [addMode, setAddMode] = useState('search')

  // ── Cloud sync: load goals + saved meals from Supabase on mount ──────────────
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('user_settings')
      .select('key, value')
      .eq('user_id', user.id)
      .in('key', ['nutrition_goals', 'nutrition_saved_meals', 'nutrition_custom_meals'])
      .then(({ data }) => {
        if (!data) return
        for (const row of data) {
          if (row.key === 'nutrition_goals') {
            const g = row.value || {}
            setMacroGoals(g)
            if (g.cal)   { setCalGoal(g.cal);   localStorage.setItem('calorie_goal', String(g.cal))   }
            if (g.prot)  { setProtGoal(g.prot);  localStorage.setItem('protein_goal', String(g.prot))  }
            if (g.carbs) { setCarbGoal(g.carbs); localStorage.setItem('carb_goal',    String(g.carbs)) }
            if (g.fat)   { setFatGoal(g.fat);    localStorage.setItem('fat_goal',     String(g.fat))   }
          }
          if (row.key === 'nutrition_saved_meals' && Array.isArray(row.value)) {
            setSavedMeals(row.value)
            localStorage.setItem('nutrition-saved-meals', JSON.stringify(row.value))
          }
          if (row.key === 'nutrition_custom_meals' && Array.isArray(row.value)) {
            setCustomMeals(row.value)
            localStorage.setItem('nutrition-custom-meals', JSON.stringify(row.value))
          }
        }
      })
  }, [user?.id])

  // helper: write a setting to Supabase (fire-and-forget, localStorage is the fallback)
  function syncSetting(key, value) {
    supabase.from('user_settings').upsert(
      { user_id: user.id, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    )
  }

  // Close macro panel on outside click
  useEffect(() => {
    function onDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setPanelOpen(false)
    }
    if (panelOpen) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [panelOpen])

  // Reload Supabase entries when date changes
  const load = useCallback(async () => {
    if (!cacheGet(`nutrition:${selectedDate}`)) setLoading(true)
    const [{ data: eData }, { data: sData }] = await Promise.all([
      supabase.from('nutrition_entries').select('*')
        .eq('user_id', user.id).eq('date', selectedDate).order('created_at'),
      supabase.from('workout_sets').select('id')
        .eq('user_id', user.id).eq('logged_date', selectedDate),
    ])
    cacheSet(`nutrition:${selectedDate}`, { entries: eData || [], workoutToday: (sData || []).length > 0 })
    setEntries(eData || [])
    setWorkoutToday((sData || []).length > 0)
    setLoading(false)
  }, [user.id, selectedDate])

  useEffect(() => { load() }, [load])

  // Reload planned meals when date changes
  useEffect(() => {
    setPlannedMeals(loadPlan(selectedDate))
  }, [selectedDate])

  // ── Derived ───────────────────────────────────────────────────────────────────
  const effCal  = workoutToday ? Math.round(calGoal  * 1.12) : calGoal
  const effProt = workoutToday ? Math.round(protGoal * 1.15) : protGoal

  const total      = entries.reduce((s, e) => s + e.calories,         0)
  const totalProt  = entries.reduce((s, e) => s + (e.protein_g || 0), 0)
  const totalCarbs = entries.reduce((s, e) => s + (e.carbs_g   || 0), 0)
  const totalFat   = entries.reduce((s, e) => s + (e.fat_g     || 0), 0)
  // Calorie consistency: calories ≈ protein×4 + carbs×4 + fat×9
  const macroCalEstimate = totalProt * 4 + totalCarbs * 4 + totalFat * 9
  const calorieDrift     = entries.length > 0 && total > 0
    ? Math.round(Math.abs(total - macroCalEstimate)) : 0

  const plannedTotal     = plannedMeals.reduce((s, p) => s + p.calories,         0)
  const plannedProtTotal = plannedMeals.reduce((s, p) => s + (p.protein_g || 0), 0)
  const plannedCarbTotal = plannedMeals.reduce((s, p) => s + (p.carbs_g   || 0), 0)
  const plannedFatTotal  = plannedMeals.reduce((s, p) => s + (p.fat_g     || 0), 0)

  const projected  = total + plannedTotal
  const over       = total > effCal
  const remaining  = effCal - projected  // remaining after accounting for planned
  const calPct     = Math.min(100, effCal > 0 ? (total / effCal) * 100 : 0)
  const planPct    = Math.min(100, effCal > 0 ? (projected / effCal) * 100 : 0)
  const ringColor  = over ? RED : GREEN
  const ringOffset = RING_CIRC * (1 - calPct / 100)
  // planned arc: starts where consumed ends
  const planArcLen = RING_CIRC * Math.min((planPct - calPct) / 100, 1 - calPct / 100)
  const planOffset = RING_CIRC * (1 - planPct / 100)

  // Group by section
  const bySection = Object.fromEntries(SECTIONS.map(s => [s.key, { actual: [], planned: [] }]))
  entries.forEach(e => {
    const key = bySection[e.meal_tag] !== undefined ? e.meal_tag : 'snacks'
    bySection[key].actual.push(e)
  })
  plannedMeals.forEach(p => {
    const key = bySection[p.meal_tag] !== undefined ? p.meal_tag : 'snacks'
    bySection[key].planned.push(p)
  })

  // Serving-size scaling — measure-aware when the food carries per-100g data
  const selMeasure = searchResult?.measures?.[measureIdx] || null
  const servingMultiplier = (() => {
    if (!searchResult) return 1
    if (qtyMode === 'grams' && searchResult.serving_size_g > 0 && parseFloat(gramsInput) > 0)
      return parseFloat(gramsInput) / searchResult.serving_size_g
    return servings
  })()
  const scaledResult = (() => {
    if (!searchResult) return null
    const grams = parseFloat(gramsInput)
    if (qtyMode === 'grams' && grams > 0) {
      if (searchResult.per100g) return { ...searchResult, ...macrosFor(searchResult, grams) }
      if (searchResult.serving_size_g > 0) {
        const f = grams / searchResult.serving_size_g
        return { ...searchResult,
          calories: Math.round(searchResult.calories * f),
          protein:  Math.round(searchResult.protein  * f),
          carbs:    Math.round(searchResult.carbs    * f),
          fat:      Math.round(searchResult.fat      * f) }
      }
    }
    if (selMeasure && selMeasure.grams > 0 && searchResult.per100g)
      return { ...searchResult, ...macrosFor(searchResult, selMeasure.grams, servings) }
    return { ...searchResult,
      calories: Math.round(searchResult.calories * servings),
      protein:  Math.round((searchResult.protein || 0) * servings),
      carbs:    Math.round((searchResult.carbs   || 0) * servings),
      fat:      Math.round((searchResult.fat     || 0) * servings) }
  })()

  // ── Actions ────────────────────────────────────────────────────────────────

  function goDay(delta) { setSelectedDate(d => shiftDate(d, delta)) }

  // Full search (Enter key): hit the verified food databases and show results
  async function searchFood(query) {
    if (!query.trim() || searching) return
    setSearching(true); setSearchResult(null); setSearchError(''); setSuggestFailed(false)
    try {
      const { results, failed } = await searchFoods(query)
      if (failed) { setSuggestFailed(true); setSuggestions([]) }
      else { setSuggestions(results); setSuggestsOpen(true) }
    } catch {
      setSuggestFailed(true)
    }
    setSearching(false)
  }

  // Track what gets logged so Recent / Frequent tabs work offline
  function recordFoodUse(result) {
    try {
      const snap = {
        name: result.name, brand: result.brand || null,
        calories: result.calories, protein: result.protein, carbs: result.carbs, fat: result.fat,
        serving_size_label: result.serving_size_label || '', serving_size_g: result.serving_size_g || 0,
        per100g: result.per100g || null, measures: result.measures || null,
        verified: !!result.verified, source: result.source || 'custom',
      }
      const recent = JSON.parse(localStorage.getItem('nutrition-recent-foods') || '[]')
        .filter(f => f.name.toLowerCase() !== snap.name.toLowerCase())
      recent.unshift(snap)
      localStorage.setItem('nutrition-recent-foods', JSON.stringify(recent.slice(0, 25)))
      const counts = JSON.parse(localStorage.getItem('nutrition-food-counts') || '{}')
      const key = snap.name.toLowerCase()
      counts[key] = { food: snap, count: (counts[key]?.count || 0) + 1 }
      localStorage.setItem('nutrition-food-counts', JSON.stringify(counts))
      setUsageTick(t => t + 1)
    } catch { /* storage full — skip */ }
  }

  // Insert helper — tries to store fiber/sugar/sodium too; if those columns
  // don't exist yet (migration not run), retries with the base payload.
  async function insertEntry(payload, micros) {
    if (micros) {
      const { data, error } = await supabase.from('nutrition_entries')
        .insert({ ...payload, ...micros }).select().single()
      if (!error) return data
    }
    const { data } = await supabase.from('nutrition_entries').insert(payload).select().single()
    return data
  }

  // Add to actual log (Supabase)
  async function addResult(sectionKey, result) {
    recordFoodUse(result)
    if (planMode) { addPlanned(sectionKey, result); return }
    const data = await insertEntry({
      user_id: user.id, date: selectedDate,
      food_name: result.name, calories: Math.round(result.calories),
      protein_g: parseFloat((result.protein || 0).toFixed(1)),
      carbs_g:   parseFloat((result.carbs   || 0).toFixed(1)),
      fat_g:     parseFloat((result.fat     || 0).toFixed(1)),
      meal_tag: sectionKey,
    }, (result.fiber || result.sugar || result.sodium) ? {
      fiber_g:   parseFloat((result.fiber  || 0).toFixed(1)),
      sugar_g:   parseFloat((result.sugar  || 0).toFixed(1)),
      sodium_mg: Math.round(result.sodium || 0),
    } : null)
    if (data) setEntries(e => [...e, data])
    clearAdd()
  }

  // Copy a logged entry from a past day onto today
  async function copyEntryToToday(entry) {
    const data = await insertEntry({
      user_id: user.id, date: today,
      food_name: entry.food_name, calories: entry.calories,
      protein_g: entry.protein_g, carbs_g: entry.carbs_g, fat_g: entry.fat_g,
      meal_tag: entry.meal_tag,
    }, null)
    if (data && selectedDate === today) setEntries(e => [...e, data])
  }

  // Copy everything you ate in this meal yesterday onto the selected day
  const [copyingMeal, setCopyingMeal] = useState(null)
  async function copyYesterdayMeal(sectionKey) {
    setCopyingMeal(sectionKey)
    const yday = shiftDate(selectedDate, -1)
    const { data: rows } = await supabase.from('nutrition_entries').select('*')
      .eq('user_id', user.id).eq('date', yday).eq('meal_tag', sectionKey)
    for (const e of rows || []) {
      const data = await insertEntry({
        user_id: user.id, date: selectedDate,
        food_name: e.food_name, calories: e.calories,
        protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g,
        meal_tag: sectionKey,
      }, null)
      if (data) setEntries(prev => [...prev, data])
    }
    setCopyingMeal(null)
  }

  // ── Water tracker (per-day, localStorage) ──
  const WATER_GOAL_ML = parseInt(localStorage.getItem('water-goal-ml')) || 3000
  const [waterMl, setWaterMl] = useState(() => parseInt(localStorage.getItem(`nutrition-water:${selectedDate}`)) || 0)
  useEffect(() => {
    setWaterMl(parseInt(localStorage.getItem(`nutrition-water:${selectedDate}`)) || 0)
  }, [selectedDate])
  function addWater(ml) {
    setWaterMl(w => {
      const next = Math.max(0, w + ml)
      localStorage.setItem(`nutrition-water:${selectedDate}`, String(next))
      return next
    })
  }

  // Add to planned (localStorage)
  function addPlanned(sectionKey, result) {
    const item = {
      id:        `plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      food_name: result.name,
      calories:  result.calories,
      protein_g: result.protein,
      carbs_g:   result.carbs,
      fat_g:     result.fat,
      meal_tag:  sectionKey,
    }
    const next = [...plannedMeals, item]
    setPlannedMeals(next)
    localStorage.setItem(planKey(selectedDate), JSON.stringify(next))
    clearAdd()
  }

  function deletePlanned(id) {
    const next = plannedMeals.filter(p => p.id !== id)
    setPlannedMeals(next)
    localStorage.setItem(planKey(selectedDate), JSON.stringify(next))
  }

  // Convert planned → actual logged
  async function logPlanned(item) {
    const { data } = await supabase.from('nutrition_entries').insert({
      user_id: user.id, date: selectedDate,
      food_name: item.food_name, calories: item.calories,
      protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g,
      meal_tag: item.meal_tag,
    }).select().single()
    if (data) setEntries(e => [...e, data])
    deletePlanned(item.id)
  }

  function clearAdd() {
    setSearchQuery(''); setSearchResult(null); setAddingTo(null)
    setAddMode('search'); setSuggestions([]); setSuggestsOpen(false)
    setServings(1); setGramsInput(''); setQtyMode('servings'); setMeasureIdx(0)
    setFoodTab('all'); setCustomFoodOpen(false); setQuickOpen(false)
  }

  function handleMfpFile(file) {
    if (!file) return
    const mediaType = file.type || 'image/jpeg'
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target.result
      const base64  = dataUrl.split(',')[1]
      setMfpImage({ base64, mediaType, preview: dataUrl })
      setMfpItems(null)
      setMfpSel(new Set())
      setMfpError(null)
    }
    reader.readAsDataURL(file)
  }

  async function parseMfpScreenshot() {
    if (!mfpImage) return
    setMfpParsing(true)
    setMfpError(null)
    try {
      const res  = await fetch('/api/parse-mfp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageBase64: mfpImage.base64, mediaType: mfpImage.mediaType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Parse failed')
      const items = data.items || []
      setMfpItems(items)
      setMfpSel(new Set(items.map((_, i) => i)))
    } catch (err) {
      setMfpError(err.message)
    } finally {
      setMfpParsing(false)
    }
  }

  async function logMfpItems() {
    if (!mfpItems) return
    setMfpLogging(true)
    const toLog = mfpItems.filter((_, i) => mfpSel.has(i))
    for (const item of toLog) {
      const data = await insertEntry({
        user_id:   user.id,
        date:      selectedDate,
        food_name: item.food_name,
        calories:  Math.round(item.calories  || 0),
        protein_g: Math.round(item.protein_g || 0),
        carbs_g:   Math.round(item.carbs_g   || 0),
        fat_g:     Math.round(item.fat_g     || 0),
        meal_tag:  item.meal_tag || 'snacks',
      })
      if (data) {
        setEntries(e => [...e, data])
        recordFoodUse({ name: item.food_name, calories: item.calories || 0, protein: item.protein_g || 0, carbs: item.carbs_g || 0, fat: item.fat_g || 0 })
      }
    }
    setMfpLogging(false)
    setMfpOpen(false)
    setMfpImage(null)
    setMfpItems(null)
    setMfpSel(new Set())
    setMfpError(null)
  }

  function closeMfp() {
    setMfpOpen(false)
    setMfpImage(null)
    setMfpItems(null)
    setMfpSel(new Set())
    setMfpError(null)
    setMfpParsing(false)
  }

  // ── MFP CSV import ──────────────────────────────────────────────────────────
  // MFP export format (header row):
  //   Date,Meal,Food Name,Calories,Carbohydrates (g),Fat (g),Protein (g),
  //   Sodium (mg),Sugar (g),Fiber (g)
  function parseMfpCsv(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!lines.length) throw new Error('File is empty')

    // Find the header row (MFP CSVs often have a title row before it)
    const headerIdx = lines.findIndex(l =>
      /date/i.test(l) && /meal/i.test(l) && /food/i.test(l) && /calorie/i.test(l))
    if (headerIdx === -1) throw new Error('Could not find MFP header row (Date, Meal, Food Name, Calories…)')

    const header = lines[headerIdx].split(',').map(h => h.trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim())
    const col = name => header.findIndex(h => h.includes(name))
    const idx = {
      date:     col('date'),
      meal:     col('meal'),
      name:     col('food'),
      cal:      col('calorie'),
      carbs:    col('carbohydrate'),
      fat:      col('fat'),
      protein:  col('protein'),
      sodium:   col('sodium'),
      sugar:    col('sugar'),
      fiber:    col('fiber'),
    }
    if (idx.date < 0 || idx.name < 0 || idx.cal < 0) throw new Error('Missing required columns: Date, Food Name, Calories')

    const MEAL_MAP = {
      breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner',
      snacks: 'snacks', snack: 'snacks',
    }

    const rows = []
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      if (cells.length < 4) continue
      const name = cells[idx.name] || ''
      if (!name || name.toLowerCase() === 'totals' || name.toLowerCase() === 'total') continue
      const cal = parseFloat(cells[idx.cal]) || 0
      if (cal === 0 && !name) continue

      const mealRaw = (cells[idx.meal] || '').toLowerCase()
      const meal_tag = MEAL_MAP[mealRaw] || 'snacks'

      rows.push({
        date:      cells[idx.date] || today,
        meal_tag,
        food_name: name,
        calories:  cal,
        protein_g: idx.protein >= 0 ? parseFloat(cells[idx.protein]) || 0 : 0,
        carbs_g:   idx.carbs   >= 0 ? parseFloat(cells[idx.carbs])   || 0 : 0,
        fat_g:     idx.fat     >= 0 ? parseFloat(cells[idx.fat])     || 0 : 0,
        fiber_g:   idx.fiber   >= 0 ? parseFloat(cells[idx.fiber])   || 0 : 0,
        sugar_g:   idx.sugar   >= 0 ? parseFloat(cells[idx.sugar])   || 0 : 0,
        sodium_mg: idx.sodium  >= 0 ? parseFloat(cells[idx.sodium])  || 0 : 0,
      })
    }
    if (!rows.length) throw new Error('No food entries found in file')
    return rows
  }

  function handleCsvFile(file) {
    if (!file) return
    setCsvError(null)
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const rows = parseMfpCsv(e.target.result)
        // Dedupe against existing entries this session (same date + food name)
        const existingKeys = new Set(entries.map(en => `${en.date}|${en.food_name.toLowerCase()}`))
        const deduped = rows.filter(r => !existingKeys.has(`${r.date}|${r.food_name.toLowerCase()}`))
        if (!deduped.length) { setCsvError('All entries already exist in your log.'); return }
        setCsvItems(deduped)
        setCsvSel(new Set(deduped.map((_, i) => i)))
      } catch (err) { setCsvError(err.message) }
    }
    reader.readAsText(file)
  }

  async function logCsvItems() {
    if (!csvItems) return
    setCsvLogging(true)
    const toLog = csvItems.filter((_, i) => csvSel.has(i))
    for (const item of toLog) {
      const data = await insertEntry({
        user_id: user.id, date: item.date,
        food_name: item.food_name,
        calories:  Math.round(item.calories),
        protein_g: parseFloat(item.protein_g.toFixed(1)),
        carbs_g:   parseFloat(item.carbs_g.toFixed(1)),
        fat_g:     parseFloat(item.fat_g.toFixed(1)),
        meal_tag:  item.meal_tag,
      }, (item.fiber_g || item.sugar_g || item.sodium_mg) ? {
        fiber_g: parseFloat(item.fiber_g.toFixed(1)),
        sugar_g: parseFloat(item.sugar_g.toFixed(1)),
        sodium_mg: Math.round(item.sodium_mg),
      } : null)
      if (data && item.date === selectedDate) setEntries(e => [...e, data])
    }
    setCsvLogging(false)
    setCsvOpen(false)
    setCsvItems(null)
    setCsvSel(new Set())
  }

  function closeCsv() {
    setCsvOpen(false)
    setCsvItems(null)
    setCsvSel(new Set())
    setCsvError(null)
  }

  function createCustomFood() {
    const name = customDraft.name.trim()
    const cal  = parseFloat(customDraft.cal)
    if (!name || !(cal >= 0)) return
    const food = saveCustomFood({
      name, brand: customDraft.brand.trim() || null,
      serving_size_label: customDraft.label.trim() || (customDraft.grams ? `${customDraft.grams} g` : '1 serving'),
      serving_size_g: parseFloat(customDraft.grams) || 0,
      calories: cal,
      protein: parseFloat(customDraft.prot)  || 0,
      carbs:   parseFloat(customDraft.carbs) || 0,
      fat:     parseFloat(customDraft.fat)   || 0,
    })
    setMyFoods(getCustomFoods())
    setCustomFoodOpen(false)
    setCustomDraft({ name: '', brand: '', label: '', grams: '', cal: '', prot: '', carbs: '', fat: '' })
    selectSuggestion(food)
  }

  function removeCustomFood(id) {
    setMyFoods(deleteCustomFood(id))
  }

  function submitQuickAdd(sectionKey) {
    const cal = parseFloat(quickDraft.cal)
    if (!(cal > 0)) return
    addResult(sectionKey, {
      name:     quickDraft.name.trim() || 'Quick add',
      calories: Math.round(cal),
      protein:  Math.round(parseFloat(quickDraft.prot)  || 0),
      carbs:    Math.round(parseFloat(quickDraft.carbs) || 0),
      fat:      Math.round(parseFloat(quickDraft.fat)   || 0),
    })
    setQuickDraft({ name: '', cal: '', prot: '', carbs: '', fat: '' })
    setQuickOpen(false)
  }

  // ── Custom meal creator ────────────────────────────────────────────────────

  async function searchMealIngredient(query) {
    if (!query.trim() || mealIngSearching) return
    setMealIngSearching(true); setMealIngResult(null)
    try {
      const { results } = await searchFoods(query)
      const top = results[0]
      if (top) setMealIngResult({
        name:     top.brand ? `${top.brand} ${top.name}` : top.name,
        calories: top.calories,
        protein:  Math.round(top.protein),
        carbs:    Math.round(top.carbs),
        fat:      Math.round(top.fat),
      })
    } catch { /* silent */ }
    setMealIngSearching(false)
  }

  function addIngredientToMeal(item) {
    setNewMealItems(prev => [...prev, { ...item, _id: `${Date.now()}-${Math.random()}` }])
    setMealIngSearch(''); setMealIngResult(null)
  }

  function removeIngredient(_id) {
    setNewMealItems(prev => prev.filter(i => i._id !== _id))
  }

  function saveCustomMeal() {
    if (!newMealName.trim() || newMealItems.length === 0) return
    const meal = {
      id:       `meal-${Date.now()}`,
      name:     newMealName.trim(),
      items:    newMealItems,
      calories: newMealItems.reduce((s, i) => s + i.calories, 0),
      protein:  Math.round(newMealItems.reduce((s, i) => s + i.protein, 0)),
      carbs:    Math.round(newMealItems.reduce((s, i) => s + i.carbs,   0)),
      fat:      Math.round(newMealItems.reduce((s, i) => s + i.fat,     0)),
    }
    const next = [meal, ...customMeals]
    setCustomMeals(next)
    localStorage.setItem('nutrition-custom-meals', JSON.stringify(next))
    syncSetting('nutrition_custom_meals', next)
    setMealCreatorOpen(false); setNewMealName(''); setNewMealItems([])
  }

  async function logCustomMeal(meal, sectionKey) {
    if (planMode) {
      addPlanned(sectionKey, { name: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat })
      return
    }
    const { data } = await supabase.from('nutrition_entries').insert({
      user_id: user.id, date: selectedDate,
      food_name: meal.name, calories: meal.calories,
      protein_g: meal.protein, carbs_g: meal.carbs, fat_g: meal.fat,
      meal_tag: sectionKey,
    }).select().single()
    if (data) setEntries(e => [...e, data])
  }

  function deleteCustomMeal(id) {
    const next = customMeals.filter(m => m.id !== id)
    setCustomMeals(next)
    localStorage.setItem('nutrition-custom-meals', JSON.stringify(next))
    syncSetting('nutrition_custom_meals', next)
  }

  async function deleteEntry(id) {
    await supabase.from('nutrition_entries').delete().eq('id', id)
    setEntries(e => e.filter(x => x.id !== id))
  }

  function startEdit(entry) {
    setEditingId(entry.id)
    setEditDraft({
      food_name: entry.food_name,
      calories:  String(entry.calories),
      protein_g: String(entry.protein_g || 0),
      carbs_g:   String(entry.carbs_g   || 0),
      fat_g:     String(entry.fat_g     || 0),
    })
  }

  async function saveEdit() {
    const patch = {
      food_name: editDraft.food_name.trim() || 'Food',
      calories:  Math.round(parseFloat(editDraft.calories)  || 0),
      protein_g: Math.round(parseFloat(editDraft.protein_g) || 0),
      carbs_g:   Math.round(parseFloat(editDraft.carbs_g)   || 0),
      fat_g:     Math.round(parseFloat(editDraft.fat_g)     || 0),
    }
    await supabase.from('nutrition_entries').update(patch).eq('id', editingId)
    setEntries(es => es.map(e => e.id === editingId ? { ...e, ...patch } : e))
    setEditingId(null)
  }

  function saveMeal(result) {
    if (!result) return
    const already = savedMeals.some(m => m.name.toLowerCase() === result.name.toLowerCase())
    if (already) return
    const next = [result, ...savedMeals].slice(0, 20)
    setSavedMeals(next)
    localStorage.setItem('nutrition-saved-meals', JSON.stringify(next))
    syncSetting('nutrition_saved_meals', next)
  }

  // ── Autocomplete: debounced search against USDA + Open Food Facts ──
  function triggerSuggest(val) {
    clearTimeout(suggestTimeout.current)
    if (val.trim().length < 2) { setSuggestions([]); setSuggestsOpen(false); setSuggestFailed(false); return }
    setSuggestLoading(true)
    setSuggestFailed(false)
    const reqId = ++suggestReqId.current
    suggestTimeout.current = setTimeout(async () => {
      try {
        const { results, failed } = await searchFoods(val)
        if (reqId !== suggestReqId.current) return // stale — discard
        setSuggestions(results)
        setSuggestFailed(failed && results.length === 0)
        setSuggestsOpen(true)
      } catch {
        if (reqId === suggestReqId.current) { setSuggestFailed(true); setSuggestsOpen(true) }
      }
      setSuggestLoading(false)
    }, 300)
  }

  function selectSuggestion(item) {
    setSearchQuery(item.name)
    setSearchResult(item)
    setSuggestsOpen(false)
    setSuggestions([])
    setServings(1); setGramsInput(''); setQtyMode('servings'); setMeasureIdx(0)
    setSearchError('')
  }

  function openAdd(key) {
    setAddingTo(key); setSearchQuery(''); setSearchResult(null); setSearchError('')
    setSuggestions([]); setSuggestsOpen(false)
    setAddMode('search'); setFoodTab('all'); setCustomFoodOpen(false); setQuickOpen(false)
    setPlanMode(isFuture) // default to Plan for future dates
  }

  function openGoalsEdit() {
    setGoalsDraft({ cal: String(calGoal), prot: String(protGoal), carbs: String(carbGoal), fat: String(fatGoal) })
    setGoalsEditing(true)
  }

  function saveGoals() {
    const cal   = parseInt(goalsDraft.cal)   || calGoal
    const prot  = parseInt(goalsDraft.prot)  || protGoal
    const carbs = parseInt(goalsDraft.carbs) || carbGoal
    const fat   = parseInt(goalsDraft.fat)   || fatGoal
    setCalGoal(cal); setProtGoal(prot); setCarbGoal(carbs); setFatGoal(fat)
    setMacroGoals({ cal, prot, carbs, fat })
    syncSetting('nutrition_goals', { cal, prot, carbs, fat })
    setGoalsEditing(false)
  }

  const aiContext = entries.length > 0
    ? `Today's food log:\n${entries.map(e =>
        `- ${e.food_name} (${e.meal_tag}): ${e.calories}kcal, P:${e.protein_g}g C:${e.carbs_g}g F:${e.fat_g}g`
      ).join('\n')}\n\nTotals: ${total}kcal, Protein:${Math.round(totalProt)}g, Carbs:${Math.round(totalCarbs)}g, Fat:${Math.round(totalFat)}g`
    : 'No food logged yet today.'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Nutrition</h1>
        <div style={{ display: 'flex', gap: 7 }}>
          <button
            onClick={() => setCsvOpen(true)}
            title="Import from MyFitnessPal CSV export"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(99,179,237,0.08)', border: '1px solid rgba(99,179,237,0.25)',
              color: '#63b3ed', borderRadius: 8, padding: '6px 12px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background .15s, border-color .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,179,237,0.18)'; e.currentTarget.style.borderColor = 'rgba(99,179,237,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,179,237,0.08)'; e.currentTarget.style.borderColor = 'rgba(99,179,237,0.25)' }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            CSV
          </button>
          <button
            onClick={() => setMfpOpen(true)}
            title="Import from MyFitnessPal screenshot"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(99,179,237,0.12)', border: '1px solid rgba(99,179,237,0.3)',
              color: '#63b3ed', borderRadius: 8, padding: '6px 12px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background .15s, border-color .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,179,237,0.22)'; e.currentTarget.style.borderColor = 'rgba(99,179,237,0.55)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,179,237,0.12)'; e.currentTarget.style.borderColor = 'rgba(99,179,237,0.3)' }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <polyline points="9 12 12 15 15 12"/>
              <line x1="12" y1="8" x2="12" y2="15"/>
            </svg>
            Screenshot
          </button>
        </div>
      </div>

      <div className="page-body" style={{ paddingBottom: 110 }}>

        {/* ── DATE NAV ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, marginBottom: 12 }}>
          <button onClick={() => goDay(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
              padding: '6px 8px', borderRadius: 8, transition: 'color .15s, background .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', minWidth: 150, textAlign: 'center' }}>
              {isToday ? 'Today' : fmtNavDate(selectedDate)}
            </span>
            {isToday && workoutToday && (
              <span style={{ fontSize: 10, fontWeight: 700, color: GREEN,
                display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width={7} height={7} viewBox="0 0 24 24" fill={GREEN}><circle cx="12" cy="12" r="12"/></svg>
                Workout
              </span>
            )}
            {!isToday && (
              <button onClick={() => setSelectedDate(today)}
                style={{ fontSize: 11, fontWeight: 600, color: GREEN,
                  background: `${GREEN}18`, border: `1px solid ${GREEN}35`,
                  borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Today
              </button>
            )}
            {isFuture && (
              <span style={{ fontSize: 10, fontWeight: 700, color: AMBER,
                background: `${AMBER}18`, border: `1px solid ${AMBER}35`,
                borderRadius: 5, padding: '2px 7px' }}>
                FUTURE
              </span>
            )}
          </div>

          <button onClick={() => goDay(1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
              padding: '6px 8px', borderRadius: 8, transition: 'color .15s, background .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'none' }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* ── CALORIE RING ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 4, paddingBottom: 24 }}>

          <div style={{ position: 'relative', width: 200, height: 200, marginBottom: 16 }}>
            <svg viewBox="0 0 200 200" width="200" height="200">
              <defs>
                <filter id="nutRingGlow">
                  <feGaussianBlur stdDeviation="3.5" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              {/* Track */}
              <circle cx="100" cy="100" r={RING_R} fill="none"
                stroke="rgba(255,255,255,0.07)" strokeWidth="14"/>
              {/* Planned arc (behind consumed) */}
              {plannedTotal > 0 && planArcLen > 0 && (
                <circle cx="100" cy="100" r={RING_R} fill="none"
                  stroke={AMBER} strokeWidth="14" strokeLinecap="round"
                  strokeDasharray={`${planArcLen} ${RING_CIRC - planArcLen}`}
                  strokeDashoffset={planOffset}
                  transform="rotate(-90 100 100)"
                  style={{ opacity: 0.55, transition: 'stroke-dashoffset .55s ease, stroke-dasharray .55s ease' }}/>
              )}
              {/* Consumed arc */}
              <circle cx="100" cy="100" r={RING_R} fill="none"
                stroke={ringColor} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={RING_CIRC} strokeDashoffset={ringOffset}
                transform="rotate(-90 100 100)" filter="url(#nutRingGlow)"
                style={{ transition: 'stroke-dashoffset .65s cubic-bezier(.22,1,.36,1), stroke .4s ease' }}/>
            </svg>
            <div style={{ position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1,
                color: over ? RED : 'var(--text)',
                fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--mono)' }}>
                {total.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontWeight: 600 }}>
                / {effCal.toLocaleString()} kcal
              </div>
              {plannedTotal > 0 ? (
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 5, color: AMBER,
                  display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width={9} height={9} viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  +{plannedTotal.toLocaleString()} planned
                </div>
              ) : (
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 5, color: over ? RED : GREEN }}>
                  {over ? `${Math.abs(effCal - total).toLocaleString()} over` : `${(effCal - total).toLocaleString()} left`}
                </div>
              )}
            </div>
          </div>

          {/* Projected row — shown when planned meals exist */}
          {plannedTotal > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14,
              background: `${AMBER}10`, border: `1px solid ${AMBER}25`,
              borderRadius: 12, padding: '10px 18px', animation: 'nutCardIn .2s ease' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: GREEN, marginBottom: 3 }}>Logged</div>
                <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)', color: GREEN }}>
                  {total.toLocaleString()}
                </div>
              </div>
              <div style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 300 }}>+</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: AMBER, marginBottom: 3 }}>Planned</div>
                <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)', color: AMBER }}>
                  {plannedTotal.toLocaleString()}
                </div>
              </div>
              <div style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 300 }}>=</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 3 }}>Projected</div>
                <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)',
                  color: projected > effCal ? RED : 'var(--text)' }}>
                  {projected.toLocaleString()}
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}> kcal</span>
                </div>
              </div>
            </div>
          )}

          {/* Goal − Food = Remaining (MFP-style daily math) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '10px 18px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 3 }}>Goal</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)' }}>{effCal.toLocaleString()}</div>
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 300 }}>−</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: GREEN, marginBottom: 3 }}>Food</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: GREEN }}>{total.toLocaleString()}</div>
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', fontWeight: 300 }}>=</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 3 }}>Remaining</div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)',
                color: effCal - total < 0 ? RED : 'var(--text)' }}>
                {(effCal - total).toLocaleString()}
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}> kcal</span>
              </div>
            </div>
          </div>

          {/* Goals header + edit */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.12em', color: 'var(--text-muted)' }}>Daily Goals</span>
            <button onClick={goalsEditing ? saveGoals : openGoalsEdit}
              style={{ display: 'flex', alignItems: 'center', gap: 5,
                background: goalsEditing ? GREEN : 'none',
                border: `1px solid ${goalsEditing ? GREEN : 'var(--border)'}`,
                borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                color: goalsEditing ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
              {goalsEditing ? (
                <><svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/></svg> Save goals</>
              ) : (
                <><svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg> Edit goals</>
              )}
            </button>
            {goalsEditing && (
              <button onClick={() => setGoalsEditing(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0 }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* Inline goals editor */}
          {goalsEditing && (
            <div style={{ width: '100%', maxWidth: 360,
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '14px 16px', marginBottom: 16, animation: 'nutCardIn .15s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Calories', key: 'cal',   unit: 'kcal', color: GREEN  },
                  { label: 'Protein',  key: 'prot',  unit: 'g',    color: BLUE   },
                  { label: 'Carbs',    key: 'carbs', unit: 'g',    color: AMBER  },
                  { label: 'Fat',      key: 'fat',   unit: 'g',    color: PURPLE },
                ].map(({ label, key, unit, color }) => (
                  <div key={key}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.1em', color, marginBottom: 5 }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <input type="number" value={goalsDraft[key]}
                        onChange={e => setGoalsDraft(d => ({ ...d, [key]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveGoals() }}
                        style={{ flex: 1, fontSize: 14, fontWeight: 700,
                          textAlign: 'right', fontFamily: 'var(--mono)' }}/>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Macro bars */}
          <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <MacroBar label="Protein" value={Math.round(totalProt)}  planned={Math.round(plannedProtTotal)} goal={effProt}  unit="g" color={BLUE}   />
            <MacroBar label="Carbs"   value={Math.round(totalCarbs)} planned={Math.round(plannedCarbTotal)} goal={carbGoal} unit="g" color={AMBER}  />
            <MacroBar label="Fat"     value={Math.round(totalFat)}   planned={Math.round(plannedFatTotal)}  goal={fatGoal}  unit="g" color={PURPLE} />
          </div>
        </div>

        {/* ── MEAL SECTIONS ── */}
        {loading ? (
          <SkeletonList rows={3} />
        ) : SECTIONS.map(section => {
          const sActual      = bySection[section.key].actual
          const sPlanned     = bySection[section.key].planned
          const sCals        = sActual.reduce((s, e) => s + e.calories, 0)
          const sPlannedCals = sPlanned.reduce((s, p) => s + p.calories, 0)
          const isOpen       = expanded[section.key]
          const isAdding     = addingTo === section.key
          const hasItems     = sActual.length > 0 || sPlanned.length > 0
          const matched      = searchQuery
            ? savedMeals.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()))
            : savedMeals

          return (
            <div key={section.key} className="card"
              style={{ marginBottom: 12, padding: 0,
                overflow: isAdding ? 'visible' : 'hidden',
                position: 'relative', zIndex: isAdding ? 20 : 'auto' }}>

              {/* Section header */}
              <button onClick={() => setExpanded(ex => ({ ...ex, [section.key]: !isOpen }))}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '14px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', textAlign: 'left' }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                  <SectionIcon sectionKey={section.key} size={16}/>
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{section.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {sCals > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, fontFamily: 'var(--mono)' }}>
                      {sCals.toLocaleString()} kcal
                    </span>
                  )}
                  {sPlannedCals > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: AMBER }}>
                      +{sPlannedCals.toLocaleString()} plan
                    </span>
                  )}
                </div>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ color: 'var(--text-muted)', flexShrink: 0, transition: 'transform .2s',
                    transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '0 16px 16px' }}>

                  {/* Actual entries */}
                  {sActual.length > 0 && (
                    <div style={{ marginTop: 10, marginBottom: 4 }}>
                      {sActual.map(entry => {
                        const isEditingThis = editingId === entry.id
                        return (
                          <div key={entry.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            {isEditingThis ? (
                              <div style={{ padding: '10px 0', animation: 'nutCardIn .15s ease' }}>
                                <input value={editDraft.food_name}
                                  onChange={e => setEditDraft(d => ({ ...d, food_name: e.target.value }))}
                                  placeholder="Food name" autoFocus
                                  style={{ width: '100%', marginBottom: 8, fontSize: 13 }}/>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)',
                                  gap: 6, marginBottom: 8 }}>
                                  {[
                                    { k: 'calories',  lbl: 'Cal',    color: GREEN  },
                                    { k: 'protein_g', lbl: 'Pro g',  color: BLUE   },
                                    { k: 'carbs_g',   lbl: 'Carb g', color: AMBER  },
                                    { k: 'fat_g',     lbl: 'Fat g',  color: PURPLE },
                                  ].map(({ k, lbl, color }) => (
                                    <div key={k}>
                                      <div style={{ fontSize: 9, fontWeight: 700, color,
                                        textTransform: 'uppercase', marginBottom: 3 }}>{lbl}</div>
                                      <input type="number" value={editDraft[k]}
                                        onChange={e => setEditDraft(d => ({ ...d, [k]: e.target.value }))}
                                        style={{ width: '100%', fontSize: 12, fontWeight: 700,
                                          textAlign: 'center', padding: '5px 4px' }}/>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button onClick={saveEdit}
                                    style={{ flex: 1, background: GREEN, color: '#fff', border: 'none',
                                      borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700,
                                      cursor: 'pointer', fontFamily: 'inherit',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                    Save
                                  </button>
                                  <button onClick={() => setEditingId(null)}
                                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)',
                                      borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600,
                                      cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)',
                                      display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18"/>
                                      <line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {entry.food_name}
                                  </div>
                                  {(entry.protein_g > 0 || entry.carbs_g > 0 || entry.fat_g > 0) && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                      P {entry.protein_g}g · C {entry.carbs_g}g · F {entry.fat_g}g
                                    </div>
                                  )}
                                </div>
                                <span style={{ fontSize: 13, fontWeight: 700, color: GREEN,
                                  fontFamily: 'var(--mono)', flexShrink: 0 }}>
                                  {entry.calories.toLocaleString()}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>kcal</span>
                                {selectedDate < today && (
                                  <button onClick={() => copyEntryToToday(entry)} title="Copy to today"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                                      color: 'var(--text-muted)', padding: '2px 3px', flexShrink: 0,
                                      display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color .15s' }}
                                    onMouseEnter={e => e.currentTarget.style.color = GREEN}
                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                    </svg>
                                  </button>
                                )}
                                <button onClick={() => startEdit(entry)} title="Edit"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--text-muted)', padding: '2px 3px', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color .15s' }}
                                  onMouseEnter={e => e.currentTarget.style.color = BLUE}
                                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </button>
                                <button onClick={() => deleteEntry(entry.id)} title="Delete"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--text-muted)', padding: '2px 3px', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color .15s' }}
                                  onMouseEnter={e => e.currentTarget.style.color = RED}
                                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                    <path d="M10 11v6M14 11v6"/>
                                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Planned entries */}
                  {sPlanned.length > 0 && (
                    <div style={{ marginTop: sActual.length > 0 ? 6 : 10, marginBottom: 4 }}>
                      {sActual.length > 0 && (
                        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.12em', color: AMBER, marginBottom: 6,
                          display: 'flex', alignItems: 'center', gap: 5 }}>
                          <svg width={10} height={10} viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                          Planned
                        </div>
                      )}
                      {sPlanned.map(item => (
                        <div key={item.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                            borderBottom: '1px solid var(--border)', opacity: 0.8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-light)' }}>
                                {item.food_name}
                              </span>
                              {sActual.length === 0 && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: AMBER,
                                  background: `${AMBER}18`, border: `1px solid ${AMBER}30`,
                                  borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>
                                  PLAN
                                </span>
                              )}
                            </div>
                            {(item.protein_g > 0 || item.carbs_g > 0 || item.fat_g > 0) && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                P {item.protein_g}g · C {item.carbs_g}g · F {item.fat_g}g
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: AMBER,
                            fontFamily: 'var(--mono)', flexShrink: 0 }}>
                            {item.calories.toLocaleString()}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>kcal</span>
                          {/* Log it */}
                          <button onClick={() => logPlanned(item)} title="Log it"
                            style={{ background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text-muted)', padding: '2px 3px', flexShrink: 0,
                              display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color .15s' }}
                            onMouseEnter={e => e.currentTarget.style.color = GREEN}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          </button>
                          {/* Delete planned */}
                          <button onClick={() => deletePlanned(item.id)} title="Remove plan"
                            style={{ background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text-muted)', padding: '2px 3px', flexShrink: 0,
                              display: 'flex', alignItems: 'center', borderRadius: 4, transition: 'color .15s' }}
                            onMouseEnter={e => e.currentTarget.style.color = RED}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              <path d="M10 11v6M14 11v6"/>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {!hasItems && !isAdding && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic',
                      marginTop: 10, marginBottom: 6 }}>
                      Nothing logged here yet.
                    </p>
                  )}

                  {/* ── Add form ── */}
                  {isAdding ? (
                    <div style={{ marginTop: 12 }}>

                      {/* Mode toggle + close */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1, display: 'flex', gap: 3,
                          background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 3 }}>
                          {[
                            { m: 'search', label: 'Search', icon: (
                              <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"/>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                              </svg>
                            )},
                            { m: 'barcode', label: 'Barcode', icon: (
                              <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M3 5h2M3 19h2M19 5h2M19 19h2"/>
                              </svg>
                            )},
                            { m: 'photo', label: 'Photo AI', icon: (
                              <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                              </svg>
                            )},
                          ].map(({ m, label, icon }) => (
                            <button key={m}
                              onClick={() => { setAddMode(m); setSearchResult(null); setSearchError('') }}
                              style={{ flex: 1, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 5, padding: '5px 6px',
                                border: 'none', borderRadius: 6, cursor: 'pointer',
                                fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                                background: addMode === m ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: addMode === m ? 'var(--text)' : 'var(--text-muted)',
                                transition: 'background .15s, color .15s' }}>
                              {icon} {label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => { setAddingTo(null); setSearchResult(null); setSearchQuery(''); setAddMode('search') }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                            cursor: 'pointer', padding: '0 4px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>

                      {/* Log vs Plan toggle */}
                      <div style={{ display: 'flex', gap: 3, marginBottom: 10,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: 3 }}>
                        <button onClick={() => setPlanMode(false)}
                          style={{ flex: 1, padding: '6px 10px', border: 'none', borderRadius: 6,
                            cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                            background: !planMode ? GREEN : 'transparent',
                            color: !planMode ? '#fff' : 'var(--text-muted)',
                            transition: 'background .15s, color .15s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Log now
                        </button>
                        <button onClick={() => setPlanMode(true)}
                          style={{ flex: 1, padding: '6px 10px', border: 'none', borderRadius: 6,
                            cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                            background: planMode ? AMBER : 'transparent',
                            color: planMode ? '#000' : 'var(--text-muted)',
                            transition: 'background .15s, color .15s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                          </svg>
                          Plan for later
                        </button>
                      </div>

                      {/* TEXT SEARCH */}
                      {addMode === 'search' && (<>
                        {/* Source tabs (MyFitnessPal-style) */}
                        <div style={{ display: 'flex', gap: 3, marginBottom: 10,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: 3 }}>
                          {[['all', 'All'], ['recent', 'Recent'], ['frequent', 'Frequent'], ['myfoods', 'My Foods'], ['meals', 'Meals']].map(([k, label]) => (
                            <button key={k}
                              onClick={() => { setFoodTab(k); setSearchResult(null); setSuggestsOpen(false) }}
                              style={{ flex: 1, padding: '5px 4px', border: 'none', borderRadius: 6,
                                cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                                background: foodTab === k ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: foodTab === k ? 'var(--text)' : 'var(--text-muted)',
                                transition: 'background .15s, color .15s' }}>
                              {label}
                            </button>
                          ))}
                        </div>

                        {foodTab === 'all' && (<>
                        {savedMeals.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6,
                            marginBottom: 10, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Saved:</span>
                            {matched.slice(0, 5).map(meal => (
                              <button key={meal.name}
                                onClick={() => { setSearchQuery(meal.name); setSearchResult(meal); setSuggestsOpen(false) }}
                                style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}35`,
                                  borderRadius: 999, padding: '3px 10px', fontSize: 11,
                                  fontWeight: 600, color: GREEN, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {meal.name}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Input + live dropdown */}
                        <div style={{ position: 'relative', marginBottom: searchError ? 10 : 0 }}>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input value={searchQuery}
                              onChange={e => {
                                const val = e.target.value
                                setSearchQuery(val)
                                setSearchResult(null)
                                triggerSuggest(val)
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  if (suggestions.length > 0 && suggestsOpen) {
                                    selectSuggestion(suggestions[0])
                                  } else {
                                    searchFood(searchQuery)
                                    setSuggestsOpen(false)
                                  }
                                }
                                if (e.key === 'Escape') { setSuggestsOpen(false) }
                              }}
                              onFocus={() => { if (suggestions.length > 0) setSuggestsOpen(true) }}
                              onBlur={() => setTimeout(() => setSuggestsOpen(false), 160)}
                              placeholder="Search foods, brands, restaurants…" autoFocus style={{ flex: 1 }}/>


                          </div>

                          {/* ── Suggestions dropdown ── */}
                          {(suggestsOpen || suggestLoading) && searchQuery.trim().length >= 2 && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                              background: 'var(--surface, #1a1a2e)',
                              border: '1px solid var(--border-strong, rgba(255,255,255,0.14))',
                              borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
                              zIndex: 500, overflow: 'hidden', animation: 'nutCardIn .12s ease' }}>

                              {/* Loading shimmer */}
                              {suggestLoading && suggestions.length === 0 && (
                                <div style={{ padding: '12px 14px', display: 'flex',
                                  alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
                                  <span style={{ display: 'inline-block', animation: 'nutSpin .7s linear infinite' }}>⟳</span>
                                  Searching food database…
                                </div>
                              )}

                              {/* Results */}
                              {suggestions.map((item, i) => (
                                <button key={item.fdcId || i}
                                  onMouseDown={() => selectSuggestion(item)}
                                  style={{ width: '100%', display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between', gap: 12,
                                    padding: '10px 14px', background: 'none', border: 'none',
                                    borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                                    transition: 'background .1s' }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.name}
                                      </span>
                                      {item.verified && (
                                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                                          stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                          style={{ flexShrink: 0 }}>
                                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                          <polyline points="22 4 12 14.01 9 11.01"/>
                                        </svg>
                                      )}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                      <span style={{
                                        fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                                        background: item.source === 'usda' && item.generic
                                          ? 'rgba(72,187,120,0.15)' : item.source === 'usda'
                                          ? 'rgba(99,179,237,0.15)' : item.source === 'off'
                                          ? 'rgba(246,173,85,0.15)' : 'rgba(160,174,192,0.15)',
                                        color: item.source === 'usda' && item.generic
                                          ? GREEN : item.source === 'usda'
                                          ? '#63b3ed' : item.source === 'off'
                                          ? AMBER : 'var(--text-muted)',
                                        letterSpacing: '.03em',
                                      }}>
                                        {item.source === 'usda' ? (item.generic ? 'USDA' : (item.brand ? 'Branded' : 'USDA')) : item.source === 'off' ? (item.brand ? 'Branded' : 'Open FF') : 'Custom'}
                                      </span>
                                      <span>P {Math.round(item.protein)}g · C {Math.round(item.carbs)}g · F {Math.round(item.fat)}g</span>
                                      {item.serving_size_label && <span>· per {item.serving_size_label}</span>}
                                    </div>
                                  </div>
                                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: GREEN,
                                      fontFamily: 'var(--mono)', lineHeight: 1 }}>{item.calories}</div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>kcal</div>
                                  </div>
                                </button>
                              ))}

                              {/* Network failure → retry */}
                              {!suggestLoading && suggestFailed && (
                                <div style={{ padding: '12px 14px' }}>
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                    Couldn't reach the food databases — check your connection.
                                  </div>
                                  <button onMouseDown={() => triggerSuggest(searchQuery)}
                                    style={{ background: `${AMBER}18`, border: `1px solid ${AMBER}35`,
                                      borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700,
                                      color: AMBER, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Retry search
                                  </button>
                                </div>
                              )}

                              {/* No results → create custom food */}
                              {!suggestLoading && !suggestFailed && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
                                <div style={{ padding: '12px 14px' }}>
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                    No foods found for "{searchQuery.trim()}"
                                  </div>
                                  <button onMouseDown={() => { setCustomFoodOpen(true); setCustomDraft(d => ({ ...d, name: searchQuery.trim() })); setSuggestsOpen(false) }}
                                    style={{ background: `${GREEN}18`, border: `1px solid ${GREEN}35`,
                                      borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700,
                                      color: GREEN, cursor: 'pointer', fontFamily: 'inherit',
                                      display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                    </svg>
                                    Create a custom food
                                  </button>
                                </div>
                              )}

                              {/* Footer */}
                              {suggestions.length > 0 && (
                                <div style={{ padding: '5px 14px 7px',
                                  borderTop: '1px solid rgba(255,255,255,0.05)',
                                  display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <svg width={9} height={9} viewBox="0 0 24 24" fill="none"
                                    stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                    Verified nutrition data · tap to select
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {searchError && (
                          <div style={{ fontSize: 12, color: RED, marginBottom: 10,
                            display: 'flex', alignItems: 'center', gap: 5 }}>
                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <line x1="12" y1="8" x2="12" y2="12"/>
                              <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            {searchError}
                          </div>
                        )}

                        {/* Quick Add — raw calories without picking a food */}
                        {!quickOpen ? (
                          <button onClick={() => setQuickOpen(true)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                              fontFamily: 'inherit', padding: '6px 0 0', textDecoration: 'underline',
                              textUnderlineOffset: 3 }}>
                            Quick add calories instead
                          </button>
                        ) : (
                          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                            padding: '10px 12px', marginTop: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                              Quick Add
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                              <input placeholder="Name (optional)" value={quickDraft.name}
                                onChange={e => setQuickDraft(d => ({ ...d, name: e.target.value }))}
                                style={{ flex: '1 1 120px', fontSize: 12 }} />
                              <input type="number" min="0" placeholder="kcal *" value={quickDraft.cal}
                                onChange={e => setQuickDraft(d => ({ ...d, cal: e.target.value }))}
                                style={{ width: 70, fontSize: 12 }} />
                              <input type="number" min="0" placeholder="P g" value={quickDraft.prot}
                                onChange={e => setQuickDraft(d => ({ ...d, prot: e.target.value }))}
                                style={{ width: 55, fontSize: 12 }} />
                              <input type="number" min="0" placeholder="C g" value={quickDraft.carbs}
                                onChange={e => setQuickDraft(d => ({ ...d, carbs: e.target.value }))}
                                style={{ width: 55, fontSize: 12 }} />
                              <input type="number" min="0" placeholder="F g" value={quickDraft.fat}
                                onChange={e => setQuickDraft(d => ({ ...d, fat: e.target.value }))}
                                style={{ width: 55, fontSize: 12 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm" onClick={() => submitQuickAdd(section.key)}
                                disabled={!(parseFloat(quickDraft.cal) > 0)}
                                style={{ background: GREEN, color: '#fff', border: 'none', fontWeight: 700, fontSize: 12 }}>
                                {planMode ? 'Plan it' : 'Log it'}
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}
                                onClick={() => setQuickOpen(false)}>Cancel</button>
                            </div>
                          </div>
                        )}
                        </>)}

                        {/* RECENT tab */}
                        {foodTab === 'recent' && (
                          <MiniFoodList foods={recentFoods} onPick={selectSuggestion}
                            empty="Foods you log will show up here for one-tap re-adding." />
                        )}

                        {/* FREQUENT tab */}
                        {foodTab === 'frequent' && (
                          <MiniFoodList foods={frequentFoods} onPick={selectSuggestion} showCount
                            empty="Your most-logged foods will collect here." />
                        )}

                        {/* MY FOODS tab */}
                        {foodTab === 'myfoods' && (<>
                          <button onClick={() => setCustomFoodOpen(o => !o)}
                            style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
                              background: `${GREEN}18`, border: `1px solid ${GREEN}35`, borderRadius: 7,
                              padding: '6px 12px', fontSize: 12, fontWeight: 700, color: GREEN,
                              cursor: 'pointer', fontFamily: 'inherit' }}>
                            <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            New custom food
                          </button>
                          <MiniFoodList foods={myFoods} onPick={selectSuggestion} onDelete={removeCustomFood}
                            empty="No custom foods yet — create one for homemade or local items." />
                        </>)}

                        {/* MEALS tab — saved My Meals, one-tap log */}
                        {foodTab === 'meals' && (
                          customMeals.length === 0 ? (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0 8px' }}>
                              No saved meals yet — build one in the My Meals section below.
                            </p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                              {customMeals.map(meal => (
                                <div key={meal.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                                  borderRadius: 8, padding: '8px 10px' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meal.name}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                      {meal.calories} kcal · P {meal.protein}g · C {meal.carbs}g · F {meal.fat}g
                                    </div>
                                  </div>
                                  <button className="btn btn-sm"
                                    onClick={() => { logCustomMeal(meal, section.key); clearAdd() }}
                                    style={{ background: planMode ? AMBER : GREEN, color: planMode ? '#000' : '#fff',
                                      border: 'none', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>
                                    {planMode ? 'Plan' : 'Add'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )
                        )}

                        {/* Custom food creation form */}
                        {customFoodOpen && (
                          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                            padding: '10px 12px', marginTop: 8, marginBottom: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                              New Custom Food
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                              <input placeholder="Name *" value={customDraft.name}
                                onChange={e => setCustomDraft(d => ({ ...d, name: e.target.value }))}
                                style={{ flex: '1 1 140px', fontSize: 12 }} />
                              <input placeholder="Brand" value={customDraft.brand}
                                onChange={e => setCustomDraft(d => ({ ...d, brand: e.target.value }))}
                                style={{ flex: '1 1 100px', fontSize: 12 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                              <input placeholder="Serving (e.g. 1 cup)" value={customDraft.label}
                                onChange={e => setCustomDraft(d => ({ ...d, label: e.target.value }))}
                                style={{ flex: '1 1 110px', fontSize: 12 }} />
                              <input type="number" min="0" placeholder="grams" value={customDraft.grams}
                                onChange={e => setCustomDraft(d => ({ ...d, grams: e.target.value }))}
                                style={{ width: 70, fontSize: 12 }} />
                              <input type="number" min="0" placeholder="kcal *" value={customDraft.cal}
                                onChange={e => setCustomDraft(d => ({ ...d, cal: e.target.value }))}
                                style={{ width: 65, fontSize: 12 }} />
                              <input type="number" min="0" placeholder="P g" value={customDraft.prot}
                                onChange={e => setCustomDraft(d => ({ ...d, prot: e.target.value }))}
                                style={{ width: 52, fontSize: 12 }} />
                              <input type="number" min="0" placeholder="C g" value={customDraft.carbs}
                                onChange={e => setCustomDraft(d => ({ ...d, carbs: e.target.value }))}
                                style={{ width: 52, fontSize: 12 }} />
                              <input type="number" min="0" placeholder="F g" value={customDraft.fat}
                                onChange={e => setCustomDraft(d => ({ ...d, fat: e.target.value }))}
                                style={{ width: 52, fontSize: 12 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm" onClick={createCustomFood}
                                disabled={!customDraft.name.trim() || customDraft.cal === ''}
                                style={{ background: GREEN, color: '#fff', border: 'none', fontWeight: 700, fontSize: 12 }}>
                                Save food
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}
                                onClick={() => setCustomFoodOpen(false)}>Cancel</button>
                            </div>
                          </div>
                        )}
                      </>)}

                      {/* CAMERA (barcode or photo AI) */}
                      {(addMode === 'barcode' || addMode === 'photo') && (
                        <FoodCamera
                          key={addMode}
                          mode={addMode}
                          onResult={result => {
                            setSearchResult(result)
                            setServings(1); setGramsInput(''); setQtyMode('servings')
                            setAddMode('search') // show result card in search view
                          }}
                        />
                      )}

                      {/* Result card */}
                      {searchResult && scaledResult && (
                        <div style={{ background: planMode ? `${AMBER}0d` : `${GREEN}0d`,
                          border: `1px solid ${planMode ? AMBER : GREEN}35`,
                          borderRadius: 12, padding: '14px 16px',
                          animation: 'nutCardIn .2s ease', marginTop: 10 }}>

                          {/* Name + scaled calories */}
                          <div style={{ display: 'flex', justifyContent: 'space-between',
                            alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                              {searchResult.name}
                            </span>
                            <span style={{ fontSize: 22, fontWeight: 800,
                              color: planMode ? AMBER : GREEN,
                              fontFamily: 'var(--mono)', lineHeight: 1, flexShrink: 0 }}>
                              {scaledResult.calories}
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}> kcal</span>
                            </span>
                          </div>

                          {/* ── Serving controls ── */}
                          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                            padding: '10px 12px', marginBottom: 10 }}>
                            {searchResult.measures?.length > 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Unit:</span>
                                <select value={measureIdx}
                                  onChange={e => { setMeasureIdx(parseInt(e.target.value)); setQtyMode('servings') }}
                                  style={{ flex: 1, fontSize: 12 }}>
                                  {searchResult.measures.map((m, i) => (
                                    <option key={i} value={i}>{m.label}</option>
                                  ))}
                                </select>
                              </div>
                            ) : searchResult.serving_size_label ? (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                                Serving size: <span style={{ color: 'var(--text-light)', fontWeight: 600 }}>
                                  {searchResult.serving_size_label}
                                </span>
                              </div>
                            ) : null}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              {/* Servings / Grams toggle */}
                              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.07)',
                                borderRadius: 6, padding: 2, flexShrink: 0 }}>
                                {['Servings', 'Grams'].map(m => (
                                  <button key={m}
                                    onClick={() => { setQtyMode(m === 'Servings' ? 'servings' : 'grams'); setGramsInput('') }}
                                    style={{ padding: '4px 9px', border: 'none', borderRadius: 5,
                                      cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                                      background: (m === 'Servings' ? qtyMode === 'servings' : qtyMode === 'grams')
                                        ? 'rgba(255,255,255,0.14)' : 'transparent',
                                      color: (m === 'Servings' ? qtyMode === 'servings' : qtyMode === 'grams')
                                        ? 'var(--text)' : 'var(--text-muted)',
                                      transition: 'background .12s, color .12s' }}>
                                    {m}
                                  </button>
                                ))}
                              </div>

                              {qtyMode === 'servings' ? (
                                <select value={servings}
                                  onChange={e => setServings(parseFloat(e.target.value))}
                                  style={{ flex: 1, fontSize: 14, fontWeight: 700,
                                    fontFamily: 'var(--mono)', textAlign: 'center' }}>
                                  {SERVING_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label} serving{o.value !== 1 ? 's' : ''}</option>
                                  ))}
                                </select>
                              ) : (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <input type="number" min="1" placeholder="150"
                                    value={gramsInput}
                                    onChange={e => setGramsInput(e.target.value)}
                                    style={{ flex: 1, fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', textAlign: 'center' }}/>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>g</span>
                                </div>
                              )}
                            </div>

                            {/* Multiplier hint */}
                            {Math.abs(servingMultiplier - 1) > 0.01 && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
                                {servingMultiplier < 1
                                  ? `${Math.round(servingMultiplier * 100)}% of 1 serving`
                                  : `×${servingMultiplier.toFixed(servingMultiplier % 1 === 0 ? 0 : 2)} servings`}
                              </div>
                            )}
                          </div>

                          {/* Scaled macros */}
                          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <MacroPill label="Protein" value={scaledResult.protein} color={BLUE}   />
                            <MacroPill label="Carbs"   value={scaledResult.carbs}   color={AMBER}  />
                            <MacroPill label="Fat"     value={scaledResult.fat}     color={PURPLE} />
                          </div>

                          {searchResult.notes && (
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic',
                              marginBottom: 10, lineHeight: 1.55 }}>
                              {searchResult.notes}
                            </p>
                          )}
                          {searchResult.confidence && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                              marginBottom: 12, background: 'rgba(255,255,255,0.05)',
                              borderRadius: 8, padding: '8px 10px' }}>
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                style={{ flexShrink: 0, marginTop: 1 }}>
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                              </svg>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                                Estimate based on what I can see. Confidence:{' '}
                                <span style={{ fontWeight: 700, color:
                                  searchResult.confidence === 'high' ? GREEN :
                                  searchResult.confidence === 'low'  ? RED   : AMBER }}>
                                  {searchResult.confidence}
                                </span>
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-sm"
                              onClick={() => addResult(section.key, scaledResult)}
                              style={{ background: planMode ? AMBER : GREEN,
                                color: planMode ? '#000' : '#fff', border: 'none',
                                flex: 1, fontWeight: 700, fontSize: 12,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              {planMode ? (
                                <><svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                                  <line x1="3" y1="10" x2="21" y2="10"/>
                                </svg> Plan for {section.label}</>
                              ) : (
                                <>+ Add to {section.label}</>
                              )}
                            </button>
                            <button onClick={() => saveMeal(scaledResult)}
                              disabled={savedMeals.some(m => m.name.toLowerCase() === searchResult.name.toLowerCase())}
                              style={{ background: 'none', border: '1px solid var(--border)',
                                borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                                display: 'flex', alignItems: 'center', gap: 5,
                                color: savedMeals.some(m => m.name.toLowerCase() === searchResult.name.toLowerCase())
                                  ? GREEN : 'var(--text)' }}>
                              {savedMeals.some(m => m.name.toLowerCase() === searchResult.name.toLowerCase()) ? (
                                <><svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12"/></svg> Saved</>
                              ) : (
                                <><svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                                </svg> Save</>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: hasItems ? 10 : 0 }}>
                      <button onClick={() => openAdd(section.key)}
                        style={{ flex: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          background: 'none', border: '1px dashed var(--border)',
                          borderRadius: 8, padding: '8px 14px', color: 'var(--text-muted)',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'border-color .15s, color .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = GREEN; e.currentTarget.style.color = GREEN }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <line x1="5"  y1="12" x2="19" y2="12"/>
                        </svg>
                        Add Food
                      </button>
                      <button onClick={() => copyYesterdayMeal(section.key)}
                        disabled={copyingMeal === section.key}
                        title={`Copy yesterday's ${section.label.toLowerCase()} here`}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                          background: 'none', border: '1px dashed var(--border)',
                          borderRadius: 8, padding: '8px 12px', color: 'var(--text-muted)',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'border-color .15s, color .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = AMBER; e.currentTarget.style.color = AMBER }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        {copyingMeal === section.key ? 'Copying…' : 'Copy yesterday'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── WATER TRACKER ── */}
      <div className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
          </svg>
          <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Water</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)',
            color: waterMl >= WATER_GOAL_ML ? GREEN : 'var(--text)' }}>
            {waterMl.toLocaleString()}<span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}> / {WATER_GOAL_ML.toLocaleString()} ml</span>
          </span>
        </div>
        <div className="progress-wrap" style={{ marginBottom: 10 }}>
          <div className="progress-fill" style={{ width: `${Math.min(100, waterMl / WATER_GOAL_ML * 100)}%`,
            background: waterMl >= WATER_GOAL_ML ? GREEN : BLUE }} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => addWater(250)}>+250 ml</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => addWater(237)}>+8 oz</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => addWater(500)}>+500 ml</button>
          {waterMl > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, marginLeft: 'auto', color: 'var(--text-light)' }}
              onClick={() => addWater(-250)}>Undo</button>
          )}
        </div>
      </div>

      {/* ── THIS WEEK ── */}
      <WeeklyNutrition userId={user.id} calGoal={effCal} />

      {/* ── CUSTOM MEALS SECTION ── */}
      <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
              stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <span style={{ fontWeight: 700, fontSize: 14 }}>My Meals</span>
            {customMeals.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                {customMeals.length}
              </span>
            )}
          </div>
          <button onClick={() => { setMealCreatorOpen(true); setNewMealName(''); setNewMealItems([]); setMealIngSearch(''); setMealIngResult(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: `${GREEN}18`,
              border: `1px solid ${GREEN}35`, borderRadius: 7, padding: '5px 12px',
              fontSize: 12, fontWeight: 700, color: GREEN, cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create Meal
          </button>
        </div>

        {customMeals.length === 0 ? (
          <div style={{ padding: '12px 16px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No saved meals yet. Create one to log multiple ingredients at once.
            </p>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {customMeals.map(meal => {
              const mealSec = logMealSection[meal.id] || SECTIONS[0].key
              const expanded = editMealId === meal.id
              return (
                <div key={meal.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
                    <button onClick={() => setEditMealId(expanded ? null : meal.id)}
                      style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left', padding: 0, fontFamily: 'inherit' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{meal.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {meal.items.length} items · P {meal.protein}g · C {meal.carbs}g · F {meal.fat}g
                      </div>
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 800, color: GREEN,
                      fontFamily: 'var(--mono)', flexShrink: 0 }}>
                      {meal.calories.toLocaleString()} kcal
                    </span>
                    <select value={mealSec}
                      onChange={e => setLogMealSection(p => ({ ...p, [meal.id]: e.target.value }))}
                      style={{ fontSize: 12, padding: '4px 6px', flexShrink: 0, maxWidth: 90 }}>
                      {SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <button onClick={() => logCustomMeal(meal, mealSec)}
                      title="Log meal"
                      style={{ background: GREEN, border: 'none', borderRadius: 7, padding: '5px 10px',
                        fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      Log
                    </button>
                    <button onClick={() => deleteCustomMeal(meal.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: '2px 3px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', borderRadius: 4 }}
                      onMouseEnter={e => e.currentTarget.style.color = RED}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                    </button>
                  </div>
                  {expanded && (
                    <div style={{ padding: '0 16px 12px', background: 'rgba(255,255,255,0.02)' }}>
                      {meal.items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', padding: '5px 0',
                          borderBottom: i < meal.items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-light)', flex: 1 }}>{item.name}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: GREEN,
                            fontFamily: 'var(--mono)', marginLeft: 8 }}>{item.calories} kcal</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── MEAL CREATOR MODAL ── */}
      {mealCreatorOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
          zIndex: 9500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setMealCreatorOpen(false) }}>
          <div style={{ width: '100%', maxWidth: 520, background: 'var(--surface, #1a1a2e)',
            borderRadius: '20px 20px 0 0', padding: '24px 20px 32px',
            maxHeight: '88vh', overflowY: 'auto',
            boxShadow: '0 -12px 60px rgba(0,0,0,0.6)', animation: 'nutPanelUp .2s ease' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Create Meal</h3>
              <button onClick={() => setMealCreatorOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Meal name */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 6 }}>Meal Name</div>
              <input value={newMealName}
                onChange={e => setNewMealName(e.target.value)}
                placeholder="e.g. My Protein Bowl"
                style={{ width: '100%', fontSize: 15, fontWeight: 600 }}/>
            </div>

            {/* Ingredient search */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 6 }}>Add Ingredients</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={mealIngSearch}
                  onChange={e => { setMealIngSearch(e.target.value); setMealIngResult(null) }}
                  onKeyDown={e => e.key === 'Enter' && searchMealIngredient(mealIngSearch)}
                  placeholder="Search any food…"
                  style={{ flex: 1 }}/>
                <button onClick={() => searchMealIngredient(mealIngSearch)}
                  disabled={!mealIngSearch.trim() || mealIngSearching}
                  style={{ background: GREEN, color: '#fff', border: 'none', borderRadius: 8,
                    padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    flexShrink: 0, opacity: mealIngSearching ? 0.7 : 1 }}>
                  {mealIngSearching ? '···' : 'Find'}
                </button>
              </div>

              {/* Ingredient result */}
              {mealIngResult && (
                <div style={{ marginTop: 10, background: `${GREEN}0d`,
                  border: `1px solid ${GREEN}35`, borderRadius: 10, padding: '12px 14px',
                  animation: 'nutCardIn .15s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{mealIngResult.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        P {mealIngResult.protein}g · C {mealIngResult.carbs}g · F {mealIngResult.fat}g
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: GREEN,
                        fontFamily: 'var(--mono)' }}>{mealIngResult.calories} kcal</span>
                      <button onClick={() => addIngredientToMeal(mealIngResult)}
                        style={{ background: GREEN, color: '#fff', border: 'none',
                          borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit' }}>
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Added ingredients */}
            {newMealItems.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Ingredients ({newMealItems.length})
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10,
                  border: '1px solid var(--border)', overflow: 'hidden' }}>
                  {newMealItems.map((item, i) => (
                    <div key={item._id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px',
                      borderBottom: i < newMealItems.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                          P {item.protein}g · C {item.carbs}g · F {item.fat}g
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: GREEN,
                        fontFamily: 'var(--mono)', flexShrink: 0 }}>{item.calories} kcal</span>
                      <button onClick={() => removeIngredient(item._id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-muted)', padding: '2px 3px', flexShrink: 0,
                          display: 'flex', alignItems: 'center', borderRadius: 4 }}
                        onMouseEnter={e => e.currentTarget.style.color = RED}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                  {/* Totals */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderTop: '1px solid var(--border-strong)',
                    background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      P {newMealItems.reduce((s,i)=>s+i.protein,0)}g ·
                      C {newMealItems.reduce((s,i)=>s+i.carbs,0)}g ·
                      F {newMealItems.reduce((s,i)=>s+i.fat,0)}g
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: GREEN, fontFamily: 'var(--mono)' }}>
                      {newMealItems.reduce((s,i)=>s+i.calories,0).toLocaleString()} kcal
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Save button */}
            <button onClick={saveCustomMeal}
              disabled={!newMealName.trim() || newMealItems.length === 0}
              style={{ width: '100%', background: newMealName.trim() && newMealItems.length > 0 ? GREEN : 'rgba(255,255,255,0.08)',
                color: newMealName.trim() && newMealItems.length > 0 ? '#fff' : 'var(--text-muted)',
                border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 800,
                cursor: newMealName.trim() && newMealItems.length > 0 ? 'pointer' : 'default',
                fontFamily: 'inherit', transition: 'background .15s, color .15s' }}>
              Save Meal
            </button>
          </div>
        </div>
      )}

      {/* ── TODAY'S MACROS panel — bottom-right, clear of the sidebar and
            offset left of the floating chat button ── */}
      <div ref={panelRef}
        style={{ position: 'fixed', bottom: 24, right: 88, zIndex: 8500,
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
        {panelOpen && (
          <div style={{ width: 310, background: 'var(--surface, #1a1a2e)',
            border: '1px solid var(--border-strong, rgba(255,255,255,0.12))',
            borderRadius: 16, padding: '18px 18px 14px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.65)', animation: 'nutPanelUp .18s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%',
                  background: GREEN, boxShadow: `0 0 8px ${GREEN}` }}/>
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {isToday ? "Today's" : fmtNavDate(selectedDate)} Macros
                </span>
              </div>
              <button onClick={() => setPanelOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <PanelMacro label="Calories" value={total}                  planned={plannedTotal}     goal={effCal}   unit="kcal" color={GREEN}  />
              <PanelMacro label="Protein"  value={Math.round(totalProt)}  planned={Math.round(plannedProtTotal)} goal={effProt}  unit="g"    color={BLUE}   />
              <PanelMacro label="Carbs"    value={Math.round(totalCarbs)} planned={Math.round(plannedCarbTotal)} goal={carbGoal} unit="g"    color={AMBER}  />
              <PanelMacro label="Fat"      value={Math.round(totalFat)}   planned={Math.round(plannedFatTotal)}  goal={fatGoal}  unit="g"    color={PURPLE} />
            </div>
            {/* Micros — populated for entries logged from the verified food database */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12,
              paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
              {[
                ['Fiber',  `${Math.round(entries.reduce((t, e) => t + (e.fiber_g   || 0), 0))} g`],
                ['Sugar',  `${Math.round(entries.reduce((t, e) => t + (e.sugar_g   || 0), 0))} g`],
                ['Sodium', `${Math.round(entries.reduce((t, e) => t + (e.sodium_mg || 0), 0)).toLocaleString()} mg`],
              ].map(([label, val]) => (
                <span key={label}>
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9 }}>{label}</span>
                  {' '}<span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text-light)' }}>{val}</span>
                </span>
              ))}
            </div>
            {entries.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Logged
                </div>
                <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                  {entries.map(e => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-light)', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                        {e.food_name}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: GREEN,
                        fontFamily: 'var(--mono)', flexShrink: 0 }}>{e.calories} kcal</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {plannedMeals.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.12em', color: AMBER, marginBottom: 8 }}>Planned</div>
                <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                  {plannedMeals.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                        {p.food_name}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: AMBER,
                        fontFamily: 'var(--mono)', flexShrink: 0 }}>{p.calories} kcal</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {entries.length === 0 && plannedMeals.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic',
                marginTop: 12, textAlign: 'center' }}>Nothing logged yet.</p>
            )}
          </div>
        )}
        <button onClick={() => setPanelOpen(o => !o)}
          style={{ background: GREEN, border: 'none', borderRadius: 999, padding: '11px 20px',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: `0 4px 20px ${GREEN}66`, display: 'flex', alignItems: 'center', gap: 8,
            transition: 'transform .15s, box-shadow .15s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.boxShadow = `0 6px 28px ${GREEN}99` }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';   e.currentTarget.style.boxShadow = `0 4px 20px ${GREEN}66` }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3"  y="12" width="4" height="9" rx="1"/>
            <rect x="10" y="7"  width="4" height="14" rx="1"/>
            <rect x="17" y="3"  width="4" height="18" rx="1"/>
          </svg>
          Today's Macros
        </button>
      </div>


      {/* ── MFP IMPORT MODAL ── */}
      {mfpOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeMfp() }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 480,
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Import from MyFitnessPal</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Upload a screenshot — all items log to {isToday ? 'today' : fmtNavDate(selectedDate)}
                </div>
              </div>
              <button onClick={closeMfp} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center',
              }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {/* upload area */}
              {!mfpImage ? (
                <div
                  onClick={() => mfpFileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleMfpFile(e.dataTransfer.files[0]) }}
                  style={{
                    border: '2px dashed rgba(99,179,237,0.35)', borderRadius: 12,
                    padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
                    transition: 'border-color .15s, background .15s',
                    background: 'rgba(99,179,237,0.04)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,179,237,0.65)'; e.currentTarget.style.background = 'rgba(99,179,237,0.09)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(99,179,237,0.35)'; e.currentTarget.style.background = 'rgba(99,179,237,0.04)' }}
                >
                  <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#63b3ed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: 0.7 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    Drop screenshot here or click to upload
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    PNG, JPG, or WebP — any MFP diary screenshot
                  </div>
                  <input
                    ref={mfpFileRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => handleMfpFile(e.target.files[0])}
                  />
                </div>
              ) : (
                <div>
                  {/* image preview */}
                  <div style={{ position: 'relative', marginBottom: 14 }}>
                    <img
                      src={mfpImage.preview}
                      alt="MFP screenshot"
                      style={{ width: '100%', borderRadius: 10, maxHeight: 260, objectFit: 'contain',
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                    <button
                      onClick={() => { setMfpImage(null); setMfpItems(null); setMfpSel(new Set()); setMfpError(null) }}
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'rgba(0,0,0,0.7)', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', borderRadius: 6, padding: '3px 7px',
                        fontSize: 11, fontWeight: 600,
                      }}
                    >
                      Change
                    </button>
                  </div>

                  {/* parse button (shown before parsing) */}
                  {mfpItems === null && !mfpParsing && (
                    <button
                      onClick={parseMfpScreenshot}
                      style={{
                        width: '100%', padding: '11px 0',
                        background: '#63b3ed', color: '#000', border: 'none',
                        borderRadius: 10, fontSize: 14, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      Read Screenshot
                    </button>
                  )}

                  {/* parsing spinner */}
                  {mfpParsing && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                      <div style={{ marginBottom: 10, fontSize: 22 }}>
                        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#63b3ed" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                        </svg>
                      </div>
                      Reading your screenshot…
                    </div>
                  )}

                  {/* error */}
                  {mfpError && (
                    <div style={{ background: 'rgba(245,101,101,0.1)', border: '1px solid rgba(245,101,101,0.3)',
                      borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#fc8181' }}>
                      {mfpError}
                    </div>
                  )}

                  {/* item review list */}
                  {mfpItems !== null && mfpItems.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                      No food items were found in this screenshot.
                    </div>
                  )}

                  {mfpItems !== null && mfpItems.length > 0 && (() => {
                    const byMeal = { breakfast: [], lunch: [], dinner: [], snacks: [] }
                    mfpItems.forEach((item, i) => { byMeal[item.meal_tag]?.push({ ...item, _i: i }) })
                    const sectionLabels = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' }
                    const selCount = mfpSel.size

                    return (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                            {mfpItems.length} item{mfpItems.length !== 1 ? 's' : ''} found
                          </span>
                          <button
                            onClick={() => setMfpSel(selCount === mfpItems.length ? new Set() : new Set(mfpItems.map((_, i) => i)))}
                            style={{ fontSize: 11, fontWeight: 600, color: '#63b3ed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            {selCount === mfpItems.length ? 'Deselect all' : 'Select all'}
                          </button>
                        </div>

                        {Object.entries(byMeal).map(([key, items]) => items.length === 0 ? null : (
                          <div key={key} style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                              {sectionLabels[key]}
                            </div>
                            {items.map(item => (
                              <div
                                key={item._i}
                                onClick={() => setMfpSel(prev => {
                                  const n = new Set(prev)
                                  n.has(item._i) ? n.delete(item._i) : n.add(item._i)
                                  return n
                                })}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '8px 10px', borderRadius: 8, marginBottom: 3,
                                  background: mfpSel.has(item._i) ? 'rgba(99,179,237,0.1)' : 'rgba(255,255,255,0.03)',
                                  border: `1px solid ${mfpSel.has(item._i) ? 'rgba(99,179,237,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                  cursor: 'pointer', transition: 'background .12s, border-color .12s',
                                  opacity: mfpSel.has(item._i) ? 1 : 0.45,
                                }}
                              >
                                {/* checkbox */}
                                <div style={{
                                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                  background: mfpSel.has(item._i) ? '#63b3ed' : 'transparent',
                                  border: `2px solid ${mfpSel.has(item._i) ? '#63b3ed' : 'rgba(255,255,255,0.2)'}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'all .12s',
                                }}>
                                  {mfpSel.has(item._i) && (
                                    <svg width={9} height={9} viewBox="0 0 12 12" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 6 5 9 10 3"/></svg>
                                  )}
                                </div>
                                {/* name + macros */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.food_name}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, display: 'flex', gap: 8 }}>
                                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{item.calories} cal</span>
                                    <span>P {item.protein_g}g</span>
                                    <span>C {item.carbs_g}g</span>
                                    <span>F {item.fat_g}g</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}

                        <button
                          onClick={logMfpItems}
                          disabled={selCount === 0 || mfpLogging}
                          style={{
                            width: '100%', marginTop: 4, padding: '12px 0',
                            background: selCount === 0 ? 'rgba(255,255,255,0.06)' : '#63b3ed',
                            color: selCount === 0 ? 'var(--text-muted)' : '#000',
                            border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                            cursor: selCount === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          {mfpLogging ? 'Logging…' : `Log ${selCount} item${selCount !== 1 ? 's' : ''}`}
                        </button>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MFP CSV IMPORT MODAL ── */}
      {csvOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeCsv() }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px 16px',
          }}
        >
          <div style={{
            background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 480,
            maxHeight: '88vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            animation: 'nutPanelUp .18s ease',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,179,237,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#63b3ed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Import MFP CSV</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    MFP app → More → Settings → Data → Export Data
                  </div>
                </div>
              </div>
              <button onClick={closeCsv}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', padding: 6, borderRadius: 6 }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {!csvItems && (
                <div>
                  <input
                    ref={csvFileRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: 'none' }}
                    onChange={e => handleCsvFile(e.target.files?.[0])}
                  />
                  <button
                    onClick={() => csvFileRef.current?.click()}
                    style={{
                      width: '100%', padding: '32px 20px', background: 'rgba(99,179,237,0.07)',
                      border: '2px dashed rgba(99,179,237,0.35)', borderRadius: 12,
                      cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 10, fontFamily: 'inherit',
                    }}
                  >
                    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#63b3ed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#63b3ed' }}>Choose CSV file</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      MFP export: More → Settings → Data → Export Data
                    </span>
                  </button>
                  {csvError && (
                    <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(252,129,74,0.12)',
                      border: '1px solid rgba(252,129,74,0.3)', borderRadius: 8,
                      fontSize: 12, color: '#fc814a' }}>
                      {csvError}
                    </div>
                  )}
                </div>
              )}

              {csvItems && (() => {
                const selCount = csvSel.size
                const byDate = {}
                csvItems.forEach((item, i) => {
                  if (!byDate[item.date]) byDate[item.date] = []
                  byDate[item.date].push({ ...item, idx: i })
                })
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {csvItems.length} entries · {selCount} selected
                      </div>
                      <button
                        onClick={() => setCsvSel(csvSel.size === csvItems.length
                          ? new Set() : new Set(csvItems.map((_, i) => i)))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: 600, color: '#63b3ed', padding: '2px 6px' }}
                      >
                        {csvSel.size === csvItems.length ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    {Object.entries(byDate).map(([date, items]) => (
                      <div key={date} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                          {date}
                        </div>
                        {items.map(item => (
                          <button key={item.idx}
                            onClick={() => setCsvSel(s => {
                              const n = new Set(s); n.has(item.idx) ? n.delete(item.idx) : n.add(item.idx); return n
                            })}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                              background: csvSel.has(item.idx) ? 'rgba(99,179,237,0.08)' : 'none',
                              border: `1px solid ${csvSel.has(item.idx) ? 'rgba(99,179,237,0.25)' : 'transparent'}`,
                              borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                              marginBottom: 4, textAlign: 'left', fontFamily: 'inherit',
                              transition: 'background .12s, border-color .12s',
                            }}
                          >
                            <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                              border: `1.5px solid ${csvSel.has(item.idx) ? '#63b3ed' : 'var(--border)'}`,
                              background: csvSel.has(item.idx) ? '#63b3ed' : 'none',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {csvSel.has(item.idx) && (
                                <svg width={9} height={9} viewBox="0 0 10 10" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round">
                                  <polyline points="1.5 5 4 7.5 8.5 2.5"/>
                                </svg>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.food_name}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                {item.meal_tag} · P {item.protein_g.toFixed(1)}g · C {item.carbs_g.toFixed(1)}g · F {item.fat_g.toFixed(1)}g
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, textAlign: 'right' }}>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#63b3ed', fontFamily: 'var(--mono)' }}>
                                {Math.round(item.calories)}
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>kcal</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                    {csvError && (
                      <div style={{ marginTop: 8, padding: '10px 14px', background: 'rgba(252,129,74,0.12)',
                        border: '1px solid rgba(252,129,74,0.3)', borderRadius: 8,
                        fontSize: 12, color: '#fc814a' }}>
                        {csvError}
                      </div>
                    )}
                    <button
                      onClick={logCsvItems}
                      disabled={selCount === 0 || csvLogging}
                      style={{
                        width: '100%', marginTop: 8, padding: '12px 0',
                        background: selCount === 0 ? 'rgba(255,255,255,0.06)' : '#63b3ed',
                        color: selCount === 0 ? 'var(--text-muted)' : '#000',
                        border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                        cursor: selCount === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {csvLogging ? 'Logging…' : `Log ${selCount} entr${selCount !== 1 ? 'ies' : 'y'}`}
                    </button>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <style>{`
        @keyframes nutPanelUp {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes nutCardIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nutSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes nutScanLine {
          0%   { top: 18%; opacity: 1; }
          48%  { opacity: 1; }
          50%  { top: 82%; opacity: 0.7; }
          52%  { opacity: 1; }
          100% { top: 18%; opacity: 1; }
        }
        @keyframes nutCamFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionIcon({ sectionKey, size = 16 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (sectionKey === 'breakfast') return (
    <svg {...p}>
      <path d="M12 2v4"/><path d="m4.93 7.93 1.41 1.41"/>
      <path d="M2 16h4"/><path d="M18 16h4"/><path d="m18.66 7.93-1.41 1.41"/>
      <path d="M16 16a4 4 0 0 0-8 0"/><path d="M2 20h20"/>
    </svg>
  )
  if (sectionKey === 'lunch') return (
    <svg {...p}>
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  )
  if (sectionKey === 'dinner') return (
    <svg {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  )
  return (
    <svg {...p}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/>
      <line x1="7" y1="2" x2="7" y2="22"/>
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
    </svg>
  )
}

function MacroBar({ label, value, planned = 0, goal, unit, color }) {
  const pct        = Math.min(100, goal > 0 ? (value / goal) * 100 : 0)
  const planPct    = Math.min(100, goal > 0 ? ((value + planned) / goal) * 100 : 0)
  const remaining  = goal - value - planned
  const over       = value > goal
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-light)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{value}</span>
          {planned > 0 && <span style={{ color: AMBER, fontFamily: 'var(--mono)', fontSize: 11 }}>+{planned}</span>}
          {' / '}{goal}{unit}
        </span>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', marginBottom: 5, position: 'relative' }}>
        {/* Planned background bar */}
        {planned > 0 && (
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${planPct}%`, borderRadius: 99, background: AMBER, opacity: 0.35,
            transition: 'width .55s cubic-bezier(.22,1,.36,1)' }}/>
        )}
        {/* Actual bar */}
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`, borderRadius: 99, background: color,
          boxShadow: `0 0 10px ${color}70`,
          transition: 'width .55s cubic-bezier(.22,1,.36,1)' }}/>
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: over ? RED : 'var(--text-muted)' }}>
        {over ? `${Math.abs(goal - value)}${unit} over` : `${Math.max(0, remaining)}${unit} remaining`}
      </div>
    </div>
  )
}

function PanelMacro({ label, value, planned = 0, goal, unit, color }) {
  const pct     = Math.min(100, goal > 0 ? (value / goal) * 100 : 0)
  const planPct = Math.min(100, goal > 0 ? ((value + planned) / goal) * 100 : 0)
  const over    = value > goal
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-light)' }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color, display: 'flex', alignItems: 'center', gap: 4 }}>
          {value.toLocaleString()}
          {planned > 0 && <span style={{ color: AMBER, fontSize: 11 }}>+{planned}</span>}
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>/ {goal.toLocaleString()} {unit}</span>
        </span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
        {planned > 0 && (
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${planPct}%`, background: AMBER, opacity: 0.4, borderRadius: 99,
            transition: 'width .4s ease' }}/>
        )}
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%',
          width: `${pct}%`, background: over ? RED : color,
          borderRadius: 99, transition: 'width .4s ease' }}/>
      </div>
    </div>
  )
}

function MacroPill({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5,
      background: `${color}18`, border: `1px solid ${color}35`,
      borderRadius: 8, padding: '4px 10px' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }}/>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{value}g</span>
    </div>
  )
}

// ── FoodCamera ────────────────────────────────────────────────────────────────
// Live camera viewfinder with Barcode + Photo AI modes
// ── Weekly view: daily calories vs goal, average macros, logging streak ──
function WeeklyNutrition({ userId, calGoal }) {
  const [days, setDays] = useState(() => cacheGet('nutrition:week') || null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const end   = getActiveDate()
    const start = shiftDate(end, -6)
    supabase.from('nutrition_entries')
      .select('date, calories, protein_g, carbs_g, fat_g')
      .eq('user_id', userId).gte('date', start).lte('date', end)
      .then(({ data }) => {
        const byDate = {}
        for (let i = 0; i < 7; i++) {
          const d = shiftDate(end, i - 6)
          byDate[d] = { date: d, cal: 0, prot: 0, carbs: 0, fat: 0, logged: false }
        }
        for (const e of data || []) {
          const d = byDate[e.date]
          if (!d) continue
          d.cal += e.calories || 0; d.prot += e.protein_g || 0
          d.carbs += e.carbs_g || 0; d.fat += e.fat_g || 0
          d.logged = true
        }
        setDays(cacheSet('nutrition:week', Object.values(byDate)))
      })
  }, [userId])

  if (!days) return null
  const loggedDays = days.filter(d => d.logged)
  const avg = k => loggedDays.length ? Math.round(loggedDays.reduce((s, d) => s + d[k], 0) / loggedDays.length) : 0
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].logged) streak++
    else break
  }
  const maxCal = Math.max(calGoal, ...days.map(d => d.cal), 1)

  return (
    <div className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none',
          border: 'none', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', padding: 0 }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
          stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>
        </svg>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, textAlign: 'left' }}>This Week</span>
        {streak > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: GREEN }}>{streak} day{streak !== 1 ? 's' : ''} logged</span>
        )}
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ color: 'var(--text-muted)', transition: 'transform .2s', transform: open ? 'rotate(0)' : 'rotate(-90deg)' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {/* Calories vs goal bars */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, marginBottom: 4, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${calGoal / maxCal * 100}%`,
              borderTop: '1px dashed rgba(255,255,255,0.25)', pointerEvents: 'none' }} />
            {days.map(d => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <div title={`${d.cal.toLocaleString()} kcal`}
                  style={{ width: '100%', maxWidth: 30, borderRadius: '4px 4px 0 0',
                    height: `${Math.max(d.cal / maxCal * 100, d.logged ? 3 : 0)}%`,
                    background: d.cal > calGoal ? RED : d.logged ? GREEN : 'rgba(255,255,255,0.07)',
                    opacity: 0.85, transition: 'height .3s ease' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {days.map(d => (
              <div key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-light)', textTransform: 'uppercase' }}>
                {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Avg <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text-light)' }}>{avg('cal').toLocaleString()}</span> kcal</span>
            <span>P <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: BLUE }}>{avg('prot')}g</span></span>
            <span>C <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: AMBER }}>{avg('carbs')}g</span></span>
            <span>F <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: PURPLE }}>{avg('fat')}g</span></span>
            <span style={{ fontSize: 10, color: 'var(--text-light)' }}>dashed line = goal</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Compact food list used by the Recent / Frequent / My Foods tabs
function MiniFoodList({ foods, onPick, onDelete, showCount, empty }) {
  if (!foods.length) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0 8px' }}>{empty}</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8, maxHeight: 260, overflowY: 'auto' }}>
      {foods.map((f, i) => (
        <div key={f.id || `${f.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 10px' }}>
          <button onClick={() => onPick(f)} style={{ flex: 1, minWidth: 0, background: 'none',
            border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', padding: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.brand ? `${f.brand} · ` : ''}{f.name}
              {showCount && f._count > 1 && (
                <span style={{ fontSize: 10, color: 'var(--text-light)', marginLeft: 6 }}>×{f._count}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {f.calories} kcal · P {Math.round(f.protein)}g · C {Math.round(f.carbs)}g · F {Math.round(f.fat)}g
              {f.serving_size_label ? ` · ${f.serving_size_label}` : ''}
            </div>
          </button>
          {onDelete && (
            <button onClick={() => onDelete(f.id)} className="del-btn" title="Delete custom food">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function FoodCamera({ mode: initialMode, onResult }) {
  const [camMode,  setCamMode]  = useState(initialMode === 'barcode' ? 'barcode' : 'photo')
  const [status,   setStatus]   = useState(initialMode === 'barcode' ? 'Point at a barcode…' : '')
  const [error,    setError]    = useState('')
  const [busy,     setBusy]     = useState(false)
  const [ready,    setReady]    = useState(false)

  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const streamRef   = useRef(null)
  const intervalRef = useRef(null)

  // Start camera once on mount
  useEffect(() => {
    let alive = true
    navigator.mediaDevices?.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    }).then(stream => {
      if (!alive) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); setReady(true) }
      }
    }).catch(() => {
      if (alive) setError('Camera access denied. Allow camera in browser settings.')
    })
    return () => {
      alive = false
      stopStream()
    }
  }, [])

  // Barcode scanning loop — restart when camMode or ready changes
  useEffect(() => {
    stopLoop()
    if (camMode === 'barcode' && ready) startLoop()
    return stopLoop
  }, [camMode, ready])

  function stopStream() {
    stopLoop()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function stopLoop() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
  }

  function startLoop() {
    const DetectorClass = ('BarcodeDetector' in window) ? window.BarcodeDetector : BarcodeDetectorPolyfill
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'qr_code']
    let detector
    try { detector = new DetectorClass({ formats }) }
    catch { setStatus('Barcode scanning unavailable on this browser'); return }

    intervalRef.current = setInterval(async () => {
      const vid = videoRef.current
      if (!vid || vid.readyState < 2 || busy) return
      try {
        const codes = await detector.detect(vid)
        if (codes.length > 0) {
          stopLoop()
          await lookupBarcode(codes[0].rawValue)
        }
      } catch { /* silent */ }
    }, 300)
  }

  async function lookupBarcode(code) {
    setBusy(true)
    setStatus(`Barcode ${code} — looking up…`)
    try {
      const food = await offLookupBarcode(code)
      if (!food) {
        setStatus('Product not found — try Search or create a custom food.')
        setBusy(false)
        if (camMode === 'barcode') startLoop()
        return
      }
      onResult({ ...food, notes: `Barcode scan · ${food.brand ? `${food.brand} ` : ''}${food.name}` })
    } catch {
      setStatus('Lookup failed — check your connection and try again.')
      setBusy(false)
      if (camMode === 'barcode') startLoop()
    }
  }

  async function captureAndAnalyze() {
    if (!PHOTO_AI_ENABLED) {
      setStatus('Photo AI is coming soon — use Search or Barcode for now.')
      return
    }
    const vid = videoRef.current
    const cvs = canvasRef.current
    if (busy || !vid || !cvs || !ready) return
    setBusy(true); setStatus('Analyzing with AI…')
    try {
      cvs.width  = vid.videoWidth
      cvs.height = vid.videoHeight
      cvs.getContext('2d').drawImage(vid, 0, 0)
      const blob   = await new Promise(r => cvs.toBlob(r, 'image/jpeg', 0.85))
      const base64 = await new Promise(r => {
        const fr = new FileReader()
        fr.onload  = e => r(e.target.result.split(',')[1])
        fr.readAsDataURL(blob)
      })
      const res  = await fetch('/api/scan-food', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType: 'image/jpeg' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      const p = data.result
      onResult({
        name:               p.name || 'Scanned food',
        calories:           Math.round(parseFloat(p.calories) || 0),
        protein:            Math.round(parseFloat(p.protein)  || 0),
        carbs:              Math.round(parseFloat(p.carbs)    || 0),
        fat:                Math.round(parseFloat(p.fat)      || 0),
        serving_size_label: p.serving_size_label || '',
        serving_size_g:     parseFloat(p.serving_size_g)  || 0,
        notes:              p.notes || '',
        confidence:         p.confidence || 'medium',
      })
    } catch (err) {
      setError(err.message)
      setBusy(false)
      setStatus('')
    }
  }

  const CORNER = `rgba(255,255,255,0.85)`

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', background: '#0a0a0a',
      animation: 'nutCamFadeIn .22s ease', position: 'relative' }}>

      {/* Inner mode toggle */}
      <div style={{ display: 'flex', gap: 3, padding: '8px 10px',
        background: 'rgba(0,0,0,0.55)', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        backdropFilter: 'blur(6px)' }}>
        {[
          { m: 'barcode', label: 'Barcode', icon: (
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14M3 5h2M3 19h2M19 5h2M19 19h2"/>
            </svg>
          )},
          { m: 'photo', label: 'Photo AI', icon: (
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          )},
        ].map(({ m, label, icon }) => (
          <button key={m}
            onClick={() => { setCamMode(m); setStatus(m === 'barcode' ? 'Point at a barcode…' : ''); setError('') }}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '7px 8px', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
              background: camMode === m ? 'rgba(255,255,255,0.18)' : 'transparent',
              color: camMode === m ? '#fff' : 'rgba(255,255,255,0.5)',
              transition: 'background .15s, color .15s' }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Video feed */}
      <video ref={videoRef} playsInline muted
        style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }}/>
      <canvas ref={canvasRef} style={{ display: 'none' }}/>

      {/* Viewfinder overlay */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', top: 44 }}>

        {/* Corner brackets */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          style={{ position: 'absolute', inset: '12% 16%', width: '68%', height: '68%' }}>
          {/* TL */}
          <path d="M2,18 L2,2 L18,2" fill="none" stroke={CORNER} strokeWidth="2.5" strokeLinecap="round"/>
          {/* TR */}
          <path d="M82,2 L98,2 L98,18" fill="none" stroke={CORNER} strokeWidth="2.5" strokeLinecap="round"/>
          {/* BL */}
          <path d="M2,82 L2,98 L18,98" fill="none" stroke={CORNER} strokeWidth="2.5" strokeLinecap="round"/>
          {/* BR */}
          <path d="M98,82 L98,98 L82,98" fill="none" stroke={CORNER} strokeWidth="2.5" strokeLinecap="round"/>
        </svg>

        {/* Barcode scan line */}
        {camMode === 'barcode' && !busy && (
          <div style={{
            position: 'absolute', left: '16%', right: '16%', height: 2,
            background: `linear-gradient(to right, transparent, ${GREEN}, ${GREEN}, transparent)`,
            boxShadow: `0 0 8px ${GREEN}, 0 0 16px ${GREEN}66`,
            animation: 'nutScanLine 1.8s ease-in-out infinite',
            borderRadius: 2,
          }}/>
        )}
      </div>

      {/* Status bar */}
      <div style={{ position: 'absolute', bottom: camMode === 'photo' ? 72 : 0,
        left: 0, right: 0, textAlign: 'center', padding: '6px 12px',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
        {error ? (
          <span style={{ fontSize: 12, color: '#f87171' }}>{error}</span>
        ) : (
          <span style={{ fontSize: 12, color: busy ? GREEN : 'rgba(255,255,255,0.7)',
            display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {busy && <span style={{ display: 'inline-block', animation: 'nutSpin .7s linear infinite' }}>⟳</span>}
            {status || (camMode === 'photo' ? 'Tap the shutter to analyze' : '')}
          </span>
        )}
      </div>

      {/* Photo shutter button */}
      {camMode === 'photo' && (
        <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0,
          display: 'flex', justifyContent: 'center' }}>
          <button onClick={captureAndAnalyze} disabled={busy || !ready}
            style={{ width: 56, height: 56, borderRadius: '50%',
              background: busy ? 'rgba(255,255,255,0.2)' : '#fff',
              border: '3px solid rgba(255,255,255,0.35)',
              cursor: busy || !ready ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: busy ? 'none' : '0 4px 18px rgba(0,0,0,0.5)',
              transition: 'background .15s, box-shadow .15s' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%',
              background: busy ? 'rgba(255,255,255,0.3)' : GREEN,
              transition: 'background .15s' }}/>
          </button>
        </div>
      )}
    </div>
  )
}
