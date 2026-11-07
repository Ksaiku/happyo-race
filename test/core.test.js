'use strict';
var Core = require('../src/core.js');

var NAMES = ['あおい', 'はると', 'こはる', 'そうた', 'みなと', 'ゆい', 'れん', 'さくら', 'ひなた', 'りく', 'めい', 'かい'];
var failures = 0;
function report(ok, label, detail) {
  if (!ok) failures++;
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''));
}
var master = Core.createRng(20240607);
function nextSeed() { return Math.floor(master() * 4294967296); }
function names(n) { return NAMES.slice(0, n); }

// ---------------------------------------------------------------- basics
(function () {
  var r1 = Core.createRng(42), r2 = Core.createRng(42);
  var same = true, inRange = true;
  for (var i = 0; i < 100; i++) { var x = r1(), y = r2(); if (x !== y) same = false; if (x < 0 || x >= 1) inRange = false; }
  var u = Core.createRng()();
  var src = [1, 2, 3, 4, 5], sh = Core.shuffle(src, Core.createRng(1));
  var okShuffle = src.join() === '1,2,3,4,5' && sh.slice().sort().join() === '1,2,3,4,5';
  var dataOk = Core.VEHICLES.length >= 8 && Core.WEATHERS.length >= 6 &&
    Core.VEHICLES.every(function (v) { return v.id && v.emoji && v.label && v.counter; }) &&
    Core.WEATHERS.every(function (v) { return v.id && v.emoji && v.label && v.forecast; });
  report(same && inRange && u >= 0 && u < 1 && okShuffle && dataOk, 'basics: rng/shuffle/VEHICLES/WEATHERS');
})();

