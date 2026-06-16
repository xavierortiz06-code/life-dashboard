import { useState, useEffect, useRef } from 'react'
import { useApp } from '../contexts/AppContext'
import MusicOverview from './MusicOverview'

function getLocalToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Guitar checklist data ────────────────────────────────────────────────────
const GUITAR_TOPICS = {
  'Music Theory': [
    'Understand the musical alphabet and half/whole steps',
    'Know all 12 notes including sharps and flats',
    'Understand enharmonic equivalents',
    'Build a major scale from any note using W W H W W W H',
    'Understand major and minor key signatures',
    'Know the circle of fifths',
    'Understand relative major and minor keys',
    'Know the number system in any key',
    'Understand chord functions',
    'Recognize common progressions and why they work',
    'Understand modes',
    'Apply theory to fretboard and songwriting',
  ],
  'Fretboard Mastery': [
    'Know all natural notes on the low E string',
    'Know all natural notes on the A string',
    'Know all natural notes on all 6 strings',
    'Include sharps/flats on all strings',
    'Find any note in under 3 seconds',
    'Identify any fret/string combo instantly',
    'Know CAGED shapes',
    'Connect CAGED positions across the neck',
    'Play the same melody in 3 positions',
    'Visualize any key across the entire fretboard',
  ],
  'Scales': [
    'Refresh all 5 pentatonic major positions',
    'Refresh all 5 pentatonic minor positions',
    'Know pentatonic major in every key',
    'Know pentatonic minor in every key',
    'Connect all 5 positions seamlessly',
    'Understand how pentatonic relates to major/minor',
    'Learn natural major scale in all positions',
    'Know major scale in every key',
    'Learn natural minor scale in all positions',
    'Know minor scale in every key',
    'Connect major and minor positions',
    'Play scales in patterns',
    'Know which scale fits over which chords',
    'Improvise over a backing track',
    'Switch between scales fluidly',
  ],
  'Chord Theory': [
    'Understand intervals',
    'Build major triad from any root',
    'Build minor triad',
    'Build diminished and augmented triads',
    'Know how triads are derived from the major scale',
    'Understand the number system',
    'Know which chords are major/minor/diminished in any key',
    'Build 7th chords',
    'Understand chord inversions',
    'Play any chord in multiple voicings',
    'Recognize chord quality by ear',
    'Understand common progressions',
  ],
  'Ear Training': [
    'Recognize unison vs octave',
    'Recognize major vs minor 2nd',
    'Recognize all intervals ascending',
    'Recognize all intervals descending',
    'Recognize major vs minor chord',
    'Recognize major, minor, diminished',
    'Identify a chord in a progression by ear',
    'Transcribe a simple melody',
    'Transcribe a chord progression',
    'Figure out a full song by ear',
  ],
  'Finger Exercises': [
    'Chromatic runs up and down all 6 strings',
    'Spider exercise at slow tempo',
    'Spider exercise with all finger combinations',
    'Chromatic runs with metronome, increase BPM',
    'String skipping exercises',
    'Legato on single strings',
    'Legato across multiple strings',
    'Trills with each finger pair',
    'Stretch exercises',
    'Scale runs at high BPM',
    'Fingerpicking patterns',
  ],
  'Learning Songs by Ear': [
    'Pick out a simple melody on one string',
    'Figure out a simple riff',
    'Identify the key of a song',
    'Figure out a full melody across multiple strings',
    'Identify chord quality by ear',
    'Figure out a simple 3-4 chord progression',
    'Transcribe a full simple song',
    'Figure out a more complex riff or solo',
    'Transcribe a full song with complex chords',
    'Figure out a song in an unfamiliar key',
    'Transcribe a full song with no references',
  ],
  'Songwriting': [
    'Write a 4 chord progression',
    'Write a progression that resolves on I',
    'Write a progression in a minor key',
    'Write a simple melody over a progression',
    'Write a melody that complements the chords',
    'Write a verse and chorus with different progressions',
    'Write a riff as a song backbone',
    'Add dynamics',
    'Write lyrics over a melody',
    'Record a rough demo',
    'Write a song in an unfamiliar key or style',
  ],
}

const GUITAR_COLORS = {
  'Music Theory':          '#6366f1',
  'Fretboard Mastery':     '#06b6d4',
  'Scales':                '#10b981',
  'Chord Theory':          '#f59e0b',
  'Ear Training':          '#ec4899',
  'Finger Exercises':      '#ef4444',
  'Learning Songs by Ear': '#8b5cf6',
  'Songwriting':           '#f97316',
}

