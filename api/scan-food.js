// Vercel serverless function — vision-based food photo macro estimator
// Requires: ANTHROPIC_API_KEY set in Vercel environment variables

import Anthropic from '@anthropic-ai/sdk'

const SCAN_SYSTEM = `You are a nutrition expert with computer vision. When given a food photo, analyze everything you can see and estimate the calories and macros for the total meal or dish shown. Respond ONLY with a single flat JSON object — no explanation, no markdown, just raw JSON:
{"name":"descriptive name of what you see","calories":450,"protein":22,"carbs":48,"fat":18,"serving_size_label":"1 plate (~400g)","serving_size_g":400,"notes":"one plain-English sentence identifying what you see and the main macro contributors","confidence":"medium"}
Rules: calories/protein/carbs/fat must be numbers (not strings). serving_size_label: short human-readable serving description. serving_size_g: approximate total grams as a number. confidence must be "high", "medium", or "low" — use "high" when the food is clearly identifiable, "low" when it is partially obscured or ambiguous. Use realistic estimates for typical restaurant or home-cooked portions.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY not configured',
      hint: 'Add ANTHROPIC_API_KEY to your Vercel environment variables',
    })
  }

  const { imageBase64, mediaType } = req.body
  if (!imageBase64 || !mediaType) {
    return res.status(400).json({ error: 'imageBase64 and mediaType required' })
  }

  // Validate media type
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowed.includes(mediaType)) {
    return res.status(400).json({ error: `Unsupported image type: ${mediaType}` })
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system:     SCAN_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: 'Estimate the total calories and macros for everything visible in this food photo.',
          },
        ],
      }],
    })

    const raw = response.content[0].text.trim()

    // Robust JSON extraction — handle matching braces rather than naive regex
    const start = raw.indexOf('{')
    if (start === -1) throw new Error('No nutrition data in response')
    let depth = 0, end = -1
    for (let i = start; i < raw.length; i++) {
      if      (raw[i] === '{') depth++
      else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end === -1) throw new Error('Malformed JSON in response')
    const parsed = JSON.parse(raw.slice(start, end + 1))

    return res.status(200).json({ result: parsed })
  } catch (err) {
    console.error('scan-food error:', err)
    return res.status(500).json({ error: err.message })
  }
}
