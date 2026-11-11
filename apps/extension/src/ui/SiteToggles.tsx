import { useEffect, useState } from 'react';
import { RETAILERS, type Retailer } from '../retailers';

const SUPPORT_LABEL: Record<Retailer['support'], { text: string; cls: string }> = {
  full: { text: 'Full support', cls: 'pill--ok' },
  generic: { text: 'Limited', cls: '' },
  not_supported: { text: 'Not supported', cls: '' },
};

/**
 * Per-site opt-in. Turning a site on asks Chrome for that one origin; turning
 * it off removes the permission. FairCart reads nothing on sites left off.
 */
export function SiteToggles({ onChange }: { onChange?: (enabled: string[]) => void }) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const out = new Set<string>();
    for (const r of RETAILERS) if (r.origins.length && (await chrome.permissions.contains({ origins: r.origins }))) out.add(r.id);
    setEnabled(out);
    onChange?.([...out]);
  };
  useEffect(() => {
    void refresh();
    const l = () => void refresh();
    chrome.permissions.onAdded.addListener(l);
    chrome.permissions.onRemoved.addListener(l);
    return () => {
      chrome.permissions.onAdded.removeListener(l);
      chrome.permissions.onRemoved.removeListener(l);
    };
  }, []);

  const toggle = async (r: Retailer) => {
    setError(null);
    try {
      if (enabled.has(r.id)) {
        // Swiggy's origin also covers food delivery; removing it is always safe.
        await chrome.permissions.remove({ origins: r.origins });
      } else {
        const ok = await chrome.permissions.request({ origins: r.origins });
        if (!ok) setError(`Chrome did not grant access to ${r.name}. FairCart stays off there.`);
      }
      await chrome.runtime.sendMessage({ type: 'sites/refresh' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    await refresh();
  };

  const group = (kind: Retailer['kind'], title: string) => (
    <section>
      <h3 className="eyebrow" style={{ margin: '18px 0 8px' }}>
        {title}
      </h3>
      <div className="site-list">
        {RETAILERS.filter((r) => r.kind === kind).map((r) => {
          const on = enabled.has(r.id);
          const label = SUPPORT_LABEL[r.support];
          return (
            <div className="site-row" key={r.id}>
              <div className="site-row__body">
                <div className="site-row__name">
                  {r.name} <span className={`pill ${label.cls}`}>{label.text}</span>
                </div>
                <div className="site-row__note">
                  {r.origins[0]?.replace('/*', '') ?? 'No website'} · {r.note}
                </div>
              </div>
              <button
                className="switch"
                role="switch"
                aria-checked={on}
                aria-label={`${on ? 'Turn off' : 'Turn on'} FairCart for ${r.name}`}
                disabled={r.support === 'not_supported'}
                onClick={() => void toggle(r)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div>
      {group('marketplace', 'Marketplaces')}
      {group('quick_commerce', 'Quick commerce & grocery')}
      {error && (
        <p className="small" style={{ color: 'var(--warn)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
