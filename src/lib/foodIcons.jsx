// Food category detection + matching SVG line icons (site style: 1.75 stroke,
// round caps, no fills). No emojis — these match the rest of the dashboard.

const CATEGORY_RULES = [
  ['restaurant', /chipotle|subway|mcdonald|chick.?fil.?a|five guys|taco bell|starbucks|wendy|burger king|panera|domino|pizza hut|kfc|popeyes|dunkin/],
  ['pizza',      /pizza|calzone/],
  ['burger',     /burger|cheeseburger|whopper|big mac|mcdouble|patty/],
  ['egg',        /\begg|omelet|frittata/],
  ['fish',       /salmon|tuna|shrimp|fish|cod|tilapia|sardine|anchov|crab|lobster|scallop|halibut|trout/],
  ['meat',       /chicken|beef|steak|turkey|pork|bacon|ham\b|sausage|lamb|meatball|carnitas|barbacoa|brisket|ribs|jerky|salami|pepperoni|prosciutto|nugget/],
  ['dairy',      /milk|yogurt|yoghurt|cheese|cottage|kefir|cream\b|whey|casein|butter/],
  ['fruit',      /apple|banana|orange|berr(y|ies)|strawberr|blueberr|raspberr|grape|mango|pineapple|peach|pear|plum|melon|watermelon|kiwi|cherry|avocado|fruit|lemon|lime|apricot|fig|date\b|pomegranate/],
  ['vegetable',  /broccoli|spinach|lettuce|kale|carrot|tomato|cucumber|pepper\b|onion|garlic|zucchini|squash|cauliflower|asparagus|celery|cabbage|salad|greens|veggie|vegetable|mushroom|pea\b|peas\b|corn\b|beet/],
  ['grain',      /bread|rice|oat|pasta|noodle|quinoa|cereal|tortilla|bagel|wrap\b|cracker|granola|barley|couscous|toast|pancake|waffle|muffin|croissant|biscuit|roll\b|bun\b|grain/],
  ['legume',     /bean|lentil|chickpea|hummus|tofu|tempeh|edamame|soy\b/],
  ['nuts',       /almond|peanut|cashew|walnut|pecan|pistachio|macadamia|nut butter|nuts?\b|seed|tahini/],
  ['sweet',      /chocolate|candy|cookie|cake|ice cream|donut|doughnut|brownie|pie\b|pastry|sugar|honey|syrup|dessert|pudding|gummy|sweet/],
  ['drink',      /coffee|latte|espresso|tea\b|soda|cola|juice|smoothie|shake|water|drink|beverage|beer|wine|kombucha|lemonade|energy/],
  ['snack',      /chip|pretzel|popcorn|bar\b|jerky|snack/],
]

export function foodCategory(food) {
  const hay = `${food.name || ''} ${food.brand || ''}`.toLowerCase()
  for (const [cat, re] of CATEGORY_RULES) {
    if (re.test(hay)) return cat
  }
  return 'generic'
}

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }

