var RR = (typeof window !== 'undefined') ? (window.RR = window.RR || {}) : {};

RR.Core = (function () {
  'use strict';

  // ---------------------------------------------------------------- RNG
  function randomSeed32() {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
      }
    } catch (e) { /* fallthrough */ }
    try {
      if (typeof require === 'function') {
        return require('crypto').randomInt(0, 4294967296) >>> 0;
      }
    } catch (e2) { /* fallthrough */ }
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }

  function createRng(seed) {
    var s;
    if (seed === undefined || seed === null) s = randomSeed32();
    else if (typeof seed === 'number') s = seed >>> 0;
    else s = fnv1a(String(seed)) >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function fnv1a(str, seed) {
    var h = (seed === undefined ? 0x811c9dc5 : seed) >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function fmix(h) {
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  var SEAL_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function sealCode(order, names) {
    var s = order.map(function (i) { return names[i]; }).join('\u0001') + '|' + order.join(',');
    var h1 = fmix(fnv1a(s));
    var h2 = fmix(fnv1a(s + '#seal', 0x2545F491));
    var c = [];
    for (var j = 0; j < 6; j++) c.push(SEAL_ALPHABET.charAt((h1 >>> (5 * j)) & 31));
    c.push(SEAL_ALPHABET.charAt(h2 & 31));
    return c[0] + c[1] + '-' + c[2] + c[3] + c[4] + '-' + c[5] + c[6];
  }

  // ---------------------------------------------------------------- data
  var VEHICLES = [
    { id: 'horse',   emoji: '🐎', label: '馬',                 counter: '頭' },
    { id: 'snail',   emoji: '🐌', label: 'カタツムリ',         counter: '匹' },
    { id: 'turtle',  emoji: '🐢', label: 'カメ',               counter: '匹' },
    { id: 'duck',    emoji: '🦆', label: 'アヒル',             counter: '羽' },
    { id: 'cart',    emoji: '🛒', label: 'ショッピングカート', counter: '台' },
    { id: 'chair',   emoji: '🪑', label: 'イス',               counter: '脚' },
    { id: 'pig',     emoji: '🐖', label: 'ブタ',               counter: '頭' },
    { id: 'rocket',  emoji: '🚀', label: 'ロケット',           counter: '機' },
    { id: 'bike',    emoji: '🚲', label: '自転車',             counter: '台' },
    { id: 'penguin', emoji: '🐧', label: 'ペンギン',           counter: '羽' }
  ];

  var WEATHERS = [
    { id: 'sunny',  emoji: '☀️',         label: '快晴',   forecast: '終日快晴、ただしレース後半にところにより波乱', note: '日差しは強いですが、走者には追い風と言えそうです' },
    { id: 'rain',   emoji: '🌧️',   label: '雨',     forecast: '午後から本降り、足元の悪い中での勝負です',     note: '路面が滑りやすいので、転倒には要注意ですね' },
    { id: 'fog',    emoji: '🌫️',   label: '濃霧',   forecast: '午後から濃霧、ところにより波乱',             note: '視界が悪く、思わぬ位置取りの変化が起きそうです' },
    { id: 'snow',   emoji: '❄️',         label: '雪',     forecast: '大粒の雪が舞い、ところにより逆転',           note: '雪は走りにくいですが、その分展開が読めません' },
    { id: 'sunset', emoji: '🌇',         label: '夕焼け', forecast: '夕焼けが広がり、終盤に大どんでん返しの予感', note: '夕日が長い影を作っています。終盤の駆け引きに注目です' },
    { id: 'night',  emoji: '🌙',         label: '夜',     forecast: '月明かりの下、静かな夜のレースになります',   note: '暗い中でも名前札がよく見えます。見失わないように' },
    { id: 'wind',   emoji: '💨',         label: '強風',   forecast: '強風注意、追い風と向かい風が入り乱れます',   note: '風向き次第で順位が入れ替わりますよ' }
  ];

  var TEXTS = {
    stumble: ['{n}、まさかの転倒！', '{n}、落とし物を拾いに戻る！', '{n}、靴ひもが…！立ち止まった！', '{n}、突然のストップ！'],
    boost:   ['{n}、急加速！', '{n}、ターボ点火！', '{n}、追い風をつかんだ！'],
    reverse: ['{n}、まさかの逆走！？', '{n}、忘れ物に気づいて引き返す！？', '{n}、道を間違えた！？'],
    swap:    ['閃光！{n}と{m}が入れ替わった！？', 'まぶしい！{n}と{m}の位置が入れ替わった！？', '謎の光！{n}と{m}が入れ替わった！？']
  };

  // material for the app's live commentary ({n}, {m} = "名前さん")
  var PHRASES = {
    lead:   ['{n}が先頭！', '先頭は{n}！', '{n}、前に出た！'],
    change: ['先頭交代！{n}！', '{n}が抜いた！', '{n}がトップ！'],
    chase:  ['{n}、追い上げる！', '{n}が迫る！', '{n}、じわじわ前へ！'],
    last:   ['{n}、まだ諦めない！', '{n}、最後尾から！'],
    final:  ['ラストスパート！', '勝負はここから！'],
    photo:  ['{n}か！{m}か！', '{n}と{m}、並んだ！']
  };

  // 走りのばらけ具合（v4）。mid=中盤のずれの大きさ、backDrift/back/backGap=優勝争い以外の後方の間隔、minSlow=終盤入りで落とせる速さの下限
  var SPREAD = { mid: 0.2, backDrift: 0.015, back: 1.3, backGap: 0.02, minSlow: 0.12, packJitter: 0.012 };

  // ---------------------------------------------------------------- helpers
  function w(x) { return x >= 1 ? 0 : (x <= 0 ? 1 : 0.5 * (1 + Math.cos(Math.PI * x))); }
  function ease(x) { return x <= 0 ? 0 : (x >= 1 ? 1 : 0.5 * (1 - Math.cos(Math.PI * x))); }
  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

  // monotone cubic Hermite (PCHIP) through strictly increasing knots, sampled on K+1 uniform steps over [0,T]
  function pchipTable(X, Y, T, K) {
    var m = X.length, h = [], d = [], i;
    for (i = 0; i < m - 1; i++) { h.push(X[i + 1] - X[i]); d.push((Y[i + 1] - Y[i]) / h[i]); }
    var sl = new Array(m);
    sl[0] = d[0]; sl[m - 1] = d[m - 2];
    for (i = 1; i < m - 1; i++) {
      if (d[i - 1] <= 0 || d[i] <= 0) sl[i] = 0;
      else {
        var w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
        sl[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    var out = new Float64Array(K + 1), j = 0;
    for (var k = 0; k <= K; k++) {
      var x = T * k / K;
      while (j < m - 2 && x > X[j + 1]) j++;
      var hh = h[j], u = (x - X[j]) / hh, u2 = u * u, u3 = u2 * u;
      out[k] = (2 * u3 - 3 * u2 + 1) * Y[j] + (u3 - 2 * u2 + u) * hh * sl[j] +
        (-2 * u3 + 3 * u2) * Y[j + 1] + (u3 - u2) * hh * sl[j + 1];
    }
    out[0] = 0; out[K] = 1;
    return out;
  }

  // ---------------------------------------------------------------- planRace
  function planRace(names, opts) {
    opts = opts || {};
    var n = names.length;
    if (n < 2) throw new RangeError('planRace: need at least 2 names');
    var rng = opts.rng || createRng(opts.seed);

    var idx = [];
    for (var q = 0; q < n; q++) idx.push(q);
    var order = shuffle(idx, rng);
    var rankOf = new Array(n);
    for (q = 0; q < n; q++) rankOf[order[q]] = q;

    // ---- finish times
    var R = 40000 + Math.floor(rng() * 4001); // v4: 40〜44秒（実況を最後まで言える尺）
    // 優勝争い（終盤の団子に入る上位 kC 人）。それより下はばらけたままゴールする
    var kC = n <= 3 ? n : (n <= 6 ? 3 : 4);
    var gaps = [40 + Math.floor(rng() * 81)];
    for (q = 1; q < n - 1; q++) gaps.push(q < kC - 1 ? 220 + Math.floor(rng() * 381) : 500 + Math.floor(rng() * 601));
    var total = 0;
    for (q = 0; q < gaps.length; q++) total += gaps[q];
    var t0 = R - total;
    var finishTime = new Array(n);
    var acc = t0;
    finishTime[order[0]] = t0;
    for (q = 1; q < n; q++) { acc += gaps[q - 1]; finishTime[order[q]] = acc; }
    var a = order[0], b = order[1];
    var t1 = finishTime[b];
    var slowFrom = t0 - 1400 + Math.floor(rng() * 201) - 100;

    var vehicle = pick(VEHICLES, rng);
    var weather = pick(WEATHERS, rng);

    // ---- base curves (monotone, 0 -> 1 exactly at finishTime)
    var K = 600;
    var tables = new Array(n);
    // v4: 位置のずれ D(u) を「0 から始まり、終盤の入り口(tA)で目標値に戻る」波で作る。
    //   中盤は大きくばらけ（逃げ・差し・追い込み）、tA で優勝争いの kC 人は同じ位置に、それより下は着順どおり後ろに並ぶ。
    //   速度 = 1 + D'(u)。0.15 未満にしない（単調増加を保つ）。
    var tA0 = t0 - 9500;
    function buildTable(i) {
      var T = finishTime[i];
      var uA = Math.min(0.95, tA0 / T);
      var M = SPREAD.mid;
      var r1 = rng(), r2 = rng(), r3 = rng();
      var A1;
      if (i === a) A1 = M * (-1 + 1.4 * r1);          // 1着：やや後ろ寄りだが、先行する回もある
      else if (i === b) A1 = M * (-0.4 + 1.4 * r1);   // 2着：やや前寄り
      else A1 = M * (2 * r1 - 1);
      var A2 = M * 0.27 * (2 * r2 - 1), A3 = M * 0.1 * (2 * r3 - 1);
      var dl = rankOf[i] >= kC ? -SPREAD.backDrift * (rankOf[i] - kC + 1) : SPREAD.packJitter * (2 * rng() - 1);
      function v(u) {
        if (u >= uA) return 1;
        var x = u / uA, w = Math.PI / uA;
        var d = A1 * w * Math.cos(Math.PI * x) + A2 * 2 * w * Math.cos(2 * Math.PI * x) + A3 * 3 * w * Math.cos(3 * Math.PI * x);
        d += dl * 6 * x * (1 - x) / uA;
        return Math.max(0.15, 1 + d);
      }
      var P = new Float64Array(K + 1);
      var prev = v(0);
      for (var k = 1; k <= K; k++) {
        var cur = v(k / K);
        P[k] = P[k - 1] + (prev + cur) * 0.5 / K;
        prev = cur;
      }
      var Z = P[K];
      for (k = 0; k <= K; k++) P[k] /= Z;
      P[K] = 1;
      return P;
    }
    var oldTables = new Array(n);
    for (q = 0; q < n; q++) oldTables[q] = buildTable(q);
    function tabAt(tb, T, t) {
      if (t <= 0) return 0;
      if (t >= T) return 1;
      var x = t / T * K, k = Math.floor(x);
      if (k >= K) k = K - 1;
      return tb[k] + (tb[k + 1] - tb[k]) * (x - k);
    }

    // ---- endgame pack: everybody bunches up by finalFrom, stays tangled (lead rotates) until ~3s before the
    //      winner finishes, then the field spreads out in finishing order. Built by re-fitting the base curves.
    var finalFrom = Math.round(t0 - 5000);
    var tG = finalFrom + 2000;
    var tA = finalFrom - 4500;
    var gF = 0.28;
    var sumOld = 0, sumE = 0, j;
    for (q = 0; q < n; q++) { sumOld += tabAt(oldTables[q], finishTime[q], finalFrom); sumE += finishTime[q] - t0; }
    var vf = (1 - sumOld / n) / (5000 + gF * sumE / n);   // pack speed (progress per ms)
    vf = Math.min(0.0002, Math.max(0.000035, vf));
    var Lc = 1 - 5000 * vf;                                  // winner's straight line at finalFrom
    var knotT = [finalFrom, finalFrom + 700, finalFrom + 1400, tG];
    var p0 = [], vi = [];
    for (q = 0; q < n; q++) {
      var Tq = finishTime[q];
      var oa = tabAt(oldTables[q], Tq, tA);
      // 優勝争いの kC 人は団子に、それより下は着順どおりに間隔をあけて後ろに並べる
      var back = rankOf[q] >= kC;
      var pp = Lc - (back ? SPREAD.back : gF) * (Tq - t0) * vf - (back ? SPREAD.backGap * (rankOf[q] - kC + 1) : 0);
      pp = Math.max(oa + SPREAD.minSlow * vf * 4500, Math.min(oa + 2.2 * vf * 4500, pp));
      pp = Math.min(pp, 1 - 0.3 * vf * (Tq - finalFrom));
      p0.push(pp);
      vi.push((1 - pp) / (Tq - finalFrom));
    }
    var aBehind = n >= 3 && rng() < 0.55;                    // winner sometimes strikes from the back in the last 3s
    var danceBase = order.slice(0, kC);
    var dance = aBehind ? danceBase.slice(1) : danceBase;
    var seq = [], prevC = -1;
    for (j = 0; j < 3; j++) {
      // v4: 先頭交代を減らす（実況が追いつくように）。最初の2つは同じ人が先頭、3つ目は1着か2着が先頭で一騎打ちへ
      if (j === 1) { seq.push(prevC); continue; }
      var cand = (j === 2 ? [a, b] : dance).filter(function (x) { return x !== prevC; });
      prevC = cand[Math.floor(rng() * cand.length)];
      seq.push(prevC);
    }
    var amp = vf * 250;
    var vals = [];
    for (j = 0; j < 4; j++) {
      var row = [];
      for (q = 0; q < n; q++) {
        var base = p0[q] + vi[q] * (knotT[j] - finalFrom);
        row.push(j < 3 ? base + (rng() * 2 - 1) * amp : base);
      }
      if (aBehind) row[a] -= vf * (j < 3 ? 250 + 200 * rng() : 200 + 80 * rng());
      if (j < 3) {
        var cc = seq[j], M = -1;
        for (q = 0; q < n; q++) if (q !== cc && row[q] > M) M = row[q];
        if (row[cc] < M + vf * 40) row[cc] = M + vf * (40 + 60 * rng());
      } else {
        // 最後の約3秒は1着・2着の一騎打ち：ほかの優勝争いは少し後ろに下げる
        if (row[b] > row[a] + vf * 250) row[b] = row[a] + vf * 250;
        if (row[b] < row[a] - vf * 250) row[b] = row[a] - vf * 250;
        var lim = Math.min(row[a], row[b]) - vf * 300;
        for (q = 0; q < n; q++) if (q !== a && q !== b && row[q] > lim) row[q] = lim;
      }
      vals.push(row);
    }
    for (q = 0; q < n; q++) {
      var T2 = finishTime[q], X = [], Y = [], kk;
      var kA = Math.floor(tA * K / T2);
      for (kk = 0; kk <= kA; kk++) { X.push(T2 * kk / K); Y.push(oldTables[q][kk]); }
      var pX = X[X.length - 1], pY = Y[Y.length - 1];
      for (j = 0; j < 4; j++) {
        var yv = vals[j][q];
        var minInc = 0.2 * vi[q] * (knotT[j] - pX);
        if (yv < pY + minInc) yv = pY + minInc;
        yv = Math.min(yv, 1 - 0.1 * vi[q] * (T2 - knotT[j]));
        X.push(knotT[j]); Y.push(yv); pX = knotT[j]; pY = yv;
      }
      X.push(T2); Y.push(1);
      tables[q] = pchipTable(X, Y, T2, K);
    }

    function bprog(i, t) {
      var T = finishTime[i];
      if (t <= 0) return 0;
      if (t >= T) return 1;
      var x = t / T * K;
      var k = Math.floor(x);
      if (k >= K) k = K - 1;
      var tb = tables[i];
      return tb[k] + (tb[k + 1] - tb[k]) * (x - k);
    }

    // ---- freeze
    var freeze = null;
    if (rng() < 0.35) {
      var ft = Math.round(R * (0.30 + 0.30 * rng()));
      if (ft > slowFrom - 1500) ft = slowFrom - 1500;
      freeze = { t: ft, dur: 1600 };
    }

    // ---- events (additive offsets on the base curve)
    function nm(i) { return names[i] + 'さん'; }

    function makeEffect(type, te, dur, r, r2, par) {
      var e = { type: type, te: te, dur: dur, r: r, r2: r2 };
      var b0, L;
      if (type === 'stumble') {
        var hold = bprog(r, te), after = bprog(r, te + dur);
        var d = after - hold;
        L = Math.max(2 * d, 1e-4);
        e.off = function (i, t) {
          if (t < te) return 0;
          if (t < te + dur) return hold - bprog(i, t);
          return -d * w((bprog(i, t) - after) / L);
        };
      } else if (type === 'boost') {
        b0 = bprog(r, te + dur); L = 2.2 * par;
        e.off = function (i, t) {
          if (t < te) return 0;
          if (t < te + dur) return par * ease((t - te) / dur);
          return par * w((bprog(i, t) - b0) / L);
        };
      } else if (type === 'reverse') {
        b0 = bprog(r, te + dur); L = 2 * par;
        e.off = function (i, t) {
          if (t < te) return 0;
          if (t < te + dur) return -par * ease((t - te) / dur);
          return -par * w((bprog(i, t) - b0) / L);
        };
      } else { // swap
        var dr = bprog(r2, te) - bprog(r, te);
        var base = {}; base[r] = bprog(r, te); base[r2] = bprog(r2, te);
        var dl = {}; dl[r] = dr; dl[r2] = -dr;
        L = Math.max(2.2 * Math.abs(dr), 1e-4);
        e.off = function (i, t) {
          if (t < te) return 0;
          return dl[i] * w((bprog(i, t) - base[i]) / L);
        };
      }
      return e;
    }

    function scanEnd(e, limit) {
      var tm;
      for (tm = e.te + e.dur; tm <= limit + 25; tm += 25) {
        if (e.off(e.r, tm) === 0 && (e.r2 < 0 || e.off(e.r2, tm) === 0)) return tm;
      }
      return Infinity;
    }

    var pool = idx.slice(); // every runner (any final rank) can be an event target
    var placed = [];
    var effects = [];

    function tryPlace(type) {
      var hiT = slowFrom - 3000;
      for (var att = 0; att < 400; att++) {
        var te = 3600 + Math.floor(rng() * (hiT - 3600 + 1));
        var sp = att < 150 ? 4500 : (att < 300 ? 2500 : 0); // v4: 実況の掛け合い1組（約4.5秒）が入るよう間隔をあける
        var ranked = pool.slice().sort(function (x, y) { return bprog(y, te) - bprog(x, te); });
        var r = -1, r2 = -1, par = 0, dur = 0, text;
        if (type === 'stumble') {
          r = pool[Math.floor(rng() * pool.length)];
          dur = 800 + Math.floor(rng() * 401);
          text = pick(TEXTS.stumble, rng).replace('{n}', function () { return nm(r); });
        } else if (type === 'boost') {
          // uniform over everyone; trailing runners are merely favoured (leaders accepted half the time)
          for (var bt = 0; bt < 4; bt++) {
            r = pool[Math.floor(rng() * pool.length)];
            if (ranked.indexOf(r) >= ranked.length / 2 || rng() < 0.5) break;
          }
          par = 0.06 + rng() * 0.03; dur = 1200;
          text = pick(TEXTS.boost, rng).replace('{n}', function () { return nm(r); });
        } else if (type === 'reverse') {
          r = pool[Math.floor(rng() * pool.length)];
          par = 0.05 + rng() * 0.03; dur = 700;
          text = pick(TEXTS.reverse, rng).replace('{n}', function () { return nm(r); });
        } else {
          if (pool.length < 2) return false;
          var bestD = -1;
          for (var m = 0; m < 6; m++) {
            var x = pool[Math.floor(rng() * pool.length)];
            var y = pool[Math.floor(rng() * pool.length)];
            if (x === y) continue;
            var dd = Math.abs(bprog(x, te) - bprog(y, te));
            if (dd > bestD) { bestD = dd; r = x; r2 = y; }
          }
          if (r < 0 || (bestD < 0.03 && att < 250)) continue;
          dur = 500;
          text = pick(TEXTS.swap, rng).replace(/{[nm]}/g, function (k) { return k === '{n}' ? nm(r) : nm(r2); });
        }
        var limit = Math.min(slowFrom, finishTime[r] - 2500);
        if (att < 250 && limit > finalFrom) limit = finalFrom; // prefer events that finish before the pack forms
        if (r2 >= 0) limit = Math.min(limit, finishTime[r2] - 2500);
        if (te + dur > limit) continue;
        var eff = makeEffect(type, te, dur, r, r2, par);
        var end = scanEnd(eff, limit);
        if (end > limit) continue;
        if (freeze && freeze.t >= te - 500 && freeze.t <= end + 300) continue;
        var bad = false;
        for (var p = 0; p < placed.length; p++) {
          var pe = placed[p];
          if (Math.abs(te - pe.t) < sp) { bad = true; break; }
          var shared = pe.runner === r || pe.runner === r2 ||
            (pe.runner2 >= 0 && (pe.runner2 === r || pe.runner2 === r2));
          if (shared && !(te >= pe.end + 200 || pe.t >= end + 200)) { bad = true; break; }
        }
        if (bad) continue;
        var ev = { t: te, dur: dur, type: type, runner: r, text: text, end: end };
        if (r2 >= 0) ev.runner2 = r2;
        placed.push({ t: te, end: end, runner: r, runner2: r2 });
        effects.push(eff);
        events.push(ev);
        return true;
      }
      return false;
    }

    var events = [];
    var want = 2 + Math.floor(rng() * 3);
    var types = shuffle(['stumble', 'boost', 'reverse', 'swap'], rng);
    var ti;
    for (ti = 0; ti < types.length && events.length < want; ti++) tryPlace(types[ti]);
    for (ti = 0; ti < types.length && events.length < 2; ti++) tryPlace(types[ti]);
    events.sort(function (x, y) { return x.t - y.t; });

    // ---- progress
    function finale(i, t) {
      if (t <= t0 - 2000 || t >= t0 - 200) return 0;
      var s = Math.sin(Math.PI * (t - (t0 - 2000)) / 1800);
      s *= s;
      return i === a ? -vf * 120 * s : vf * 350 * s;
    }

    function progress(i, t) {
      var T = finishTime[i];
      if (t <= 0) return 0;
      if (t >= T) return 1;
      var p = bprog(i, t);
      for (var k = 0; k < effects.length; k++) {
        var e = effects[k];
        if (e.r === i || e.r2 === i) p += e.off(i, t);
      }
      if (i === a || i === b) p += finale(i, t);
      return p < 0 ? 0 : (p > 0.999 ? 0.999 : p);
    }

    function leaderAt(t) {
      var best = order[0], bv = progress(best, t);
      for (var k = 1; k < n; k++) {
        var v = progress(order[k], t);
        if (v > bv) { bv = v; best = order[k]; }
      }
      return best;
    }

    // ---- lead changes (sampled every 50ms; A->B->A within 400ms is dropped as flicker; baseline = leaderAt(50))
    function computeLeadChanges() {
      var raw = [], prev = leaderAt(50), tt, L, out = [];
      for (tt = 100; tt <= t0 + 50; tt += 50) {
        L = leaderAt(tt);
        if (L !== prev) { raw.push({ t: tt, leader: L, from: prev }); prev = L; }
      }
      raw.forEach(function (c) {
        var last = out[out.length - 1];
        if (last && last.from === c.leader && c.t - last.t <= 400) out.pop();
        else out.push(c);
      });
      return out.map(function (c) { return { t: c.t, leader: c.leader }; });
    }

    // rank (0 = leader) per runner index; ties broken by finishing order, consistent with leaderAt
    function positionAt(t) {
      var pr = new Array(n), res = new Array(n), i2, j2;
      for (i2 = 0; i2 < n; i2++) pr[i2] = progress(i2, t);
      for (i2 = 0; i2 < n; i2++) {
        var c2 = 0;
        for (j2 = 0; j2 < n; j2++) {
          if (j2 !== i2 && (pr[j2] > pr[i2] || (pr[j2] === pr[i2] && rankOf[j2] < rankOf[i2]))) c2++;
        }
        res[i2] = c2;
      }
      return res;
    }

    // ---- commentary: only the pre-race intro (negative times); in-race lines are generated by the app
    // v4: 読み上げが紹介ボードの表示中に終わるよう短くする（詳しい予報はボードに文字で出す）
    var commentary = [
      { t: -4500, role: 'ana', text: '本日の天気は、' + weather.label + '！' },
      { t: -2300, role: 'kai', text: '乗り物は' + vehicle.label + '。' + n + vehicle.counter + 'で勝負です' }
    ];

    return {
      n: n,
      names: names.slice(),
      order: order,
      rankOf: rankOf,
      finishTime: finishTime,
      raceEnd: R,
      photo: { a: a, b: b, t0: t0, t1: t1 },
      slowFrom: slowFrom,
      events: events,
      freeze: freeze,
      vehicle: vehicle,
      weather: weather,
      sealCode: sealCode(order, names),
      commentary: commentary,
      finalFrom: finalFrom,
      leadChanges: computeLeadChanges(),
      positionAt: positionAt,
      progress: progress,
      baseProgress: bprog,
      leaderAt: leaderAt
    };
  }

  return {
    createRng: createRng,
    shuffle: shuffle,
    VEHICLES: VEHICLES,
    WEATHERS: WEATHERS,
    planRace: planRace,
    PHRASES: PHRASES,
    sealCode: sealCode,
    SPREAD: SPREAD
  };
})();

if (typeof module !== 'undefined') module.exports = RR.Core;
