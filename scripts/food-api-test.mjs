// Accuracy test for the food data layer.
// Run: node scripts/food-api-test.mjs
// Asserts macros within ±10% of USDA reference values (with a small absolute
// floor so trace amounts like 0.2g fat don't fail on rounding).
import { searchFoods, lookupBarcode } from '../src/lib/foodApi.js'

// Reference values per 100g from USDA FoodData Central.
// `match` picks the intended result out of the merged search list.
const CASES = [
  { q: 'chicken breast raw',  match: /chicken.*breast/i,              kcal: 106, prot: 22.5, fat: 1.9,  carbs: 0    },
  { q: 'egg whole raw',       match: /egg, whole, raw/i,              kcal: 143, prot: 12.4, fat: 9.6,  carbs: 1.0  },
  { q: 'banana raw',          match: /bananas?,.*raw/i,               kcal: 93,  prot: 1.0,  fat: 0.3,  carbs: 22   },
  { q: 'rice white long-grain cooked', match: /rice, white, long-grain, regular.*cooked/i, kcal: 130, prot: 2.7, fat: 0.3, carbs: 28.2 },
  { q: 'oats regular cooked water', match: /cereals, oats.*cooked with water/i, kcal: 71, prot: 2.5, fat: 1.5, carbs: 12 },
  { q: 'whole milk',          match: /milk, whole/i,                  kcal: 61,  prot: 3.2,  fat: 3.3,  carbs: 4.8  },
  { q: 'peanut butter smooth', match: /peanut butter, smooth(?!.*reduced)/i, kcal: 593, prot: 22.5, fat: 51, carbs: 22.5 },
  { q: 'ground beef 80% raw', match: /beef, ground, 80/i,             kcal: 254, prot: 17.2, fat: 20,   carbs: 0    },
  { q: 'apple raw with skin', match: /apples?, raw, with skin/i,      kcal: 52,  prot: 0.3,  fat: 0.2,  carbs: 13.8 },
  { q: 'salmon atlantic farmed raw', match: /salmon, atlantic, farmed, raw/i, kcal: 208, prot: 20.4, fat: 13.4, carbs: 0 },
  { q: 'bread white commercially prepared', match: /bread, white, commercially prepared(?!.*toasted)/i, kcal: 267, prot: 8.0, fat: 3.3, carbs: 49.5 },
]

const TOL_PCT = 0.10
function within(actual, expected, absFloor) {
  return Math.abs(actual - expected) <= Math.max(expected * TOL_PCT, absFloor)
}

let pass = 0, fail = 0
const sleep = ms => new Promise(r => setTimeout(r, ms))

for (const c of CASES) {
  try {
    const { results } = await searchFoods(c.q)
    const usda = results.filter(r => r.source === 'usda')
    const food = usda.find(r => c.match.test(r.name)) || usda.find(r => r.generic) || usda[0]
    if (!food) { console.log(`FAIL  ${c.q}: no USDA result`); fail++; continue }
    const g = food.per100g
    const checks = [
      ['kcal',  g.cal,   c.kcal,  10 ],
      ['prot',  g.prot,  c.prot,  1.0],
      ['fat',   g.fat,   c.fat,   1.0],
      ['carbs', g.carbs, c.carbs, 1.5],
    ]
    const bad = checks.filter(([, actual, expected, floor]) => !within(actual, expected, floor))
    if (bad.length === 0) {
      console.log(`PASS  ${c.q.padEnd(36)} → "${food.name}"  ${g.cal}kcal P${g.prot} F${g.fat} C${g.carbs}`)
      pass++
    } else {
      console.log(`FAIL  ${c.q} → "${food.name}"  ` + bad.map(([k, a, e]) => `${k}=${a} (want ~${e})`).join(', '))
      fail++
    }
  } catch (err) {
    console.log(`FAIL  ${c.q}: ${err.message}`)
    fail++
  }
  await sleep(400) // be polite to the APIs (DEMO_KEY rate limits)
}

// Barcode: Coca-Cola 330ml can
try {
  const coke = await lookupBarcode('5449000000996')
  if (!coke) throw new Error('product not found')
  const m = { cal: coke.per100g.cal * 3.3, carbs: coke.per100g.carbs * 3.3, prot: coke.per100g.prot, fat: coke.per100g.fat }
  const ok = within(m.cal, 139, 12) && within(m.carbs, 35, 3) && m.prot < 1 && m.fat < 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  coca-cola barcode (330ml) → "${coke.name}"  ${Math.round(m.cal)}kcal C${Math.round(m.carbs)} P${m.prot} F${m.fat}`)
  ok ? pass++ : fail++
} catch (err) {
  console.log(`FAIL  coca-cola barcode: ${err.message}`)
  fail++
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
