import ReactDOM from 'react-dom/client';
import { startFairCart } from './boot';
import { App } from './ui/App';
import './style.css';

/**
 * FairCart content script. Registered at runtime only for retailers the user
 * enabled. It reads visible page structure, never input values, never clicks
 * anything on the page, and sends structured facts (not page HTML) to the
 * extension's own service worker.
 */

declare global {
  interface Window {
    __faircartLoaded?: boolean;
  }
}

export default defineContentScript({
  registration: 'runtime',
  matches: [],
  cssInjectionMode: 'ui',
  async main(ctx) {
    if (window.__faircartLoaded) return;
    window.__faircartLoaded = true;

    const ui = await createShadowRootUi(ctx, {
      name: 'faircart-companion',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(<App />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
    const stop = startFairCart(ui.shadowHost);
    ctx.onInvalidated(() => {
      stop();
      ui.remove();
      window.__faircartLoaded = false;
    });
  },
});
