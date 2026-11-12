import { describe, expect, it } from 'vitest';
import { centsToPayPal, formatInr, formatUsd, INR_PER_USD, paiseToUsdCents, toPaise } from '@faircart/money';

describe('money', () => {
  it('uses the fixed demo rate', () => expect(INR_PER_USD).toBe(88));

  it('converts rupees to integer paise without float drift', () => {
    expect(toPaise(289)).toBe(28900);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });

  it('converts paise to USD cents per line', () => {
    expect(paiseToUsdCents(28900)).toBe(328);
    expect(paiseToUsdCents(1500)).toBe(17);
    expect(paiseToUsdCents(900)).toBe(10);
  });

  it('rounds exact halves to even', () => {
    expect(paiseToUsdCents(44)).toBe(0); // 0.5
    expect(paiseToUsdCents(132)).toBe(2); // 1.5
    expect(paiseToUsdCents(220)).toBe(2); // 2.5
  });

  it('formats for people and for PayPal', () => {
    expect(formatInr(31300)).toBe('₹313');
    expect(formatInr(350)).toBe('₹3.50');
    expect(formatUsd(355)).toBe('US$3.55');
    expect(centsToPayPal(5)).toBe('0.05');
    expect(centsToPayPal(355)).toBe('3.55');
  });
});

describe('dollar stores', () => {
  it('sends US cents to PayPal unchanged and formats dollars', async () => {
    const { formatMoney, perUsd, toUsdCents } = await import('../src/index');
    expect(toUsdCents(1397, 'USD')).toBe(1397);
    expect(toUsdCents(28900)).toBe(328);
    expect(perUsd('USD')).toBe(1);
    expect(formatMoney(1397, 'USD')).toBe('$13.97');
    expect(formatMoney(100, 'USD')).toBe('$1.00');
    expect(formatMoney(28900)).toBe('₹289');
  });
});
