// ─────────────────────────────────────────────────────────────────────
// Food data layer — real verified nutrition, no LLM dependency.
//   • USDA FoodData Central  → routed through /api/food-search (key stays server-side)
//   • Open Food Facts        → branded foods + barcode fallback
// Results are normalized to one shape and cached (memory + localStorage).
//
// Normalized food shape:
// {
//   id, source: 'usda'|'off'|'custom', verified: boolean,
//   name, brand,                       // brand null for generic foods
//   per100g: { cal, prot, carbs, fat, fiber, sugar, sodium },  // sodium in mg
//   serving_size_g, serving_size_label,
//   measures: [{ label, grams }],      // serving-size picker options
//   calories, protein, carbs, fat, fiber, sugar, sodium,       // per default serving
// }
// ─────────────────────────────────────────────────────────────────────

const LS = typeof localStorage !== 'undefined' ? localStorage : null

// ── Built-in verified foods ──────────────────────────────────────────
// Exact USDA FoodData Central per-100g values for the most commonly logged
// whole foods. These match instantly, work offline, and don't depend on the
// (rate-limited) USDA API key — so the staples are always accurate. This is
// USDA data cached locally, NOT estimated. Tuple: [names, cal, prot, carbs, fat, fiber, sugar, sodium_mg, defaultGrams, defaultLabel]
const COMMON_RAW = [
  [['chicken breast', 'chicken breast raw'], 106, 22.5, 0, 1.9, 0, 0, 45, 120, '1 breast (120g)'],
  [['chicken breast cooked', 'grilled chicken', 'cooked chicken breast'], 165, 31, 0, 3.6, 0, 0, 74, 140, '1 breast (140g)'],
  [['chicken thigh cooked', 'chicken thigh'], 209, 26, 0, 10.9, 0, 0, 88, 130, '1 thigh (130g)'],
  [['egg', 'eggs', 'whole egg'], 143, 12.6, 0.7, 9.5, 0, 0.2, 142, 50, '1 large (50g)'],
  [['egg white', 'egg whites'], 52, 10.9, 0.7, 0.2, 0, 0.2, 166, 33, '1 white (33g)'],
  [['banana'], 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1, 118, '1 medium (118g)'],
  [['apple'], 52, 0.3, 13.8, 0.2, 2.4, 10.4, 1, 182, '1 medium (182g)'],
  [['orange'], 47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, 131, '1 medium (131g)'],
  [['strawberries', 'strawberry'], 32, 0.7, 7.7, 0.3, 2, 4.9, 1, 144, '1 cup (144g)'],
  [['blueberries', 'blueberry'], 57, 0.7, 14.5, 0.3, 2.4, 10, 1, 148, '1 cup (148g)'],
  [['white rice cooked', 'white rice', 'rice cooked', 'rice'], 130, 2.7, 28.2, 0.3, 0.4, 0.1, 1, 158, '1 cup (158g)'],
  [['brown rice cooked', 'brown rice'], 123, 2.7, 25.6, 1, 1.6, 0.2, 4, 195, '1 cup (195g)'],
  [['oatmeal cooked', 'oatmeal', 'oats cooked'], 71, 2.5, 12, 1.5, 1.7, 0.3, 4, 234, '1 cup (234g)'],
  [['oats dry', 'rolled oats', 'dry oats'], 379, 13.2, 67.7, 6.5, 10.1, 0.99, 6, 40, '1/2 cup (40g)'],
  [['whole milk', 'milk'], 61, 3.2, 4.8, 3.3, 0, 5.1, 43, 244, '1 cup (244g)'],
  [['2% milk', 'reduced fat milk'], 50, 3.4, 4.8, 2, 0, 5.1, 47, 244, '1 cup (244g)'],
  [['skim milk', 'nonfat milk'], 34, 3.4, 5, 0.1, 0, 5.1, 42, 245, '1 cup (245g)'],
  [['greek yogurt', 'greek yogurt nonfat'], 59, 10.3, 3.6, 0.4, 0, 3.2, 36, 170, '1 container (170g)'],
  [['peanut butter'], 588, 25, 20, 50, 6, 9.2, 459, 32, '2 tbsp (32g)'],
  [['almonds'], 579, 21.2, 21.6, 49.9, 12.5, 4.4, 1, 28, '1 oz (28g)'],
  [['white bread', 'bread'], 267, 8, 49, 3.3, 2.7, 5.7, 490, 25, '1 slice (25g)'],
  [['whole wheat bread', 'wheat bread'], 247, 13, 41, 3.4, 7, 6, 450, 28, '1 slice (28g)'],
  [['ground beef raw', 'ground beef', 'ground beef 80/20'], 254, 17.2, 0, 20, 0, 0, 66, 113, '4 oz (113g)'],
  [['salmon', 'salmon raw'], 208, 20.4, 0, 13.4, 0, 0, 59, 113, '4 oz (113g)'],
  [['tuna canned', 'canned tuna', 'tuna'], 116, 25.5, 0, 0.8, 0, 0, 247, 142, '1 can (142g)'],
  [['shrimp cooked', 'shrimp'], 99, 24, 0.2, 0.3, 0, 0, 111, 85, '3 oz (85g)'],
  [['broccoli'], 34, 2.8, 6.6, 0.4, 2.6, 1.7, 33, 91, '1 cup (91g)'],
  [['spinach'], 23, 2.9, 3.6, 0.4, 2.2, 0.4, 79, 30, '1 cup (30g)'],
  [['sweet potato cooked', 'sweet potato'], 90, 2, 20.7, 0.2, 3.3, 6.5, 36, 130, '1 medium (130g)'],
  [['potato cooked', 'potato', 'baked potato'], 87, 1.9, 20.1, 0.1, 1.8, 0.9, 6, 173, '1 medium (173g)'],
  [['avocado'], 160, 2, 8.5, 14.7, 6.7, 0.7, 7, 150, '1 avocado (150g)'],
  [['olive oil'], 884, 0, 0, 100, 0, 0, 2, 14, '1 tbsp (14g)'],
  [['butter'], 717, 0.9, 0.1, 81, 0, 0.1, 643, 14, '1 tbsp (14g)'],
  [['cheddar cheese', 'cheddar'], 403, 23, 3.1, 33, 0, 0.5, 621, 28, '1 oz (28g)'],
  [['cottage cheese'], 98, 11.1, 3.4, 4.3, 0, 2.7, 364, 113, '1/2 cup (113g)'],
  [['pasta cooked', 'pasta', 'spaghetti cooked'], 158, 5.8, 30.9, 0.9, 1.8, 0.6, 1, 140, '1 cup (140g)'],
  [['black beans cooked', 'black beans'], 132, 8.9, 23.7, 0.5, 8.7, 0.3, 1, 172, '1 cup (172g)'],
  [['quinoa cooked', 'quinoa'], 120, 4.4, 21.3, 1.9, 2.8, 0.9, 7, 185, '1 cup (185g)'],
  [['honey'], 304, 0.3, 82.4, 0, 0.2, 82.1, 4, 21, '1 tbsp (21g)'],
  [['ground turkey cooked', 'ground turkey'], 203, 27, 0, 10, 0, 0, 79, 113, '4 oz (113g)'],
]

