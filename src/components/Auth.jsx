import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    // Detect password recovery link (user clicked reset email link)
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      setRecoveryMode(true)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (recoveryMode) {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) setError(error.message)
      else {
        setMessage('Password updated! You are now logged in.')
        setRecoveryMode(false)
        window.location.hash = ''
      }
    } else if (resetMode) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
      if (error) setError(error.message)
      else setMessage('Check your email for a password reset link.')
    } else if (tab === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setMessage('Account created! Check your email to confirm it, then log in.')
    }

    setLoading(false)
  }

  if (recoveryMode) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">Life Dashboard</div>
          <div className="auth-sub">Set a new password</div>
          <form className="auth-form" onSubmit={handleSubmit}>
            {error   && <div className="auth-alert error">{error}</div>}
            {message && <div className="auth-alert success">{message}</div>}
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoFocus
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              disabled={loading}
            >
              {loading ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (resetMode) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">Life Dashboard</div>
          <div className="auth-sub">Reset your password</div>
          <form className="auth-form" onSubmit={handleSubmit}>
            {error   && <div className="auth-alert error">{error}</div>}
            {message && <div className="auth-alert success">{message}</div>}
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
              disabled={loading}
            >
              {loading ? 'Sending…' : 'Send reset email'}
            </button>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 8, width: '100%' }}
              onClick={() => { setResetMode(false); setError(''); setMessage('') }}
            >
              Back to log in
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">Life Dashboard</div>
        <div className="auth-sub">Your personal command center</div>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); setError(''); setMessage('') }}
          >
            Log in
          </button>
          <button
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => { setTab('signup'); setError(''); setMessage('') }}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error   && <div className="auth-alert error">{error}</div>}
          {message && <div className="auth-alert success">{message}</div>}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
            disabled={loading}
          >
            {loading ? 'Working…' : tab === 'login' ? 'Log in' : 'Create account'}
          </button>

          {tab === 'login' && (
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 8, width: '100%', fontSize: '0.85rem' }}
              onClick={() => { setResetMode(true); setError(''); setMessage('') }}
            >
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
