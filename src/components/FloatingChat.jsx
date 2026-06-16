import { useState, useEffect, useRef } from 'react'

/**
 * Reusable floating chat button + panel.
 * Props:
 *   title       — panel header label (default "AI Assistant")
 *   placeholder — input placeholder text
 *   systemPrompt — instructions for the AI (sets personality/role)
 *   context     — live data string injected into every request so the AI
 *                 can reference real numbers (updated automatically by parent)
 */
export default function FloatingChat({
  title        = 'AI Assistant',
  placeholder  = 'Ask anything…',
  systemPrompt = 'You are a helpful assistant.',
  context      = '',
  emptyTitle   = 'Ask me anything',
  emptyHints   = [],
}) {
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const msgEndRef             = useRef(null)

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    if (!text.trim() || loading) return
    const msg = text.trim()
    setInput('')
    setLoading(true)
    const updated = [...messages, { role: 'user', content: msg }]
    setMessages(updated)

    try {
      const res = await fetch('/api/chat-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, systemPrompt, context }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setMessages(m => [...m, { role: 'assistant', content: data.reply }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Error: ${err.message}` }])
    }

    setLoading(false)
  }

  return (
    <>
      {/* ── Chat panel ──────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 84,
          right: 24,
          width: 340,
          maxHeight: 'min(500px, calc(100vh - 120px))',
          background: 'var(--panel-bg, #111117)',
          border: '1px solid var(--border-strong, rgba(255,255,255,0.12))',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(99,102,241,0.12)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9000,
          overflow: 'hidden',
          animation: 'chatSlideUp .18s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '13px 16px',
            borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--accent, #6366f1)',
              boxShadow: '0 0 8px rgba(99,102,241,0.8)',
            }} />
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '.01em' }}>{title}</span>
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 14px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'var(--panel-bg, #111117)',
          }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, opacity: 0.45 }}>
                  <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-light)' }}>{emptyTitle}</div>
                {emptyHints.length > 0 && (
                  <div style={{ opacity: 0.75 }}>
                    {emptyHints.map((h, i) => <span key={i}>"{h}"<br /></span>)}
                  </div>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '86%',
                  padding: '8px 12px',
                  borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  background: msg.role === 'user'
                    ? 'var(--accent, #6366f1)'
                    : 'rgba(255,255,255,0.07)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border, rgba(255,255,255,0.08))',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '9px 14px',
                  borderRadius: '12px 12px 12px 3px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid var(--border, rgba(255,255,255,0.08))',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                }}>
                  <span style={{ letterSpacing: 3 }}>···</span>
                </div>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid var(--border, rgba(255,255,255,0.07))',
            display: 'flex',
            gap: 7,
            flexShrink: 0,
            background: 'var(--panel-bg, #111117)',
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
              placeholder={placeholder}
              disabled={loading}
              autoFocus
              style={{ flex: 1, fontSize: 13 }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              style={{ padding: '6px 12px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Floating trigger button ────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Close assistant' : 'Open AI assistant'}
        aria-label={open ? 'Close assistant' : 'Open AI assistant'}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--accent, #6366f1)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
          zIndex: 9001,
          transition: 'transform .15s ease, box-shadow .15s ease',
          color: '#fff',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'scale(1.08)'
          e.currentTarget.style.boxShadow = '0 6px 28px rgba(99,102,241,0.65)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.45)'
        }}
      >
        {open ? (
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
          </svg>
        )}
      </button>

      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
      `}</style>
    </>
  )
}