function buildCommonFood([names, cal, prot, carbs, fat, fiber, sugar, sodium, g, label]) {
  const per100g = { cal, prot, carbs, fat, fiber, sugar, sodium }
  const f = g / 100
  const round1c = v => Math.round(v * 10) / 10
  return {
    id: `common-${names[0].replace(/\s+/g, '-')}`,
    source: 'usda', verified: true, generic: true,
    name: names[0].replace(/\b\w/g, c => c.toUpperCase()),
    brand: null,
    _aliases: names,
    per100g,
    serving_size_g: g,
    serving_size_label: label,
    measures: [
      { label, grams: g },
      { label: '100 g', grams: 100 },
      { label: '1 oz (28g)', grams: 28.35 },
      { label: '1 g', grams: 1 },
    ],
    calories: Math.round(cal * f),
    protein:  round1c(prot * f),
    carbs:    round1c(carbs * f),
    fat:      round1c(fat * f),
    fiber:    round1c(fiber * f),
    sugar:    round1c(sugar * f),
    sodium:   Math.round(sodium * f),
  }
}

const COMMON_FOODS = COMMON_RAW.map(buildCommonFood)

// Match query against the built-in foods. Exact alias match ranks first.
function searchCommon(q) {
  const ql = q.trim().toLowerCase()
  if (!ql) return []
  const tokens = ql.split(/\s+/).filter(t => t.length >= 2)
  const scored = []
  for (const food of COMMON_FOODS) {
    let score = 0
    for (const alias of food._aliases) {
      if (alias === ql) { score = 100; break }
      if (alias.startsWith(ql)) score = Math.max(score, 60)
      else if (alias.includes(ql)) score = Math.max(score, 40)
      else if (tokens.length && tokens.every(t => alias.includes(t))) score = Math.max(score, 30)
    }
    if (score > 0) scored.push({ food, score })
  }
  return scored.sort((a, b) => b.score - a.score).map(s => s.food)
}

