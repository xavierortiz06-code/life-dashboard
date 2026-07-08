// Curated restaurant nutrition — values from each chain's official published
// nutrition data (2024–2025 US menus). Static, reviewable data in code — not
// AI-estimated at runtime. Builders let you assemble an order ingredient by
// ingredient with a live macro total, like the chains' own calculators.
//
// item tuple: [name, cal, protein, carbs, fat]

function items(rows) {
  return rows.map(([name, cal, prot, carbs, fat]) => ({ name, cal, prot, carbs, fat }))
}

export const RESTAURANTS = [
  {
    key: 'chipotle',
    name: 'Chipotle',
    match: /\bchipotle\b/i,
    builder: {
      title: 'Build your Chipotle order',
      sections: [
        { key: 'base', title: 'Base', mode: 'single', required: true, items: items([
          ['Burrito Bowl', 0, 0, 0, 0],
          ['Burrito (flour tortilla)', 320, 8, 50, 9],
          ['3 Crispy Corn Tacos', 210, 3, 30, 9],
          ['3 Soft Flour Tacos', 240, 6, 39, 7],
          ['Salad', 0, 0, 0, 0],
          ['Quesadilla (tortilla + cheese)', 630, 25, 51, 37],
        ])},
        { key: 'protein', title: 'Protein', mode: 'multi', items: items([
          ['Chicken', 180, 32, 0, 7],
          ['Steak', 150, 21, 1, 6],
          ['Barbacoa', 170, 24, 2, 7],
          ['Carnitas', 210, 23, 0, 12],
          ['Sofritas', 150, 8, 9, 10],
          ['Double Chicken', 360, 64, 0, 14],
          ['Double Steak', 300, 42, 2, 12],
        ])},
        { key: 'rice', title: 'Rice & Beans', mode: 'multi', items: items([
          ['White Rice', 210, 4, 40, 4],
          ['Brown Rice', 210, 4, 36, 6],
          ['Black Beans', 130, 8, 22, 1.5],
          ['Pinto Beans', 130, 8, 21, 1.5],
        ])},
        { key: 'toppings', title: 'Toppings & Salsas', mode: 'multi', items: items([
          ['Fajita Veggies', 20, 1, 5, 0],
          ['Fresh Tomato Salsa', 25, 1, 5, 0],
          ['Roasted Chili-Corn Salsa', 80, 3, 16, 1.5],
          ['Tomatillo Green-Chili Salsa', 15, 0, 4, 0],
          ['Tomatillo Red-Chili Salsa', 30, 0, 4, 0],
          ['Sour Cream', 110, 2, 2, 9],
          ['Monterey Jack Cheese', 110, 6, 1, 8],
          ['Queso Blanco', 120, 5, 4, 9],
          ['Guacamole', 230, 2, 8, 22],
          ['Romaine Lettuce', 5, 0, 1, 0],
        ])},
        { key: 'sides', title: 'Sides', mode: 'multi', items: items([
          ['Chips', 540, 7, 73, 25],
          ['Chips & Guac', 770, 9, 81, 47],
          ['Side Tortilla', 320, 8, 50, 9],
        ])},
      ],
    },
  },
  {
    key: 'subway',
    name: 'Subway',
    match: /\bsubway\b/i,
    builder: {
      title: 'Build your Subway 6-inch',
      sections: [
        { key: 'bread', title: 'Bread', mode: 'single', required: true, items: items([
          ['Italian (White)', 180, 6, 34, 2],
          ['Italian Herbs & Cheese', 220, 8, 36, 5],
          ['9-Grain Wheat', 180, 7, 34, 2],
          ['Multigrain Flatbread', 230, 8, 41, 5],
          ['No Bread (salad)', 0, 0, 0, 0],
        ])},
        { key: 'protein', title: 'Protein', mode: 'multi', items: items([
          ['Turkey Breast', 50, 9, 2, 0.5],
          ['Black Forest Ham', 60, 9, 3, 1],
          ['Roast Beef', 90, 13, 2, 2],
          ['Oven-Roasted Chicken', 90, 16, 2, 2],
          ['Rotisserie-Style Chicken', 100, 17, 1, 3],
          ['Steak', 110, 17, 3, 4],
          ['Tuna Salad', 250, 10, 1, 22],
          ['Meatballs & Marinara', 240, 12, 24, 11],
          ['Bacon (2 strips)', 80, 6, 0, 6],
        ])},
        { key: 'cheese', title: 'Cheese', mode: 'multi', items: items([
          ['American Cheese', 40, 2, 1, 3.5],
          ['Provolone', 50, 4, 1, 4],
          ['Pepper Jack', 50, 3, 1, 4],
          ['Shredded Mozzarella', 45, 3, 1, 3.5],
        ])},
        { key: 'veggies', title: 'Veggies', mode: 'multi', items: items([
          ['Lettuce', 3, 0, 1, 0],
          ['Tomatoes', 5, 0, 1, 0],
          ['Cucumbers', 3, 0, 1, 0],
          ['Green Peppers', 3, 0, 1, 0],
          ['Red Onions', 5, 0, 1, 0],
          ['Spinach', 3, 0, 0, 0],
          ['Pickles', 0, 0, 0, 0],
          ['Jalapeños', 3, 0, 1, 0],
          ['Black Olives', 5, 0, 0, 0.5],
          ['Banana Peppers', 0, 0, 0, 0],
          ['Avocado', 60, 1, 3, 5],
        ])},
        { key: 'sauce', title: 'Sauces', mode: 'multi', items: items([
          ['Mayonnaise', 100, 0, 0, 11],
          ['Light Mayo', 50, 0, 1, 5],
          ['Yellow Mustard', 10, 1, 1, 0],
          ['Chipotle Southwest', 100, 0, 1, 10],
          ['Sweet Onion', 40, 0, 9, 0],
          ['Ranch', 80, 0, 1, 8],
          ['Oil', 45, 0, 0, 5],
          ['Red Wine Vinegar', 0, 0, 0, 0],
          ['Honey Mustard', 30, 0, 7, 0],
        ])},
      ],
    },
  },
  {
    key: 'mcdonalds',
    name: "McDonald's",
    match: /mcdonald|mickey d|\bmcd\b/i,
    quickItems: items([
      ['Big Mac', 590, 25, 46, 34],
      ['Quarter Pounder with Cheese', 520, 30, 41, 26],
      ['Double Quarter Pounder with Cheese', 740, 48, 43, 42],
      ['McDouble', 400, 22, 33, 20],
      ['Cheeseburger', 300, 15, 32, 13],
      ['Hamburger', 250, 12, 31, 9],
      ['McChicken', 400, 14, 39, 21],
      ['Crispy Chicken Sandwich', 470, 27, 46, 20],
      ['Filet-O-Fish', 390, 16, 39, 19],
      ['10 pc Chicken McNuggets', 410, 23, 25, 24],
      ['6 pc Chicken McNuggets', 250, 14, 15, 15],
      ['20 pc Chicken McNuggets', 830, 46, 51, 49],
      ['Small French Fries', 230, 3, 31, 10],
      ['Medium French Fries', 320, 5, 43, 15],
      ['Large French Fries', 480, 7, 65, 23],
      ['Egg McMuffin', 310, 17, 30, 13],
      ['Sausage McMuffin with Egg', 480, 20, 30, 31],
      ['Sausage Burrito', 310, 13, 25, 17],
      ['Hash Browns', 140, 2, 17, 8],
      ['Hotcakes (3)', 580, 9, 102, 15],
      ['Fruit & Maple Oatmeal', 320, 6, 64, 4.5],
      ['McFlurry with M&Ms (regular)', 640, 13, 96, 21],
      ['Vanilla Cone', 200, 5, 33, 5],
      ['Apple Pie', 230, 2, 33, 11],
    ]),
  },
  {
    key: 'chickfila',
    name: 'Chick-fil-A',
    match: /chick.?fil.?a|chickfila/i,
    quickItems: items([
      ['Chicken Sandwich', 420, 28, 41, 18],
      ['Deluxe Chicken Sandwich', 490, 29, 44, 22],
      ['Spicy Chicken Sandwich', 450, 28, 45, 19],
      ['Spicy Deluxe Sandwich', 520, 30, 47, 23],
      ['Grilled Chicken Sandwich', 390, 28, 44, 12],
      ['Grilled Chicken Club', 520, 38, 45, 21],
      ['8 pc Nuggets', 250, 27, 11, 11],
      ['12 pc Nuggets', 380, 40, 16, 17],
      ['8 pc Grilled Nuggets', 130, 25, 1, 3],
      ['12 pc Grilled Nuggets', 200, 38, 2, 4.5],
      ['3 pc Chick-n-Strips', 310, 29, 16, 14],
      ['Medium Waffle Fries', 420, 5, 45, 24],
      ['Small Waffle Fries', 320, 4, 34, 19],
      ['Large Waffle Fries', 530, 6, 57, 30],
      ['Cobb Salad with Nuggets', 850, 40, 33, 61],
      ['Market Salad with Grilled Chicken', 550, 28, 41, 31],
      ['Spicy Southwest Salad', 690, 34, 39, 46],
      ['Chicken Biscuit', 460, 19, 45, 23],
      ['Chick-n-Minis (4 ct)', 360, 19, 40, 14],
      ['Hash Browns', 270, 3, 24, 18],
      ['Mac & Cheese (medium)', 450, 20, 29, 27],
      ['Chicken Noodle Soup (medium)', 255, 17, 35, 5],
      ['Frosted Lemonade', 320, 6, 65, 6],
      ['Chocolate Chunk Cookie', 370, 5, 49, 17],
    ]),
  },
  {
    key: 'fiveguys',
    name: 'Five Guys',
    match: /five guys/i,
    quickItems: items([
      ['Hamburger', 700, 39, 39, 43],
      ['Cheeseburger', 840, 47, 40, 55],
      ['Bacon Burger', 780, 43, 39, 50],
      ['Bacon Cheeseburger', 920, 51, 40, 62],
      ['Little Hamburger', 480, 23, 39, 26],
      ['Little Cheeseburger', 550, 27, 40, 32],
      ['Little Bacon Burger', 560, 27, 39, 33],
      ['Little Bacon Cheeseburger', 630, 31, 40, 39],
      ['Hot Dog', 520, 18, 40, 35],
      ['Cheese Dog', 590, 22, 41, 41],
      ['Bacon Cheese Dog', 670, 26, 41, 48],
      ['Grilled Cheese', 470, 11, 41, 26],
      ['Veggie Sandwich', 280, 8, 36, 15],
      ['Little Fries', 530, 8, 72, 23],
      ['Regular Fries', 950, 15, 131, 41],
      ['Large Fries', 1310, 20, 181, 57],
    ]),
  },
  {
    key: 'tacobell',
    name: 'Taco Bell',
    match: /taco bell/i,
    quickItems: items([
      ['Crunchy Taco', 170, 8, 13, 10],
      ['Crunchy Taco Supreme', 190, 8, 15, 11],
      ['Soft Taco', 180, 9, 17, 9],
      ['Soft Taco Supreme', 210, 10, 20, 10],
      ['Doritos Locos Taco', 170, 8, 13, 10],
      ['Bean Burrito', 350, 13, 54, 9],
      ['Burrito Supreme (Beef)', 390, 16, 49, 14],
      ['5-Layer Burrito', 490, 16, 62, 18],
      ['7-Layer Veggie Burrito', 440, 13, 63, 16],
      ['Crunchwrap Supreme', 530, 16, 71, 21],
      ['Chicken Quesadilla', 510, 27, 37, 27],
      ['Steak Quesadilla', 500, 25, 37, 27],
      ['Mexican Pizza', 550, 20, 45, 31],
      ['Cheesy Gordita Crunch', 500, 20, 41, 28],
      ['Chicken Power Bowl', 460, 26, 39, 22],
      ['Cinnamon Twists', 170, 1, 26, 6],
      ['Nacho Fries', 320, 4, 34, 18],
      ['Cheesy Bean & Rice Burrito', 420, 9, 55, 18],
    ]),
  },
  {
    key: 'starbucks',
    name: 'Starbucks',
    match: /starbucks/i,
    quickItems: items([
      ['Caffe Latte, Grande (2% milk)', 190, 13, 19, 7],
      ['Caffe Latte, Grande (oat milk)', 270, 8, 28, 13],
      ['Caffe Latte, Grande (nonfat)', 130, 13, 19, 0],
      ['Vanilla Latte, Grande (2%)', 250, 12, 37, 6],
      ['Caramel Macchiato, Grande (2%)', 250, 10, 35, 7],
      ['Cappuccino, Grande (2%)', 140, 9, 14, 5],
      ['Caffe Americano, Grande', 15, 1, 2, 0],
      ['Cold Brew, Grande (black)', 5, 0, 0, 0],
      ['Iced Brown Sugar Oatmilk Shaken Espresso, Grande', 120, 2, 18, 4],
      ['Pumpkin Spice Latte, Grande (2%)', 390, 14, 52, 14],
      ['White Chocolate Mocha, Grande (2%)', 430, 15, 54, 18],
      ['Mocha Frappuccino, Grande', 370, 5, 54, 15],
      ['Caramel Frappuccino, Grande', 380, 4, 54, 16],
      ['Bacon, Gouda & Egg Sandwich', 360, 17, 34, 18],
      ['Turkey Bacon & Egg White Sandwich', 230, 17, 28, 5],
      ['Double-Smoked Bacon Sandwich', 500, 20, 41, 29],
      ['Sausage, Cheddar & Egg Sandwich', 480, 15, 34, 31],
      ['Egg White & Roasted Red Pepper Egg Bites', 170, 12, 11, 8],
      ['Bacon & Gruyere Egg Bites', 300, 19, 9, 21],
      ['Butter Croissant', 260, 5, 32, 13],
      ['Chocolate Croissant', 300, 5, 34, 17],
      ['Banana Nut Bread', 420, 6, 74, 12],
      ['Blueberry Muffin', 360, 6, 50, 15],
      ['Cake Pop (Birthday)', 160, 2, 23, 7],
    ]),
  },
]

