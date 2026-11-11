import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Mark } from '../content/ui/icons';
import { PrivacyFacts } from '../../src/ui/PrivacyFacts';
import { Preferences } from '../../src/ui/Preferences';
import { SiteToggles } from '../../src/ui/SiteToggles';
import { setSettings } from '../../src/store/storage';
import '../../src/ui/page.css';
import './onboarding.css';

function Onboarding() {
  const [enabled, setEnabled] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  const finish = async () => {
    await setSettings({ onboarded: true });
    setDone(true);
  };

  return (
    <main className="ob">
      <header className="ob__hero">
        <span className="ob__mark">
          <Mark size={28} />
        </span>
        <p className="eyebrow">Consumer protection for Indian online shopping</p>
        <h1>FairCart points out what a shopping page would rather you missed.</h1>
        <p className="ob__lede">
          Late fees, pre-ticked add-ons, timers that restart, discounts measured against prices nobody charges. FairCart notices them where they appear, explains them in plain language, and tracks the prices you see so you can tell a real deal from a dressed-up one.
        </p>
      </header>

      <section className="ob__three">
        <div>
          <h3>Spots it in place</h3>
          <p>A small companion sits near your cursor. When something on the page deserves a second look, a marker appears beside it.</p>
        </div>
        <div>
          <h3>Shows its evidence</h3>
          <p>Every finding says what FairCart saw, why it can matter, how sure it is, and what you can check. It never accuses a retailer of breaking the law.</p>
        </div>
        <div>
          <h3>Keeps honest prices</h3>
          <p>FairCart records prices on the product pages you open. It only claims a "30-day low" once it has 30 days of real observations.</p>
        </div>
      </section>

      <section className="ob__step">
        <div className="ob__num">1</div>
        <div>
          <h2>Choose where FairCart can look</h2>
          <p className="muted">FairCart is off everywhere until you turn a site on. Chrome will ask you to confirm each one. You can change this any time in settings.</p>
          <SiteToggles onChange={setEnabled} />
        </div>
      </section>

      <section className="ob__step">
        <div className="ob__num">2</div>
        <div>
          <h2>What FairCart reads, and where it goes</h2>
          <PrivacyFacts />
        </div>
      </section>

      <section className="ob__step">
        <div className="ob__num">3</div>
        <div>
          <h2>How the companion behaves</h2>
          <Preferences />
        </div>
      </section>

      <footer className="ob__foot">
        {done ? (
          <p role="status">
            <b>You're set.</b> {enabled.length ? 'Open one of your enabled sites and look for the FairCart button near your cursor.' : 'Turn on at least one site above when you are ready.'} Click the FairCart icon in the toolbar to open the side panel.{' '}
            <a href={chrome.runtime.getURL('/demo.html')} target="_blank" rel="noreferrer">
              Want to see it catch something? Open the demo shop.
            </a>
          </p>
        ) : (
          <>
            <p className="muted">{enabled.length ? `${enabled.length} site${enabled.length === 1 ? '' : 's'} on.` : 'No sites on yet. FairCart will do nothing until you turn one on.'}</p>
            <button className="btn btn--primary" onClick={() => void finish()}>
              Finish setup
            </button>
          </>
        )}
      </footer>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Onboarding />);
