function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function getActiveDate() {
  const now = new Date()
  if (now.getHours() < 6) {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return localDateStr(d)
  }
  return localDateStr(now)
}

export function getTomorrowDate() {
  const now = new Date()
  if (now.getHours() < 6) {
    return localDateStr(now)
  }
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  return localDateStr(d)
}

export function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