// Detect a restaurant from a search query. Returns the restaurant object or null.
export function detectRestaurant(query) {
  const q = (query || '').trim()
  if (q.length < 3) return null
  for (const r of RESTAURANTS) {
    if (r.match.test(q)) return r
  }
  return null
}

// Search quick items across all restaurants (e.g. "big mac" without typing
// "mcdonalds"). Returns normalized food objects ready for the logger.
export function searchRestaurantItems(query) {
  const q = (query || '').trim().toLowerCase()
  if (q.length < 3) return []
  const tokens = q.split(/\s+/).filter(t => t.length >= 2)
  if (!tokens.length) return []
  const out = []
  for (const r of RESTAURANTS) {
    const menu = r.quickItems || []
    for (const it of menu) {
      const hay = `${it.name} ${r.name}`.toLowerCase()
      if (tokens.every(t => hay.includes(t))) {
        out.push(quickItemToFood(r, it))
      }
    }
  }
  return out.slice(0, 6)
}

export function quickItemToFood(rest, it) {
  return {
    id: `rest-${rest.key}-${it.name.replace(/\W+/g, '-').toLowerCase()}`,
    source: 'restaurant',
    verified: true,
    generic: false,
    name: it.name,
    brand: rest.name,
    per100g: null,
    serving_size_g: 0,
    serving_size_label: '1 order',
    measures: [{ label: '1 order', grams: 0 }],
    calories: it.cal,
    protein: it.prot,
    carbs: it.carbs,
    fat: it.fat,
    fiber: 0, sugar: 0, sodium: 0,
  }
}

// Turn a builder selection into a single loggable food object.
export function buildOrderFood(rest, selections) {
  const chosen = []
  let cal = 0, prot = 0, carbs = 0, fat = 0
  for (const sec of rest.builder.sections) {
    for (const it of sec.items) {
      const count = selections[`${sec.key}|${it.name}`] || 0
      if (count > 0) {
        chosen.push(count > 1 ? `${it.name} ×${count}` : it.name)
        cal += it.cal * count; prot += it.prot * count
        carbs += it.carbs * count; fat += it.fat * count
      }
    }
  }
  if (!chosen.length) return null
  return {
    id: `rest-${rest.key}-custom-${Date.now()}`,
    source: 'restaurant',
    verified: true,
    generic: false,
    name: `${rest.name} — ${chosen.slice(0, 4).join(', ')}${chosen.length > 4 ? ` +${chosen.length - 4} more` : ''}`,
    brand: rest.name,
    per100g: null,
    serving_size_g: 0,
    serving_size_label: '1 order',
    measures: [{ label: '1 order', grams: 0 }],
    calories: Math.round(cal),
    protein: Math.round(prot * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
    fiber: 0, sugar: 0, sodium: 0,
  }
}
