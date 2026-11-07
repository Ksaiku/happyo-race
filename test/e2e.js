// E2E: dist/index.html をヘッドレス Edge で開き、2/8/12人のレースを最後まで走らせて検証する。
// 使い方: node test/e2e.js   （Playwright + インストール済み Microsoft Edge を使用）
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const URL_BASE = 'file:///' + path.join(ROOT, 'dist', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const SAMPLE = ['あおい', 'はると', 'こはる', 'そうた', 'みなと', 'ゆい', 'れん', 'さくら', 'ひなた', 'いつき', 'めい', 'りく'];
const CASES = [
  { n: 2, speed: 3 },
  { n: 8, speed: 1, shots: true },   // 等速で体感時間も測る
  { n: 12, speed: 3, shots: true },
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.setOffline(true); // インターネット無しで動くこと
  const external = [];
  context.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob|about):/.test(u)) external.push(u); });

  let allOk = true;
  const report = [];
  for (const c of CASES) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(`${URL_BASE}?speed=${c.speed}`);
    const names = SAMPLE.slice(0, c.n);
    await page.fill('#names', names.join('\n'));
    const t0 = Date.now();
    await page.click('#btnStart');

    if (c.shots) {
      // レース中盤のスクショ
      await page.waitForFunction(() => {
        const r = document.getElementById('race');
        const intro = document.getElementById('intro');
        const cnt = document.getElementById('count');
        const vis = (el) => el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
        return vis(r) && !vis(intro) && !vis(cnt);
      }, null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(9000 / c.speed);
      await page.screenshot({ path: path.join(SHOTS, `race-${c.n}.png`) });
      // 写真判定フィルム
      await page.waitForFunction(() => { const f = document.getElementById('film'); return f && !f.classList.contains('hidden') && getComputedStyle(f).display !== 'none'; }, null, { timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(2600 / c.speed);
      await page.screenshot({ path: path.join(SHOTS, `photo-${c.n}.png`) });
    }

    await page.waitForFunction(() => window.__raceLog && window.__raceLog.done, null, { timeout: 120000 });
    const wall = (Date.now() - t0) / 1000;
    if (c.shots) {
      await page.waitForTimeout(3500);
      await page.screenshot({ path: path.join(SHOTS, `result-${c.n}.png`) });
    }
    const log = await page.evaluate(() => window.__raceLog);
    const same = JSON.stringify(log.goalOrder) === JSON.stringify(log.resultOrder);
    const complete = log.goalOrder.length === c.n && new Set(log.goalOrder).size === c.n && names.every((x) => log.goalOrder.includes(x));
    const errs = errors.concat(log.errors || []);
    const verdict = log.verdictShown === true;   // v4: 写真判定の「1着 ○○さん！」が結果画面の前に出たか
    const ok = same && complete && verdict && errs.length === 0;
    allOk = allOk && ok;
    report.push({ n: c.n, speed: c.speed, ok, sameOrder: same, complete, verdict, wallSec: +wall.toFixed(1), goalOrder: log.goalOrder.join(','), errors: errs });
    await page.close();
  }
  await browser.close();

  for (const r of report) console.log(JSON.stringify(r));
  console.log('external requests:', external.length ? external : 'none');
  if (external.length) allOk = false;
  console.log(allOk ? 'E2E: ALL PASS' : 'E2E: FAIL');
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