// ---------------------------------------------------------------- per-plan validation
function validate(plan, nm) {
  var errs = [];
  function e(tag, msg) { errs.push('[' + tag + '] ' + msg); }
  var n = plan.n, ft = plan.finishTime, order = plan.order, p = plan.photo, i, k, t;

  // structure
  if (plan.order.slice().sort(function (x, y) { return x - y; }).join() !== nm.map(function (_, j) { return j; }).join()) e('R3', 'order not permutation');
  for (i = 0; i < n; i++) if (plan.rankOf[i] !== order.indexOf(i)) e('R3', 'rankOf mismatch');

  // R2
  for (i = 0; i < n; i++) {
    if (plan.progress(i, ft[i]) !== 1) e('R2', 'progress(finish)!=1');
    if (plan.progress(i, ft[i] + 500) !== 1) e('R2', 'progress(after)!=1');
    if (plan.progress(i, 0) !== 0 || plan.progress(i, -50) !== 0) e('R2', 'progress(<=0)!=0');
    var ts = [ft[i] - 1, ft[i] - 0.01];
    for (t = 0; t < ft[i]; t += 50) ts.push(t);
    for (k = 0; k < ts.length; k++) {
      var v = plan.progress(i, ts[k]);
      if (!(v < 1) || !(v >= 0)) { e('R2', 'range violation ' + v + ' at ' + ts[k]); break; }
    }
  }

  // R3
  for (k = 1; k < n; k++) if (!(ft[order[k]] > ft[order[k - 1]])) e('R3', 'finish not strictly increasing');
  var d01 = ft[order[1]] - ft[order[0]];
  if (d01 < 40 || d01 > 120) e('R3', '1st-2nd gap ' + d01);
  for (k = 2; k < n; k++) {
    var dg = ft[order[k]] - ft[order[k - 1]];
    if (dg < 200 || dg > 900) e('R3', 'gap ' + dg);
  }
  if (plan.raceEnd < 26000 || plan.raceEnd > 29000 || plan.raceEnd !== ft[order[n - 1]]) e('R3', 'raceEnd ' + plan.raceEnd);
  if (p.a !== order[0] || p.b !== order[1] || p.t0 !== ft[p.a] || p.t1 !== ft[p.b]) e('R3', 'photo mismatch');
  if (plan.slowFrom < p.t0 - 1600 || plan.slowFrom > p.t0 - 1200) e('R3', 'slowFrom ' + plan.slowFrom);
  if (!/^[0-9A-Z]{2}-[0-9A-Z]{3}-[0-9A-Z]{2}$/.test(plan.sealCode) || plan.sealCode !== Core.sealCode(plan.order, nm)) e('R3', 'sealCode ' + plan.sealCode);

  // R4
  var ev = plan.events;
  if (ev.length < 2 || ev.length > 4) e('R4', 'event count ' + ev.length);
  var lastT = -1;
  ev.forEach(function (x) {
    if (x.t < lastT) e('R4', 'events not sorted'); lastT = x.t;
    var rs = [x.runner]; if (x.runner2 !== undefined) rs.push(x.runner2);
    if (x.type === 'swap' ? (x.runner2 === undefined || x.runner2 === x.runner) : x.runner2 !== undefined) e('R4', 'runner2 misuse');
    rs.forEach(function (r) {
      if (!(x.end <= ft[r] - 2500)) e('R4', x.type + ' end ' + x.end + ' > finish-2500 ' + (ft[r] - 2500));
    });
    if (!(x.end <= plan.slowFrom)) e('R4', 'end after slowFrom');
    if (x.t < 3000) e('R4', 'event too early');
    if (x.type === 'stumble' && (x.dur < 800 || x.dur > 1200)) e('R4', 'stumble dur');
    if (x.type === 'boost' && x.dur !== 1200) e('R4', 'boost dur');
    if (x.type === 'reverse' && x.dur !== 700) e('R4', 'reverse dur');
    if (nm[x.runner] && x.text.indexOf(nm[x.runner] + 'さん') < 0) e('R4', 'text lacks name');
    if (x.type === 'swap') {
      if (x.text.indexOf(nm[x.runner2] + 'さん') < 0) e('R4', 'swap text lacks name2');
      if (Math.abs(plan.progress(x.runner, x.t) - plan.baseProgress(x.runner2, x.t)) > 1e-9) e('R4', 'swap does not exchange positions');
    }
    // offset returns to 0 after end (check when no other event touches the runner afterwards)
    rs.forEach(function (r) {
      var later = ev.some(function (y) { return y !== x && (y.runner === r || y.runner2 === r) && y.end + 1 > x.end && y.t < ft[r] - 2500; });
      var tEnd = x.end + 1;
      if (!later && tEnd < ft[r] - 2500) {
        var active = ev.some(function (y) { return y !== x && (y.runner === r || y.runner2 === r) && y.t <= tEnd && tEnd <= y.end; });
        if (!active && Math.abs(plan.progress(r, tEnd) - plan.baseProgress(r, tEnd)) > 1e-9) e('R4', 'offset not zero after end');
      }
    });
  });
  if (plan.freeze) {
    var f = plan.freeze;
    if (f.dur !== 1600 || f.t < 0.3 * plan.raceEnd - 1 || f.t > 0.6 * plan.raceEnd + 1 || f.t >= plan.slowFrom - 1000) e('R4', 'freeze range ' + f.t);
    ev.forEach(function (x) { if (f.t >= x.t - 400 && f.t <= x.end + 200) e('R4', 'freeze overlaps event'); });
  }

  // R5 finale: 2nd place edges ahead sometime in the last 2s; both run side by side
  var ahead = false, close = true;
  for (t = p.t0 - 2000; t < p.t0; t += 10) {
    var pa = plan.progress(p.a, t), pb = plan.progress(p.b, t);
    if (pb > pa + 1e-6) ahead = true;
    if (Math.abs(pa - pb) > 0.03) close = false;
    for (i = 0; i < n; i++) if (i !== p.a && i !== p.b && plan.progress(i, t) > Math.max(pa, pb)) close = false;
  }
  if (!ahead) e('R5', 'b never ahead of a in last 2s');
  if (!close) e('R5', 'a/b not side by side & in front');

  // R6 monotone except reverse windows and swap instants
  for (i = 0; i < n; i++) {
    var prev = 0;
    for (t = 10; t <= ft[i] + 10; t += 10) {
      var cur = plan.progress(i, t);
      if (cur < 0) e('R6', 'negative');
      if (cur < prev - 1e-12) {
        var exempt = ev.some(function (x) {
          if (x.runner !== i && x.runner2 !== i) return false;
          if (x.type === 'reverse') return t >= x.t - 10 && t <= x.t + x.dur + 20;
          if (x.type === 'swap') return t >= x.t - 10 && t <= x.t + 20;
          return false;
        });
        if (!exempt) { e('R6', 'decrease runner ' + i + ' at ' + t + ' by ' + (prev - cur)); break; }
      }
      prev = cur;
    }
  }
  ev.forEach(function (x) {
    if (x.type !== 'reverse') return;
    var dec = false, q = plan.progress(x.runner, x.t);
    for (var tt = x.t + 10; tt <= x.t + x.dur; tt += 10) { var c2 = plan.progress(x.runner, tt); if (c2 < q) dec = true; q = c2; }
    if (!dec) e('R6', 'reverse does not move backward');
  });

  // commentary: only the 2 pre-race intro lines (negative times)
  var cm = plan.commentary;
  if (cm.length !== 2) e('CM', 'lines ' + cm.length);
  for (k = 0; k < cm.length; k++) {
    if (!(cm[k].t < 0)) e('CM', 'commentary not pre-race');
    if (k && cm[k].t < cm[k - 1].t) e('CM', 'not sorted');
    if (cm[k].role !== (k === 0 ? 'ana' : 'kai')) e('CM', 'bad role');
    if (!cm[k].text) e('CM', 'empty text');
  }
  var joined = cm.map(function (l) { return l.text; }).join('\n');
  if (joined.indexOf(plan.weather.label) < 0) e('CM', 'no weather mention');
  if (joined.indexOf(plan.vehicle.label) < 0) e('CM', 'no vehicle mention');

  // v2: finalFrom
  if (!(Number.isInteger(plan.finalFrom)) || plan.finalFrom < p.t0 - 5500 || plan.finalFrom > p.t0 - 4500 || plan.finalFrom <= 0 || plan.finalFrom >= plan.slowFrom) e('FF', 'finalFrom ' + plan.finalFrom);

  // v2: leadChanges format + flicker exclusion
  var lcs = plan.leadChanges;
  if (!Array.isArray(lcs)) e('LC', 'leadChanges not array');
  else {
    var base = plan.leaderAt(50), l1 = base, l2 = -1;
    for (k = 0; k < lcs.length; k++) {
      var c = lcs[k];
      if (typeof c.t !== 'number' || !(c.leader >= 0 && c.leader < n && Number.isInteger(c.leader))) { e('LC', 'bad entry'); break; }
      if (k && c.t < lcs[k - 1].t) e('LC', 'not sorted');
      if (c.leader === l1) e('LC', 'same leader consecutive');
      if (k && c.leader === l2 && c.t - lcs[k - 1].t <= 400) e('LC', 'flicker ' + (c.t - lcs[k - 1].t) + 'ms');
      if (plan.leaderAt(c.t) !== c.leader) e('LC', 'leaderAt mismatch at ' + c.t);
      if (c.t > p.t0 + 100) e('LC', 'change after goal');
      l2 = l1; l1 = c.leader;
    }
    if (plan.leaderAt(p.t0 + 200) !== p.a) e('LC', 'leader after goal is not winner');
  }

  // v2: positionAt consistent with leaderAt / progress
  for (t = -100; t <= plan.raceEnd + 300; t += 97) {
    var pos = plan.positionAt(t);
    if (pos.length !== n || pos.slice().sort(function (x, y) { return x - y; }).join() !== nm.map(function (_, j) { return j; }).join()) { e('PA', 'positionAt not a permutation at ' + t); break; }
    if (pos[plan.leaderAt(t)] !== 0) { e('PA', 'positionAt leader mismatch at ' + t); break; }
    var bad = false;
    for (i = 0; i < n && !bad; i++) for (k = 0; k < n; k++) if (plan.progress(i, t) > plan.progress(k, t) && pos[i] > pos[k]) { bad = true; break; }
    if (bad) { e('PA', 'positionAt order vs progress at ' + t); break; }
  }
  var fin = plan.positionAt(plan.raceEnd + 500);
  for (i = 0; i < n; i++) if (fin[i] !== plan.rankOf[i]) { e('PA', 'final positionAt != rankOf'); break; }

  return errs;
}

