// Vercel serverless function — food autocomplete using Claude Haiku
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM = `You are a precise food nutrition database. Return the 6 best matches for the query with ACCURATE calories.

EXACT CALORIE REFERENCE (memorize these — never deviate):
CHICK-FIL-A: Classic Chicken Sandwich=440, Spicy Chicken Sandwich=450, Spicy Deluxe=500, Deluxe=500, Nuggets 8pc=260, Nuggets 12pc=390, Waffle Fries Med=420, Mac & Cheese=440, Grilled Chicken Sandwich=320, Chicken Biscuit=450
McDONALD'S: Big Mac=550, Quarter Pounder w/Cheese=520, McDouble=400, McChicken=400, Filet-O-Fish=390, 10pc McNuggets=410, Large Fries=490, Med Fries=320, Egg McMuffin=310
TACO BELL: Crunchy Taco=170, Soft Taco=180, Burrito Supreme=410, Chicken Quesadilla=510, Chalupa=360, Crunchwrap Supreme=530, Nacho Fries=320
CHIPOTLE: Chicken Burrito=1035, Chicken Bowl=665, Steak Bowl=700, Burrito Bowl no rice=500, Chips=540, Guacamole=230
STARBUCKS: Grande Latte=190, Grande Cappuccino=120, Grande Caramel Macchiato=250, Grande Frappuccino=370, Grande Cold Brew=5
BURGER KING: Whopper=670, Double Whopper=900, Chicken Sandwich=660, Impossible Whopper=630, Medium Fries=380
SUBWAY: 6" Italian BMT=390, 6" Turkey=280, 6" Chicken=330, 6" Tuna=480, Footlong Turkey=560
PANERA: Broccoli Cheddar Soup cup=290, Fuji Apple Salad=570, Turkey Sandwich=500, Chicken Noodle Soup cup=130
COMMON FOODS: large egg=78, 2 eggs=156, cup cooked white rice=206, cup cooked brown rice=216, medium banana=105, medium apple=95, cup whole milk=149, cup 2% milk=122, chicken breast 6oz=185, chicken breast 4oz=124, salmon fillet 6oz=234, ground beef 4oz 80/20=290, cup oatmeal cooked=158, slice white bread=79, slice wheat bread=69, tbsp peanut butter=95, cup Greek yogurt plain=130, protein bar Quest=190, protein bar KIND=200, cup broccoli=55, cup spinach=7, medium sweet potato=103, cup pasta cooked=220, cup cheerios=100, cup 2% cottage cheese=180, avocado half=120, cup black beans=227, oz cheddar cheese=115, oz mozzarella=85

ABBREVIATION MAP: cfa/chick=Chick-fil-A, mcd/mcds=McDonald's, pb=peanut butter, bk=Burger King, tbell/tb=Taco Bell, chip=Chipotle, sbux/sbx=Starbucks, paner=Panera

RULES:
- If query is a brand/restaurant, list 6 popular items from that place
- If query is vague (e.g. "sandwich"), return 6 specific well-known variants
- Typos/abbreviations: resolve to closest match
- NEVER round calories to nearest 50 or 100 — use real numbers
- calories/protein/carbs/fat are NUMBERS not strings

Return ONLY a raw JSON array, no markdown, no explanation:
[{"name":"Chick-fil-A Classic Chicken Sandwich","calories":440,"protein":28,"carbs":40,"fat":19,"serving_size_label":"1 sandwich (215g)","serving_size_g":215}]

Always return 4-6 items. Never truncate the JSON.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured', results: [] })

  const { query } = req.body
  if (!query?.trim()) return res.status(400).json({ results: [] })

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: query.trim() }],
    })

    const raw   = response.content[0].text.trim()
    const start = raw.indexOf('[')
    const end   = raw.lastIndexOf(']')
    if (start === -1 || end === -1) throw new Error('No JSON array in response')

    const items = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(items)) throw new Error('Response is not an array')

    const results = items.map(p => ({
      name:               String(p.name || '').trim(),
      calories:           Math.round(parseFloat(p.calories) || 0),
      protein:            Math.round(parseFloat(p.protein)  || 0),
      carbs:              Math.round(parseFloat(p.carbs)    || 0),
      fat:                Math.round(parseFloat(p.fat)      || 0),
      serving_size_label: p.serving_size_label || '',
      serving_size_g:     parseFloat(p.serving_size_g) || 0,
      source: 'ai',
    })).filter(p => p.name && p.calories > 0)

    return res.status(200).json({ results })
  } catch (err) {
    console.error('suggest-foods error:', err)
    return res.status(200).json({ results: [], error: err.message })
  }
}
