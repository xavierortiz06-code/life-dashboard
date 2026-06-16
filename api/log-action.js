// Vercel serverless function — parses natural language into a structured dashboard action
// Requires: ANTHROPIC_API_KEY set in Vercel environment variables

import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ type: 'unknown', message: 'AI not configured — add ANTHROPIC_API_KEY to Vercel env vars.' })

  const { message, today, dayOfWeek, exercises = [] } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })

  const client = new Anthropic({ apiKey })

  const prompt = `You are a personal dashboard logging assistant. Parse the user's message and return ONLY a JSON object — no markdown, no extra text, no code fences.

Today: ${today} (${dayOfWeek})
User's saved exercises: ${exercises.length > 0 ? exercises.join(', ') : 'none yet'}

Return exactly ONE of these JSON shapes:

IMPORTANT: All date fields MUST be exactly "YYYY-MM-DD" format (e.g. "${today}"). No other format. Use zero-padded month and day.

WORKOUT (gym sets, lifting, cardio):
{"type":"log_workout","exercise":"<name>","sets":[{"weight":<lbs>,"reps":<num>}],"date":"${today}","message":"<e.g. Logged 3×8 Bench Press @ 225 lbs>"}
Rules:
- Expand shorthand: "3x8 @ 225" → 3 set objects each with weight:225, reps:8
- Pyramid sets like "135x10, 185x8, 225x6" → 3 objects with different weights
- Bodyweight (pull-ups, push-ups with no weight mentioned) → weight:0
- Match exercise name to user's saved exercises when the name is close (prefer existing names)
- Default date: "${today}". "yesterday" = one day before ${today}. Dates are always YYYY-MM-DD.

TODO (task, reminder, thing to do):
{"type":"add_todo","title":"<title>","priority":"high"|"normal"|"low","due_date":"<YYYY-MM-DD>"|null,"message":"<e.g. Added 'Call dentist' to your task list>"}
Rules:
- priority "high" only if user says urgent/important/asap/high priority. Default: "normal"
- due_date only if explicitly mentioned

EXPENSE / INCOME (money, spending, payment, transaction):
{"type":"add_transaction","transaction_type":"expense"|"income","amount":<positive number>,"category":"<category>","description":"<desc or null>","date":"${today}","message":"<e.g. Logged -$45.00 Chipotle (Food)>"}
Rules:
- Categories: Food, Gas, Entertainment, Shopping, Bills, Subscriptions, Fitness, Health, Travel, Salary, Freelance, Other
- Amount is always a positive number (no $ sign, no commas) — a plain number like 12.77
- Default date: "${today}" (YYYY-MM-DD). Never use any other date format.
- If no category is clear from context, infer from description

SCHEDULE (add event/task to the day planner):
{"type":"add_schedule","date":"${today}","section":"morning"|"work"|"afternoon"|"nightly","title":"<title>","time":"<e.g. 10:00 AM>"|null,"message":"<e.g. Added Doctor appt Monday morning>"}
Rules:
- morning = before ~9am or "in the morning", work = 9am–5pm or "during work/day", afternoon = 5pm–9pm or "after work/evening", nightly = after 9pm or "at night"
- Default section: "morning" if unspecified
- Default date: "${today}" (YYYY-MM-DD). Resolve "tomorrow", "Monday", etc. relative to ${today} using zero-padded YYYY-MM-DD.
- time field is a human label like "10:00 AM", "2:30 PM" — null if not specified

UNKNOWN (intent is unclear or not one of the above):
{"type":"unknown","message":"<one sentence: what you can log, give an example relevant to what the user said>"}

Return ONLY the JSON object. No other text.

User message: "${message.replace(/"/g, '\\"')}"`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].text.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return res.status(200).json({ type: 'unknown', message: "I didn't catch that. Try: 'bench press 3x8 @ 225', 'add todo: call dentist', '$20 Chipotle food', 'gym tomorrow morning'" })
    }

    return res.status(200).json(JSON.parse(jsonMatch[0]))
  } catch (err) {
    console.error('log-action error:', err)
    return res.status(500).json({ type: 'unknown', message: `Error: ${err.message}` })
  }
}
