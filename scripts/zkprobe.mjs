import { chromium } from 'playwright';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[console.${msg.type()}] ${msg.text().slice(0, 500)}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror] ${String(err).slice(0, 800)}`));

  await page.goto('http://localhost:5173/zkprobe.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('out')?.textContent?.includes('PROBE DONE'), null, { timeout: 60000 }).catch(() => {});
  const text = await page.evaluate(() => document.getElementById('out')?.textContent ?? '(no output)');
  console.log('=== PROBE OUTPUT ===');
  console.log(text.slice(0, 6000));
  console.log('=== CONSOLE ERRORS ===');
  console.log(errors.slice(0, 12).join('\n').slice(0, 4000));
  await browser.close();
};
run().catch((e) => { console.error('runner failed:', e); process.exit(1); });
