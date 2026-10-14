/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Emits sw.js with every built file in its precache list, so the app works
// offline right after the first visit. The version changes whenever any file does.
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).concat(['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png']);
      const hash = createHash('sha256');
      for (const name of Object.keys(bundle).sort()) {
        const item = bundle[name];
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const template = readFileSync('src/sw-template.js', 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__VERSION__', hash.digest('hex').slice(0, 12))
          .replace('__FILES__', JSON.stringify(['./', ...files.map((f) => './' + f)])),
      });
    },
  };
}

// Relative base so the app works from any host path (Vercel, Cloudflare, a subfolder).
export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  // The browser test in e2e/ runs separately with `npm run test:e2e`.
  test: { include: ['tests/**/*.test.ts'] },
});
