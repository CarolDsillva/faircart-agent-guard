import { retailerForUrl } from '../retailers';
import { amazonAdapter } from './amazon';
import { flipkartAdapter } from './flipkart';
import { isSensitivePage } from './gate';
import { genericAdapter } from './generic';
import { emptyExtraction, type Extraction, type RefRegistry, type SiteAdapter } from './types';

export * from './types';
export { readBill } from './bill';

export function adapterFor(url: URL): SiteAdapter | null {
  const r = retailerForUrl(url.href);
  if (!r || r.support === 'not_supported') return null;
  if (r.id === 'amazon_in') return amazonAdapter;
  if (r.id === 'flipkart') return flipkartAdapter;
  return genericAdapter(r.id);
}

/** Run the right adapter, behind the safety gate. Returns null on unsupported URLs. */
export function extractPage(doc: Document, url: URL, refs: RefRegistry): Extraction | null {
  const adapter = adapterFor(url);
  if (!adapter) return null;
  if (isSensitivePage(doc)) {
    const r = retailerForUrl(url.href)!;
    const x = emptyExtraction(adapter, r.id, 'unknown');
    x.sensitive = true;
    x.gaps.push('This page has password or payment fields, so FairCart is not reading it.');
    return x;
  }
  try {
    return adapter.extract(doc, url, refs);
  } catch (err) {
    const r = retailerForUrl(url.href)!;
    const x = emptyExtraction(adapter, r.id, 'unknown');
    x.gaps.push(`FairCart couldn't read this page (${err instanceof Error ? err.message : 'adapter error'}).`);
    return x;
  }
}
