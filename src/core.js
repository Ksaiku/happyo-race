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

  // 走りの調整値（v4.2）。startMs=スタートの加速にかかる時間、minEarly=スパート前の速さの下限（その人の平均の速さに対する比。遅すぎて止まって見えないように）
  var SPREAD = { startMs: 1200, minEarly: 0.4 };

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
    // v4.2: 理由なく遅くならない走り。各自の速さは「スタートの加速」と「スパート（最大2回）」でだけ変わり、一度も下がらない。
    //   遅くなる・止まる・戻るのはイベント（転倒・逆走など）のときだけ。
    //   中盤のばらけは「最初から速い人（逃げ）」と「最初はゆっくりで後からスパートする人（差し・追い込み）」の差で作る。
    //   条件（最後の2秒は1着・2着が並んで先頭、2着が一度前に出る など）を満たすまで、スパートの位置と強さを引き直す。
    var K = 600;
    var tables = new Array(n);
    var finalFrom = Math.round(t0 - 5000);
    var NI = 2 * K;
    function sstep(x) { return x <= 0 ? 0 : (x >= 1 ? 1 : x * x * (3 - 2 * x)); }
    function uni(lo, hi) { return lo + (hi - lo) * rng(); }
    // 速さ v(t) = スタートの加速 × (1 + k1·スパート1 + k2·スパート2)。k1, k2 >= 0 なので v は下がらない
    function buildProfile(T, P) {
      var F = new Float64Array(NI + 1), dt = T / NI, prev = 0, j2;
      function vel(t) {
        return sstep(t / SPREAD.startMs) * (1 + P.k1 * sstep((t - P.s1) / P.d1) + P.k2 * sstep((t - P.s2) / P.d2));
      }
      for (j2 = 1; j2 <= NI; j2++) {
        var cur = vel(j2 * dt);
        F[j2] = F[j2 - 1] + (prev + cur) * 0.5 * dt;
        prev = cur;
      }
      var tb = new Float64Array(K + 1);
      for (j2 = 0; j2 <= K; j2++) tb[j2] = F[j2 * 2] / F[NI];
      tb[K] = 1;
      return { tb: tb, early: T / F[NI] };   // early = 加速後・スパート前の速さ（その人の平均の速さに対する比）
    }
    function drawParams(q) {
      var T = finishTime[q], P = {};
      if (q === a) {
        // 1着：多くは後方から。中盤の追い上げ＋最後の約2秒の決め手（スロー中に2着を差す）
        var closer = n === 2 ? rng() < 0.7 : rng() < 0.8;
        P.k1 = closer ? uni(0.5, 1.5) : uni(0, 0.15); P.s1 = uni(0.45, 0.65) * T; P.d1 = uni(2500, 6000);
        P.k2 = uni(0.3, 0.7); P.s2 = T - uni(1500, 2600); P.d2 = uni(700, 1400);
      } else if (q === b) {
        // 2着：一足早いスパートで前に出て、最後に1着に差される
        P.k1 = uni(0, 0.8); P.s1 = uni(0.3, 0.65) * T; P.d1 = uni(2500, 6000);
        P.k2 = uni(0.1, 0.4); P.s2 = T - uni(3500, 6500); P.d2 = uni(1500, 3000);
      } else {
        // 走り方：逃げ（最初から速く一定）・先行・差し・追い込み（最初はゆっくり、中盤以降に大きくスパート）
        var st = rng();
        if (st < 0.3) { P.k1 = uni(0, 0.1); P.s1 = uni(0.3, 0.6) * T; }
        else if (st < 0.55) { P.k1 = uni(0.15, 0.4); P.s1 = uni(0.3, 0.55) * T; }
        else if (st < 0.75) { P.k1 = uni(0.5, 1.0); P.s1 = uni(0.45, 0.6) * T; }
        else { P.k1 = uni(1.5, 2.6); P.s1 = uni(0.5, 0.65) * T; }
        P.d1 = uni(2500, 6000);
        P.k2 = uni(0, 0.4); P.s2 = T - uni(3000, 9000); P.d2 = uni(1000, 3000);
      }
      return P;
    }
    function tabAt(tb, T, t) {
      if (t <= 0) return 0;
      if (t >= T) return 1;
      var x = t / T * K, k2 = Math.floor(x);
      if (k2 >= K) k2 = K - 1;
      return tb[k2] + (tb[k2 + 1] - tb[k2]) * (x - k2);
    }
    function scoreField(tbs) {
      var at = function (q2, t) { return tabAt(tbs[q2], finishTime[q2], t); };
      // 必須：最後の2秒、1着・2着が並んで（0.025以内）先頭、2着が一度は前に出る
      var bAhead = false, tt, q2;
      for (tt = t0 - 2000; tt < t0; tt += 20) {
        var pa = at(a, tt), pb = at(b, tt), mx = Math.max(pa, pb);
        if (pb > pa + 0.0005) bAhead = true;
        if (Math.abs(pa - pb) > 0.025) return -1;
        for (q2 = 0; q2 < n; q2++) if (q2 !== a && q2 !== b && at(q2, tt) > mx - 0.002) return -1;
      }
      if (!bAhead) return -1;
      var sc = 0;
      // 後半40%の先頭交代 2回以上
      var lead = function (t) { var bq = 0, bv = -1; for (var q3 = 0; q3 < n; q3++) { var v = at(q3, t); if (v > bv) { bv = v; bq = q3; } } return bq; };
      var lc = 0, prevL = lead(0.6 * t0);
      for (tt = 0.6 * t0 + 100; tt <= t0; tt += 100) { var L2 = lead(tt); if (L2 !== prevL) { lc++; prevL = L2; } }
      if (lc >= 2) sc++;
      // 中盤（1着ゴールの半分の時刻）の先頭は1着でないことが多い
      if (lead(0.5 * t0) !== a) sc++;
      if (n >= 4) {
        // 中盤はばらける（幅 0.2 以上）、終盤入り＋1秒で優勝争いは 0.05 以内
        var pr = [], top = [];
        for (q2 = 0; q2 < n; q2++) pr.push(at(q2, 0.5 * t0));
        if (Math.max.apply(null, pr) - Math.min.apply(null, pr) >= 0.2) sc++;
        for (q2 = 0; q2 < kC; q2++) top.push(at(order[q2], finalFrom + 1000));
        if (Math.max.apply(null, top) - Math.min.apply(null, top) <= 0.05) sc++;
      } else sc += 2;
      return sc;
    }
    var bestTabs = null, bestSc = -2, attempt;
    var curTabs = new Array(n), curEarly = new Array(n);
    for (attempt = 0; attempt < 120 && bestSc < 4; attempt++) {
      for (q = 0; q < n; q++) {
        // 1着・2着は毎回引き直す。ほかは最初の1回と、たまに引き直す
        if (attempt === 0 || q === a || q === b || rng() < 0.3) {
          var pf, tries = 0;
          do { pf = buildProfile(finishTime[q], drawParams(q)); tries++; } while (pf.early < SPREAD.minEarly && tries < 20);
          curTabs[q] = pf.tb; curEarly[q] = pf.early;
        }
      }
      var s = scoreField(curTabs);
      if (s > bestSc) { bestSc = s; bestTabs = curTabs.slice(); }
    }
    if (!bestTabs) bestTabs = curTabs.slice();
    for (q = 0; q < n; q++) tables[q] = bestTabs[q];

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
    function progress(i, t) {
      var T = finishTime[i];
      if (t <= 0) return 0;
      if (t >= T) return 1;
      var p = bprog(i, t);
      for (var k = 0; k < effects.length; k++) {
        var e = effects[k];
        if (e.r === i || e.r2 === i) p += e.off(i, t);
      }
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