const CACHE_LS_KEY = 'food-search-cache-v2'
const CACHE_TTL    = 7 * 24 * 3600 * 1000 // 7 days
const CACHE_MAX    = 60                   // queries kept in localStorage

const memCache = new Map()

function readLsCache() {
  if (!LS) return {}
  try { return JSON.parse(LS.getItem(CACHE_LS_KEY) || '{}') } catch { return {} }
}

function writeLsCache(store) {
  if (!LS) return
  // Evict oldest entries beyond the cap
  const keys = Object.keys(store)
  if (keys.length > CACHE_MAX) {
    keys.sort((a, b) => store[a].ts - store[b].ts)
    for (const k of keys.slice(0, keys.length - CACHE_MAX)) delete store[k]
  }
  try { LS.setItem(CACHE_LS_KEY, JSON.stringify(store)) } catch { /* quota — skip */ }
}

function cacheLookup(q) {
  if (memCache.has(q)) return memCache.get(q)
  const store = readLsCache()
  const hit = store[q]
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    memCache.set(q, hit.results)
    return hit.results
  }
  return null
}

function cacheStore(q, results) {
  memCache.set(q, results)
  const store = readLsCache()
  store[q] = { ts: Date.now(), results }
  writeLsCache(store)
}

const round1 = v => Math.round(v * 10) / 10

function scale(per100g, grams) {
  const f = grams / 100
  return {
    calories: Math.round((per100g.cal   || 0) * f),
    protein:  round1((per100g.prot  || 0) * f),
    carbs:    round1((per100g.carbs || 0) * f),
    fat:      round1((per100g.fat   || 0) * f),
    fiber:    round1((per100g.fiber || 0) * f),
    sugar:    round1((per100g.sugar || 0) * f),
    sodium:   Math.round((per100g.sodium || 0) * f), // mg
  }
}

// ── USDA ─────────────────────────────────────────────────────────────

// nutrientNumber → field. Energy prefers Atwater-specific (957) > general (958) > 208.
function usdaNutrients(foodNutrients) {
  const byNum = {}
  for (const n of foodNutrients || []) {
    const num = String(n.nutrientNumber ?? n.number ?? '')
    if (num && byNum[num] === undefined) byNum[num] = n.value
  }
  return {
    cal:    byNum['957'] ?? byNum['958'] ?? byNum['208'] ?? 0,
    prot:   byNum['203'] ?? 0,
    fat:    byNum['204'] ?? 0,
    carbs:  byNum['205'] ?? 0,
    fiber:  byNum['291'] ?? 0,
    sugar:  byNum['269'] ?? 0,
    sodium: byNum['307'] ?? 0, // already mg
  }
}

