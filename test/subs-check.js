// 実況字幕の突き合わせ：字幕が出た時刻と「言い終わる時刻」のレース状況（先頭・最後尾・上位2人）を並べて表示する。
// 使い方: node test/subs-check.js           （読み上げなし＝字幕のみ）
//         node test/subs-check.js voice     （読み上げを疑似再現。速さは PC 内蔵音声の実測に合わせて 約185ms/字）
//         node test/subs-check.js voice 3   （3レース分をまとめて集計）
// 最後に「最後まで言えた割合」「言い終わりでも状況が同じ割合」を出す（目安：80% 以上 / 90% 以上）。
const path = require('path');
const { chromium } = require('playwright');
const URL = 'file:///' + path.join(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/');
const FAKE = process.argv[2] === 'voice';
const RUNS = +(process.argv[3] || 1);
const MS_PER_CHAR = 185; // Microsoft Ayumi / Haruka を rate 1.25〜1.45 で読んだときの実測

(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  let tot = { utt: 0, full: 0, cut: 0, never: 0, chk: 0, ok: 0 };
  for (let run = 0; run < RUNS; run++) {
    const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    if (FAKE) await p.addInitScript((ms) => {
      window.__utt = [];
      const v = { lang: 'ja-JP', localService: true, name: 'fake' };
      window.SpeechSynthesisUtterance = function (t) { this.text = t; };
      let cur = null, tm = [];
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        getVoices: () => [v, v], addEventListener() {},
        cancel() { tm.forEach(clearTimeout); tm = []; if (cur) { const u = cur; cur = null; if (u.__r.start) u.__r.cut = true; u.onerror && u.onerror({}); } },
        speak(u) {
          cur = u; const r = { text: u.text, dur: 40 + u.text.length * ms }; u.__r = r; window.__utt.push(r);
          tm.push(setTimeout(() => { r.start = true; u.onstart && u.onstart({});
            tm.push(setTimeout(() => { if (cur === u) { cur = null; r.full = true; u.onend && u.onend({}); } }, r.dur)); }, 40));
        } } });
    }, MS_PER_CHAR);
    await p.goto(URL + '?speed=1');
    await p.evaluate(() => { const o = RR.Core.planRace; RR.Core.planRace = function () { const pl = o.apply(this, arguments); window.__plan = pl; return pl; }; });
    await p.click('#btnStart');
    await p.waitForFunction(() => window.__raceLog.done, null, { timeout: 120000 }).catch(async () => { console.log('TIMEOUT', errs); });
    await p.waitForTimeout(FAKE ? 15000 : 500); // 結果画面の締めの掛け合いまで
    const r = await p.evaluate((ms) => {
      const pl = window.__plan, L = window.__raceLog;
      const ord = (t) => [...Array(pl.n).keys()].sort((a, b) => pl.progress(b, t) - pl.progress(a, t));
      return { slowFrom: pl.slowFrom, finalFrom: pl.finalFrom, events: pl.events.map((e) => [e.t, e.type, pl.names[e.runner]]),
        utt: window.__utt || [],
        subs: L.subs.map((s) => {
          const end = s.t + (window.__utt ? 40 + s.text.length * ms : 2200);
          return { ...s, end: Math.round(end), lead: pl.names[pl.leaderAt(s.t)], leadEnd: pl.names[pl.leaderAt(end)],
            last: pl.names[ord(s.t)[pl.n - 1]], lastEnd: pl.names[ord(end)[pl.n - 1]], top2: [0, 1].map((k) => pl.names[ord(s.t)[k]]) };
        }), errors: L.errors };
    }, MS_PER_CHAR);
    console.log(`--- race ${run + 1}  finalFrom ${r.finalFrom} slowFrom ${r.slowFrom} events ${JSON.stringify(r.events)}`);
    r.subs.forEach((s) => {
      let mark = '  ';
      if (/^(lead|leader)\+?$/.test(s.kind)) { tot.chk++; mark = s.lead === s.leadEnd ? 'OK' : 'NG'; if (mark === 'OK') tot.ok++; }
      if (/^last\+?$/.test(s.kind)) { tot.chk++; mark = s.last === s.lastEnd ? 'OK' : 'NG'; if (mark === 'OK') tot.ok++; }
      console.log(mark, String(s.t).padStart(6), String(s.genT).padStart(6), s.shownAt.padEnd(5), s.kind.padEnd(9), s.text.padEnd(16, '　'),
        '先頭=' + s.lead + (s.lead !== s.leadEnd ? '→' + s.leadEnd : ''), '最後尾=' + s.last + (s.last !== s.lastEnd ? '→' + s.lastEnd : ''), '上位=' + s.top2.join('/'));
    });
    r.utt.forEach((u) => { tot.utt++; if (u.full) tot.full++; else if (u.start) tot.cut++; else tot.never++; });
    if (FAKE) r.utt.filter((u) => !u.full).forEach((u) => console.log('   ' + (u.start ? '途中で切れた' : '始まらず') + ': ' + u.text));
    console.log('errors', r.errors, errs);
    await p.context().close();
  }
  if (FAKE) console.log(`\n読み上げ ${tot.utt} 文：最後まで ${tot.full}（${(100 * tot.full / Math.max(1, tot.utt)).toFixed(0)}%）、途中で切れた ${tot.cut}、始まらず ${tot.never}`);
  console.log(`先頭・最後尾ネタ ${tot.chk} 件：言い終わりでも同じ ${tot.ok}（${(100 * tot.ok / Math.max(1, tot.chk)).toFixed(0)}%）`);
  await b.close();
})();
