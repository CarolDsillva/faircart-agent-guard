import { defineConfig } from 'wxt';
import { RETAILERS } from './src/retailers';

const optionalHosts = [...new Set(RETAILERS.flatMap((r) => r.origins))];

export default defineConfig({
  // JSX via esbuild's automatic runtime; no React Vite plugin needed.
  vite: () => ({ esbuild: { jsx: 'automatic' } }),
  hooks: {
    // The runtime-registered content script loads its shadow-root CSS from the extension, so
    // that file must be web-accessible on the retailer origins (and nowhere else).
    'build:manifestGenerated': (_wxt, manifest) => {
      for (const war of manifest.web_accessible_resources ?? []) {
        if (typeof war === 'object' && war.resources.some((r) => r.startsWith('content-scripts/'))) war.matches = optionalHosts;
      }
    },
  },
  manifest: {
    name: 'FairCart',
    description: 'Spots manipulative shopping design, explains it, and tracks real prices on Indian shopping sites.',
    // Minimum install-time permissions. No <all_urls>, tabs, history, cookies or webRequest.
    permissions: ['storage', 'sidePanel', 'scripting', 'alarms'],
    optional_permissions: ['notifications'],
    // Each retailer origin is requested only when the user turns that site on.
    optional_host_permissions: optionalHosts,
    action: { default_title: 'Open FairCart' },
    commands: {
      'toggle-companion-menu': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Open the FairCart menu on this page',
      },
    },
  },
});
