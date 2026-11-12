/**
 * The practice stores' catalogue: about 180 everyday products across nine
 * aisles, priced in US dollars, built from a short list so prices and names
 * stay consistent. Every brand is made up.
 */

export type Shape = 'bag' | 'bottle' | 'box';

export interface Category {
  id: string;
  name: string;
  /** Food: DemoMart's pre-ticked add-on is "freshness protection". Otherwise "damage protection". */
  fresh: boolean;
  blurb: string;
}

export interface Product {
  sku: string;
  title: string;
  brand: string;
  name: string;
  size: string;
  /** US dollars. */
  price: number;
  mrp: number;
  cat: string;
  colour: string;
  label: string;
  shape: Shape;
  rating: string;
  ratings: number;
}

type Item = [name: string, size: string, price: number, colour: string, label: string, shape?: Shape];

interface Aisle extends Category {
  brands: [string, string, string];
  items: Item[];
}

const AISLES: Aisle[] = [
  {
    id: 'pantry',
    name: 'Pantry',
    fresh: true,
    blurb: 'Kitchen staples, sourced from growers we know and packed fresh.',
    brands: ['Golden Valley', 'Harvest Lane', 'Old Mill'],
    items: [
      ['Extra Virgin Olive Oil', '1 L', 12.99, '#6b8e23', 'OLIVE OIL', 'bottle'],
      ['Spaghetti', '1 lb', 1.89, '#d9a441', 'SPAGHETTI', 'box'],
      ['Basmati Rice', '2 lb', 4.49, '#b33a3a', 'BASMATI'],
      ['Rolled Oats', '42 oz', 5.29, '#5b7f3a', 'OATS', 'box'],
      ['Peanut Butter', '16 oz', 3.79, '#a0632b', 'PEANUT', 'bottle'],
      ['Wildflower Honey', '12 oz', 6.99, '#e0a106', 'HONEY', 'bottle'],
      ['Marinara Sauce', '24 oz', 3.49, '#c0392b', 'MARINARA', 'bottle'],
      ['All-Purpose Flour', '5 lb', 3.99, '#d8c9a8', 'FLOUR'],
      ['Granola', '12 oz', 4.99, '#b07a3b', 'GRANOLA', 'box'],
      ['Black Beans', '15 oz', 1.29, '#3b3b3b', 'BLACK BEANS', 'box'],
    ],
  },
  {
    id: 'dairy',
    name: 'Dairy & Eggs',
    fresh: true,
    blurb: 'From family farms, kept cold from the farm to your door.',
    brands: ['Pasture Pure', 'Meadow Valley', 'Clover Hill'],
    items: [
      ['Whole Milk', '1 gal', 4.29, '#3a78b3', 'MILK', 'box'],
      ['Greek Yogurt', '32 oz', 5.99, '#5aa0d6', 'YOGURT', 'box'],
      ['Salted Butter', '1 lb', 4.79, '#e5c34a', 'BUTTER', 'box'],
      ['Aged Cheddar', '8 oz', 4.49, '#f0b429', 'CHEDDAR', 'box'],
      ['Large Eggs', '12 ct', 3.99, '#c98a4a', 'EGGS', 'box'],
      ['Oat Milk', '64 oz', 4.49, '#a38b6d', 'OAT MILK', 'box'],
      ['Cream Cheese', '8 oz', 2.79, '#9fc5e8', 'CREAM CHEESE', 'box'],
      ['Sourdough Bread', '24 oz', 5.49, '#8a5a2b', 'SOURDOUGH'],
    ],
  },
  {
    id: 'produce',
    name: 'Fruit & Veg',
    fresh: true,
    blurb: 'Picked this week and checked by hand before it is packed.',
    brands: ['FreshPick', 'Farm Daily', 'GreenBasket'],
    items: [
      ['Bananas', '2 lb', 1.49, '#e6c229', 'BANANAS'],
      ['Gala Apples', '3 lb', 4.99, '#c0392b', 'APPLES'],
      ['Avocados', '4 ct', 5.49, '#4f7a28', 'AVOCADOS'],
      ['Strawberries', '1 lb', 3.99, '#d63447', 'STRAWBERRY', 'box'],
      ['Baby Spinach', '5 oz', 3.49, '#3f8a3a', 'SPINACH', 'box'],
      ['Sweet Potatoes', '3 lb', 3.99, '#c1652f', 'SWEET POTATO'],
      ['Blueberries', '1 pint', 4.49, '#3b4c9b', 'BLUEBERRY', 'box'],
    ],
  },
  {
    id: 'snacks',
    name: 'Snacks',
    fresh: true,
    blurb: 'Crunchy, fresh and sealed for the long evening ahead.',
    brands: ['Crunchy Co', 'Munchwell', 'Tasty Bites'],
    items: [
      ['Sea Salt Chips', '8 oz', 3.99, '#f2c230', 'CHIPS'],
      ['Mixed Nuts', '10 oz', 7.99, '#c0572b', 'MIXED NUTS'],
      ['Dark Chocolate 70%', '3.5 oz', 2.99, '#4a2b1d', 'DARK 70%', 'box'],
      ['Pretzels', '16 oz', 3.49, '#a8763e', 'PRETZELS'],
      ['Granola Bars', '6 ct', 4.29, '#b5893f', 'BARS', 'box'],
      ['Popcorn', '6 ct', 3.99, '#e8c547', 'POPCORN', 'box'],
      ['Trail Mix', '26 oz', 9.99, '#8b5a2b', 'TRAIL MIX'],
    ],
  },
  {
    id: 'drinks',
    name: 'Coffee, Tea & Drinks',
    fresh: true,
    blurb: 'Roasted and packed in small batches to keep the flavour in.',
    brands: ['Bluebird Roasters', 'Leafline', 'Brewhouse'],
    items: [
      ['Whole Bean Coffee', '12 oz', 11.49, '#4b2e1e', 'WHOLE BEAN'],
      ['Ground Coffee', '12 oz', 9.99, '#6b3e26', 'GROUND'],
      ['Green Tea', '20 bags', 4.49, '#4f8a3a', 'GREEN TEA', 'box'],
      ['Earl Grey Tea', '20 bags', 4.49, '#3c3f6b', 'EARL GREY', 'box'],
      ['Sparkling Water', '12 pk', 5.99, '#3fb6d6', 'SPARKLING', 'box'],
      ['Orange Juice', '52 oz', 4.99, '#f29f05', 'ORANGE', 'bottle'],
    ],
  },
  {
    id: 'household',
    name: 'Household',
    fresh: false,
    blurb: 'Tough on grime, gentle on hands and surfaces.',
    brands: ['Sparkle', 'CleanHome', 'Brightway'],
    items: [
      ['Laundry Detergent', '92 oz', 12.99, '#2a6db0', 'DETERGENT', 'bottle'],
      ['Dish Soap', '19 oz', 3.49, '#3aa35b', 'DISH SOAP', 'bottle'],
      ['Multi-Surface Cleaner', '32 oz', 4.29, '#7b4fb3', 'CLEANER', 'bottle'],
      ['Paper Towels', '6 rolls', 9.99, '#5f8fc4', 'PAPER TOWELS', 'box'],
      ['Trash Bags', '40 ct', 8.99, '#333d47', 'TRASH BAGS', 'box'],
      ['Sponges', '6 ct', 3.99, '#e8b20e', 'SPONGES', 'box'],
    ],
  },
  {
    id: 'personal',
    name: 'Personal Care',
    fresh: false,
    blurb: 'Dermatologist tested and free from harsh additives.',
    brands: ['Herbal Leaf', 'Glow & Co', 'PureSkin'],
    items: [
      ['Body Wash', '18 oz', 6.99, '#2c6e9b', 'BODY WASH', 'bottle'],
      ['Shampoo', '12 oz', 7.49, '#2e9b6a', 'SHAMPOO', 'bottle'],
      ['Toothpaste', '4.8 oz', 3.29, '#1f7fbf', 'TOOTHPASTE', 'box'],
      ['Face Moisturizer', '1.7 oz', 12.99, '#d6457a', 'MOISTURIZER', 'bottle'],
      ['Hand Soap', '12 oz', 3.49, '#7cc4a4', 'HAND SOAP', 'bottle'],
      ['Deodorant', '2.6 oz', 5.99, '#4c5d8a', 'DEODORANT', 'box'],
    ],
  },
  {
    id: 'baby',
    name: 'Baby',
    fresh: false,
    blurb: 'Soft, safe and made for sensitive skin.',
    brands: ['TinyToes', 'Little Sprout', 'Cuddle Care'],
    items: [
      ['Diapers Size 3', '84 ct', 24.99, '#5a9bd5', 'DIAPERS', 'box'],
      ['Baby Wipes', '216 ct', 11.99, '#7cc4a4', 'WIPES', 'box'],
      ['Baby Lotion', '13 oz', 6.49, '#f2a7b8', 'LOTION', 'bottle'],
      ['Oatmeal Cereal', '8 oz', 3.99, '#e7b75f', 'CEREAL', 'box'],
    ],
  },
  {
    id: 'pets',
    name: 'Pets',
    fresh: false,
    blurb: 'Vet-approved food and care for every furry friend.',
    brands: ['Happy Paws', 'Whisker', 'TrailDog'],
    items: [
      ['Dry Dog Food', '15 lb', 29.99, '#a0522d', 'DOG FOOD'],
      ['Cat Food Pouches', '12 ct', 9.49, '#d97b29', 'CAT FOOD', 'box'],
      ['Cat Litter', '20 lb', 14.99, '#7f8c8d', 'LITTER'],
      ['Dog Treats', '16 oz', 7.99, '#b5651d', 'TREATS'],
    ],
  },
];