// ─── Piano checklist data ─────────────────────────────────────────────────────
const PIANO_TOPICS = {
  'Music Theory': [
    'Understand the musical alphabet and half/whole steps',
    'Identify all 12 notes on the keyboard',
    'Understand enharmonic equivalents on the keys',
    'Build a major scale from any note using W W H W W W H',
    'Understand major and minor key signatures',
    'Know the circle of fifths',
    'Understand relative major and minor keys',
    'Know the number system in any key',
    'Understand chord functions',
    'Recognize common progressions and why they work',
    'Understand modes',
    'Apply theory to what you\'re already playing',
  ],
  'Keyboard/Note Mastery': [
    'Identify all white keys by name',
    'Identify all black keys by name',
    'Know every note in every octave instantly',
    'Understand octave patterns',
    'Find any note in under 3 seconds',
    'Know the relationship between piano keys and sheet music',
    'Visualize any key signature across the full keyboard',
    'Navigate the keyboard fluidly without looking down',
  ],
  'Scales': [
    'Play C major scale right hand',
    'Play C major scale left hand',
    'Play C major scale hands together',
    'Play major scale in all 12 keys right hand',
    'Play major scale in all 12 keys left hand',
    'Play major scale in all 12 keys hands together',
    'Play natural minor scale in all 12 keys',
    'Play pentatonic major in all 12 keys',
    'Play pentatonic minor in all 12 keys',
    'Play scales fluidly across multiple octaves',
    'Know which scale fits over which chords',
    'Improvise using scales over a backing track',
  ],
  'Chord Theory': [
    'Understand intervals on the keyboard',
    'Build major triad from any root',
    'Build minor triad',
    'Build diminished and augmented triads',
    'Know how triads are derived from the major scale',
    'Understand the number system',
    'Know which chords are major/minor/diminished in any key',
    'Build 7th chords',
    'Understand chord inversions',
    'Play any chord in all inversions smoothly',
    'Recognize chord quality by ear',
    'Understand and play common progressions',
  ],
  'Ear Training': [
    'Recognize unison vs octave',
    'Recognize major vs minor 2nd',
    'Recognize all intervals ascending',
    'Recognize all intervals descending',
    'Recognize major vs minor chord',
    'Recognize major, minor, diminished',
    'Identify a chord in a progression by ear',
    'Transcribe a simple melody',
    'Transcribe a chord progression',
    'Figure out a full song by ear',
  ],
  'Technique': [
    'Proper hand position and posture',
    'Finger independence exercises',
    'Play hands separately cleanly',
    'Play hands together on a simple piece',
    'Scales hands together smoothly',
    'Finger exercises with metronome, increase BPM',
    'Legato playing',
    'Staccato playing',
    'Dynamic control',
    'Play hands together on a complex piece cleanly',
  ],
  'Learning Songs by Ear': [
    'Figure out a simple melody with right hand',
    'Identify the key of a song by ear',
    'Figure out a full melody across multiple octaves',
    'Identify chord quality by ear',
    'Figure out a simple chord progression',
    'Play melody and chords together on a simple song',
    'Transcribe a full simple song hands together',
    'Figure out a more complex song by ear',
    'Transcribe a full song with no references',
  ],
  'Songwriting': [
    'Write a 4 chord progression using the number system',
    'Write a progression that resolves on I',
    'Write a progression in a minor key',
    'Write a simple melody over a progression with right hand',
    'Write a melody with chord accompaniment hands together',
    'Write a verse and chorus with different progressions',
    'Add dynamics and variation',
    'Write lyrics over a melody',
    'Record a rough demo of a full song idea',
  ],
}

// Songs I'm Learning is a manual list stored under tracker.piano.songs
// It is NOT part of PIANO_TOPICS (no checklist, no status cycling)

const PIANO_COLORS = {
  'Music Theory':           '#6366f1',
  'Keyboard/Note Mastery':  '#06b6d4',
  'Scales':                 '#10b981',
  'Chord Theory':           '#f59e0b',
  'Ear Training':           '#ec4899',
  'Technique':              '#ef4444',
  'Learning Songs by Ear':  '#8b5cf6',
  'Songwriting':            '#f97316',
  'Songs I\'m Learning':    '#14b8a6',
}

// ─── Drums checklist data ─────────────────────────────────────────────────────
const DRUMS_TOPICS = {
  'Technique': [
    'Proper seated posture and kit setup',
    'Matched grip with both hands',
    'Basic stroke (full, down, tap, up)',
    'Even volume and control with both hands separately',
    'Consistent stroke with weaker hand',
    'Proper foot technique on kick drum',
    'Proper foot technique on hi-hat pedal',
    'Play kick and hi-hat together smoothly',
  ],
  'Rudiments': [
    'Single stroke roll at slow tempo',
    'Single stroke roll up to speed',
    'Double stroke roll at slow tempo',
    'Double stroke roll up to speed',
    'Paradiddle at slow tempo',
    'Paradiddle up to speed',
    'Flam',
    'All rudiments combined fluidly',
  ],
  'Beat Mastery': [
    'Basic rock beat (kick, snare, hi-hat)',
    'Basic beat with consistent tempo',
    'Basic beat with a metronome',
    'Vary the hi-hat (open, closed, half-open)',
    'Add kick drum variations',
    'Add snare variations',
    'Play a beat in different time signatures (3/4, 6/8)',
    'Create your own beats',
  ],
  'Fills': [
    'Simple 1-beat fill on snare',
    'Simple fill around the kit',
    'Fill that lands cleanly back on beat 1',
    '2-beat fill',
    '4-beat fill',
    'Fills with kick drum incorporated',
    'Create and improvise your own fills',
    'Transition smoothly between beats and fills',
  ],
  'Timekeeping': [
    'Play a basic beat with metronome at slow BPM',
    'Gradually increase BPM while staying consistent',
    'Play without rushing or dragging',
    'Lock in with a bass line or backing track',
    'Stay in the pocket over a full song length',
    'Play at varying tempos on demand',
  ],
  'Song Learning': [
    'Play along to a simple song at slow tempo',
    'Play along to a simple song at full tempo',
    'Learn the exact drum part of a simple song',
    'Figure out a drum part by ear',
    'Play along to a song with fills intact',
    'Learn a song with a more complex drum part',
    'Figure out a complex drum part by ear',
    'Play a full set of multiple songs back to back',
  ],
}

const DRUMS_COLORS = {
  'Technique':     '#ef4444',
  'Rudiments':     '#6366f1',
  'Beat Mastery':  '#06b6d4',
  'Fills':         '#f59e0b',
  'Timekeeping':   '#10b981',
  'Song Learning': '#ec4899',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTopics(instrument) {
  if (instrument === 'piano') return PIANO_TOPICS
  if (instrument === 'drums') return DRUMS_TOPICS
  return GUITAR_TOPICS
}
function getColors(instrument) {
  if (instrument === 'piano') return PIANO_COLORS
  if (instrument === 'drums') return DRUMS_COLORS
  return GUITAR_COLORS
}

// ─── SVG icon components ──────────────────────────────────────────────────────
const iconBase = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }

