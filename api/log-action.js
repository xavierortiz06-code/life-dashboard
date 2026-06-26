import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ type: 'unknown', message: 'AI not configured.' })

  const { message, today, dayOfWeek, exercises = [], tasks = [], routines = [] } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })

  const client = new Anthropic({ apiKey })

  const taskList   = tasks.length   > 0 ? tasks.map(t => `"${t.title}" (id:${t.id})`).join(', ')   : 'none'
  const routineList= routines.length> 0 ? routines.map(r=>`"${r.title}" (id:${r.id})`).join(', ')  : 'none'

  const prompt = `You are a personal dashboard logging assistant. Parse the user's message and return ONLY a JSON object — no markdown, no extra text.

Today: ${today} (${dayOfWeek})
User's saved exercises: ${exercises.length > 0 ? exercises.join(', ') : 'none yet'}
User's open tasks: ${taskList}
User's active routines: ${routineList}

Return exactly ONE of these JSON shapes:

WORKOUT:
{"type":"log_workout","exercise":"<name>","sets":[{"weight":<lbs>,"reps":<num>}],"date":"${today}","message":"<e.g. Logged 3×8 Bench Press @ 225 lbs>"}
- Expand shorthand: "3x8 @ 225" → 3 set objects each weight:225, reps:8
- Bodyweight → weight:0
- Match exercise name to saved exercises when close

TODO (add new task):
{"type":"add_todo","title":"<title>","priority":"high"|"normal"|"low","due_date":"<YYYY-MM-DD>"|null,"list":"task_list"|"claude_tasks","message":"<confirmation>"}
- list: use "claude_tasks" if user says "claude to-do", "claude tasks", "claude list", or "claude's list". Default: "task_list"

COMPLETE TASK (check off / mark done an existing task or routine):
{"type":"complete_task","task_id":<id>|null,"task_title":"<exact title from list>","item_type":"task"|"routine","message":"<confirmation>"}
- Use when user says "check off", "mark done", "complete", "finish", "done with"
- Match the task title from the open tasks or routines list
- Set task_id if you can match one, task_title always
- item_type: "task" for task_list items, "routine" for routine_tasks

EXPENSE / INCOME:
{"type":"add_transaction","transaction_type":"expense"|"income","amount":<positive number>,"category":"<category>","description":"<desc or null>","date":"${today}","message":"<confirmation>"}
- Categories: Food, Gas, Entertainment, Shopping, Bills, Subscriptions, Fitness, Health, Travel, Salary, Freelance, Other

SCHEDULE (add to day planner):
{"type":"add_schedule","date":"${today}","section":"morning"|"work"|"afternoon"|"nightly","title":"<title>","time":"<e.g. 10:00 AM>"|null,"message":"<confirmation>"}

UNKNOWN (not a loggable action — this is a question, opinion, or general chat):
{"type":"unknown","message":""}

Return ONLY the JSON object.

User message: "${message.replace(/"/g, '\\"')}"`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].text.trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return res.status(200).json({ type: 'unknown', message: '' })
    return res.status(200).json(JSON.parse(match[0]))
  } catch (err) {
    console.error('log-action error:', err)
    return res.status(500).json({ type: 'unknown', message: '' })
  }
}
