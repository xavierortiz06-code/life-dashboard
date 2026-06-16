import { useState, useEffect } from 'react'
import { useApp } from '../contexts/AppContext'
import { supabase } from '../lib/supabase'

const COLORS = [
  { label: 'Indigo',  value: '#6366f1' },
  { label: 'Violet',  value: '#8b5cf6' },
  { label: 'Rose',    value: '#f43f5e' },
  { label: 'Orange',  value: '#f97316' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Sky',     value: '#0ea5e9' },
  { label: 'Slate',   value: '#475569' },
  { label: 'Amber',   value: '#f59e0b' },
]

export default function Settings() {
  const { user, settings, updateSettings, theme, setTheme } = useApp()
  const [form, setForm] = useState({
    display_name:    settings.display_name    || '',
    avatar_initials: settings.avatar_initials || '',
    accent_color:    settings.accent_color    || '#6366f1',
  })
  const [saved, setSaved] = useState(false)

  // Sync form if settings load after mount
  useEffect(() => {
    setForm({
      display_name:    settings.display_name    || '',
      avatar_initials: settings.avatar_initials || '',
      accent_color:    settings.accent_color    || '#6366f1',
    })
  }, [settings.display_name, settings.avatar_initials, settings.accent_color])

  async function handleSave(e) {
    e.preventDefault()
    await updateSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function previewColor(c) {
    setForm(f => ({ ...f, accent_color: c }))
    document.documentElement.style.setProperty('--accent', c)
    document.documentElement.style.setProperty('--accent-light', c + '26')
  }

  const initials = form.avatar_initials || form.display_name?.slice(0, 2).toUpperCase() || user?.email?.slice(0, 2).toUpperCase()

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="page-body">
        {/* Profile & appearance */}
        <div className="card" style={{ maxWidth: 500 }}>
          <h2 style={{ marginBottom: 20 }}>Profile & appearance</h2>

          {/* Live avatar preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '14px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
            <div className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
              {initials}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {form.display_name || user?.email?.split('@')[0]}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user?.email}</div>
            </div>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="form-group">
              <label>Display name</label>
              <input
                value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                placeholder="Your name"
              />
            </div>

            <div className="form-group">
              <label>Avatar initials (1–2 letters)</label>
              <input
                value={form.avatar_initials}
                onChange={e => setForm(f => ({ ...f, avatar_initials: e.target.value.slice(0, 2).toUpperCase() }))}
                placeholder="XO"
                maxLength={2}
                style={{ maxWidth: 80 }}
              />
            </div>

            <div className="form-group">
              <label>Theme</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Moon icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke={theme === 'dark' ? 'var(--text)' : 'var(--text-light)'}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
                <button
                  type="button"
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                  style={{
                    position: 'relative',
                    width: 48,
                    height: 26,
                    borderRadius: 13,
                    border: 'none',
                    cursor: 'pointer',
                    background: theme === 'light' ? 'var(--accent)' : 'var(--border-strong)',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                    padding: 0,
                  }}
                  aria-label="Toggle light/dark mode"
                >
                  <span style={{
                    position: 'absolute',
                    top: 3,
                    left: theme === 'light' ? 25 : 3,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    transition: 'left 0.2s',
                    display: 'block',
                  }} />
                </button>
                {/* Sun icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke={theme === 'light' ? 'var(--text)' : 'var(--text-light)'}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              </div>
            </div>

            <div className="form-group">
              <label>Accent color</label>
              <div className="swatches">
                {COLORS.map(c => (
                  <div
                    key={c.value}
                    className={`swatch${form.accent_color === c.value ? ' selected' : ''}`}
                    style={{ background: c.value }}
                    onClick={() => previewColor(c.value)}
                    title={c.label}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <label style={{ textTransform: 'none', fontSize: 12, color: 'var(--text-muted)', letterSpacing: 0, fontWeight: 400 }}>
                  Custom:
                </label>
                <input
                  type="color"
                  value={form.accent_color}
                  onChange={e => previewColor(e.target.value)}
                  style={{ width: 38, height: 32, padding: 2, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 6 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {form.accent_color}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-primary" type="submit">Save settings</button>
              {saved && (
                <span style={{ color: 'var(--success)', fontSize: 13, fontWeight: 500 }}>
                  ✓ Saved!
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Account card */}
        <div className="card" style={{ maxWidth: 500 }}>
          <h2 style={{ marginBottom: 8 }}>Account</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Signed in as <strong>{user?.email}</strong>
          </p>
          <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