function GuitarSvg({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} stroke={color} strokeWidth="1.75">
      <rect x="9" y="1" width="6" height="3.5" rx="1"/>
      <rect x="10.5" y="4.5" width="3" height="5" rx="0.5"/>
      <path d="M12 9.5
        C15.5 9.5 18.5 11.5 18.5 13.5
        C18.5 15.5 17 15.5 17 16.2
        C17 16.9 18.5 17.5 18.5 19.5
        C18.5 21.5 15.5 22.5 12 22.5
        C8.5 22.5 5.5 21.5 5.5 19.5
        C5.5 17.5 7 16.9 7 16.2
        C7 15.5 5.5 15.5 5.5 13.5
        C5.5 11.5 8.5 9.5 12 9.5 Z"/>
      <circle cx="12" cy="17.5" r="2.2"/>
    </svg>
  )
}

function PianoSvg({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} stroke={color} strokeWidth="1.75">
      <rect x="2" y="5" width="20" height="16" rx="1.5"/>
      <line x1="7.33" y1="5" x2="7.33" y2="21"/>
      <line x1="12" y1="5" x2="12" y2="21"/>
      <line x1="16.67" y1="5" x2="16.67" y2="21"/>
      <rect x="4.5" y="5" width="3.5" height="9" rx="0.5" fill={color} stroke="none"/>
      <rect x="9.5" y="5" width="3.5" height="9" rx="0.5" fill={color} stroke="none"/>
      <rect x="14.5" y="5" width="3.5" height="9" rx="0.5" fill={color} stroke="none"/>
    </svg>
  )
}

function DrumSvg({ size = 24, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...iconBase} stroke={color} strokeWidth="1.75">
      <ellipse cx="12" cy="7" rx="9" ry="3"/>
      <line x1="3" y1="7" x2="3" y2="13"/>
      <line x1="21" y1="7" x2="21" y2="13"/>
      <ellipse cx="12" cy="13" rx="9" ry="3"/>
      <line x1="7" y1="16" x2="5" y2="21"/>
      <line x1="17" y1="16" x2="19" y2="21"/>
      <line x1="12" y1="16" x2="12" y2="21"/>
    </svg>
  )
}

function TopicIcon({ topic, instrument = 'guitar', size = 18, color = 'currentColor' }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', ...iconBase, stroke: color, strokeWidth: 1.75 }
  switch (topic) {
    case 'Music Theory':
      return (
        <svg {...p}>
          <line x1="3" y1="8"  x2="22" y2="8"/>
          <line x1="3" y1="12" x2="22" y2="12"/>
          <line x1="3" y1="16" x2="22" y2="16"/>
          <path d="M9 20V8l8-2v12"/>
          <circle cx="6.5" cy="20" r="2.5"/>
          <circle cx="14.5" cy="18" r="2.5"/>
        </svg>
      )
    case 'Fretboard Mastery':
      return (
        <svg {...p}>
          <rect x="2" y="7" width="20" height="10" rx="1"/>
          <line x1="8"  y1="7" x2="8"  y2="17"/>
          <line x1="14" y1="7" x2="14" y2="17"/>
          <line x1="2"  y1="12" x2="22" y2="12"/>
          <circle cx="5"  cy="9.5"  r="1.5" fill={color} stroke="none"/>
          <circle cx="11" cy="14.5" r="1.5" fill={color} stroke="none"/>
        </svg>
      )
    case 'Keyboard/Note Mastery':
      return (
        <svg {...p}>
          <rect x="2" y="6" width="20" height="13" rx="1.5"/>
          <line x1="6.5"  y1="6" x2="6.5"  y2="19"/>
          <line x1="11"   y1="6" x2="11"   y2="19"/>
          <line x1="15.5" y1="6" x2="15.5" y2="19"/>
          <rect x="4.5" y="6" width="3" height="7.5" rx="0.5" fill={color} stroke="none"/>
          <rect x="9"   y="6" width="3" height="7.5" rx="0.5" fill={color} stroke="none"/>
          <rect x="13.5" y="6" width="3" height="7.5" rx="0.5" fill={color} stroke="none"/>
        </svg>
      )
    case 'Scales':
      return (
        <svg {...p}>
          <polyline points="2 20 2 16 6 16 6 12 10 12 10 8 14 8 14 4 22 4"/>
        </svg>
      )
    case 'Chord Theory':
      return (
        <svg {...p}>
          <polygon points="12 2 2 7 12 12 22 7"/>
          <polyline points="2 12 12 17 22 12"/>
          <polyline points="2 17 12 22 22 17"/>
        </svg>
      )
    case 'Ear Training':
      return (
        <svg {...p}>
          <path d="M6 9a6 6 0 1 1 12 0c0 5-6 8.5-6 13"/>
          <path d="M9.5 9.5a2.5 2.5 0 0 0 5 0"/>
        </svg>
      )
    case 'Finger Exercises':
      return (
        <svg {...p}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      )
    case 'Technique':
      return (
        <svg {...p}>
          {/* Metronome */}
          <polygon points="12 2 4 22 20 22"/>
          <line x1="12" y1="22" x2="12" y2="10"/>
          <line x1="12" y1="14" x2="16" y2="10"/>
        </svg>
      )
    case 'Learning Songs by Ear':
      return (
        <svg {...p}>
          <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
          <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
        </svg>
      )
    case 'Songwriting':
      return (
        <svg {...p}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>
        </svg>
      )
    case 'Songs I\'m Learning':
      return (
        <svg {...p}>
          <line x1="8" y1="6"  x2="21" y2="6"/>
          <line x1="8" y1="12" x2="21" y2="12"/>
          <line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6"  x2="3.01" y2="6"/>
          <line x1="3" y1="12" x2="3.01" y2="12"/>
          <line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
      )
    // ── Drums-specific topics ──────────────────────────────────────────────
    case 'Rudiments':
      return (
        <svg {...p}>
          {/* 2×4 dot grid representing rudiment patterns */}
          <circle cx="7"  cy="8"  r="1.5" fill={color} stroke="none"/>
          <circle cx="12" cy="8"  r="1.5" fill={color} stroke="none"/>
          <circle cx="17" cy="8"  r="1.5" fill={color} stroke="none"/>
          <circle cx="7"  cy="12" r="1.5" fill={color} stroke="none"/>
          <circle cx="12" cy="12" r="1.5" fill={color} stroke="none"/>
          <circle cx="17" cy="12" r="1.5" fill={color} stroke="none"/>
          <circle cx="7"  cy="16" r="1.5" fill={color} stroke="none"/>
          <circle cx="17" cy="16" r="1.5" fill={color} stroke="none"/>
        </svg>
      )
    case 'Beat Mastery':
      return (
        <svg {...p}>
          {/* Equalizer bars */}
          <rect x="2"  y="14" width="4" height="7"  rx="1"/>
          <rect x="8"  y="8"  width="4" height="13" rx="1"/>
          <rect x="14" y="4"  width="4" height="17" rx="1"/>
          <rect x="20" y="10" width="2" height="11" rx="1"/>
        </svg>
      )
    case 'Fills':
      return (
        <svg {...p}>
          {/* Zigzag / lightning bolt */}
          <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      )
    case 'Timekeeping':
      return (
        <svg {...p}>
          {/* Clock */}
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      )
    case 'Song Learning':
      return (
        <svg {...p}>
          {/* Headphones */}
          <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
          <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
        </svg>
      )
    default: return null
  }
}

