// End-to-end: install the service worker, go offline, add an expense, reload, and check it's still there.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = '/opt/pw-browsers';
  const dir = existsSync(root) && readdirSync(root).find((d) => d.startsWith('chromium-'));
  return dir ? `${root}/${dir}/chrome-linux/chrome` : undefined;
}

const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('4173') && r()));
const assert = (cond, msg) => { if (!cond) throw new Error('FAILED: ' + msg); console.log('ok -', msg); };

const browser = await chromium.launch({ executablePath: chromePath() });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  assert(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');

  await ctx.setOffline(true);
  await page.reload();
  await page.locator('h1').waitFor();
  assert(await page.locator('h1').isVisible(), 'app loads with no network');

  await page.click('button[aria-label="Add"]');
  for (const k of ['1', '2', '5', '0']) await page.click(`.keypad button:text-is("${k}")`);
  assert((await page.textContent('[data-testid=amount]')) === 'Rs. 1250', 'keypad enters amount');
  await page.fill('input[placeholder^="Note"]', 'Lunch');
  await page.click('.cat:has-text("Food")');
  await page.locator('.list li:has-text("Lunch")').waitFor();
  assert((await page.textContent('[data-testid=spent]')) === 'Rs. 1,250.00', 'expense saved in 3 taps and total updates');

  await page.reload();
  await page.locator('.list li:has-text("Lunch")').waitFor();
  assert((await page.textContent('[data-testid=spent]')) === 'Rs. 1,250.00', 'data survives an offline reload');
  assert(await page.locator('.list li:has-text("Lunch")').isVisible(), 'transaction is listed');
  await page.screenshot({ path: 'e2e/home.png' });

  await page.click('.list li:has-text("Lunch")');
  await page.screenshot({ path: 'e2e/editor.png' });
  console.log('all e2e checks passed');
} finally {
  await browser.close();
  process.kill(-server.pid);
}
