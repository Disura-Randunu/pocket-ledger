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

  await page.click('.sheet-bg', { position: { x: 10, y: 10 } });

  // Carry-over: September ends with a balance, October offers to bring it in.
  page.on('dialog', (d) => d.accept());
  const text = (id) => page.textContent(`[data-testid=${id}]`);
  const add = async (keys, category, income = false) => {
    await page.click('button[aria-label="Add"]');
    if (income) await page.click('.toggle button:text-is("Income")');
    for (const k of keys) await page.click(`.keypad button:text-is("${k}")`);
    await page.click(`.cat:has-text("${category}")`);
    await page.locator('.sheet').waitFor({ state: 'detached' });
  };
  await page.click('button[aria-label="Previous month"]');
  await page.locator('h1:text-is("September 2026")').waitFor();
  await add('50000', 'Salary', true);
  await add('1000', 'Food');
  await page.click('button[aria-label="Next month"]');
  await page.locator('.carry:has-text("September ended with Rs. 49,000.00")').waitFor();
  assert(true, 'next month offers to carry the balance');
  await page.screenshot({ path: 'e2e/carry-prompt.png' });
  await page.click('.carry button:text-is("Carry over")');
  await page.locator('.list li:has-text("September balance")').waitFor();
  assert((await text('carried')) === 'Rs. 49,000.00' && (await text('net')) === 'Rs. 47,750.00', 'one tap carries it and net includes it');
  assert((await text('spent')) === 'Rs. 1,250.00', 'carry-over is not counted as spending');
  await page.screenshot({ path: 'e2e/carry-done.png' });

  await page.click('button[aria-label="Previous month"]');
  await add('500', 'Food');
  await page.click('button[aria-label="Next month"]');
  await page.locator('[data-testid=carried]:text-is("Rs. 48,500.00")').waitFor();
  assert(true, 'carry-over follows later edits to the previous month');

  await page.click('.list li:has-text("September balance")');
  await page.locator('[data-testid=carried]').waitFor({ state: 'detached' });
  assert(!(await page.locator('.carry').count()), 'removing it does not nag again');
  await page.click('button[aria-label="Previous month"]');
  await page.locator('.carry-link:has-text("Carry Rs. 48,500.00 into October")').waitFor();
  assert(true, 'a past month still offers a quiet way to carry later');
  await page.click('button[aria-label="Next month"]');
  await page.locator('h1:text-is("October 2026")').waitFor();
  await page.click('button[aria-label="Settings"]');
  await page.click('button:text-is("සිංහල")');
  await page.screenshot({ path: 'e2e/settings-si.png' });
  await page.click('button:text-is("හරි")');
  await page.reload();
  await page.locator('.summary span:text-is("වියදම")').waitFor();
  assert(await page.locator('.bar-label:has-text("ආහාර")').isVisible(), 'Sinhala is remembered after reload');
  await page.screenshot({ path: 'e2e/home-si.png' });
  console.log('all e2e checks passed');
} finally {
  await browser.close();
  process.kill(-server.pid);
}
