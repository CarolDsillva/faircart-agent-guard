import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Mark } from '../content/ui/icons';
import { PrivacyFacts } from '../../src/ui/PrivacyFacts';
import { Preferences } from '../../src/ui/Preferences';
import { SiteToggles } from '../../src/ui/SiteToggles';
import '../../src/ui/page.css';
import '../onboarding/onboarding.css';

function Options() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const exportData = async () => {
    const res = (await chrome.runtime.sendMessage({ type: 'export' })) as { ok: boolean; data?: unknown };
    if (!res.ok) return setStatus('Export failed.');
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `faircart-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('Exported findings, products and price history to a JSON file.');
  };

  const clear = async () => {
    await chrome.runtime.sendMessage({ type: 'data/clear' });
    setConfirming(false);
    setStatus('Deleted all products, prices, watches and findings. Your settings and site choices are kept.');
  };

  return (
    <main className="ob">
      <header className="ob__hero" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <span className="ob__mark" style={{ margin: 0 }}>
          <Mark size={24} />
        </span>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Settings</h1>
          <p className="muted" style={{ margin: 0 }}>
            FairCart {chrome.runtime.getManifest().version} · runs entirely in this browser
          </p>
        </div>
      </header>

      <section className="ob__step" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <h2>Sites</h2>
          <p className="muted">FairCart only reads sites that are on.</p>
          <SiteToggles />
          <p className="small" style={{ marginTop: 14 }}>
            <a href={chrome.runtime.getURL('/demo.html')} target="_blank" rel="noreferrer">
              Open the demo shop
            </a>{' '}
            <span className="muted">· a fictional store with planted dark patterns. It needs no site permission and is never added to price history.</span>
          </p>
        </div>
      </section>

      <section className="ob__step" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <h2>Companion and detection</h2>
          <Preferences />
        </div>
      </section>

      <section className="ob__step" style={{ gridTemplateColumns: '1fr' }}>
        <div>
          <h2>Privacy and data</h2>
          <PrivacyFacts />
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => void exportData()}>
              Export my data
            </button>
            {confirming ? (
              <>
                <button className="btn btn--danger" onClick={() => void clear()}>
                  Yes, delete everything
                </button>
                <button className="btn" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button className="btn btn--danger" onClick={() => setConfirming(true)}>
                Delete stored data…
              </button>
            )}
          </div>
          {status && (
            <p role="status" className="small" style={{ marginTop: 10 }}>
              {status}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Options />);
