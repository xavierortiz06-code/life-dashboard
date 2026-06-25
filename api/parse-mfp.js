// Vercel serverless function — parse MyFitnessPal diary screenshot
// Requires: ANTHROPIC_API_KEY set in Vercel environment variables

import Anthropic from '@anthropic-ai/sdk'

const SYSTEM = `You are a precise nutrition data extractor. You will receive a screenshot of a MyFitnessPal food diary or meal log.

Extract every individual food item listed. Return ONLY a raw JSON array — no markdown, no explanation, nothing else:

[
  {"food_name":"Oatmeal, 1 cup cooked","calories":150,"protein_g":5,"carbs_g":27,"fat_g":3,"meal_tag":"breakfast"},
  {"food_name":"Banana, 1 medium","calories":105,"protein_g":1,"carbs_g":27,"fat_g":0,"meal_tag":"breakfast"}
]

Rules:
- meal_tag must be exactly one of: breakfast, lunch, dinner, snacks
- All numeric values must be integers (round if needed), never strings
- Include EVERY individual food row — skip totals, subtotals, and header rows
- food_name should include the serving size if shown (e.g. "Chicken Breast, 4 oz")
- Map MFP sections: Breakfast→breakfast, Lunch→lunch, Dinner→dinner, Snacks/Snack/Evening Snack→snacks
- If a value is missing or unclear, use 0
- If the meal section is unclear, default to snacks`

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables' })
  }

  const { imageBase64, mediaType } = req.body || {}
  if (!imageBase64 || !mediaType) {
    return res.status(400).json({ error: 'imageBase64 and mediaType are required' })
  }

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowed.includes(mediaType)) {
    return res.status(400).json({ error: `Unsupported image type: ${mediaType}. Use jpeg, png, gif, or webp.` })
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model:      'claude-opus-4-8',
      max_tokens: 2048,
      system:     SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text',  text: 'Extract all food items from this MyFitnessPal screenshot.' },
        ],
      }],
    })

    const raw = response.content[0].text.trim()

    // Extract JSON array robustly
    const start = raw.indexOf('[')
    const end   = raw.lastIndexOf(']')
    if (start === -1 || end === -1) {
      return res.status(200).json({ items: [], warning: 'No food items detected in this screenshot' })
    }

    const items = JSON.parse(raw.slice(start, end + 1))

    if (!Array.isArray(items)) throw new Error('Unexpected response format')

    // Sanitize: ensure all numeric fields are numbers
    const clean = items.map(item => ({
      food_name:  String(item.food_name || 'Unknown food'),
      calories:   Math.round(Number(item.calories)  || 0),
      protein_g:  Math.round(Number(item.protein_g) || 0),
      carbs_g:    Math.round(Number(item.carbs_g)   || 0),
      fat_g:      Math.round(Number(item.fat_g)     || 0),
      meal_tag:   ['breakfast','lunch','dinner','snacks'].includes(item.meal_tag) ? item.meal_tag : 'snacks',
    }))

    return res.status(200).json({ items: clean })
  } catch (err) {
    console.error('parse-mfp error:', err)
    return res.status(500).json({ error: err.message })
  }
}
