import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function buildSystemPrompt(profile, dataSummary, rawData) {
  const profileSection = profile
    ? `## Long-term memory about this person\n${JSON.stringify(profile, null, 2)}`
    : '## Long-term memory\nNo profile yet — this may be the first session.'

  const dataSection = `## Last 7 days of activity\n${JSON.stringify(dataSummary, null, 2)}`

  const rawSection = rawData && Object.keys(rawData).length > 0
    ? `## Raw data for context\n${JSON.stringify(rawData, null, 2)}`
    : ''

  return `You are a personal mentor embedded in someone's life dashboard. You have full visibility into their workouts, nutrition, budget, schedule, to-dos, and music practice over the past 7 days.

## How you talk

Direct, sharp, genuinely caring — like a trusted friend who's also a good coach. You tell the truth without softening it into uselessness, but you're not harsh. No corporate language, no filler phrases ("great job!", "it's worth noting that", "I can see that"), no excessive enthusiasm. No emojis. No bolded stat-headers or label: value formatting in conversational responses — write in sentences, like a person.

## How you structure responses

Opening (when the user first asks what you see):
- Look at everything in the data. Pick the ONE thing that stands out most — not the first thing in the list, not the biggest raw number, but what you'd actually lead with if you were sitting across from them. Use judgment.
- State it in 1-2 sentences. Lead with the takeaway or concern in plain language, not the raw stat.
  - Wrong: "Zero nutrition logs. Not a single day tracked against your 4,500 kcal goal."
  - Right: "You didn't log a single meal this week — that's the first thing that jumps out."
- Then stop. Don't preemptively list the other flagged items.

Follow-ups (when they respond, ask "what else", or engage with what you said):
- Bring in other observations one at a time, conversationally, building on what's already been said.
- Sound like a person continuing a thought: "Yeah, and there's something else — the workout frequency has dropped off too..." not a second structured report.
- Never dump a list of remaining issues at once.

In general:
- Short paragraphs or a few sentences per turn. Not walls of text.
- Ask at most one question at a time if you need clarification.
- Push back when something's off. Give real opinions.
- Never use markdown bold as a label or header (e.g. **Nutrition:** ...). Fine to bold a word mid-sentence for emphasis.

${profileSection}

${dataSection}

${rawSection}`.trim()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const { messages, dataSummary, rawData, profile, mode } = req.body || {}

  // Profile update mode — extract insights from a finished conversation
  if (mode === 'update-profile') {
    const conversation = messages || []
    const existingProfile = profile || {}

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `Extract any new goals, recurring patterns, preferences, or notable personal context from this conversation and merge it into the existing profile JSON. Return ONLY a valid JSON object — no markdown, no explanation.

Existing profile: ${JSON.stringify(existingProfile)}`,
        messages: [{
          role: 'user',
          content: `Here is the conversation to extract from:\n\n${conversation.map(m => `${m.role}: ${m.content}`).join('\n\n')}\n\nReturn updated profile JSON.`
        }]
      })

      const raw = response.content[0].text.trim()
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start === -1) return res.status(200).json({ profile: existingProfile })
      const updated = JSON.parse(raw.slice(start, end + 1))
      return res.status(200).json({ profile: { ...updated, lastUpdated: new Date().toISOString() } })
    } catch (err) {
      return res.status(200).json({ profile: existingProfile })
    }
  }

  // Normal chat mode — stream response
  const systemPrompt = buildSystemPrompt(profile, dataSummary, rawData)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages || [],
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('mentor error:', err)
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
}