// ─── Tracker state init ───────────────────────────────────────────────────────
function initTracker() {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem('music-tracker') || 'null') } catch { return null }
  })()
  const guitar = {}
  for (const topic of Object.keys(GUITAR_TOPICS)) {
    const len = GUITAR_TOPICS[topic].length
    guitar[topic] = Array.from({ length: len }, (_, i) =>
      saved?.guitar?.[topic]?.[i] ?? 'not-started'
    )
  }
  const piano = {}
  for (const topic of Object.keys(PIANO_TOPICS)) {
    const len = PIANO_TOPICS[topic].length
    piano[topic] = Array.from({ length: len }, (_, i) =>
      saved?.piano?.[topic]?.[i] ?? 'not-started'
    )
  }
  // Songs I'm Learning is a plain string array
  piano.songs = Array.isArray(saved?.piano?.songs) ? saved.piano.songs : []

  const drums = {}
  for (const topic of Object.keys(DRUMS_TOPICS)) {
    const len = DRUMS_TOPICS[topic].length
    drums[topic] = Array.from({ length: len }, (_, i) =>
      saved?.drums?.[topic]?.[i] ?? 'not-started'
    )
  }

  return { guitar, piano, drums }
}

// ─── AI prompt generator ──────────────────────────────────────────────────────
function buildPrompt(tracker, instrument) {
  const topics      = getTopics(instrument)
  const trackerData = tracker[instrument] || {}
  const lines       = []
  for (const [topic, items] of Object.entries(topics)) {
    const statuses = trackerData[topic] || []
    const idx      = statuses.findIndex(s => s === 'in-progress')
    if (idx >= 0) lines.push(`  • ${topic}: "${items[idx]}"`)
  }
  if (lines.length === 0) return null
  const instLabel = instrument === 'piano' ? 'piano' : instrument === 'drums' ? 'drums' : 'guitar'
  return `I'm learning ${instLabel} and currently working on these specific concepts:\n\n${lines.join('\n')}\n\nFor each topic above, please give me a focused, practical lesson tailored to exactly where I am in the curriculum. For each one include:\n- A clear explanation of the concept\n- Specific exercises or drills I can do on ${instLabel} right now\n- What to focus on in today's practice session\n- Tips to make it click faster\n\nKeep each lesson concise and actionable.`
}

