import { NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../contexts/AppContext'
import TodoRing from './TodoRing'
import GoalTicker from './GoalTicker'
import { OverviewIcon, WorkoutIcon, ScheduleIcon, TodoIcon, BudgetIcon, MusicIcon, NutritionIcon, SettingsIcon, MentorIcon } from './Icons'

function BrandMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-3px' }}>
      <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" /><path d="M12 7l4.5 2.5v5L12 17l-4.5-2.5v-5L12 7z" />
    </svg>
  )
}

const NAV = [
  { to: '/overview',  icon: OverviewIcon,  label: 'Overview' },
  { to: '/workouts',  icon: WorkoutIcon,   label: 'Workouts' },
  { to: '/schedule',  icon: ScheduleIcon,  label: 'Schedule' },
  { to: '/todo',      icon: TodoIcon,      label: 'To-do' },
  { to: '/budget',    icon: BudgetIcon,    label: 'Budget' },
  { to: '/music',     icon: MusicIcon,     label: 'Music' },
  { to: '/nutrition', icon: NutritionIcon, label: 'Nutrition' },
  { to: '/mentor',    icon: MentorIcon,    label: 'Mentor'   },
  { to: '/settings',  icon: SettingsIcon,  label: 'Settings' },
]

export default function Layout({ children }) {
  const { user, settings } = useApp()
  const displayName = settings.display_name || user?.email?.split('@')[0] || 'User'
  const initials    = settings.avatar_initials || displayName.slice(0, 2).toUpperCase()
  const location    = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const activeNav = NAV.find(n => location.pathname.startsWith(n.to)) || NAV[0]

  // Close when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <div className="app-shell">
      {/* ── Desktop sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BrandMark /> Dashboard
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon"><item.icon size={16} /></span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Todo progress ring */}
        <TodoRing />

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{displayName}</div>
              <div className="user-email">{user?.email}</div>
            </div>
          </div>
          <button className="signout-btn" onClick={() => supabase.auth.signOut()}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="main-content">
        {/* Mobile header */}
        <div className="mobile-header">
          <div className="mobile-brand"><BrandMark /> Dashboard</div>
          <div className="avatar">{initials}</div>
        </div>

        {/* Goal ticker — always visible above page content */}
        <div style={{ paddingTop: 16 }}>
          <GoalTicker />
        </div>

        {children}
      </main>

      {/* ── Mobile bottom nav (dropdown) ── */}
      <div className="mobile-nav-wrap" ref={menuRef}>
        {/* Vertical menu */}
        {menuOpen && (
          <div className="mobile-nav-menu">
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `mob-menu-item${isActive ? ' active' : ''}`}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        )}

        {/* Pill trigger button */}
        <button
          className="mobile-nav-pill"
          onClick={() => setMenuOpen(o => !o)}
        >
          <activeNav.icon size={16} />
          <span>{activeNav.label}</span>
          <svg
            width={12} height={12} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ marginLeft: 2, transition: 'transform .2s', transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
    </div>
  )
}
