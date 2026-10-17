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
  await page.click('.toast button:text-is("Undo")');
  await page.locator('[data-testid=carried]:text-is("Rs. 48,500.00")').waitFor();
  assert(true, 'Undo brings a removed carry-over back');

  await page.click('.list li:has-text("September balance")');
  await page.locator('[data-testid=carried]').waitFor({ state: 'detached' });
  assert(!(await page.locator('.carry').count()), 'removing it does not nag again');
  await page.screenshot({ path: 'e2e/carry-removed.png' });
  await page.click('.carry-link:has-text("Bring in September balance (Rs. 48,500.00)")');
  await page.locator('[data-testid=carried]:text-is("Rs. 48,500.00")').waitFor();
  assert(true, 'a quiet link on the same screen brings it back later');
  await page.click('.list li:has-text("September balance")');
  await page.locator('[data-testid=carried]').waitFor({ state: 'detached' });

  await page.click('.list li:has-text("Lunch")');
  await page.click('button:text-is("Delete")');
  await page.locator('.toast').waitFor();
  await page.locator('.list li:has-text("Lunch")').waitFor({ state: 'detached', timeout: 2000 });
  await page.waitForTimeout(300);
  assert(!(await page.locator('.list li:has-text("Lunch")').count()), 'delete is instant and stays deleted');
  await page.click('.toast button:text-is("Undo")');
  await page.locator('.list li:has-text("Lunch")').waitFor();
  assert(true, 'Undo restores a deleted entry');
  await page.click('button[aria-label="Previous month"]');
  await page.locator('.carry-link:has-text("Carry Rs. 48,500.00 into October")').waitFor();
  assert(true, 'a past month still offers a quiet way to carry later');
  await page.click('button[aria-label="Next month"]');
  await page.locator('h1:text-is("October 2026")').waitFor();

  // Custom category: create it from the entry sheet and save in the same tap.
  await page.click('button[aria-label="Add"]');
  for (const k of '2500') await page.click(`.keypad button:text-is("${k}")`);
  await page.click('.cat.new');
  await page.click('.emojis button:text-is("🏠")');
  await page.fill('.new-cat input', 'Rent');
  await page.screenshot({ path: 'e2e/new-category.png' });
  await page.click('.new-cat button:has-text("Add and save")');
  await page.locator('.list li:has-text("Rent")').waitFor();
  assert((await text('spent')) === 'Rs. 3,750.00', 'new category is created and the entry saved in one tap');
  await page.click('button[aria-label="Add"]');
  assert(await page.locator('.cat:has-text("Rent")').isVisible(), 'new category appears in the grid');
  await page.click('.sheet-bg', { position: { x: 10, y: 10 } });
  await page.click('button[aria-label="Settings"]');
  await page.click('.chip:has-text("Rent")');
  await page.locator('.chip:has-text("Rent")').waitFor({ state: 'detached' });
  await page.click('.sheet button.ghost');
  assert(await page.locator('.list li:has-text("Rent")').isVisible(), 'removing a category keeps past entries');
  await page.click('button[aria-label="Add"]');
  assert(!(await page.locator('.cat:has-text("Rent")').count()), 'removed category leaves the grid');
  await page.click('.sheet-bg', { position: { x: 10, y: 10 } });

  // Accounts: hidden until a second one exists, then chips, a From picker and balance fixes appear.
  assert(!(await page.locator('.accounts').count()), 'no account UI with a single account');
  await page.click('button[aria-label="Settings"]');
  await page.click('.add-acct');
  await page.fill('input[placeholder^="Name"]', 'BOC');
  await page.fill('input[placeholder^="How much"]', '50000');
  await page.click('.new-cat button:has-text("Add account")');
  await page.locator('.acct-row:has-text("BOC")').waitFor();
  await page.click('.sheet button.ghost');
  await page.locator('.accounts').waitFor();
  assert(await page.locator('.acct').count() === 2, 'balance chips appear with two accounts');
  const boc = page.locator('.acct:has-text("BOC") b');
  assert((await boc.textContent()) === 'Rs. 50,000.00', 'new account starts with the amount in it now');
  assert(!(await page.locator('.carry, .carry-link:has-text("Carry")').count()), 'carry-over steps aside once accounts exist');

  const spentBefore = await text('spent');
  await page.click('button[aria-label="Add"]');
  for (const k of '2000') await page.click(`.keypad button:text-is("${k}")`);
  await page.click('.from button:has-text("BOC")');
  await page.screenshot({ path: 'e2e/account-picker.png' });
  await page.click('.cat:has-text("Shopping")');
  await page.locator('.list li:has-text("Shopping")').waitFor();
  assert((await boc.textContent()) === 'Rs. 48,000.00', 'expense comes out of the chosen account');
  assert(await page.locator('.list li:has-text("Shopping") small:has-text("BOC")').isVisible(), 'list shows which account paid');
  await page.click('button[aria-label="Add"]');
  assert((await page.textContent('.from button.on')).includes('BOC'), 'last used account is remembered');
  await page.click('.sheet-bg', { position: { x: 10, y: 10 } });

  await page.click('.acct:has-text("BOC")');
  await page.locator('.list li:has-text("Lunch")').waitFor({ state: 'detached' });
  assert(await page.locator('.list li:has-text("Shopping")').isVisible(), 'tapping a chip shows only that account');
  await page.click('.carry-link:has-text("Fix balance")');
  await page.fill('.fix input', '47500');
  await page.click('.fix button');
  await page.locator('.list li:has-text("Balance fix")').waitFor();
  assert((await boc.textContent()) === 'Rs. 47,500.00', 'fixing the balance matches reality');
  const spentAfterFix = await text('spent');
  await page.screenshot({ path: 'e2e/accounts.png' });
  await page.click('.acct:has-text("BOC")');
  await page.locator('.list li:has-text("Lunch")').waitFor();
  assert(spentAfterFix !== spentBefore, 'shopping counts as spending');
  await page.click('.list li:has-text("Balance fix")');
  await page.locator('.list li:has-text("Balance fix")').waitFor({ state: 'detached' });
  assert((await text('spent')) === spentAfterFix, 'a balance fix is not counted as spending');
  await page.click('.toast button:text-is("Undo")');
  await page.locator('.list li:has-text("Balance fix")').waitFor();

  // Transfers: money moves between accounts without counting as spending or income.
  const cash = page.locator('.acct:has-text("Cash") b');
  const cashBefore = await cash.textContent();
  const spentBeforeTransfer = await text('spent');
  await page.click('button[aria-label="Add"]');
  await page.click('.toggle button:text-is("Transfer")');
  for (const k of '10000') await page.click(`.keypad button:text-is("${k}")`);
  await page.click('.from:has-text("From") button:has-text("BOC")');
  await page.click('.from:has-text("To") button:has-text("BOC")');
  assert((await page.textContent('.from:has-text("From") button.on')).includes('Cash'), 'picking the same account swaps From and To');
  await page.click('.from:has-text("From") button:has-text("BOC")');
  await page.screenshot({ path: 'e2e/transfer.png' });
  await page.click('button:has-text("Save transfer")');
  await page.locator('.list li:has-text("BOC → Cash")').waitFor();
  assert((await boc.textContent()) === 'Rs. 37,500.00', 'transfer takes money out of the source account');
  const toNum = (s) => Number(s.replace('Rs.', '').replace(/[^\d.-]/g, ''));
  assert(toNum(await cash.textContent()) - toNum(cashBefore) === 10000, 'transfer puts it into the other account');
  assert((await text('spent')) === spentBeforeTransfer, 'a transfer is not spending');
  await page.click('button[aria-label="Add"]');
  assert((await page.textContent('.from button.on')).includes('BOC'), 'a transfer does not change the remembered account');
  await page.click('.sheet-bg', { position: { x: 10, y: 10 } });
  await page.click('.acct:has-text("Cash")');
  assert((await page.textContent('.list li:has-text("BOC → Cash") .amt')).startsWith('+'), 'filtered to Cash, the transfer shows as money in');
  await page.screenshot({ path: 'e2e/transfer-list.png' });
  await page.click('.acct:has-text("Cash")');
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
