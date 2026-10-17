// A stale cached page must not leave a blank screen: the app recovers by itself, data intact.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
const dir = readdirSync('/opt/pw-browsers').find((d) => d.startsWith('chromium-'));
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('4173') && r()));
const browser = await chromium.launch({ executablePath: `/opt/pw-browsers/${dir}/chrome-linux/chrome` });
const page = await browser.newPage();
try {
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.click('button[aria-label="Add"]');
  await page.click('.keypad button:text-is("7")');
  await page.click('.cat:has-text("Food")');
  await page.locator('.list li:has-text("Food")').waitFor();
  // Poison the cache: the shell now points at a script that no longer exists, like a stale deploy.
  await page.evaluate(async () => {
    const html = (await (await fetch('./')).text()).replace(/assets\/index-[^"]+\.js/, 'assets/gone.js');
    for (const k of await caches.keys()) await (await caches.open(k)).put('./', new Response(html, { headers: { 'content-type': 'text/html' } }));
  });
  await page.reload();
  console.log('blank after poisoning:', !(await page.locator('.fab').count()));
  await page.locator('.list li:has-text("Food")').waitFor({ timeout: 15000 });
  console.log('ok - app recovered by itself and the entry is still there');
} finally {
  await browser.close();
  process.kill(-server.pid);
}
