/**
 * Safety gate: if a page shows credential or payment entry fields, FairCart
 * extracts nothing from it. Input values are never read anywhere in FairCart;
 * this only looks at field types and names.
 */
const SENSITIVE_AUTOCOMPLETE = /\b(cc-number|cc-csc|cc-exp|one-time-code|current-password|new-password)\b/i;
const SENSITIVE_NAME = /(cvv|cvc|card.?num|cardnumber|otp|upi.?pin|mpin|vpa|password|passcode)/i;
const PAYMENT_FRAME = /(razorpay|payu|juspay|cashfree|billdesk|paytm|ccavenue|phonepe|checkout\.stripe)/i;

export function isSensitivePage(doc: Document): boolean {
  for (const input of doc.querySelectorAll('input')) {
    const type = (input.getAttribute('type') ?? '').toLowerCase();
    if (type === 'hidden') continue;
    if (type === 'password') return true;
    if (SENSITIVE_AUTOCOMPLETE.test(input.getAttribute('autocomplete') ?? '')) return true;
    const ident = `${input.name} ${input.id} ${input.getAttribute('aria-label') ?? ''} ${input.getAttribute('placeholder') ?? ''}`;
    if (SENSITIVE_NAME.test(ident)) return true;
  }
  for (const f of doc.querySelectorAll('iframe[src]')) {
    if (PAYMENT_FRAME.test(f.getAttribute('src') ?? '')) return true;
  }
  return false;
}
