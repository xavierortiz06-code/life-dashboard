import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../contexts/AppContext'
import { useMacroGoals } from '../lib/goals'
import {
  gatherWeekData,
  loadProfile, saveProfile,
  loadTodayConversation, saveConversation,
} from '../lib/mentorData'

const TODAY = new Date().toISOString().split('T')[0]

async function streamMentorMessage(messages, dataSummary, rawData, profile, onChunk) {
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload === '[DONE]') return full
      try {
        const { text, error } = JSON.parse(payload)
        if (error) throw new Error(error)
        if (text) { full += text; onChunk(text) }
      } catch {}
    }
  }
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

export default function Mentor() {
  const { user, settings } = useApp()
  const { goals: macroGoals } = useMacroGoals()

  const [messages, setMessages]         = useState([])       // { role, content }
  const [input, setInput]               = useState('')
  const [streaming, setStreaming]       = useState(false)
  const [loadingData, setLoadingData]   = useState(false)
  const [dataSummary, setDataSummary]   = useState(null)
  const [rawData, setRawData]           = useState(null)
  const [streamingText, setStreamingText] = useState('')

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)
  const idleTimer  = useRef(null)
  const profileRef = useRef(loadProfile())

  // Scroll to bottom whenever messages or streaming text changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // On mount: load today's conversation or trigger greeting
  useEffect(() => {
    async function init() {
      const saved = loadTodayConversation()
      if (saved && saved.length > 0) {
        setMessages(saved)
        return
      }
      // No conversation today — gather data and greet
      setLoadingData(true)
      try {
        const { summary, rawData: rd } = await gatherWeekData(user.id, macroGoals)
        setDataSummary(summary)
        setRawData(rd)
        setLoadingData(false)
        await sendGreeting(summary, rd)
      } catch (err) {
        setLoadingData(false)
        appendAssistantMessage("I couldn't load your data right now. What's on your mind?")
      }
    }
    if (user?.id) init()
  }, [user?.id])

  // Save conversation on idle (2 min) and update profile
  function resetIdleTimer(msgs) {
    clearTimeout(idleTimer.current)
    if (msgs.length === 0) return
    idleTimer.current = setTimeout(async () => {
      saveConversation(TODAY, msgs)
      await updateProfile(msgs, profileRef.current)
    }, 2 * 60 * 1000)
  }

  // Save on unmount
  useEffect(() => {
    return () => {
      clearTimeout(idleTimer.current)
      setMessages(prev => {
        if (prev.length > 0) {
          saveConversation(TODAY, prev)
          updateProfile(prev, profileRef.current)
        }
        return prev
      })
    }
  }, [])

  function appendAssistantMessage(text) {
    setMessages(prev => {
      const next = [...prev, { role: 'assistant', content: text }]
      saveConversation(TODAY, next)
      resetIdleTimer(next)
      return next
    })
  }

  async function sendGreeting(summary, rd) {
    setStreaming(true)
    setStreamingText('')
    try {
      const initMessages = [{
        role: 'user',
        content: 'Give me your opening read on my week — what stands out from my data?'
      }]
      let full = ''
      await streamMentorMessage(
        initMessages,
        summary,
        rd,
        profileRef.current,
        chunk => { full += chunk; setStreamingText(t => t + chunk) }
      )
      setStreamingText('')
      setMessages([
        ...initMessages,
        { role: 'assistant', content: full }
      ])
      saveConversation(TODAY, [
        ...initMessages,
        { role: 'assistant', content: full }
      ])
    } catch {
      appendAssistantMessage("Couldn't reach the mentor right now. Try sending a message.")
    } finally {
      setStreaming(false)
    }
  }

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')

    const userMsg  = { role: 'user', content: text }
    const nextMsgs = [...messages, userMsg]
    setMessages(nextMsgs)

    // Ensure we have data loaded
    let summary = dataSummary
    let rd      = rawData
    if (!summary && user?.id) {
      try {
        const result = await gatherWeekData(user.id, macroGoals)
        summary = result.summary
        rd      = result.rawData
        setDataSummary(summary)
        setRawData(rd)
      } catch {}
    }

    setStreaming(true)
    setStreamingText('')
    try {
      let full = ''
      await streamMentorMessage(
        nextMsgs,
        summary,
        rd,
        profileRef.current,
        chunk => { full += chunk; setStreamingText(t => t + chunk) }
      )
      setStreamingText('')
      const final = [...nextMsgs, { role: 'assistant', content: full }]
      setMessages(final)
      saveConversation(TODAY, final)
      resetIdleTimer(final)
    } catch {
      setStreamingText('')
      appendAssistantMessage("Something went wrong. Try again.")
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }, [input, messages, streaming, dataSummary, rawData, user?.id, macroGoals])

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const allMessages = [
    ...messages,
    ...(streamingText ? [{ role: 'assistant', content: streamingText, streaming: true }] : [])
  ]

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', maxHeight: 900 }}>
      {/* Header */}
      <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        <h1 className="page-title" style={{ marginBottom: 2 }}>Mentor</h1>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Reads your workouts, nutrition, budget, schedule, and to-dos
        </div>
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loadingData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
            <div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            Mentor is looking at your week...
          </div>
        )}

        {!loadingData && allMessages.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
            Starting up...
          </div>
        )}

        {allMessages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              paddingLeft: msg.role === 'assistant' ? 0 : 40,
              paddingRight: msg.role === 'user' ? 0 : 40,
            }}
          >
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: msg.role === 'user'
                ? 'var(--accent)'
                : 'rgba(255,255,255,0.05)',
              color: msg.role === 'user' ? '#fff' : 'var(--text)',
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
            }}>
              {msg.content}
              {msg.streaming && (
                <span style={{
                  display: 'inline-block',
                  width: 2,
                  height: '1em',
                  background: 'var(--accent)',
                  marginLeft: 2,
                  verticalAlign: 'text-bottom',
                  animation: 'blink 0.8s step-end infinite',
                }} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKey}
            placeholder="Ask your mentor anything..."
            disabled={streaming || loadingData}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              padding: '10px 14px',
              fontSize: 14,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-raised, rgba(255,255,255,0.04))',
              color: 'var(--text)',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              overflow: 'hidden',
              minHeight: 42,
            }}
          />
          <button
            onClick={send}
            disabled={streaming || loadingData || !input.trim()}
            className="btn btn-primary"
            style={{ padding: '10px 16px', flexShrink: 0 }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