var RUNS_PER_N = 200;
var lead = {};
[2, 6, 8, 10, 12].forEach(function (n) {
  var nm = names(n), errs = [], evCnt = {}, frz = 0, notLeadA = 0, notLeadB = 0, types = {};
  var tag = {}, lc2 = 0, lcSum = 0, dg = [], i;
  for (var r = 0; r < RUNS_PER_N; r++) {
    var plan = Core.planRace(nm, { seed: nextSeed() });
    var es = validate(plan, nm);
    es.forEach(function (m) { errs.push(m); tag[m.slice(1, m.indexOf(']'))] = (tag[m.slice(1, m.indexOf(']'))] || 0) + 1; });
    evCnt[plan.events.length] = (evCnt[plan.events.length] || 0) + 1;
    plan.events.forEach(function (x) { types[x.type] = (types[x.type] || 0) + 1; });
    if (plan.freeze) frz++;
    if (plan.leaderAt(0.5 * plan.raceEnd) !== plan.order[0]) notLeadA++;
    if (plan.leaderAt(0.5 * plan.photo.t0) !== plan.order[0]) notLeadB++;
    // lead changes in the last 40% (of the time until the winner crosses)
    var lo = 0.6 * plan.photo.t0, cnt = plan.leadChanges.filter(function (c) { return c.t >= lo; }).length;
    if (cnt >= 2) lc2++;
    lcSum += cnt;
    // pack tightness at finalFrom: spread of everyone except the current leader and the last runner
    if (n >= 4) {
      var pr = [];
      for (i = 0; i < n; i++) pr.push(plan.progress(i, plan.finalFrom));
      pr.sort(function (x, y) { return x - y; });
      dg.push(pr[n - 2] - pr[1]);
    }
  }
  lead[n] = { a: notLeadA / RUNS_PER_N, b: notLeadB / RUNS_PER_N };
  report(errs.length === 0, 'n=' + n + ' x' + RUNS_PER_N + ' rules R2-R6+v2 (finalFrom/leadChanges/positionAt/commentary)',
    errs.length ? JSON.stringify(tag) + ' e.g. ' + errs.slice(0, 3).join(' | ') : 'events:' + JSON.stringify(evCnt) + ' freeze:' + frz + ' types:' + JSON.stringify(types));
  report(lead[n].a >= 0.6 && lead[n].b >= 0.6, 'n=' + n + ' R5 leader@50% != winner',
    'at raceEnd/2: ' + (lead[n].a * 100).toFixed(1) + '%, at winner-time/2: ' + (lead[n].b * 100).toFixed(1) + '%');
  var lcRate = lc2 / RUNS_PER_N;
  report(lcRate >= 0.8, 'n=' + n + ' lead changes >=2 in last 40%',
    (lcRate * 100).toFixed(1) + '% of races (avg ' + (lcSum / RUNS_PER_N).toFixed(2) + ' changes), need >=80%');
  if (n >= 4) {
    dg.sort(function (x, y) { return x - y; });
    var mean = dg.reduce(function (x, y) { return x + y; }, 0) / dg.length, p90 = dg[Math.floor(dg.length * 0.9)], mx = dg[dg.length - 1];
    var limMean = n <= 8 ? 0.06 : 0.11, limMax = n <= 8 ? 0.10 : 0.17;
    report(mean <= limMean && mx <= limMax, 'n=' + n + ' pack tightness at finalFrom (middle runners, excl. leader & last)',
      'range mean=' + mean.toFixed(3) + ' p90=' + p90.toFixed(3) + ' max=' + mx.toFixed(3) + ' (limits mean<=' + limMean + ' max<=' + limMax + ')');
  }
});