// ─── AI context builder (for future use) ─────────────────────────────────────
function buildAIContext(tracker, instrument) {
  if (!instrument) return ''
  const topics      = getTopics(instrument)
  const trackerData = tracker[instrument] || {}
  const instLabel   = instrument === 'piano' ? 'Piano' : instrument === 'drums' ? 'Drums' : 'Guitar'
  const lines       = [`== ${instLabel} Learning Tracker ==`, '']

  // In-progress items
  const inProgressLines = []
  for (const [topic, items] of Object.entries(topics)) {
    const statuses = trackerData[topic] || []
    const idx      = statuses.findIndex(s => s === 'in-progress')
    if (idx >= 0) inProgressLines.push(`  • ${topic}: "${items[idx]}"`)
  }
  if (inProgressLines.length > 0) {
    lines.push('Currently working on:')
    lines.push(...inProgressLines)
    lines.push('')
  } else {
    lines.push('No topics in progress yet.')
    lines.push('')
  }

  // Per-topic progress summary
  lines.push('Progress by topic:')
  for (const [topic, items] of Object.entries(topics)) {
    const statuses = trackerData[topic] || []
    const done     = statuses.filter(s => s === 'complete').length
    const pct      = items.length > 0 ? Math.round(done / items.length * 100) : 0
    const ip       = statuses.find(s => s === 'in-progress') ? ' (in progress)' : ''
    lines.push(`  ${topic}: ${done}/${items.length} complete (${pct}%)${ip}`)
  }
  lines.push('')

  // Songs I'm learning (piano only)
  if (instrument === 'piano') {
    const songs = tracker.piano?.songs || []
    if (songs.length > 0) {
      lines.push('Songs currently learning:')
      songs.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`))
      lines.push('')
    }
  }

  return lines.join('\n')
}

// ─── Main component ───────────────────────────────────────────────────────────
// ─── Practice session logger: live timer or quick manual log ─────────
const PRACTICE_INSTRUMENTS = [['guitar', 'Guitar'], ['piano', 'Piano'], ['drums', 'Drums']]

function PracticeLogger({ onLog }) {
  const [inst,      setInst]      = useState('guitar')
  const [minutes,   setMinutes]   = useState('')
  const [date,      setDate]      = useState(() => getLocalToday())
  const [startedAt, setStartedAt] = useState(null)
  const [elapsed,   setElapsed]   = useState(0)
  const [savedMsg,  setSavedMsg]  = useState('')

  useEffect(() => {
    if (!startedAt) return
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  function confirmLog(mins, d) {
    onLog(inst, mins, d)
    setSavedMsg(`${mins} min of ${PRACTICE_INSTRUMENTS.find(([k]) => k === inst)[1]} logged`)
    setTimeout(() => setSavedMsg(''), 3000)
  }

  function stopTimer() {
    const mins = Math.max(1, Math.round(elapsed / 60))
    setStartedAt(null)
    setElapsed(0)
    confirmLog(mins, getLocalToday())
  }

  function quickLog() {
    const mins = parseInt(minutes)
    if (!mins || mins <= 0) return
    confirmLog(mins, date)
    setMinutes('')
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  return (
    <div className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-light)' }}>
        Practice
      </span>
      <select value={inst} onChange={e => setInst(e.target.value)} style={{ fontSize: 12, width: 100 }}>
        {PRACTICE_INSTRUMENTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>

      {startedAt ? (
        <>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{mm}:{ss}</span>
          <button className="btn btn-primary btn-sm" onClick={stopTimer}>Stop &amp; log</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setStartedAt(null); setElapsed(0) }}>Discard</button>
        </>
      ) : (
        <>
          <button className="btn btn-primary btn-sm" onClick={() => setStartedAt(Date.now())} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            Start practice
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-light)' }}>or</span>
          <input
            type="number" min="1" placeholder="min"
            value={minutes} onChange={e => setMinutes(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && quickLog()}
            style={{ width: 64, fontSize: 12 }}
          />
          <input type="date" value={date} max={getLocalToday()} onChange={e => setDate(e.target.value)} style={{ fontSize: 12, width: 130 }} />
          <button className="btn btn-ghost btn-sm" onClick={quickLog} disabled={!parseInt(minutes)}>Log session</button>
        </>
      )}

      {savedMsg && (
        <span style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          {savedMsg}
        </span>
      )}
    </div>
  )
}

export default function Music() {
  const { theme }      = useApp()
  const isDark         = theme !== 'light'

  const [instrument, setInstrument] = useState(null)
  const [view,       setView]       = useState('overview') // 'overview'|'instruments'|'topics'|'checklist'|'songs-list'
  const [topic,      setTopic]      = useState(null)
  const [tracker,    setTracker]    = useState(initTracker)
  const [copied,     setCopied]     = useState(false)
  const [showPre,    setShowPre]    = useState(false)

  const [activity, setActivity] = useState(() => {
    try {
      const raw = localStorage.getItem('music-activity')
      if (raw) return JSON.parse(raw)
    } catch {}
    return { sessions: [], completions: [] }
  })

  useEffect(() => {
    localStorage.setItem('music-tracker', JSON.stringify(tracker))
  }, [tracker])

  useEffect(() => {
    localStorage.setItem('music-activity', JSON.stringify(activity))
  }, [activity])

  function logSession(inst) {
    const today = getLocalToday()
    setActivity(a => {
      if (a.sessions.some(s => s.instrument === inst && s.date === today)) return a
      return { ...a, sessions: [...a.sessions, { instrument: inst, date: today }] }
    })
  }

  // Explicit practice log (timer or quick form) — accumulates minutes per day
  function logPracticeSession(inst, minutes, date) {
    setActivity(a => {
      const i = a.sessions.findIndex(s => s.instrument === inst && s.date === date)
      if (i >= 0) {
        const sessions = a.sessions.map((s, idx) =>
          idx === i ? { ...s, minutes: (s.minutes || 0) + minutes } : s)
        return { ...a, sessions }
      }
      return { ...a, sessions: [...a.sessions, { instrument: inst, date, minutes }] }
    })
  }

  function logCompletion(inst, topicName, idx) {
    const today = getLocalToday()
    setActivity(a => ({
      ...a,
      completions: [...a.completions, { instrument: inst, topic: topicName, itemIdx: idx, date: today, ts: Date.now() }],
    }))
  }

  function cycle(topicName, idx) {
    if (!instrument) return
    const prev = tracker[instrument]?.[topicName]?.[idx] ?? 'not-started'
    const next = prev === 'not-started' ? 'in-progress' : prev === 'in-progress' ? 'complete' : 'not-started'
    setTracker(t => {
      const updated = t[instrument][topicName].map((s, i) => {
        if (i === idx) return next
        if (next === 'in-progress' && s === 'in-progress') return 'not-started'
        return s
      })
      return { ...t, [instrument]: { ...t[instrument], [topicName]: updated } }
    })
    logSession(instrument)
    if (next === 'complete') logCompletion(instrument, topicName, idx)
  }

  function cycleFromOverview(inst, topicName, idx) {
    const prev = tracker[inst]?.[topicName]?.[idx] ?? 'not-started'
    const next = prev === 'not-started' ? 'in-progress' : prev === 'in-progress' ? 'complete' : 'not-started'
    setTracker(t => {
      const updated = (t[inst][topicName] || []).map((s, i) => {
        if (i === idx) return next
        if (next === 'in-progress' && s === 'in-progress') return 'not-started'
        return s
      })
      return { ...t, [inst]: { ...t[inst], [topicName]: updated } }
    })
    logSession(inst)
    if (next === 'complete') logCompletion(inst, topicName, idx)
  }

  function jumpToInstrument(inst) {
    setInstrument(inst)
    setView('topics')
  }

  function addSong(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    setTracker(t => ({ ...t, piano: { ...t.piano, songs: [...(t.piano.songs || []), trimmed] } }))
  }

  function removeSong(idx) {
    setTracker(t => ({ ...t, piano: { ...t.piano, songs: (t.piano.songs || []).filter((_, i) => i !== idx) } }))
  }

  async function copyPrompt() {
    const p = buildPrompt(tracker, instrument)
    if (!p) return
    await navigator.clipboard.writeText(p)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function openInstrument(inst) {
    setInstrument(inst)
    setView('topics')
  }

  function openTopic(t) {
    setTopic(t)
    setView(t === 'Songs I\'m Learning' ? 'songs-list' : 'checklist')
  }

  function goBack() {
    if (view === 'checklist' || view === 'songs-list') {
      setView('topics'); setTopic(null)
    } else if (view === 'topics') {
      setView('instruments')
    } else if (view === 'instruments') {
      setView('overview'); setInstrument(null)
    } else {
      setView('overview')
    }
  }

  const topics          = instrument ? getTopics(instrument) : {}
  const colors          = instrument ? getColors(instrument) : {}
  const InstrumentIcon  = instrument === 'piano' ? PianoSvg : instrument === 'drums' ? DrumSvg : GuitarSvg
  const instrumentLabel = instrument === 'guitar' ? 'Guitar' : instrument === 'piano' ? 'Piano' : instrument === 'drums' ? 'Drums' : ''
  const activeCount     = instrument
    ? Object.keys(topics).filter(t => (tracker[instrument]?.[t] || []).some(s => s === 'in-progress')).length
    : 0
  const prompt = instrument ? buildPrompt(tracker, instrument) : null

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {view !== 'overview' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={goBack}
              style={{ padding: '4px 10px', fontWeight: 600 }}
            >
              ← Back
            </button>
          )}
          <div>
            <h1 style={{ marginBottom: 0 }}>Music</h1>
            {view === 'overview' && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>Overview</div>
            )}
            {view === 'instruments' && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>Choose an instrument</div>
            )}
            {view === 'topics' && instrument && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                <InstrumentIcon size={12} /> {instrumentLabel} — {Object.keys(topics).length} topics
                {instrument === 'piano' && <span style={{ color: 'var(--text-muted)' }}>+ Songs I'm Learning</span>}
              </div>
            )}
            {(view === 'checklist' || view === 'songs-list') && topic && (
              <div style={{ fontSize: 12, marginTop: 1, fontWeight: 600, color: colors[topic] || 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <InstrumentIcon size={12} color={colors[topic] || 'var(--accent)'} />
                {instrumentLabel} › {topic}
              </div>
            )}
          </div>
          {view === 'overview' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setView('instruments')}
              style={{ marginLeft: 'auto', fontSize: 12 }}
            >
              Browse All →
            </button>
          )}
        </div>
      </div>

      <div className="page-body">

        {view === 'overview' && (
          <PracticeLogger onLog={logPracticeSession} />
        )}

        {view === 'overview' && (
          <MusicOverview
            tracker={tracker}
            activity={activity}
            topicsMap={{ guitar: GUITAR_TOPICS, piano: PIANO_TOPICS, drums: DRUMS_TOPICS }}
            colorsMap={{ guitar: GUITAR_COLORS, piano: PIANO_COLORS, drums: DRUMS_COLORS }}
            isDark={isDark}
            onCycle={cycleFromOverview}
            onJump={jumpToInstrument}
          />
        )}

        {/* AI Prompt card — always visible on topics view */}
        {view === 'topics' && instrument && (
          <AIPromptCard
            count={activeCount}
            prompt={prompt}
            copied={copied}
            showPre={showPre}
            onCopy={copyPrompt}
            onToggle={() => setShowPre(s => !s)}
            isDark={isDark}
          />
        )}

        {view === 'instruments' && (
          <InstrumentsView
            tracker={tracker}
            onOpen={openInstrument}
          />
        )}

        {view === 'topics' && instrument && (
          <TopicsView
            instrument={instrument}
            tracker={tracker}
            isDark={isDark}
            onOpen={openTopic}
          />
        )}

        {view === 'checklist' && topic && instrument && (
          <ChecklistView
            topic={topic}
            instrument={instrument}
            statuses={tracker[instrument]?.[topic] || []}
            isDark={isDark}
            onCycle={idx => cycle(topic, idx)}
          />
        )}

        {view === 'songs-list' && (
          <SongsListView
            songs={tracker.piano.songs || []}
            onAdd={addSong}
            onRemove={removeSong}
            isDark={isDark}
          />
        )}
      </div>

    </div>
  )
}

// ─── AI Prompt card ───────────────────────────────────────────────────────────
function AIPromptCard({ count, prompt, copied, showPre, onCopy, onToggle, isDark }) {
  return (
    <div className="card" style={{ padding: '16px 20px', borderLeft: '3px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
            AI Practice Session
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {count} topic{count !== 1 ? 's' : ''} in progress — copy and paste into Claude for a focused lesson
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onToggle} style={{ fontSize: 12 }}>
            {showPre ? 'Hide' : 'Preview'}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={onCopy}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, minWidth: 118 }}
          >
            {copied ? (
              <>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Copied!
              </>
            ) : (
              <>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
                Copy prompt
              </>
            )}
          </button>
        </div>
      </div>

      {showPre && (
        <pre style={{
          marginTop: 14, padding: 14,
          background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          border: '1px solid var(--border)', borderRadius: 8,
          fontSize: 12, lineHeight: 1.65,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          color: 'var(--text-light)', fontFamily: 'var(--mono)', overflowX: 'auto',
        }}>
          {prompt}
        </pre>
      )}
    </div>
  )
}

// ─── Instruments view ─────────────────────────────────────────────────────────
function InstrumentsView({ tracker, onOpen }) {
  function instrumentStats(inst, topics) {
    const totalItems   = Object.values(topics).flat().length
    const doneItems    = Object.entries(topics).reduce((s, [t]) =>
      s + (tracker[inst]?.[t] || []).filter(x => x === 'complete').length, 0)
    const activeTopics = Object.keys(topics).filter(t =>
      (tracker[inst]?.[t] || []).some(s => s === 'in-progress')).length
    const pct          = totalItems > 0 ? doneItems / totalItems * 100 : 0
    return { totalItems, doneItems, activeTopics, pct }
  }

  const guitarStats = instrumentStats('guitar', GUITAR_TOPICS)
  const pianoStats  = instrumentStats('piano',  PIANO_TOPICS)
  const drumsStats  = instrumentStats('drums',  DRUMS_TOPICS)

  const instruments = [
    { id: 'guitar', label: 'Guitar', Icon: GuitarSvg, available: true, stats: guitarStats, topicCount: Object.keys(GUITAR_TOPICS).length },
    { id: 'piano',  label: 'Piano',  Icon: PianoSvg,  available: true, stats: pianoStats,  topicCount: Object.keys(PIANO_TOPICS).length },
    { id: 'drums',  label: 'Drums',  Icon: DrumSvg,   available: true, stats: drumsStats,  topicCount: Object.keys(DRUMS_TOPICS).length },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
      {instruments.map(({ id, Icon, label, available, stats, topicCount }) => (
        <div
          key={id}
          className="card"
          style={{
            padding: '28px 24px',
            cursor: available ? 'pointer' : 'default',
            opacity: available ? 1 : 0.55,
            position: 'relative',
            transition: 'transform .14s, box-shadow .14s',
          }}
          onClick={() => available && onOpen(id)}
          onMouseEnter={e => { if (available) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,0.18)' } }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
        >
          {!available && (
            <div style={{
              position: 'absolute', top: 12, right: 12,
              fontSize: 9, fontWeight: 800, letterSpacing: '.1em',
              color: 'var(--text-muted)', background: 'var(--border)',
              padding: '2px 7px', borderRadius: 4,
            }}>
              COMING SOON
            </div>
          )}

          <div style={{ marginBottom: 14, opacity: available ? 1 : 0.7 }}>
            <Icon size={40} color="currentColor" />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: available ? 16 : 0 }}>{label}</div>

          {available && stats && (
            <>
              <div style={{ display: 'flex', gap: 0, marginBottom: 14 }}>
                {[
                  { label: 'Complete', value: `${stats.doneItems}/${stats.totalItems}` },
                  { label: 'In Progress', value: stats.activeTopics, accent: stats.activeTopics > 0 },
                  { label: 'Topics', value: topicCount },
                ].map(({ label: lbl, value, accent }, i, arr) => (
                  <div key={lbl} style={{ flex: 1, paddingRight: i < arr.length - 1 ? 12 : 0, borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none', marginRight: i < arr.length - 1 ? 12 : 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.06em' }}>{lbl}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)', color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="progress-wrap" style={{ height: 5 }}>
                <div style={{
                  height: '100%', width: `${stats.pct}%`,
                  background: 'var(--accent)',
                  borderRadius: 3, transition: 'width .5s ease',
                  boxShadow: stats.pct > 0 ? '0 0 8px rgba(99,102,241,0.45)' : 'none',
                }} />
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                {stats.pct.toFixed(0)}% overall
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Topics view ──────────────────────────────────────────────────────────────
function TopicsView({ instrument, tracker, isDark, onOpen }) {
  const topics = getTopics(instrument)
  const colors = getColors(instrument)
  const songs  = instrument === 'piano' ? (tracker.piano?.songs || []) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))', gap: 12 }}>
      {Object.entries(topics).map(([topicName, items]) => {
        const statuses   = tracker[instrument]?.[topicName] || []
        const done       = statuses.filter(s => s === 'complete').length
        const inProgress = statuses.some(s => s === 'in-progress')
        const color      = colors[topicName]
        const pct        = items.length > 0 ? done / items.length * 100 : 0

        return (
          <div
            key={topicName}
            className="card"
            style={{
              padding: '18px 20px',
              cursor: 'pointer',
              borderLeft: `3px solid ${color}`,
              transition: 'transform .12s, box-shadow .12s',
            }}
            onClick={() => onOpen(topicName)}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = `0 6px 20px ${color}28`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ marginBottom: 6, color }}>
                  <TopicIcon topic={topicName} instrument={instrument} size={18} color={color} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{topicName}</div>
              </div>
              {inProgress && (
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '.07em',
                  color, background: `${color}18`, border: `1px solid ${color}40`,
                  padding: '2px 7px', borderRadius: 4, marginTop: 2, flexShrink: 0,
                }}>
                  IN PROGRESS
                </div>
              )}
            </div>

            <div className="progress-wrap" style={{ height: 4, marginBottom: 7 }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: color, borderRadius: 3, transition: 'width .5s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>{done}/{items.length} complete</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{pct.toFixed(0)}%</span>
            </div>
          </div>
        )
      })}

      {/* Songs I'm Learning card — piano only, special */}
      {instrument === 'piano' && (
        <div
          className="card"
          style={{
            padding: '18px 20px',
            cursor: 'pointer',
            borderLeft: `3px solid ${PIANO_COLORS["Songs I'm Learning"]}`,
            transition: 'transform .12s, box-shadow .12s',
          }}
          onClick={() => onOpen("Songs I'm Learning")}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = `0 6px 20px ${PIANO_COLORS["Songs I'm Learning"]}28`
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = ''
            e.currentTarget.style.boxShadow = ''
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ marginBottom: 6, color: PIANO_COLORS["Songs I'm Learning"] }}>
                <TopicIcon topic="Songs I'm Learning" size={18} color={PIANO_COLORS["Songs I'm Learning"]} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>Songs I'm Learning</div>
            </div>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '.07em',
              color: PIANO_COLORS["Songs I'm Learning"],
              background: `${PIANO_COLORS["Songs I'm Learning"]}18`,
              border: `1px solid ${PIANO_COLORS["Songs I'm Learning"]}40`,
              padding: '2px 7px', borderRadius: 4, marginTop: 2, flexShrink: 0,
            }}>
              MANUAL
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {songs && songs.length > 0
              ? `${songs.length} song${songs.length !== 1 ? 's' : ''} in progress`
              : 'Add songs you\'re currently learning'}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Checklist view ───────────────────────────────────────────────────────────
function ChecklistView({ topic, instrument, statuses, isDark, onCycle }) {
  const topics = getTopics(instrument)
  const colors = getColors(instrument)
  const items  = topics[topic] || []
  const color  = colors[topic]
  const done   = statuses.filter(s => s === 'complete').length
  const pct    = items.length > 0 ? done / items.length * 100 : 0
  const hasIP  = statuses.some(s => s === 'in-progress')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Progress summary */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{done}/{items.length} complete</span>
            {hasIP && (
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '.07em',
                color, background: `${color}18`, border: `1px solid ${color}40`,
                padding: '2px 7px', borderRadius: 4,
              }}>
                1 IN PROGRESS
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, fontFamily: 'var(--mono)', color, fontWeight: 800 }}>
            {pct.toFixed(0)}%
          </div>
        </div>
        <div className="progress-wrap" style={{ height: 6 }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: color, borderRadius: 3,
            boxShadow: pct > 0 ? `0 0 8px ${color}55` : 'none',
            transition: 'width .4s ease',
          }} />
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 18, fontSize: 11, color: 'var(--text-muted)', paddingLeft: 4, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <CircleIcon status="not-started" color={color} size={14} /> Not started
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color }}>
          <CircleIcon status="in-progress" color={color} size={14} /> In progress
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--success)' }}>
          <CircleIcon status="complete" color={color} size={14} /> Complete
        </span>
        <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>Click any item to cycle status</span>
      </div>

      {/* Checklist */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {items.map((text, idx) => {
          const status     = statuses[idx] || 'not-started'
          const isComplete = status === 'complete'
          const isIP       = status === 'in-progress'

          return (
            <div
              key={idx}
              onClick={() => onCycle(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '13px 20px',
                borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                background: isIP
                  ? (isDark ? `${color}14` : `${color}0d`)
                  : 'transparent',
                transition: 'background .1s',
              }}
              onMouseEnter={e => {
                if (!isIP) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isIP
                  ? (isDark ? `${color}14` : `${color}0d`)
                  : 'transparent'
              }}
            >
              <div style={{
                fontSize: 10, color: 'var(--text-muted)',
                fontFamily: 'var(--mono)', minWidth: 20,
                textAlign: 'right', flexShrink: 0,
              }}>
                {idx + 1}
              </div>
              <div style={{ flexShrink: 0 }}>
                <CircleIcon status={status} color={color} size={18} />
              </div>
              <span style={{
                flex: 1, fontSize: 13, lineHeight: 1.45,
                color: isComplete ? 'var(--text-muted)' : isIP ? 'var(--text)' : 'var(--text-light)',
                textDecoration: isComplete ? 'line-through' : 'none',
                fontWeight: isIP ? 600 : 400,
              }}>
                {text}
              </span>
              {isIP && (
                <div style={{
                  flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: '.07em',
                  color, background: `${color}18`, border: `1px solid ${color}40`,
                  padding: '2px 7px', borderRadius: 4,
                }}>
                  IN PROGRESS
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Songs I'm Learning view ──────────────────────────────────────────────────
function SongsListView({ songs, onAdd, onRemove, isDark }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const color = PIANO_COLORS["Songs I'm Learning"]

  function handleAdd() {
    const trimmed = input.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setInput('')
    inputRef.current?.focus()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Summary */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color }}>
            {songs.length} song{songs.length !== 1 ? 's' : ''} in progress
          </span>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Add and remove songs as you learn them
          </div>
        </div>
      </div>

      {/* Add form */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="Song title or Artist — Song"
            style={{ flex: 1, fontSize: 14 }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handleAdd}
            disabled={!input.trim()}
            style={{ fontSize: 13, flexShrink: 0 }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Song list */}
      {songs.length === 0 ? (
        <div className="card" style={{ padding: '36px 20px', textAlign: 'center' }}>
          <div style={{ marginBottom: 10 }}>
            <TopicIcon topic="Songs I'm Learning" size={32} color="var(--text-muted)" />
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No songs added yet. Type a song above and press Enter or Add.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {songs.map((song, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '13px 20px',
                borderBottom: idx < songs.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* Number */}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)', minWidth: 20, textAlign: 'right', flexShrink: 0 }}>
                {idx + 1}
              </div>

              {/* Color dot */}
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 5px ${color}80` }} />

              {/* Song name */}
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, lineHeight: 1.45 }}>
                {song}
              </span>

              {/* Remove */}
              <button
                onClick={() => onRemove(idx)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-light)', fontSize: 13, padding: '3px 6px',
                  borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-light)'}
                title="Remove"
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Status circle icon ───────────────────────────────────────────────────────
function CircleIcon({ status, color, size = 18 }) {
  if (status === 'complete') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="var(--success)" opacity={0.9}/>
        <polyline points="8 12 11 15 16 9" stroke="white" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  if (status === 'in-progress') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.5"/>
        <circle cx="12" cy="12" r="5" fill={color}/>
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="var(--border-strong)" strokeWidth="2"/>
    </svg>
  )
}
