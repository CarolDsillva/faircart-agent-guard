import { describe, expect, it } from 'vitest';
import * as A from '@faircart/adapters';

describe('@faircart/adapters re-export', () => {
  it('exposes the extension adapters, retailers and journey reducer', () => {
    for (const name of ['extractPage', 'RefRegistry', 'toSnapshot', 'readBill', 'retailerForUrl', 'addSnapshot', 'addTap'] as const) {
      expect(typeof (A as Record<string, unknown>)[name], name).toBe('function');
    }
  });
});