function titleCase(s) {
  return (s || '').toLowerCase().replace(/(^|[\s(,-])([a-z])/g, (m, p, c) => p + c.toUpperCase())
}

function normalizeUsdaFood(item) {
  const per100g = usdaNutrients(item.foodNutrients)
  const generic = item.dataType === 'Foundation' || item.dataType === 'SR Legacy'

  // Household measures for the serving picker
  const measures = [{ label: '100 g', grams: 100 }, { label: '1 g', grams: 1 }, { label: '1 oz (28g)', grams: 28.35 }]
  for (const m of item.foodMeasures || []) {
    const g = parseFloat(m.gramWeight)
    const label = (m.disseminatedText || '').trim()
    if (g > 0 && label && label.toLowerCase() !== 'quantity not specified') {
      measures.push({ label: `${label} (${Math.round(g)}g)`, grams: g })
    }
  }

  let servingG = 100
  let servingLabel = '100 g'
  if (!generic && item.servingSize > 0 && /^(g|grm|gram)/i.test(item.servingSizeUnit || '')) {
    servingG = item.servingSize
    servingLabel = item.householdServingFullText
      ? `${item.householdServingFullText} (${Math.round(servingG)}g)`
      : `${Math.round(servingG)} g`
    measures.unshift({ label: servingLabel, grams: servingG })
  } else if ((item.foodMeasures || []).length && measures.length > 3) {
    // Generic food with household measures — keep 100g default but surface them
  }

  return {
    id: `usda-${item.fdcId}`,
    source: 'usda',
    verified: true,
    name: titleCase(item.description),
    brand: item.brandOwner || item.brandName || null,
    generic,
    per100g,
    serving_size_g: servingG,
    serving_size_label: servingLabel,
    measures,
    ...scale(per100g, servingG),
  }
}

export async function searchUsda(query, { signal } = {}) {
  const res = await fetch(`/api/food-search?q=${encodeURIComponent(query)}`, { signal })
  if (!res.ok) throw new Error(`food-search ${res.status}`)
  const data = await res.json()
  return (data.foods || []).map(normalizeUsdaFood).filter(f => f.per100g.cal > 0 || f.per100g.prot > 0)
}

// ── Open Food Facts ──────────────────────────────────────────────────

function normalizeOffProduct(p, code) {
  const n = p.nutriments || {}
  const per100g = {
    cal:    n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0,
    prot:   n.proteins_100g      ?? 0,
    carbs:  n.carbohydrates_100g ?? 0,
    fat:    n.fat_100g           ?? 0,
    fiber:  n.fiber_100g         ?? 0,
    sugar:  n.sugars_100g        ?? 0,
    sodium: (n.sodium_100g ?? 0) * 1000, // g → mg
  }
  if (!per100g.cal && !per100g.prot && !per100g.carbs && !per100g.fat) return null

  // Fields vary by backend: serving_size may be a string ("30 g") or absent;
  // product_name and brands may be a string OR an array (search-a-licious).
  const servingStr = typeof p.serving_size === 'string' ? p.serving_size : ''
  const servingG = parseFloat(p.serving_quantity) ||
    parseFloat(servingStr.match(/([\d.]+)\s*(g|ml)/i)?.[1]) || 0

  const measures = [{ label: '100 g', grams: 100 }, { label: '1 g', grams: 1 }, { label: '1 oz (28g)', grams: 28.35 }]
  let servingLabel = '100 g'
  let defaultG = 100
  if (servingG > 0) {
    servingLabel = servingStr || `${Math.round(servingG)} g`
    defaultG = servingG
    measures.unshift({ label: `1 serving (${servingLabel})`, grams: servingG })
  }

  const firstStr = v => (Array.isArray(v) ? v[0] : v) || ''
  const name  = firstStr(p.product_name || p.product_name_en).trim()
  const brand = firstStr(p.brands).split(',')[0].trim() || null
  if (!name) return null

  return {
    id: `off-${code || p.code || name}`,
    source: 'off',
    verified: true,
    name,
    brand,
    generic: false,
    per100g,
    serving_size_g: defaultG,
    serving_size_label: servingLabel,
    measures,
    ...scale(per100g, defaultG),
  }
}

// Open Food Facts has several search backends with different uptime and
// relevance. We try them best-first and fall through on failure:
//   1. search-a-licious (search.openfoodfacts.org) — best relevance
//   2. legacy CGI (sorted by scan popularity) — good relevance, sometimes 503
//   3. v2 /search — poor relevance but usually up (the token filter cleans it)
const OFF_ENDPOINTS = [
  q => `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=20`,
  q => `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
       `&search_simple=1&action=process&json=1&page_size=20&sort_by=unique_scans_n` +
       `&fields=code,product_name,brands,serving_size,serving_quantity,nutriments`,
  q => `https://world.openfoodfacts.org/api/v2/search?search_terms=${encodeURIComponent(q)}` +
       `&fields=code,product_name,brands,serving_size,serving_quantity,nutriments&page_size=20`,
]

export async function searchOff(query, { signal } = {}) {
  let reachedAny = false
  for (const makeUrl of OFF_ENDPOINTS) {
    try {
      const res = await fetch(makeUrl(query), { signal })
      if (!res.ok) continue          // 503/429 etc — try the next backend
      reachedAny = true
      const data = await res.json()
      const raw  = data.hits || data.products || []  // search-a-licious uses `hits`
      const norm = raw.map(p => normalizeOffProduct(p, p.code)).filter(Boolean)
      if (norm.length) return norm
    } catch { /* network/parse error — try the next backend */ }
  }
  if (!reachedAny) throw new Error('Open Food Facts unreachable')
  return []  // reached a backend but it had no usable matches
}

// Try FDC first (more reliable for US products), fall back to OFF.
export async function lookupBarcode(code, { signal } = {}) {
  // 1. FDC via server proxy (key stays hidden)
  try {
    const res = await fetch(`/api/food-search?barcode=${encodeURIComponent(code)}`, { signal })
    if (res.ok) {
      const data = await res.json()
      const foods = (data.foods || []).map(normalizeUsdaFood).filter(f => f.per100g.cal > 0 || f.per100g.prot > 0)
      if (foods.length > 0) return foods[0]
    }
  } catch { /* fall through to OFF */ }

  // 2. Open Food Facts fallback
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}` +
    `?fields=code,product_name,brands,serving_size,serving_quantity,nutriments`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`Barcode lookup failed (${res.status})`)
  }
  const data = await res.json()
  if (data.status !== 1 || !data.product) return null
  return normalizeOffProduct(data.product, code)
}

// ── Custom foods (local) ─────────────────────────────────────────────

const CUSTOM_KEY = 'nutrition-custom-foods'

export function getCustomFoods() {
  if (!LS) return []
  try { return JSON.parse(LS.getItem(CUSTOM_KEY) || '[]') } catch { return [] }
}

export function saveCustomFood(food) {
  const entry = {
    id: `custom-${Date.now()}`,
    source: 'custom',
    verified: false,
    name: food.name,
    brand: food.brand || null,
    generic: false,
    per100g: food.serving_size_g > 0 ? {
      cal:    (food.calories || 0) / food.serving_size_g * 100,
      prot:   (food.protein  || 0) / food.serving_size_g * 100,
      carbs:  (food.carbs    || 0) / food.serving_size_g * 100,
      fat:    (food.fat      || 0) / food.serving_size_g * 100,
      fiber: 0, sugar: 0, sodium: 0,
    } : null,
    serving_size_g: food.serving_size_g || 0,
    serving_size_label: food.serving_size_label || (food.serving_size_g ? `${food.serving_size_g} g` : '1 serving'),
    measures: food.serving_size_g > 0
      ? [{ label: food.serving_size_label || `${food.serving_size_g} g`, grams: food.serving_size_g }, { label: '100 g', grams: 100 }, { label: '1 g', grams: 1 }]
      : [{ label: food.serving_size_label || '1 serving', grams: 0 }],
    calories: Math.round(food.calories || 0),
    protein:  round1(food.protein || 0),
    carbs:    round1(food.carbs   || 0),
    fat:      round1(food.fat     || 0),
    fiber: 0, sugar: 0, sodium: 0,
  }
  const list = [entry, ...getCustomFoods()]
  if (LS) LS.setItem(CUSTOM_KEY, JSON.stringify(list))
  return entry
}

export function deleteCustomFood(id) {
  const list = getCustomFoods().filter(f => f.id !== id)
  if (LS) LS.setItem(CUSTOM_KEY, JSON.stringify(list))
  return list
}

// ── Merged search ────────────────────────────────────────────────────

function dedupeKey(f) {
  return `${(f.name || '').toLowerCase().replace(/\s+/g, ' ')}|${(f.brand || '').toLowerCase()}`
}

// Keep only branded products that actually relate to the query — OFF returns
// noise otherwise. A product passes if its name shares a meaningful token with
// the query. Falls back to the unfiltered list if filtering would empty it.
function relevantBranded(list, q) {
  const tokens = q.split(/\s+/).filter(t => t.length >= 3)
  if (!tokens.length) return list
  const hit = list.filter(f => {
    const hay = `${f.name} ${f.brand || ''}`.toLowerCase()
    return tokens.some(t => hay.includes(t))
  })
  return hit.length ? hit : list
}

function dedupeMerge(...lists) {
  const seen = new Set()
  const out = []
  for (const f of lists.flat()) {
    const k = dedupeKey(f)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(f)
  }
  return out
}

// Returns { results, failed } — failed=true means remote sources errored AND
// there were no built-in matches to fall back on.
export async function searchFoods(query, { signal } = {}) {
  const q = query.trim().toLowerCase()
  if (!q) return { results: [], failed: false }

  // Local sources — always available, no network
  const customHits = getCustomFoods().filter(f =>
    f.name.toLowerCase().includes(q) || (f.brand || '').toLowerCase().includes(q))
  const commonHits = searchCommon(q)
  const localHits  = [...customHits, ...commonHits]

  const cached = cacheLookup(q)
  if (cached) return { results: dedupeMerge(localHits, cached).slice(0, 25), failed: false }

  const [usdaRes, offRes] = await Promise.allSettled([
    searchUsda(q, { signal }),
    searchOff(q, { signal }),
  ])
  const usda = usdaRes.status === 'fulfilled' ? usdaRes.value : []
  const off  = offRes.status  === 'fulfilled' ? offRes.value  : []
  const remoteFailed = usdaRes.status === 'rejected' && offRes.status === 'rejected'

  // Generic whole foods first (USDA Foundation/SR), then relevant branded
  const generic = usda.filter(f => f.generic)
  const branded = relevantBranded([...off, ...usda.filter(f => !f.generic)], q)
  const remoteMerged = dedupeMerge(generic, branded).slice(0, 20)

  if (!remoteFailed) cacheStore(q, remoteMerged)
  // Only truly "failed" if remote died AND we have nothing built-in to show
  return {
    results: dedupeMerge(localHits, remoteMerged).slice(0, 25),
    failed: remoteFailed && localHits.length === 0,
  }
}

// Macros for a chosen measure + quantity. Falls back to serving multiples
// when gram math isn't possible (custom foods without weights).
export function macrosFor(food, grams, qty = 1) {
  if (food.per100g && grams > 0) return scale(food.per100g, grams * qty)
  return {
    calories: Math.round((food.calories || 0) * qty),
    protein:  round1((food.protein || 0) * qty),
    carbs:    round1((food.carbs   || 0) * qty),
    fat:      round1((food.fat     || 0) * qty),
    fiber:    round1((food.fiber   || 0) * qty),
    sugar:    round1((food.sugar   || 0) * qty),
    sodium:   Math.round((food.sodium || 0) * qty),
  }
}
