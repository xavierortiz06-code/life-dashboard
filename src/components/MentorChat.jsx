import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../contexts/AppContext'
import { useMacroGoals } from '../lib/goals'
import {
  gatherWeekData,
  loadProfile, saveProfile,
  loadTodayConversation, saveConversation,
} from '../lib/mentorData'

const TODAY = new Date().toISOString().split('T')[0]
const CHAR_DELAY = 14 // ms between chars for natural typing feel

// Stream from API and call onChunk with each character (with delay)
async function streamMentorMessage(messages, dataSummary, rawData, profile, onChar) {
  const res = await fetch('/api/mentor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, dataSummary, rawData, profile }),
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  // Character queue for slow-type effect
  let charQueue = []
  let charTimer = null
  let resolveFlush

  function processQueue() {
    if (charQueue.length === 0) { charTimer = null; resolveFlush?.(); return }
    const ch = charQueue.shift()
    onChar(ch)
    charTimer = setTimeout(processQueue, CHAR_DELAY)
  }

  function enqueue(text) {
    for (const ch of text) charQueue.push(ch)
    if (!charTimer) processQueue()
  }

  async function flushQueue() {
    if (charQueue.length === 0) return
    return new Promise(r => { resolveFlush = r })
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload === '[DONE]') break
      try {
        const { text, error } = JSON.parse(payload)
        if (error) throw new Error(error)
        if (text) { full += text; enqueue(text) }
      } catch {}
    }
  }

  await flushQueue()
  return full
}

