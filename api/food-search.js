// Vercel serverless — USDA FoodData Central proxy
// Keeps FDC_API_KEY server-side; returns raw USDA food objects so the
// client's existing normalizeUsdaFood() can process them without duplication.
//
// GET /api/food-search?q=chicken+breast          — text search
// GET /api/food-search?barcode=012345678901      — UPC barcode lookup

const API_KEY = process.env.FDC_API_KEY || process.env.USDA_API_KEY || 'DEMO_KEY'
const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1'

// Nutrient IDs we care about — returned in full detail by /v1/food/:id
const WANTED_NUTRIENTS = new Set([
  '203','204','205','208','269','291','307',   // protein, fat, carbs, kcal, sugar, fiber, sodium
  '957','958',                                  // Atwater-specific energy
  '1003','1004','1005','1008',                 // alternate IDs from search endpoint
])

function buildUrl(path, params) {
  const u = new URL(FDC_BASE + path)
  u.searchParams.set('api_key', API_KEY)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.toString()
}

// Normalize nutrient list from either search or detail endpoint.
// The search endpoint uses `nutrientId`, the detail endpoint uses `nutrient.id`.
function pickNutrients(list) {
  const out = []
  for (const n of list || []) {
    // Search endpoint: n.nutrientNumber (string "208"), n.nutrientId (number)
    // Detail endpoint: n.nutrient.id, n.number
    const num = String(n.nutrientNumber ?? n.nutrientId ?? n.nutrient?.id ?? n.number ?? '')
    if (!num || !WANTED_NUTRIENTS.has(num)) continue
    if (n.value != null) out.push({ nutrientNumber: num, value: n.value })
  }
  return out
}

// Build the food object shape that foodApi.js's normalizeUsdaFood() expects.
function shapeFood(f) {
  return {
    fdcId:                 f.fdcId,
    description:          f.description,
    dataType:             f.dataType,
    brandOwner:           f.brandOwner   || f.brandName || null,
    brandName:            f.brandName    || null,
    servingSize:          f.servingSize  || null,
    servingSizeUnit:      f.servingSizeUnit || null,
    householdServingFullText: f.householdServingFullText || null,
    foodNutrients:        pickNutrients(f.foodNutrients || []),
    foodMeasures:         (f.foodMeasures || []).map(m => ({
      disseminatedText: m.disseminatedText || '',
      gramWeight:       m.gramWeight || 0,
    })),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'GET only' })

  const { q, barcode } = req.query

  try {
    // ── Barcode lookup ────────────────────────────────────────────────────────
    if (barcode) {
      const code = barcode.trim().replace(/\D/g, '')
      if (!code) return res.status(400).json({ error: 'Invalid barcode' })

      // FDC stores GTINs as 14-digit strings; pad a 12-digit UPC to 14
      const gtin = code.padStart(14, '0')
      const url  = buildUrl('/foods/search', {
        query:    gtin,
        dataType: 'Branded',
        pageSize: '1',
      })
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`FDC barcode ${resp.status}`)
      const data = await resp.json()
      const foods = (data.foods || []).map(shapeFood)
      return res.status(200).json({ foods, mode: 'barcode' })
    }

    // ── Text search ───────────────────────────────────────────────────────────
    const query = (q || '').trim()
    if (query.length < 2) return res.status(200).json({ foods: [], mode: 'search' })

    // Run Foundation/SR Legacy and Branded searches in parallel;
    // Foundation gives best whole-food accuracy, Branded covers packaged goods.
    // requireAllWords keeps multi-word queries precise ("greek yogurt" won't
    // return plain yogurt) — MFP-style matching.
    const multiWord = query.trim().split(/\s+/).length > 1
    const [genericResp, brandedResp] = await Promise.allSettled([
      fetch(buildUrl('/foods/search', {
        query, dataType: 'Foundation,SR Legacy', pageSize: '15',
        ...(multiWord ? { requireAllWords: 'true' } : {}),
      })),
      fetch(buildUrl('/foods/search', {
        query, dataType: 'Branded', pageSize: '20',
        ...(multiWord ? { requireAllWords: 'true' } : {}),
      })),
    ])

    const generic = genericResp.status === 'fulfilled' && genericResp.value.ok
      ? (await genericResp.value.json()).foods || []
      : []
    const branded = brandedResp.status === 'fulfilled' && brandedResp.value.ok
      ? (await brandedResp.value.json()).foods || []
      : []

    // Generic first, then branded — matches priority requested in build spec
    const merged = [...generic, ...branded]
      .map(shapeFood)
      // Drop entries with zero nutritional data
      .filter(f => f.foodNutrients.length > 0)

    return res.status(200).json({ foods: merged, mode: 'search' })
  } catch (err) {
    console.error('food-search error:', err.message)
    return res.status(200).json({ foods: [], mode: 'error', error: err.message })
  }
}