// ---------------------------------------------------------------- fairness (R1)
function chiCrit(df, z) { var c = 2 / (9 * df); return df * Math.pow(1 - c + z * Math.sqrt(c), 3); }
function fairness(n, runs, printTable) {
  var nm = names(n), tbl = [], i, j;
  for (i = 0; i < n; i++) { tbl.push([]); for (j = 0; j < n; j++) tbl[i].push(0); }
  for (var r = 0; r < runs; r++) {
    var plan = Core.planRace(nm, { seed: nextSeed() });
    plan.order.forEach(function (runner, rank) { tbl[runner][rank]++; });
  }
  var E = runs / n, chi = 0;
  for (i = 0; i < n; i++) for (j = 0; j < n; j++) chi += (tbl[i][j] - E) * (tbl[i][j] - E) / E;
  var df = (n - 1) * (n - 1);
  var adj = chi * (n - 1) / n; // permutation-matrix correction: E[chi]=n(n-1) vs df=(n-1)^2
  var crit = chiCrit(df, 3.0902);
  if (printTable) {
    console.log('  count table (row=runner, col=rank, expected ' + E + '):');
    for (i = 0; i < n; i++) console.log('   ' + tbl[i].map(function (v) { return ('   ' + v).slice(-4); }).join(''));
  }
  report(adj < crit, 'R1 fairness n=' + n + ' x' + runs,
    'chi2=' + chi.toFixed(1) + ' adj=' + adj.toFixed(1) + ' df=' + df + ' crit(p=0.001)=' + crit.toFixed(1) + (adj < crit ? ' -> uniform (p>0.001)' : ' -> BIASED'));
}
fairness(8, 1000, true);
fairness(2, 1000, false);
fairness(12, 1000, false);

