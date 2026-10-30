import { mark } from './lib/perf';
mark('código');
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// App instalável: um service worker simples guarda o essencial para abrir sem rede.
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.VITE_DEMO !== '1') {
  addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
  // Os ecrãs que não vêm logo ficam guardados para abrir sem rede: pede-se ao service worker com a app já sossegada.
  const warm = () => navigator.serviceWorker.ready.then((r) => r.active?.postMessage('warm')).catch(() => {});
  addEventListener('load', () => setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(warm, { timeout: 10_000 }) : warm()), 8000));
}
