import { render } from 'preact';
import { App } from './App';
import './styles.css';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // A home-screen app often resumes instead of reloading, so look for a new version whenever it comes back.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update());
  });
  // When a new version takes over, switch to it right away instead of waiting for the next launch.
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  }
}