// ---------------------------------------------------------------- event targets by final rank
(function () {
  var n = 8, nm = names(n), cnt = [], q;
  for (q = 0; q < n; q++) cnt.push(0);
  for (var r = 0; r < 1000; r++) {
    var plan = Core.planRace(nm, { seed: nextSeed() });
    var hit = {};
    plan.events.forEach(function (x) { hit[plan.rankOf[x.runner]] = 1; if (x.runner2 !== undefined) hit[plan.rankOf[x.runner2]] = 1; });
    Object.keys(hit).forEach(function (k) { cnt[k]++; });
  }
  var mn = Math.min.apply(null, cnt), mx = Math.max.apply(null, cnt);
  report(cnt[0] > 0 && cnt[1] > 0 && mn > 0.5 * (cnt.reduce(function (x, y) { return x + y; }, 0) / n) && mx < 1.6 * (cnt.reduce(function (x, y) { return x + y; }, 0) / n),
    'event targets not skewed by final rank (n=8 x1000)', 'by rank 1..8: ' + cnt.join(' '));
})();

// ---------------------------------------------------------------- same members, 10 races
(function () {
  var nm = names(8), seen = {}, i;
  for (i = 0; i < 10; i++) seen[Core.planRace(nm, { seed: nextSeed() }).order.join()] = 1;
  var seeded = Object.keys(seen).length;
  var seen2 = {};
  for (i = 0; i < 10; i++) seen2[Core.planRace(nm).order.join()] = 1;
  var unseeded = Object.keys(seen2).length;
  report(seeded === 10 && unseeded >= 9, 'same members x10 give different orders', 'distinct seeded=' + seeded + ' unseeded=' + unseeded);
  var a = Core.planRace(nm, { seed: 7 }), b = Core.planRace(nm, { seed: 7 });
  report(a.sealCode === b.sealCode && a.order.join() === b.order.join() && a.events.length === b.events.length, 'same seed -> same plan');
})();

console.log(failures === 0 ? 'ALL PASS' : ('FAILED: ' + failures));
process.exit(failures === 0 ? 0 : 1);
