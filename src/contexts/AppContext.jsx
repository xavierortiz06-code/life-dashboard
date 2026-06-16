import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AppContext = createContext({
  user: null,
  settings: { display_name: '', avatar_initials: '', accent_color: '#6366f1' },
  updateSettings: () => {},
})

export function AppProvider({ user, children }) {
  const [settings, setSettings] = useState({
    display_name: '',
    avatar_initials: '',
    accent_color: '#6366f1',
  })
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'dark')

  function setTheme(t) {
    setThemeState(t)
    localStorage.setItem('theme', t)
  }

  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', theme === 'light')
  }, [theme])

  useEffect(() => {
    if (user) fetchSettings()
  }, [user])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', settings.accent_color)
    // 26 hex = ~15% opacity — more visible on the dark theme background
    document.documentElement.style.setProperty('--accent-light', settings.accent_color + '26')
  }, [settings.accent_color])

  async function fetchSettings() {
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()
    if (data) setSettings(data)
  }

  async function updateSettings(updates) {
    const next = { ...settings, ...updates }
    setSettings(next)
    await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        display_name: next.display_name,
        avatar_initials: next.avatar_initials,
        accent_color: next.accent_color,
      },
      { onConflict: 'user_id' }
    )
  }

  return (
    <AppContext.Provider value={{ user, settings, updateSettings, theme, setTheme }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
