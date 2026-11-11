import { dismissControlFor } from '../../src/adapters/cues';
import type { BackgroundToContent } from '../../src/messages';
import type { Settings } from '../../src/store/storage';
import { isOurs, newPage, refs, scanNow, sendBg, setHost } from './actions';
import { getState, setState } from './store';

/**
 * Starts FairCart on the current document: scanning, the tap ledger and
 * message/settings listeners. Shared by the runtime content script and the
 * built-in demo shop page. Returns a stop function.
 */

/** Debounced rescans on relevant DOM changes; ignores FairCart's own UI. */
function watchPage() {
  let lastUrl = location.href;
  let timer: number | undefined;
  let firstPending = 0;
  const schedule = () => {
    const now = Date.now();
    if (!firstPending) firstPending = now;
    window.clearTimeout(timer);
    // Ticking timers mutate the DOM every second; cap rescans of the same page at one per ~5 s.
    const wait = location.href !== lastUrl ? 300 : now - firstPending > 5000 ? 0 : 800;
    timer = window.setTimeout(() => {
      firstPending = 0;
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        newPage();
        setState({ card: null, menuOpen: false, tab: null });
      }
      void scanNow();
    }, wait);
  };
  const mo = new MutationObserver((records) => {
    if (records.every((r) => isOurs(r.target))) return;
    schedule();
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['checked', 'aria-checked', 'hidden', 'open'] });
  window.addEventListener('popstate', schedule);
  // Checkbox ticks change a property, not the DOM, so watch input changes too.
  const onChange = (e: Event) => {
    if (!isOurs(e.target)) schedule();
  };
  document.addEventListener('change', onChange, true);
  return () => {
    mo.disconnect();
    window.removeEventListener('popstate', schedule);
    document.removeEventListener('change', onChange, true);
    window.clearTimeout(timer);
  };
}

/** Tap ledger: records the user's own clicks on controls FairCart classified. Observes only. */
function watchTaps() {
  const onClick = (e: MouseEvent) => {
    if (getState().picking || isOurs(e.target) || !(e.target instanceof Element)) return;
    for (const c of getState().extraction?.controls ?? []) {
      const el = c.elRef ? refs.get(c.elRef) : undefined;
      if (el && (el === e.target || el.contains(e.target))) {
        void sendBg({ type: 'tap', controlId: c.id, action: 'tap' });
        break;
      }
    }
    // A decline button in a pop-up is both a tap and a dismissal.
    const d = dismissControlFor(e.target);
    if (d) void sendBg({ type: 'tap', controlId: d.promptId, action: 'dismiss' });
  };
  document.addEventListener('click', onClick, { capture: true, passive: true });
  return () => document.removeEventListener('click', onClick, { capture: true });
}

export function startFairCart(host: HTMLElement): () => void {
  host.setAttribute('data-faircart-ui', '');
  setHost(host);

  const onMsg = (msg: BackgroundToContent) => {
    if (msg.type === 'menu/toggle') setState((s) => ({ menuOpen: !s.menuOpen, hiddenForPage: false }));
    if (msg.type === 'findings/update') setState({ findings: msg.findings });
    if (msg.type === 'settings/changed') void scanNow();
  };
  chrome.runtime.onMessage.addListener(onMsg);
  // Settings changed on the options page or in another tab.
  const onStore = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes.settings?.newValue) setState({ settings: changes.settings.newValue as Settings });
  };
  chrome.storage.onChanged.addListener(onStore);

  const stopTaps = watchTaps();
  const stopPage = watchPage();
  void scanNow();
  return () => {
    stopTaps();
    stopPage();
    chrome.runtime.onMessage.removeListener(onMsg);
    chrome.storage.onChanged.removeListener(onStore);
  };
}
