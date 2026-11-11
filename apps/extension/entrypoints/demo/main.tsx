import ReactDOM from 'react-dom/client';
import { mountShop } from '../../src/demo/shop';
import { startFairCart } from '../content/boot';
import companionCss from '../content/style.css?inline';
import { App } from '../content/ui/App';
import './demo.css';

/**
 * The demo shop is an extension page, where content scripts can't run, so it
 * hosts the same companion directly: same UI, same boot code, same adapter
 * path (the generic reader), same rule pack in the service worker.
 */
mountShop(document.getElementById('shop')!);

const host = document.createElement('faircart-companion');
document.body.append(host);
const shadow = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = companionCss;
const container = document.createElement('div');
shadow.append(style, container);
ReactDOM.createRoot(container).render(<App />);
startFairCart(host);
