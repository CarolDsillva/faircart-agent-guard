// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractPage, RefRegistry } from '../src/adapters';
import { renderView } from '../src/demo/shop';

/** The Agent Guard console reads the store inside an iframe: elements come from another window. */
function frameDoc(html: string): Document {
  const f = document.createElement('iframe');
  document.body.append(f);
  const doc = f.contentDocument!;
  doc.documentElement.innerHTML = `<head></head><body>${html}</body>`;
  return doc;
}

describe('reading a page in another frame', () => {
  it('sees a pre-ticked add-on as ticked', () => {
    const doc = frameDoc(renderView('item', { protection: true, pass: true }));
    expect(doc.defaultView!.HTMLInputElement).not.toBe(window.HTMLInputElement);
    const x = extractPage(doc, new URL('http://localhost:5173/shop.html?view=item'), new RefRegistry())!;
    expect(x.controls.find((c) => c.id === 'protect')?.checked).toBe(true);
  });
});
