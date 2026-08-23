import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './styles.css';

// Surface the deepest underlying error in a visible overlay so debugging
// wallet/ZK issues doesn't require opening DevTools.
const explain = (e: unknown): string => {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; cur && i < 8; i++) {
    const m = cur instanceof Error ? cur.message : String(cur);
    if (m && !parts.includes(m)) parts.push(m);
    cur = (cur as { cause?: unknown })?.cause;
  }
  return parts.join('\n↳ ');
};
const showOverlay = (title: string, e: unknown) => {
  let el = document.getElementById('shadowbid-error-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'shadowbid-error-overlay';
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.85);color:#fff;font:13px/1.5 monospace;padding:24px;overflow:auto;white-space:pre-wrap;';
    document.body.appendChild(el);
  }
  el.textContent = `SHADOWBID DEBUG — ${title}\n\n${explain(e)}\n\n(press Esc to dismiss)`;
};
window.addEventListener('error', (ev) => showOverlay('window error', ev.error ?? ev.message));
window.addEventListener('unhandledrejection', (ev) => showOverlay('unhandled rejection', ev.reason));
window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') document.getElementById('shadowbid-error-overlay')?.remove();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
