/**
 * Money for the guard and payment path: integer paise and integer US cents
 * only. Adapters read rupees as numbers; convert once, at the boundary.
 */

/** Fixed demo exchange rate, shown on screen and on the receipt. */
export const INR_PER_USD = 88;

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** paise / 88 in cents (1 USD = 88 INR, so 1 cent = 88 paise), half-to-even. */
export function paiseToUsdCents(paise: number): number {
  const q = Math.floor(paise / INR_PER_USD);
  const twice = 2 * (paise - q * INR_PER_USD);
  if (twice < INR_PER_USD) return q;
  if (twice > INR_PER_USD) return q + 1;
  return q % 2 === 0 ? q : q + 1;
}

export function formatInr(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const frac = Math.abs(paise % 100);
  const whole = `₹${rupees.toLocaleString('en-IN')}`;
  return frac ? `${whole}.${String(frac).padStart(2, '0')}` : whole;
}

export function centsToPayPal(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, '0')}`;
}

export function formatUsd(cents: number): string {
  return `US$${centsToPayPal(cents)}`;
}

/** The store's currency. Amounts are integer minor units either way (paise or cents). */
export type Currency = 'INR' | 'USD';

/** Minor units → US cents for PayPal. A USD store needs no conversion. */
export function toUsdCents(minor: number, currency: Currency = 'INR'): number {
  return currency === 'USD' ? minor : paiseToUsdCents(minor);
}

/** How many units of the store's currency make US$1. */
export const perUsd = (currency: Currency = 'INR') => (currency === 'USD' ? 1 : INR_PER_USD);

export function formatMoney(minor: number, currency: Currency = 'INR'): string {
  if (currency === 'INR') return formatInr(minor);
  return `${minor < 0 ? '-' : ''}$${centsToPayPal(Math.abs(minor))}`;
}
