/**
 * The parts of a store page that make it feel like a real store: other
 * products, reviews, offers, the footer. Display only: no links or buttons,
 * so the agent and FairCart's readers see the same controls as before.
 */

const rs = (n: number) => `₹${n.toLocaleString('en-IN')}`;

interface Pack {
  name: string;
  brand: string;
  size: string;
  price: number;
  mrp?: number;
  colour: string;
  label: string;
  shape?: 'bag' | 'bottle' | 'box';
  rating: string;
}

/** A drawn product pack. Bags, bottles and boxes in the store's catalogue. */
export function packArt(p: Pick<Pack, 'colour' | 'label' | 'size' | 'shape'>, cls = 'cat-art'): string {
  // SVG ids can't contain spaces, or the gradient silently fails and the pack renders black.
  const gid = `g-${p.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (p.shape === 'bottle') {
    return `<svg class="${cls}" viewBox="0 0 120 140" aria-hidden="true">
      <defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="${p.colour}" stop-opacity=".75"/><stop offset=".5" stop-color="${p.colour}"/><stop offset="1" stop-color="${p.colour}" stop-opacity=".7"/></linearGradient></defs>
      <rect x="50" y="8" width="20" height="14" rx="3" fill="#c79a2b"/>
      <path d="M46 22h28v12c10 6 16 14 16 26v64a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8V60c0-12 6-20 16-26z" fill="url(#${gid})"/>
      <rect x="36" y="66" width="48" height="40" rx="4" fill="#fff8e6"/>
      <text x="60" y="84" text-anchor="middle" font-family="Arial" font-size="9" font-weight="700" fill="#6b4a00">${p.label}</text>
      <text x="60" y="97" text-anchor="middle" font-family="Arial" font-size="8" fill="#6b4a00">${p.size}</text>
    </svg>`;
  }
  if (p.shape === 'box') {
    return `<svg class="${cls}" viewBox="0 0 120 140" aria-hidden="true">
      <path d="M24 30 60 18l36 12v92l-36 10-36-10z" fill="${p.colour}"/>
      <path d="M60 18v114" stroke="#000" stroke-opacity=".12"/>
      <path d="M24 30 60 42l36-12" fill="none" stroke="#fff" stroke-opacity=".35"/>
      <rect x="32" y="62" width="56" height="34" rx="4" fill="#fff"/>
      <text x="60" y="78" text-anchor="middle" font-family="Arial" font-size="9" font-weight="700" fill="#333">${p.label}</text>
      <text x="60" y="90" text-anchor="middle" font-family="Arial" font-size="8" fill="#555">${p.size}</text>
    </svg>`;
  }
  return `<svg class="${cls}" viewBox="0 0 120 140" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" x2="1"><stop offset="0" stop-color="${p.colour}" stop-opacity=".8"/><stop offset=".55" stop-color="${p.colour}"/><stop offset="1" stop-color="${p.colour}" stop-opacity=".78"/></linearGradient></defs>
    <path d="M26 18h68l6 112q-40 8-80 0z" fill="url(#${gid})"/>
    <path d="M26 18h68l-2 10H28z" fill="#000" opacity=".15"/>
    <rect x="34" y="50" width="52" height="56" rx="6" fill="#fffaf0"/>
    <text x="60" y="70" text-anchor="middle" font-family="Georgia" font-size="10" font-weight="700" fill="#5a2d0c">${p.label}</text>
    <text x="60" y="94" text-anchor="middle" font-family="Arial" font-size="9" font-weight="700" fill="#2f5d34">${p.size}</text>
  </svg>`;
}

const SIMILAR: Pack[] = [
  { name: 'Golden Harvest Basmati Rice', brand: 'Golden Harvest', size: '5 kg', price: 649, mrp: 799, colour: '#b33a3a', label: 'BASMATI', rating: '4.4' },
  { name: 'Sunrise Toor Dal', brand: 'Sunrise', size: '1 kg', price: 168, mrp: 199, colour: '#d6a21e', label: 'TOOR DAL', rating: '4.2' },
  { name: 'Sunrise Besan', brand: 'Sunrise', size: '1 kg', price: 99, colour: '#e3b23c', label: 'BESAN', rating: '4.3' },
  { name: 'Kanak Sunflower Oil', brand: 'Kanak', size: '1 L', price: 155, mrp: 180, colour: '#e8b20e', label: 'SUNFLOWER', shape: 'bottle', rating: '4.1' },
  { name: 'Morning Rolled Oats', brand: 'Morning', size: '1 kg', price: 189, mrp: 225, colour: '#5b7f3a', label: 'OATS', shape: 'box', rating: '4.5' },
];

export function similarRail(title = 'Similar products'): string {
  return `<section class="rail" aria-label="${title}">
    <h2>${title}</h2>
    <div class="rail__row">${SIMILAR.map(
      (p) => `<div class="pcard">
        <div class="pcard__img">${packArt(p)}</div>
        <p class="pcard__brand">${p.brand}</p>
        <p class="pcard__name">${p.name}</p>
        <p class="pcard__size">${p.size}</p>
        <p class="pcard__price"><b>${rs(p.price)}</b>${p.mrp ? ` <s>${rs(p.mrp)}</s>` : ''}</p>
        <p class="pcard__rating"><span>★ ${p.rating}</span></p>
      </div>`,
    ).join('')}</div>
  </section>`;
}

export function offers(): string {
  return `<section class="offers" aria-label="Offers">
    <h3>Offers for you</h3>
    <ul>
      <li><b>Bank offer</b> 10% instant discount with HDFC Bank credit cards</li>
      <li><b>PayPal</b> Pay with PayPal for buyer protection on every order</li>
      <li><b>First order</b> Free delivery on your first three orders</li>
    </ul>
  </section>`;
}

export function reviews(honest = false): string {
  const items: [string, number, string, string][] = [
    ['Meera R.', 5, 'Soft rotis every time', 'Fresh stock, nicely sealed bag. Rotis stay soft till dinner.'],
    ['Arjun K.', 4, 'Good atta, delivery was quick', 'Arrived in about 15 minutes. Slightly coarse but tastes great.'],
    honest
      ? ['Farah S.', 5, 'What you see is what you pay', 'Price on the page was the price at checkout. No surprises.']
      : ['Farah S.', 3, 'Watch the add-ons at checkout', 'Atta is fine. The protection plan was already ticked in my cart, so check before you pay.'],
  ];
  return `<section class="reviews" aria-label="Customer reviews">
    <div class="reviews__head">
      <h2>Ratings and reviews</h2>
      <div class="reviews__score"><b>4.3</b><span class="stars" aria-hidden="true">★★★★☆</span><small>2,184 ratings and 312 reviews</small></div>
    </div>
    <div class="reviews__bars" aria-hidden="true">${[
      [5, 62],
      [4, 21],
      [3, 9],
      [2, 4],
      [1, 4],
    ]
      .map(([n, pct]) => `<div><span>${n}★</span><i><b style="width:${pct}%"></b></i><span>${pct}%</span></div>`)
      .join('')}</div>
    <ul class="reviews__list">${items
      .map(
        ([who, stars, title, body]) => `<li>
          <p class="review__top"><span class="review__stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span> <b>${title}</b></p>
          <p class="review__body">${body}</p>
          <p class="review__who">${who} · Verified buyer</p>
        </li>`,
      )
      .join('')}</ul>
  </section>`;
}

export function promoStrip(text: string): string {
  return `<div class="promo">${text}</div>`;
}

export function richFooter(name: string): string {
  return `<footer class="dm-foot">
    <div class="dm-foot__cols">
      <div><b>${name}</b><span>About us</span><span>Careers</span><span>Press</span><span>Blog</span></div>
      <div><b>Help</b><span>Customer support</span><span>Returns and refunds</span><span>Delivery areas</span><span>Contact us</span></div>
      <div><b>Policies</b><span>Terms of use</span><span>Privacy</span><span>Cancellations</span><span>Grievance redressal</span></div>
      <div><b>Get the app</b><span class="badge-store">App Store</span><span class="badge-store">Google Play</span></div>
    </div>
    <div class="dm-foot__pay"><span>We accept</span><i>PayPal</i><i>UPI</i><i>Visa</i><i>Mastercard</i><i>RuPay</i><i>Net banking</i></div>
    <p class="dm-foot__note">© 2026 ${name}. A fictional store made for the PennyWise demo. Nothing here is for sale.</p>
  </footer>`;
}
