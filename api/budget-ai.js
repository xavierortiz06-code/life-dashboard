// Vercel serverless function — AI budget plan assistant
// Requires: ANTHROPIC_API_KEY set in Vercel environment variables

import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY not configured',
      hint: 'Add ANTHROPIC_API_KEY to your Vercel environment variables',
    })
  }

  const { message, categories, income } = req.body
  if (!message || !categories) return res.status(400).json({ error: 'message and categories required' })

  const client = new Anthropic({ apiKey })

  const categoryList = categories
    .map(c => `  ID ${c.id}: "${c.name}" = ${c.pct}% ($${((c.pct / 100) * income).toFixed(2)})`)
    .join('\n')

  const prompt = `You are a budget planning assistant. The user wants to adjust their monthly budget.

Monthly income: $${Number(income).toLocaleString('en-US')}
Current categories:
${categoryList}
Current total: ${categories.reduce((s, c) => s + c.pct, 0).toFixed(1)}%

User request: "${message}"

Return ONLY a JSON object, no other text:
{
  "changes": [
    { "type": "set_pct", "id": <number>, "pct": <number with 1 decimal> },
    { "type": "add", "name": "<string>", "pct": <number with 1 decimal> },
    { "type": "delete", "id": <number> },
    { "type": "rename", "id": <number>, "name": "<string>" }
  ],
  "message": "<friendly 1-2 sentence summary of exactly what changed>"
}

CRITICAL RULES:
1. After ALL changes are applied, all category percentages MUST sum to exactly 100.0%
2. If you increase or add a category, reduce OTHER categories proportionally to compensate
3. If you delete a category, distribute its percentage proportionally to the remaining ones
4. Never leave a category at 0% — delete it instead if it should be removed
5. Round all percentages to 1 decimal place
6. Use the exact ID numbers from the list above`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].text.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned unexpected format' })

    const result = JSON.parse(jsonMatch[0])
    return res.status(200).json(result)
  } catch (err) {
    console.error('Anthropic error:', err)
    return res.status(500).json({ error: err.message })
  }
}
