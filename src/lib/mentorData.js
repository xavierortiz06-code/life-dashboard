import { supabase } from './supabase'

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function today() {
  return new Date().toISOString().split('T')[0]
}

export async function gatherWeekData(userId, macroGoals) {
  const start = daysAgo(7)
  const end   = today()

  const [
    workoutRes,
    nutritionRes,
    budgetRes,
    tasksRes,
    focusRes,
    routineRes,
    routineCompRes,
    scheduleDayRes,
  ] = await Promise.allSettled([
    supabase.from('workout_sets')
      .select('*, exercises(name, muscle_group)')
      .eq('user_id', userId)
      .gte('logged_date', start)
      .lte('logged_date', end),
    supabase.from('nutrition_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end),
    supabase.from('budget_entries')
      .select('*')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end),
    supabase.from('task_list')
      .select('*')
      .eq('user_id', userId),
    supabase.from('focus_tasks')
      .select('*')
      .eq('user_id', userId),
    supabase.from('routine_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true),
    supabase.from('routine_completions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', start)
      .lte('date', end),
    supabase.from('schedule_day_tasks')
      .select('*')
      .eq('user_id', userId)
      .gte('task_date', start)
      .lte('task_date', end),
  ])

  const workouts      = workoutRes.value?.data  || []
  const nutrition     = nutritionRes.value?.data || []
  const budgetEntries = budgetRes.value?.data    || []
  const tasks         = tasksRes.value?.data     || []
  const focusTasks    = focusRes.value?.data     || []
  const routines      = routineRes.value?.data   || []
  const routineComps  = routineCompRes.value?.data || []
  const scheduleItems = scheduleDayRes.value?.data || []

  // ── Workouts summary ──────────────────────────────────────────────
  const workoutsByDate = {}
  for (const s of workouts) {
    if (!workoutsByDate[s.logged_date]) workoutsByDate[s.logged_date] = []
    workoutsByDate[s.logged_date].push(s)
  }
  const sessionDates  = Object.keys(workoutsByDate)
  const muscleGroups  = {}
  for (const s of workouts) {
    const mg = s.exercises?.muscle_group || 'Unknown'
    muscleGroups[mg] = (muscleGroups[mg] || 0) + 1
  }

  // ── Nutrition summary ─────────────────────────────────────────────
  const calGoal   = macroGoals?.cal   || 2000
  const protGoal  = macroGoals?.prot  || 150
  const carbsGoal = macroGoals?.carbs || 200
  const fatGoal   = macroGoals?.fat   || 65

  const nutriByDate = {}
  for (const e of nutrition) {
    if (!nutriByDate[e.date]) nutriByDate[e.date] = { cal: 0, prot: 0, carbs: 0, fat: 0 }
    nutriByDate[e.date].cal   += e.calories  || 0
    nutriByDate[e.date].prot  += e.protein   || 0
    nutriByDate[e.date].carbs += e.carbs     || 0
    nutriByDate[e.date].fat   += e.fat       || 0
  }
  const nutriDays = Object.values(nutriByDate)
  const avgCal    = nutriDays.length ? Math.round(nutriDays.reduce((s, d) => s + d.cal, 0) / nutriDays.length) : 0

  // ── Budget summary ────────────────────────────────────────────────
  const budgetByCategory = {}
  for (const e of budgetEntries) {
    const cat = e.category || 'Other'
    budgetByCategory[cat] = (budgetByCategory[cat] || 0) + parseFloat(e.amount || 0)
  }
  const totalSpent = Object.values(budgetByCategory).reduce((s, v) => s + v, 0)

  // ── To-do summary ─────────────────────────────────────────────────
  const incompleteTasks  = tasks.filter(t => !t.completed)
  const completedTasks   = tasks.filter(t => t.completed)
  const incompleteFocus  = focusTasks.filter(t => !t.completed)

  // ── Routine summary ───────────────────────────────────────────────
  const routineCompByDate = {}
  for (const c of routineComps) {
    if (!routineCompByDate[c.date]) routineCompByDate[c.date] = new Set()
    routineCompByDate[c.date].add(c.routine_task_id)
  }
  const routineDays = Object.keys(routineCompByDate).length
  const avgRoutinesPerDay = routineDays > 0
    ? (routineComps.length / routineDays).toFixed(1)
    : 0

  // ── Schedule summary ──────────────────────────────────────────────
  const scheduleDone    = scheduleItems.filter(t => t.completed).length
  const scheduleTotal   = scheduleItems.length
  const scheduleRate    = scheduleTotal > 0 ? Math.round((scheduleDone / scheduleTotal) * 100) : null

  // ── Music (localStorage) ──────────────────────────────────────────
  let musicSummary = null
  try {
    const log = JSON.parse(localStorage.getItem('music-practice-log') || '[]')
    const weekLog = log.filter(e => e.date >= start && e.date <= end)
    if (weekLog.length > 0) {
      const byInstrument = {}
      for (const e of weekLog) {
        byInstrument[e.instrument || 'Guitar'] = (byInstrument[e.instrument || 'Guitar'] || 0) + 1
      }
      musicSummary = { sessionsThisWeek: weekLog.length, byInstrument }
    }
  } catch {}

  const summary = {
    dateRange: { from: start, to: end },
    workouts: {
      sessionsLogged: sessionDates.length,
      sessionDates,
      muscleGroupsHit: muscleGroups,
      totalSets: workouts.length,
    },
    nutrition: {
      daysLogged: nutriDays.length,
      averageCalories: avgCal,
      calorieGoal: calGoal,
      proteinGoalG: protGoal,
      carbsGoalG: carbsGoal,
      fatGoalG: fatGoal,
      dailyBreakdown: nutriByDate,
    },
    budget: {
      totalSpentThisWeek: Math.round(totalSpent * 100) / 100,
      byCategory: Object.fromEntries(
        Object.entries(budgetByCategory).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
    },
    todos: {
      incompleteCount: incompleteTasks.length,
      completedCount: completedTasks.length,
      incompleteFocusCount: incompleteFocus.length,
    },
    routines: {
      activeRoutineCount: routines.length,
      daysWithAnyCompletion: routineDays,
      avgCompletionsPerActiveDay: parseFloat(avgRoutinesPerDay),
    },
    schedule: {
      tasksPlanned: scheduleTotal,
      tasksCompleted: scheduleDone,
      completionRatePct: scheduleRate,
    },
    music: musicSummary,
  }

  // Raw data for flagged categories (full entries for AI to reference specifics)
  const rawData = {}
  if (budgetEntries.length > 0) rawData.budgetEntries = budgetEntries.slice(0, 40)
  if (workouts.length > 0) {
    rawData.workoutSets = workouts.slice(0, 60).map(s => ({
      date: s.logged_date,
      exercise: s.exercises?.name,
      muscleGroup: s.exercises?.muscle_group,
      sets: s.sets,
      reps: s.reps,
      weight: s.weight,
    }))
  }

  return { summary, rawData }
}

// ── Memory helpers ────────────────────────────────────────────────────────────

export function loadProfile() {
  try { return JSON.parse(localStorage.getItem('mentorProfile') || 'null') } catch { return null }
}

export function saveProfile(profile) {
  localStorage.setItem('mentorProfile', JSON.stringify(profile))
}

export function loadConversations() {
  try { return JSON.parse(localStorage.getItem('mentorConversations') || '[]') } catch { return [] }
}

export function saveConversation(date, messages) {
  const convos = loadConversations()
  const idx = convos.findIndex(c => c.date === date)
  if (idx >= 0) convos[idx] = { date, messages }
  else convos.unshift({ date, messages })
  // keep last 60 days
  const trimmed = convos.slice(0, 60)
  localStorage.setItem('mentorConversations', JSON.stringify(trimmed))
}

export function loadTodayConversation() {
  const today = new Date().toISOString().split('T')[0]
  const convos = loadConversations()
  return convos.find(c => c.date === today)?.messages || null
}
