import { describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/env';

describe('readConfig', () => {
  it('falls back to simulated PayPal with a warning when sandbox keys are missing, instead of failing to start', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg = readConfig({ AUTHZ_HMAC_SECRET: 'x'.repeat(32), PAYPAL_MODE: 'sandbox' });
    expect(cfg.paypalConfig.mode).toBe('mock');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('PAYPAL_CLIENT_ID'));
    warn.mockRestore();
  });
});