const PATHS = {
  meat: (
    // drumstick
    <><path d="M15.5 4.5a4.5 4.5 0 0 1 0 9c-.6 0-1.2-.1-1.7-.3l-4.6 4.6a2.3 2.3 0 1 1-3-3l4.6-4.6a4.5 4.5 0 0 1 4.7-5.7z" /><circle cx="5.5" cy="18.5" r="0.4" /></>
  ),
  fish: (
    <><path d="M6.5 12c3-4.5 8-5.5 11.5-5.5 0 0 .5 3-1 5.5 1.5 2.5 1 5.5 1 5.5-3.5 0-8.5-1-11.5-5.5z" /><path d="M6.5 12 2.5 8.5v7L6.5 12z" /><circle cx="14.5" cy="10.7" r="0.4" /></>
  ),
  egg: (
    <path d="M12 3.5c3.5 0 6.5 5.5 6.5 10a6.5 6.5 0 0 1-13 0c0-4.5 3-10 6.5-10z" />
  ),
  dairy: (
    <><path d="M8 2.5h8M9 2.5v3.2L6.5 10v10a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5V10L15 5.7V2.5" /><path d="M6.5 13.5h11" /></>
  ),
  fruit: (
    <><path d="M12 8c-3.5-2-7 .5-7 5 0 4 2.5 8 5 8 .8 0 1.4-.4 2-.4s1.2.4 2 .4c2.5 0 5-4 5-8 0-4.5-3.5-7-7-5z" /><path d="M12 8c0-2.5 1.5-4.5 3.5-5" /></>
  ),
  vegetable: (
    <><path d="M9 8.5c-3 1-5 4-4.5 7.5.4 3 2.5 5 5.5 4.5 5-1 9-7.5 10-13.5-6 .5-9 .5-11 1.5z" /><path d="M4.5 19.5C8 15 12 12 15.5 10" /></>
  ),
  grain: (
    <><path d="M4.5 14.5c0-5 3.5-9 7.5-9s7.5 4 7.5 9c0 2.5-3.4 4-7.5 4s-7.5-1.5-7.5-4z" /><path d="M8.5 8.5v5M12 7.5v6M15.5 8.5v5" /></>
  ),
  legume: (
    <><path d="M7.5 4.5c-2.5 1.5-3.5 5-2 8.5s5 5.5 8 6.5c3 1 5.5-.5 6-3s-1.5-4-4-5-4-1-5.5-3-1-4.5-2.5-4z" /><circle cx="9" cy="9.5" r="0.4" /><circle cx="12.5" cy="13" r="0.4" /><circle cx="16" cy="15.5" r="0.4" /></>
  ),
  nuts: (
    <><path d="M12 3.5c-1 2-5.5 2.5-5.5 7 0 3.5 2.5 6.5 5.5 10 3-3.5 5.5-6.5 5.5-10 0-4.5-4.5-5-5.5-7z" /><path d="M8 9.5c1.5 1 6.5 1 8 0" /></>
  ),
  sweet: (
    <><path d="M7 8.5 12 3l5 5.5" /><path d="M6 8.5h12l-1.5 12a1.5 1.5 0 0 1-1.5 1.3h-6a1.5 1.5 0 0 1-1.5-1.3L6 8.5z" /><path d="M9.5 12.5c.8.8 1.7.8 2.5 0s1.7-.8 2.5 0" /></>
  ),
  drink: (
    <><path d="M6 3.5h12l-1.5 16a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8L6 3.5z" /><path d="M6.7 9.5h10.6" /><path d="M12 3.5 14.5 1" /></>
  ),
  snack: (
    <><path d="M12 3 4 20h16L12 3z" /><circle cx="11" cy="12" r="0.4" /><circle cx="13.5" cy="15.5" r="0.4" /><circle cx="10" cy="16.5" r="0.4" /></>
  ),
  pizza: (
    <><path d="M3.5 6C8 3.5 16 3.5 20.5 6L12 21.5 3.5 6z" /><path d="M4.5 8.2c4.5-2 10.5-2 15-0" /><circle cx="10" cy="11" r="0.5" /><circle cx="14" cy="13.5" r="0.5" /><circle cx="11.5" cy="16" r="0.5" /></>
  ),
  burger: (
    <><path d="M4.5 9.5a7.5 5.5 0 0 1 15 0z" /><path d="M4.5 12.5h15" /><path d="M4 15.5c1.5-1 3 1 4.5 0s3 1 4.5 0 3 1 4.5 0 2 .5 2.5 0" /><path d="M4.5 18.5a7.5 3.5 0 0 0 15 0v-.5h-15v.5z" /></>
  ),
  restaurant: (
    <><path d="M5 3.5v6a2 2 0 0 0 2 2v9M9 3.5v6a2 2 0 0 1-2 2M7 3.5v4" /><path d="M17 3.5c-1.5 1-2.5 3-2.5 6 0 2 .8 2.5 2.5 2.5v8.5" /><path d="M17 3.5c1 0 1.5.8 1.5 2.5v6" /></>
  ),
  generic: (
    <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M7.5 12h9" opacity="0" /><path d="M8.5 10c.5-1.8 1.8-3 3.5-3" /></>
  ),
}

const CAT_COLORS = {
  meat: '#f97316', fish: '#38bdf8', egg: '#fbbf24', dairy: '#93c5fd',
  fruit: '#fb7185', vegetable: '#4ade80', grain: '#d4a373', legume: '#a3e635',
  nuts: '#d4a373', sweet: '#f472b6', drink: '#22d3ee', snack: '#facc15',
  pizza: '#fb923c', burger: '#f97316', restaurant: '#a78bfa', generic: '#94a3b8',
}

export function FoodIcon({ food, size = 30, category }) {
  const cat = category || foodCategory(food || {})
  const color = CAT_COLORS[cat] || CAT_COLORS.generic
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3, flexShrink: 0,
      background: `${color}14`,
      border: `1px solid ${color}30`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color,
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" {...S}>
        {PATHS[cat] || PATHS.generic}
      </svg>
    </div>
  )
}
