import { useEffect, useState, Component, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, isConfigured } from './lib/supabase'
import { AppProvider } from './contexts/AppContext'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, color: '#FAFAFA', fontFamily: 'inherit' }}>
        <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: '#76746E', maxWidth: 340, textAlign: 'center' }}>{this.state.error?.message}</div>
        <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '8px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>
          Reload app
        </button>
      </div>
    )
    return this.props.children
  }
}
import Auth from './components/Auth'
import Layout from './components/Layout'

// Pages are lazy-loaded so each becomes its own chunk — the initial bundle
// only ships the shell, and a page's code loads when you first navigate to it.
const Overview  = lazy(() => import('./pages/Overview'))
const Workouts  = lazy(() => import('./pages/Workouts'))
const Schedule  = lazy(() => import('./pages/Schedule'))
const Todo      = lazy(() => import('./pages/Todo'))
const Budget    = lazy(() => import('./pages/Budget'))
const Music     = lazy(() => import('./pages/Music'))
const Nutrition = lazy(() => import('./pages/Nutrition'))
const Settings  = lazy(() => import('./pages/Settings'))
const Mentor    = lazy(() => import('./pages/Mentor'))

function SetupRequired() {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="auth-logo">Life Dashboard</div>
        <div style={{ margin: '20px 0', padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
          <strong style={{ color: '#92400e', fontSize: 13 }}>Supabase not configured</strong>
          <p style={{ color: '#78350f', fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
            You need to connect a free Supabase database before you can use the app.
            Follow the setup steps below, then restart the dev server.
          </p>
        </div>
        <ol style={{ fontSize: 13, lineHeight: 2, color: '#374151', paddingLeft: 18 }}>
          <li>Go to <strong>supabase.com</strong> and create a free account</li>
          <li>Click <strong>"New project"</strong> and give it a name (e.g. "life-dashboard")</li>
          <li>Wait ~2 minutes for it to set up</li>
          <li>In your project, go to <strong>SQL Editor → New query</strong></li>
          <li>Open <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>supabase-schema.sql</code> from your project folder and paste it in, then click <strong>Run</strong></li>
          <li>Go to <strong>Project Settings → API</strong></li>
          <li>Copy your <strong>Project URL</strong> and <strong>anon / public key</strong></li>
          <li>Open <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>.env.local</code> and replace the two placeholder values</li>
          <li>Stop the dev server (Ctrl+C) and run <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 4 }}>npm run dev</code> again</li>
        </ol>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!isConfigured) return <SetupRequired />

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        Loading…
      </div>
    )
  }

  if (!user) return <Auth />

  return (
    <ErrorBoundary>
    <AppProvider user={user}>
      <BrowserRouter>
        <Layout>
          <Suspense fallback={<div className="loading"><div className="loading-spinner" />Loading…</div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<Overview />} />
              <Route path="/workouts" element={<Workouts />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/todo" element={<Todo />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/music" element={<Music />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/body"      element={<Navigate to="/workouts" replace />} />
              <Route path="/mentor"   element={<Mentor />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </Layout>
      </BrowserRouter>
    </AppProvider>
    </ErrorBoundary>
  )
}
