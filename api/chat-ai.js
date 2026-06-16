// Vercel serverless function — general-purpose AI chat with injected context
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

  const { messages, systemPrompt, context, maxTokens } = req.body
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' })
  }

  const client = new Anthropic({ apiKey })

  const system = [
    systemPrompt || 'You are a helpful assistant.',
    context ? `\n\nCurrent data context (use this to answer questions accurately):\n${context}` : '',
  ].join('')

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: Math.min(Math.max(parseInt(maxTokens) || 600, 100), 4096),
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    return res.status(200).json({ reply: response.content[0].text.trim() })
  } catch (err) {
    console.error('Anthropic error:', err)
    return res.status(500).json({ error: err.message })
  }
}
