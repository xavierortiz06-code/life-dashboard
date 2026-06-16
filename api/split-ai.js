// Vercel serverless function — AI split assistant
// Requires: ANTHROPIC_API_KEY set in Vercel environment variables
// Add it at: vercel.com → your project → Settings → Environment Variables

import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY not configured',
      hint: 'Add ANTHROPIC_API_KEY to your Vercel environment variables'
    })
  }

  const { message, currentSplit } = req.body
  if (!message || !currentSplit) {
    return res.status(400).json({ error: 'message and currentSplit required' })
  }

  const client = new Anthropic({ apiKey })

  const splitText = Object.entries(currentSplit)
    .map(([day, data]) => `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]}: ${data.name}${data.exercises?.length ? ' — ' + data.exercises.join(', ') : ''}`)
    .join('\n')

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a workout split editor. Here is the user's current weekly split:

${splitText}

The user says: "${message}"

Update the split based on what the user asked. Return ONLY a JSON object with this exact format:
{
  "0": {"name": "Rest", "exercises": []},
  "1": {"name": "Push Day", "exercises": ["Bench Press", "OHP", "Lateral Raises"]},
  "2": {"name": "Pull Day", "exercises": ["Pull-ups", "Barbell Row"]},
  "3": {"name": "Rest", "exercises": []},
  "4": {"name": "Legs", "exercises": ["Squat", "Romanian Deadlift"]},
  "5": {"name": "Upper", "exercises": []},
  "6": {"name": "Rest", "exercises": []}
}

Keys 0-6 represent Sunday through Saturday. Return only the JSON, no explanation.`
      }]
    })

    const text = response.content[0].text.trim()
    // Extract JSON even if there's surrounding text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned unexpected format' })

    const updatedSplit = JSON.parse(jsonMatch[0])
    return res.status(200).json({ updatedSplit })
  } catch (err) {
    console.error('Anthropic error:', err)
    return res.status(500).json({ error: err.message })
  }
}
