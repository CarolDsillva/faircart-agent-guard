/**
 * The practice stores' catalogue: about 180 everyday products across nine
 * aisles, built from a short list so prices and names stay consistent. Every
 * brand is made up. The Sunrise Chakki Atta 5 kg keeps its original SKU and
 * price, so earlier runs and tests still line up.
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
    id: 'staples',
    name: 'Atta, Rice & Dal',
    fresh: true,
    blurb: 'Stone-ground and sorted in small batches, packed fresh every week.',
    brands: ['Sunrise', 'Golden Harvest', 'Annapurna Farms'],
    items: [
      ['Chakki Atta', '5 kg', 289, '#c8893e', 'ATTA'],
      ['Chakki Atta', '10 kg', 549, '#b97a33', 'ATTA'],
      ['Basmati Rice', '5 kg', 649, '#b33a3a', 'BASMATI'],
      ['Sona Masoori Rice', '5 kg', 399, '#7a8f3a', 'SONA MASOORI'],
      ['Toor Dal', '1 kg', 168, '#d6a21e', 'TOOR DAL'],
      ['Moong Dal', '1 kg', 142, '#6f9a3a', 'MOONG DAL'],
      ['Chana Dal', '1 kg', 98, '#c99a2e', 'CHANA DAL'],
      ['Besan', '1 kg', 99, '#e3b23c', 'BESAN'],
      ['Poha', '500 g', 45, '#d9c28a', 'POHA'],
      ['Sooji Rava', '1 kg', 62, '#e0c48c', 'SOOJI'],
    ],
  },
  {
    id: 'dairy',
    name: 'Dairy & Bread',
    fresh: true,
    blurb: 'From local dairies, kept cold from the farm to your door.',
    brands: ['Pasture Pure', 'Doodhwala', 'Meadow Valley'],
    items: [
      ['Toned Milk', '1 L', 56, '#3a78b3', 'MILK', 'box'],
      ['Fresh Paneer', '200 g', 90, '#e8e2cf', 'PANEER', 'box'],
      ['Thick Curd', '400 g', 45, '#5aa0d6', 'CURD', 'box'],
      ['Salted Butter', '100 g', 58, '#e5c34a', 'BUTTER', 'box'],
      ['Cheese Slices', '200 g', 145, '#f0b429', 'CHEESE', 'box'],
      ['Cow Ghee', '1 L', 649, '#d9a51c', 'GHEE', 'bottle'],
      ['Brown Bread', '400 g', 50, '#8a5a2b', 'BROWN BREAD'],
      ['Farm Eggs', '12 pcs', 89, '#c98a4a', 'EGGS', 'box'],
    ],
  },
  {
    id: 'produce',
    name: 'Fruits & Vegetables',
    fresh: true,
    blurb: 'Picked this morning and checked by hand before it is packed.',
    brands: ['FreshPick', 'Farm Daily', 'GreenBasket'],
    items: [
      ['Robusta Bananas', '1 dozen', 59, '#e6c229', 'BANANAS'],
      ['Shimla Apples', '1 kg', 199, '#c0392b', 'APPLES'],
      ['Onions', '1 kg', 39, '#9b4f6b', 'ONIONS'],
      ['Tomatoes', '1 kg', 32, '#d64532', 'TOMATOES'],
      ['Potatoes', '1 kg', 35, '#b08a52', 'POTATOES'],
      ['Spinach', '250 g', 25, '#3f8a3a', 'SPINACH'],
      ['Pomegranate', '500 g', 129, '#a3243b', 'POMEGRANATE'],
    ],
  },
  {
    id: 'snacks',
    name: 'Snacks',
    fresh: true,
    blurb: 'Crunchy, fresh and sealed for the long evening ahead.',
    brands: ['Crunchy Co', 'Munchwell', 'Tasty Bites'],
    items: [
      ['Salted Potato Chips', '90 g', 20, '#f2c230', 'CHIPS'],
      ['Masala Peanuts', '200 g', 55, '#c0572b', 'PEANUTS'],
      ['Digestive Biscuits', '250 g', 45, '#a8763e', 'DIGESTIVE', 'box'],
      ['Dark Chocolate', '100 g', 99, '#4a2b1d', 'DARK 70%', 'box'],
      ['Instant Noodles', '4 pack', 56, '#e2492f', 'NOODLES'],
      ['Methi Khakhra', '200 g', 70, '#6b8e23', 'KHAKHRA', 'box'],
      ['Trail Mix', '200 g', 199, '#8b5a2b', 'TRAIL MIX'],
    ],
  },
  {
    id: 'masala',
    name: 'Masala & Oil',
    fresh: true,
    blurb: 'Whole spices roasted and ground in small lots for full aroma.',
    brands: ['Kanak', 'Spice Route', 'Masala Ghar'],
    items: [
      ['Sunflower Oil', '1 L', 155, '#e8b20e', 'SUNFLOWER', 'bottle'],
      ['Mustard Oil', '1 L', 175, '#c99a06', 'MUSTARD', 'bottle'],
      ['Garam Masala', '100 g', 72, '#7b3f1d', 'GARAM MASALA', 'box'],
      ['Turmeric Powder', '200 g', 48, '#e1a400', 'HALDI', 'box'],
      ['Red Chilli Powder', '200 g', 64, '#b8261b', 'CHILLI', 'box'],
      ['Iodised Salt', '1 kg', 28, '#2d6fb5', 'SALT'],
      ['Sugar', '1 kg', 48, '#cfd8dc', 'SUGAR'],
    ],
  },
  {
    id: 'drinks',
    name: 'Tea, Coffee & Drinks',
    fresh: true,
    blurb: 'Sourced from estates we visit, packed to keep the flavour in.',
    brands: ['Leafline', 'Monsoon Estates', 'Brewhouse'],
    items: [
      ['Assam Tea', '500 g', 245, '#7a2e1f', 'ASSAM TEA', 'box'],
      ['Filter Coffee', '500 g', 320, '#4b2e1e', 'FILTER COFFEE'],
      ['Green Tea', '25 bags', 165, '#4f8a3a', 'GREEN TEA', 'box'],
      ['Mango Drink', '1.2 L', 72, '#f29f05', 'MANGO', 'bottle'],
      ['Lemon Soda', '750 ml', 40, '#9cc93a', 'SODA', 'bottle'],
      ['Hot Chocolate', '200 g', 210, '#5b3220', 'COCOA', 'box'],
    ],
  },
  {
    id: 'cleaning',
    name: 'Cleaning',
    fresh: false,
    blurb: 'Tough on grime, gentle on hands and surfaces.',
    brands: ['Sparkle', 'CleanHome', 'Shudh'],
    items: [
      ['Detergent Powder', '1 kg', 125, '#2a6db0', 'DETERGENT', 'box'],
      ['Dishwash Liquid', '500 ml', 99, '#3aa35b', 'DISHWASH', 'bottle'],
      ['Floor Cleaner', '1 L', 189, '#7b4fb3', 'FLOOR', 'bottle'],
      ['Toilet Cleaner', '500 ml', 92, '#1f7fbf', 'TOILET', 'bottle'],
      ['Garbage Bags', '30 pcs', 99, '#333d47', 'BAGS', 'box'],
      ['Glass Cleaner', '500 ml', 105, '#3fb6d6', 'GLASS', 'bottle'],
    ],
  },
  {
    id: 'personal',
    name: 'Personal Care',
    fresh: false,
    blurb: 'Dermatologist tested and free from harsh additives.',
    brands: ['Herbal Leaf', 'Glow & Co', 'PureSkin'],
    items: [
      ['Sandal Bath Soap', '4 x 100 g', 140, '#c98b4e', 'SANDAL', 'box'],
      ['Anti-Dandruff Shampoo', '340 ml', 245, '#2c6e9b', 'SHAMPOO', 'bottle'],
      ['Herbal Toothpaste', '150 g', 95, '#2e9b6a', 'TOOTHPASTE', 'box'],
      ['Neem Face Wash', '100 ml', 175, '#4c9a2a', 'FACE WASH', 'bottle'],
      ['Hand Wash', '250 ml', 99, '#d6457a', 'HAND WASH', 'bottle'],
      ['Coconut Hair Oil', '300 ml', 140, '#2f8f83', 'COCONUT OIL', 'bottle'],
    ],
  },
  {
    id: 'baby',
    name: 'Baby Care',
    fresh: false,
    blurb: 'Soft, safe and made for sensitive skin.',
    brands: ['TinyToes', 'Little Sprout', 'Cuddle Care'],
    items: [
      ['Diaper Pants M', '42 pcs', 699, '#5a9bd5', 'DIAPERS', 'box'],
      ['Baby Wipes', '72 pcs', 199, '#7cc4a4', 'WIPES', 'box'],
      ['Baby Lotion', '200 ml', 249, '#f2a7b8', 'LOTION', 'bottle'],
      ['Rice Cereal', '300 g', 289, '#e7b75f', 'CEREAL', 'box'],
    ],
  },
];

export const CATEGORIES: Category[] = AISLES.map(({ id, name, fresh, blurb }) => ({ id, name, fresh, blurb }));

/** Brand price factors: the first brand is the house reference price. */
const FACTOR = [1, 1.09, 0.94];
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const PRODUCTS: Product[] = AISLES.flatMap((a) =>
  a.items.flatMap(([name, size, base, colour, label, shape = 'bag']) =>
    a.brands.map((brand, bi) => {
      const title = `${brand} ${name} ${size}`;
      const h = hash(title);
      const price = bi === 0 ? base : Math.max(10, Math.round(base * FACTOR[bi]!));
      // MRP sits 10-45% above the price, the way grocery apps print it.
      const mrp = Math.round((price * (110 + (h % 36))) / 100);
      const sku = title === 'Sunrise Chakki Atta 5 kg' ? 'DEMO-ATTA-5KG' : `${a.id.toUpperCase().slice(0, 3)}-${slug(`${brand} ${name} ${size}`)}`;
      return {
        sku,
        title,
        brand,
        name,
        size,
        price,
        mrp: sku === 'DEMO-ATTA-5KG' ? 420 : mrp,
        cat: a.id,
        colour,
        label,
        shape,
        rating: (3.8 + (h % 10) / 10).toFixed(1),
        ratings: 120 + (h % 4800),
      };
    }),
  ),
);

const BY_SKU = new Map(PRODUCTS.map((p) => [p.sku, p]));

export const DEFAULT_SKU = 'DEMO-ATTA-5KG';

export function productBySku(sku: string | null | undefined): Product {
  return (sku && BY_SKU.get(sku)) || BY_SKU.get(DEFAULT_SKU)!;
}

export function categoryOf(p: Product): Category {
  return CATEGORIES.find((c) => c.id === p.cat)!;
}

/** DemoMart's pre-ticked add-on scales with the basket, like the real thing. */
export function protectionPrice(p: Product): number {
  return p.price < 100 ? 19 : p.price < 400 ? 49 : 99;
}

export function protectionName(p: Product): string {
  return categoryOf(p).fresh ? 'freshness protection' : 'damage protection';
}

export function searchProducts(q: string, cat?: string | null): Product[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return PRODUCTS.filter((p) => (!cat || p.cat === cat) && words.every((w) => `${p.title} ${categoryOf(p).name}`.toLowerCase().includes(w)));
}
