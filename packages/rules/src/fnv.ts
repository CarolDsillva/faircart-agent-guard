const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** FNV-1a 64-bit over UTF-8 bytes, lowercase hex, 16 chars. Used for stable finding ids. */
export function fnv1a64(input: string): string {
  let h = OFFSET;
  for (const byte of new TextEncoder().encode(input)) {
    h ^= BigInt(byte);
    h = (h * PRIME) & MASK;
  }
  return h.toString(16).padStart(16, '0');
}