async function updateProfile(messages, currentProfile) {
  try {
    const res = await fetch('/api/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, profile: currentProfile, mode: 'update-profile' }),
    })
    const { profile } = await res.json()
    if (profile) saveProfile(profile)
  } catch {}
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px 0', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)',
          animation: `mentorDot 1.2s ${i * 0.2}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Message({ msg, isLast }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      gap: 10,
      alignItems: 'flex-start',
      animation: isLast ? 'mentorFadeIn 0.25s ease' : 'none',
    }}>
      {/* Avatar — only for assistant */}
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
          background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        </div>
      )}

      {/* Bubble */}
      <div style={{
        maxWidth: 'min(76%, 560px)',
        padding: isUser ? '9px 14px' : '10px 0 2px 0',
        borderRadius: isUser ? 14 : 0,
        background: isUser ? 'rgba(99,102,241,0.18)' : 'transparent',
        border: isUser ? '1px solid rgba(99,102,241,0.25)' : 'none',
        fontSize: 14,
        lineHeight: 1.65,
        color: isUser ? 'rgba(255,255,255,0.9)' : 'var(--text)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        letterSpacing: '0.01em',
      }}>
        {msg.content}
        {msg.streaming && (
          <span style={{
            display: 'inline-block', width: 2, height: '0.85em',
            background: '#6366f1', marginLeft: 1,
            verticalAlign: 'text-bottom', borderRadius: 1,
            animation: 'mentorCursor 0.7s step-end infinite',
          }} />
        )}
      </div>
    </div>
  )
}

export default function MentorChat() {
  const { user } = useApp()
  const { goals: macroGoals } = useMacroGoals()

  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [streaming, setStreaming]     = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [liveText, setLiveText]       = useState('')
  const [dataSummary, setDataSummary] = useState(null)
  const [rawData, setRawData]         = useState(null)
  const [expanded, setExpanded]       = useState(false)

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const idleTimer  = useRef(null)
  const profileRef = useRef(loadProfile())

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveText])

  useEffect(() => {
    if (!user?.id) return
    const saved = loadTodayConversation()
    if (saved?.length) { setMessages(saved); setExpanded(true); return }
    // Auto-greet
    async function greet() {
      setExpanded(true)
      setLoadingData(true)
      try {
        const { summary, rawData: rd } = await gatherWeekData(user.id, macroGoals)
        setDataSummary(summary)
        setRawData(rd)
        setLoadingData(false)
        await runStream(
          [{ role: 'user', content: 'Give me your opening read on my week — what stands out from my data?' }],
          summary, rd
        )
      } catch {
        setLoadingData(false)
        appendMsg({ role: 'assistant', content: "Couldn't load your data right now. What's on your mind?" })
      }
    }
    greet()
  }, [user?.id])

  function appendMsg(msg) {
    setMessages(prev => {
      const next = [...prev, msg]
      saveConversation(TODAY, next)
      resetIdleTimer(next)
      return next
    })
  }

  function resetIdleTimer(msgs) {
    clearTimeout(idleTimer.current)
    if (!msgs.length) return
    idleTimer.current = setTimeout(async () => {
      saveConversation(TODAY, msgs)
      await updateProfile(msgs, profileRef.current)
    }, 2 * 60 * 1000)
  }

  useEffect(() => () => {
    clearTimeout(idleTimer.current)
    setMessages(prev => {
      if (prev.length) { saveConversation(TODAY, prev); updateProfile(prev, profileRef.current) }
      return prev
    })
  }, [])

  async function runStream(nextMsgs, summary, rd) {
    setStreaming(true)
    setLiveText('')
    let full = ''
    try {
      await streamMentorMessage(
        nextMsgs, summary, rd, profileRef.current,
        ch => { full += ch; setLiveText(t => t + ch) }
      )
      setLiveText('')
      const final = [...nextMsgs, { role: 'assistant', content: full }]
      setMessages(final)
      saveConversation(TODAY, final)
      resetIdleTimer(final)
    } catch {
      setLiveText('')
      appendMsg({ role: 'assistant', content: 'Something went wrong. Try again.' })
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    inputRef.current.style.height = '42px'

    const userMsg  = { role: 'user', content: text }
    const nextMsgs = [...messages, userMsg]
    setMessages(nextMsgs)

    let summary = dataSummary
    let rd = rawData
    if (!summary && user?.id) {
      try {
        const result = await gatherWeekData(user.id, macroGoals)
        summary = result.summary; rd = result.rawData
        setDataSummary(summary); setRawData(rd)
      } catch {}
    }
    await runStream(nextMsgs, summary, rd)
  }, [input, messages, streaming, dataSummary, rawData, user?.id, macroGoals])

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const allMessages = [
    ...messages,
    ...(liveText ? [{ role: 'assistant', content: liveText, streaming: true }] : [])
  ]

  // Collapsed state — just a button
  if (!expanded) {
    return (
      <div style={{ marginTop: 24 }}>
        <button
          onClick={() => setExpanded(true)}
          style={{
            width: '100%', padding: '14px 20px',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 14,
            background: 'rgba(99,102,241,0.06)',
            color: 'var(--text)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
            fontFamily: 'inherit', transition: 'all .2s',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Mentor</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Ask about your week, progress, or anything on your mind</div>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 24 }}>
      {/* Card */}
      <div style={{
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
        overflow: 'hidden',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.015)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)' }}>Mentor</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                {streaming ? (
                  <span style={{ color: '#6366f1' }}>Thinking...</span>
                ) : loadingData ? (
                  <span style={{ color: 'var(--text-muted)' }}>Reading your week...</span>
                ) : (
                  'Reads your workouts, nutrition, budget & schedule'
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setExpanded(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div style={{
          minHeight: 180,
          maxHeight: 420,
          overflowY: 'auto',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.06) transparent',
        }}>
          {loadingData && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <div style={{ paddingTop: 6 }}>
                <TypingDots />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Reading your week...</div>
              </div>
            </div>
          )}

          {allMessages.map((msg, i) => (
            <Message key={i} msg={msg} isLast={i === allMessages.length - 1} />
          ))}

          {streaming && !liveText && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <div style={{ paddingTop: 6 }}><TypingDots /></div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '12px 14px',
          background: 'rgba(255,255,255,0.01)',
        }}>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-end',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 12,
            padding: '8px 8px 8px 14px',
            transition: 'border-color .2s',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 130) + 'px'
              }}
              onKeyDown={handleKey}
              placeholder="Ask anything about your week..."
              disabled={streaming || loadingData}
              rows={1}
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none',
                background: 'transparent', color: 'var(--text)',
                fontFamily: 'inherit', fontSize: 14, lineHeight: 1.55,
                padding: 0, minHeight: 24, maxHeight: 130,
                overflow: 'hidden',
                '::placeholder': { color: 'rgba(255,255,255,0.25)' },
              }}
            />
            <button
              onClick={send}
              disabled={streaming || loadingData || !input.trim()}
              style={{
                width: 32, height: 32, flexShrink: 0,
                borderRadius: 8, border: 'none', cursor: 'pointer',
                background: input.trim() && !streaming && !loadingData
                  ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                  : 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .2s',
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                stroke={input.trim() && !streaming && !loadingData ? '#fff' : 'rgba(255,255,255,0.25)'}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 7, paddingLeft: 2 }}>
            Enter to send · Shift+Enter for new line
          </div>
        </div>
      </div>

      <style>{`
        @keyframes mentorDot {
          0%, 60%, 100% { opacity: 0.25; transform: scale(1); }
          30% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes mentorCursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes mentorFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
