// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:5173/shop.html?view=item&reset=1"}
import { expect, it } from 'vitest';
import { loadState, mountShop, saveState } from '../src/shop';

it('starts a fresh store visit when opened with reset=1, and drops the flag from the URL', () => {
  saveState('demomart', { protection: false, pass: false, seat: false, disputed: true });
  document.body.innerHTML = '<div id="shop"></div>';
  mountShop(document.getElementById('shop')!);
  expect(loadState('demomart')).toEqual({ protection: true, pass: true, seat: false, disputed: false });
  expect(location.search).toBe('?view=item');
});