export const CATEGORIES: Category[] = AISLES.map(({ id, name, fresh, blurb }) => ({ id, name, fresh, blurb }));

/** Brand price factors: the first brand is the house reference price. */
const FACTOR = [1, 1.09, 0.94];
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Prices end in .x9, the way shelves print them. */
const shelf = (n: number) => Math.max(0.99, Math.round(n * 10) / 10 - 0.01);
const cents = (n: number) => Math.round(n * 100) / 100;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const DEFAULT_SKU = 'DEMO-COFFEE-12OZ';
const FLAGSHIP = 'Bluebird Roasters Whole Bean Coffee 12 oz';

export const PRODUCTS: Product[] = AISLES.flatMap((a) =>
  a.items.flatMap(([name, size, base, colour, label, shape = 'bag']) =>
    a.brands.map((brand, bi) => {
      const title = `${brand} ${name} ${size}`;
      const h = hash(title);
      const price = bi === 0 ? base : cents(shelf(base * FACTOR[bi]!));
      // A "was" price 10-40% above, the way store pages print it.
      const mrp = cents(shelf((price * (110 + (h % 31))) / 100));
      const sku = title === FLAGSHIP ? DEFAULT_SKU : `${a.id.toUpperCase().slice(0, 3)}-${slug(title)}`;
      return { sku, title, brand, name, size, price, mrp: sku === DEFAULT_SKU ? 14.99 : mrp, cat: a.id, colour, label, shape, rating: (3.8 + (h % 10) / 10).toFixed(1), ratings: 120 + (h % 4800) };
    }),
  ),
);

const BY_SKU = new Map(PRODUCTS.map((p) => [p.sku, p]));

export function productBySku(sku: string | null | undefined): Product {
  return (sku && BY_SKU.get(sku)) || BY_SKU.get(DEFAULT_SKU)!;
}

export function categoryOf(p: Product): Category {
  return CATEGORIES.find((c) => c.id === p.cat)!;
}

/** DemoMart's pre-ticked add-on scales with the basket, like the real thing. */
export function protectionPrice(p: Product): number {
  return p.price < 5 ? 0.99 : p.price < 15 ? 1.99 : 3.99;
}

export function protectionName(p: Product): string {
  return categoryOf(p).fresh ? 'freshness protection' : 'damage protection';
}

export function searchProducts(q: string, cat?: string | null): Product[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return PRODUCTS.filter((p) => (!cat || p.cat === cat) && words.every((w) => `${p.title} ${categoryOf(p).name}`.toLowerCase().includes(w)));
}
