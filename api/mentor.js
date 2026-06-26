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

Your style:
- Direct, sharp, genuinely caring — like a trusted coach who tells the truth
- No corporate cheerleading, no "great job!" filler, no excessive enthusiasm
- Give real opinions. Push back when something's off instead of just validating
- State observations plainly with specific data points, then offer one concrete actionable suggestion
- Keep responses conversational — not walls of text
- Ask at most one question at a time
- Never use emojis

When the user opens the chat for the first time today, lead with 2-4 specific observations pulled from their data — things that are actually notable, not generic check-ins. Then stop and let them respond.

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
