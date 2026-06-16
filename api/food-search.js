// Vercel serverless function — food autocomplete using USDA FoodData Central
// Free API key signup: https://fdc.nal.usda.gov/api-key-signup.html
// Falls back to DEMO_KEY (30 req/min, fine for personal use)
// Set USDA_API_KEY in Vercel env vars for higher limits

const NUTRIENT = {
  calories: [1008],            // Energy (kcal)
  protein:  [1003],            // Protein
  carbs:    [1005],            // Carbohydrate, by difference
  fat:      [1004],            // Total lipid (fat)
}

function getNutrient(list, ids) {
  for (const id of ids) {
    const found = list.find(n => n.nutrientId === id)
    if (found?.value != null) return Math.round(found.value)
  }
  return 0
}

export default async function handler(req, res) {
  // Allow CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const q = (req.query.q || '').trim()
  if (q.length < 2) return res.status(200).json({ results: [] })

  const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY'

  try {
    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
    url.searchParams.set('query',    q)
    url.searchParams.set('api_key',  apiKey)
    url.searchParams.set('pageSize', '10')
    // Branded = packaged/restaurant items submitted by manufacturers
    // Survey (FNDDS) = What We Eat in America survey — covers restaurant meals
    // SR Legacy = USDA standard reference (raw ingredients)
    url.searchParams.set('dataType', 'Branded,Survey (FNDDS),SR Legacy')

    const resp = await fetch(url.toString(), {
      headers: { 'Content-Type': 'application/json' },
    })

    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`USDA ${resp.status}: ${body.slice(0, 120)}`)
    }

    const data = await resp.json()

    const results = (data.foods || [])
      .map(food => {
        const ns      = food.foodNutrients || []
        const calories = getNutrient(ns, NUTRIENT.calories)
        const protein  = getNutrient(ns, NUTRIENT.protein)
        const carbs    = getNutrient(ns, NUTRIENT.carbs)
        const fat      = getNutrient(ns, NUTRIENT.fat)

        // Skip entries with zero macro info
        if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) return null

        const servG     = parseFloat(food.servingSize) || 100
        const servUnit  = (food.servingSizeUnit || 'g').toLowerCase()
        const household = food.householdServingFullText || ''

        const servLabel = household
          ? `${household} (${servG}${servUnit})`
          : `${servG}${servUnit}`

        // Build a clean display name
        const brand = food.brandOwner || food.brandName || ''
        const desc  = food.description || ''
        const name  = brand && !desc.toLowerCase().includes(brand.toLowerCase())
          ? `${desc} — ${brand}`
          : desc

        return {
          fdcId:              food.fdcId,
          name:               name.trim(),
          calories,
          protein,
          carbs,
          fat,
          serving_size_label: servLabel,
          serving_size_g:     servG,
          source:             'usda',
        }
      })
      .filter(Boolean)
      .slice(0, 8)

    return res.status(200).json({ results })
  } catch (err) {
    console.error('food-search error:', err)
    // Don't fail the whole UI — just return empty so the AI fallback kicks in
    return res.status(200).json({ results: [], error: err.message })
  }
}
