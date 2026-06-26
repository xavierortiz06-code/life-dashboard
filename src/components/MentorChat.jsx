import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../contexts/AppContext'
import { useMacroGoals } from '../lib/goals'
import {
  gatherWeekData,
  loadProfile, saveProfile,
  loadTodayConversation, saveConversation,
} from '../lib/mentorData'

const TODAY = new Date().toISOString().split('T')[0]
const CHAR_DELAY = 12

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
  let charQueue = []
  let charTimer = null
  let resolveFlush

  function processQueue() {
    if (charQueue.length === 0) { charTimer = null; resolveFlush?.(); return }
    onChar(charQueue.shift())
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

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar() {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
      background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 12px rgba(99,102,241,0.35)',
    }}>
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    </div>
  )
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '8px 0' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
          animation: `mDot 1.4s ${i * 0.18}s ease-in-out infinite`,
        }} />
      ))}
    </div>
  )
}

// ── Single message ────────────────────────────────────────────────────────────
function Message({ msg, isLast }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        animation: isLast ? 'mSlide 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none',
      }}>
        <div style={{
          maxWidth: 'min(72%, 500px)',
          padding: '11px 16px',
          borderRadius: '18px 18px 4px 18px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.28) 0%, rgba(6,182,212,0.18) 100%)',
          border: '1px solid rgba(99,102,241,0.3)',
          fontSize: 15,
          fontWeight: 500,
          lineHeight: 1.6,
          color: 'rgba(255,255,255,0.95)',
          letterSpacing: '0.01em',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      animation: isLast ? 'mSlide 0.3s cubic-bezier(0.22,1,0.36,1)' : 'none',
    }}>
      <Avatar />
      <div style={{
        flex: 1, minWidth: 0,
        fontSize: 15,
        fontWeight: 400,
        lineHeight: 1.7,
        color: 'rgba(255,255,255,0.88)',
        letterSpacing: '0.012em',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        paddingTop: 6,
      }}>
        {msg.content}
        {msg.streaming && (
          <span style={{
            display: 'inline-block', width: 2, height: '0.9em',
            background: 'linear-gradient(180deg, #6366f1, #06b6d4)',
            marginLeft: 2, verticalAlign: 'text-bottom', borderRadius: 2,
            animation: 'mCursor 0.65s step-end infinite',
          }} />
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
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
  const [focused, setFocused]         = useState(false)

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
    async function greet() {
      setExpanded(true)
      setLoadingData(true)
      try {
        const { summary, rawData: rd } = await gatherWeekData(user.id, macroGoals)
        setDataSummary(summary); setRawData(rd)
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
    if (inputRef.current) { inputRef.current.style.height = 'auto' }

    const userMsg  = { role: 'user', content: text }
    const nextMsgs = [...messages, userMsg]
    setMessages(nextMsgs)

    let summary = dataSummary, rd = rawData
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

  const canSend = input.trim() && !streaming && !loadingData

  // ── Collapsed pill ────────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div style={{ marginTop: 28 }}>
        <button onClick={() => setExpanded(true)} style={{
          width: '100%', padding: '16px 20px',
          border: '1px solid rgba(99,102,241,0.18)',
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(6,182,212,0.04) 100%)',
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 14,
          transition: 'border-color .2s, background .2s',
        }}>
          <Avatar />
          <div style={{ textAlign: 'left', flex: 1 }}>
            <div style={{
              fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em',
              background: 'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>Mentor</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
              Ask about your week, progress, or anything on your mind
            </div>
          </div>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    )
  }

  // ── Expanded card ─────────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(180deg, rgba(99,102,241,0.06) 0%, transparent 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar />
            <div>
              <div style={{
                fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em',
                background: 'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.75) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>Mentor</div>
              <div style={{ fontSize: 11, marginTop: 1, fontWeight: 500 }}>
                {streaming ? (
                  <span style={{
                    background: 'linear-gradient(90deg, #6366f1, #06b6d4)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>Thinking...</span>
                ) : loadingData ? (
                  <span style={{ color: 'rgba(255,255,255,0.35)' }}>Reading your week...</span>
                ) : (
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}>Workouts · Nutrition · Budget · Schedule</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => setExpanded(false)} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s',
          }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>

        {/* ── Message list ── */}
        <div style={{
          minHeight: 200, maxHeight: 460, overflowY: 'auto',
          padding: '22px 22px 10px',
          display: 'flex', flexDirection: 'column', gap: 20,
          scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.05) transparent',
        }}>
          {/* Loading state */}
          {loadingData && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Avatar />
              <div style={{ paddingTop: 8 }}>
                <TypingDots />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 5, fontWeight: 500 }}>
                  Pulling your last 7 days...
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {allMessages.map((msg, i) => (
            <Message key={i} msg={msg} isLast={i === allMessages.length - 1} />
          ))}

          {/* Thinking dots (before first word arrives) */}
          {streaming && !liveText && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Avatar />
              <div style={{ paddingTop: 8 }}><TypingDots /></div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Divider line ── */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.045)', margin: '0 0' }} />

        {/* ── Input ── */}
        <div style={{
          padding: '14px 16px 16px',
          background: 'rgba(0,0,0,0.1)',
        }}>
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-end',
            background: focused ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.035)',
            border: `1px solid ${focused ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 14,
            padding: '10px 10px 10px 16px',
            transition: 'border-color .2s, background .2s',
            boxShadow: focused ? '0 0 0 3px rgba(99,102,241,0.08)' : 'none',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
              }}
              onKeyDown={handleKey}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Ask anything about your week..."
              disabled={streaming || loadingData}
              rows={1}
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none',
                background: 'transparent', color: 'rgba(255,255,255,0.9)',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 400,
                lineHeight: 1.6, padding: 0,
                minHeight: 22, maxHeight: 140, overflow: 'hidden',
              }}
            />
            <button
              onClick={send}
              disabled={!canSend}
              style={{
                width: 34, height: 34, flexShrink: 0,
                borderRadius: 10, border: 'none', cursor: canSend ? 'pointer' : 'default',
                background: canSend
                  ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                  : 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all .2s',
                boxShadow: canSend ? '0 2px 10px rgba(99,102,241,0.4)' : 'none',
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                stroke={canSend ? '#fff' : 'rgba(255,255,255,0.2)'}
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.03em',
            color: 'rgba(255,255,255,0.15)', marginTop: 8, paddingLeft: 2,
          }}>
            ENTER TO SEND · SHIFT+ENTER FOR NEW LINE
          </div>
        </div>
      </div>

      <style>{`
        @keyframes mDot {
          0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes mCursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes mSlide {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
