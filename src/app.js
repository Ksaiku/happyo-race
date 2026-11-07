/* app.js - 画面遷移・統合・演出オーバーレイ */
var RR = (typeof window !== 'undefined') ? (window.RR = window.RR || {}) : {};

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  // ---------- テスト用ログ ----------
  var log = window.__raceLog = { goalOrder: [], resultOrder: [], done: false, errors: [], subs: [] };
  function logErr(msg) { try { log.errors.push(String(msg)); } catch (e) {} }
  window.onerror = function (msg, src, line, col) {
    logErr(msg + ' @' + (src || '') + ':' + line + ':' + col);
    return false;
  };
  window.addEventListener('unhandledrejection', function (ev) {
    logErr('unhandledrejection: ' + (ev && ev.reason && (ev.reason.message || ev.reason)));
  });

  // ---------- ユーティリティ ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function aud(fn) {
    try {
      var A = RR.Audio;
      if (A && typeof A[fn] === 'function') return A[fn].apply(A, Array.prototype.slice.call(arguments, 1));
    } catch (e) { logErr('audio.' + fn + ': ' + e.message); }
    return undefined;
  }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  var speed = (function () {
    var m = /[?&]speed=([0-9.]+)/.exec(window.location.search || '');
    var v = m ? parseFloat(m[1]) : 1;
    return (v > 0 && isFinite(v)) ? v : 1;
  })();

  var DEFAULT_NAMES = ['あおい', 'はると', 'こはる', 'そうた', 'みなと', 'ゆい', 'れん', 'さくら'];

  // ---------- 状態 ----------
  var rend = null;
  var S = null;            // 現在のレース状態
  var speechOn = true, muted = false;
  var audioInited = false;
  var currentScreen = 'setup';

  function show(name) {
    currentScreen = name;
    ['setup', 'race', 'result'].forEach(function (id) {
      $(id).classList.toggle('active', id === name);
    });
    if (name === 'race' && rend) { try { rend.resize(); } catch (e) { logErr('resize: ' + e.message); } }
  }

  // ---------- 準備画面 ----------
  var parsedNames = [];
  function readNames() {
    return $('names').value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }
  function parseTime(str) {
    var m = /^\s*(\d{1,2})\s*[:：]\s*(\d{2})\s*$/.exec(str || '');
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  function validate() {
    parsedNames = readNames();
    var n = parsedNames.length, msg = '', ok = true;
    if (n < 2) { msg = '2人以上入力してください（いま ' + n + '人）'; ok = false; }
    else if (n > 12) { msg = '12人までです（いま ' + n + '人）'; ok = false; }
    else if (parseTime($('optStart').value) === null) { msg = '開始時刻は 13:00 の形式で入力してください'; ok = false; }
    else {
      var mn = parseInt($('optMin').value, 10);
      if (!(mn >= 1 && mn <= 120)) { msg = '1人あたりの分数は 1〜120 で入力してください'; ok = false; }
    }
    var el = $('setupMsg');
    el.textContent = ok ? ('出走 ' + n + '人  準備OK！') : msg;
    el.classList.toggle('ok', ok);
    $('btnStart').disabled = !ok;
    return ok;
  }
  function saveSetup() {
    lsSet('rr.names', $('names').value);
    lsSet('rr.start', $('optStart').value);
    lsSet('rr.min', $('optMin').value);
    lsSet('rr.speech', speechOn ? '1' : '0');
  }
  function loadSetup() {
    var nm = lsGet('rr.names');
    $('names').value = (nm && nm.trim()) ? nm : DEFAULT_NAMES.join('\n');
    var st = lsGet('rr.start'); if (st) $('optStart').value = st;
    var mn = lsGet('rr.min'); if (mn) $('optMin').value = mn;
    var sp = lsGet('rr.speech'); if (sp === '0') speechOn = false;
  }

  // ---------- 上部ボタン ----------
  function refreshControls() {
    var b = $('btnSound');
    b.textContent = muted ? '🔇 音 OFF' : '🔊 音 ON';
    b.classList.toggle('off', muted);
    var s = $('btnSpeech');
    s.textContent = speechOn ? '🗣 読み上げ ON' : '🗣 読み上げ OFF';
    s.classList.toggle('off', !speechOn);
    $('optSpeech').checked = speechOn;
  }
  function setSpeech(v) {
    speechOn = !!v;
    aud('setSpeech', speechOn);
    if (!speechOn) aud('cancelSpeech');
    refreshControls(); saveSetup();
  }
  function initAudioOnce() {
    if (audioInited) return;
    audioInited = true;
    aud('init');
    aud('setMuted', muted);
    aud('setSpeech', speechOn);
  }

  // ---------- 演出ユーティリティ ----------
  function later(fn, ms) {
    var id = setTimeout(function () { try { fn(); } catch (e) { logErr('timer: ' + e.message); } }, ms);
    if (S) S.timers.push(id);
    return id;
  }
  function clearTimers() {
    if (!S) return;
    S.timers.forEach(clearTimeout);
    S.timers = [];
    if (S.introTimer) clearTimeout(S.introTimer);
  }
  function showTelop(text, ms, big, kind) {
    var el = $('telop');
    el.innerHTML = '<span>' + esc(text) + '</span>';
    el.className = (big ? 'big ' : '') + (kind === 'lc' ? 'lc' : '');
    S.telopUntil = performance.now() + ms;
    S.telopKind = kind || 'event';
  }
  function showSub(line) {
    var el = $('sub');
    el.className = line.role === 'kai' ? 'kai' : 'ana';
    el.innerHTML = '<span><b><i>' + (line.role === 'kai' ? '解説' : '実況') + '</i></b><span class="tx">' + esc(line.text) + '</span></span>';
  }
  function hideSub() { $('sub').classList.add('hidden'); }
  function hideOverlays() {
    ['telop', 'sub', 'freezeMsg', 'count', 'intro', 'film', 'skipHint', 'spurt'].forEach(function (id) { $(id).classList.add('hidden'); });
  }

  // =====================================================================
  // 実況エンジン（状況 → 短い文。優先度・古い文の破棄・ana/kai 交互）
  //  - 文は「その瞬間の実データ」から作る。事前スケジュールはしない。
  //  - 字幕は読み上げが実際に始まった瞬間（onstart）に出し、onend+0.6s で消す。
  //    音声なし/読み上げOFFでは生成した瞬間に出して 2.2s で消す（audio.speak が onstart/onend を保証）。
  //  - high は発話を割り込み、normal は発話中なら捨てる。1.2s 以内に始まらない文は捨てる。
  // =====================================================================
  // 台詞の書式: '本文' または '本文｜ツッコミ'（ツッコミは本文の後に相方が言う）。
  //   # = 走者名, @ = 2人目の名前, % = その走者の帽子, $ = 今回の乗り物
  //   ana = 実況（煽り役・ボケ）、kai = 解説（ツッコミ・ぼやき）。
  var PH = {
    stumble: { ana: ['#さん転倒！｜受け身は百点です', 'あっ、#さんが！｜見なかったことにしましょう', '#さんつまずいた！｜何もない所でしたね', '#さん、止まった！｜景色を見てますね'],
               kai: ['#さん、痛い…', '#さん、今のは減点です'] },
    boost:   { ana: ['#さん急加速！｜朝ごはん何食べたんですか', '#さん、きた！｜急に本気出しましたね', '#さん猛ダッシュ！｜締め切り前の顔です', '#さん、飛んだ！'],
               kai: ['#さん、大人げない！', '#さん、速い！'] },
    reverse: { ana: ['#さん逆走！？｜忘れ物ですかね', '#さん、どこへ！？｜帰ろうとしてます', '#さん、逆です！｜ゴールはあっちです！'],
               kai: ['#さん、向きが…'] },
    swap:    { ana: ['入れ替わった！？｜今の、反則では？', '#さんと@さんが！？', '何が起きた！？｜私も見てませんでした'],
               kai: ['位置が入れ替わった？'] },
    lead:    { ana: ['先頭交代！#さん！', '#さんがトップ！', '#さん抜いた！｜容赦ないですね', '#さん前へ！'],
               kai: ['#さん、ドヤ顔です', 'トップは#さんに'] },
    spurt:   { ana: ['ラストスパート！｜ここで本気出す人います', 'ここから勝負！', '最後の直線！｜全員、目が本気です'],
               kai: ['ここからが勝負です'] },
    photo:   { ana: ['#さんか！@さんか！', '#さん！@さん！', '#さんか@さんか！'], kai: ['#さんと@さん僅差！'] },
    leader:  { ana: ['#さん先頭！｜まだ油断できません', '#さんリード！｜もう勝った顔してます', '#さんが引っ張る！', '先頭は#さん！｜後ろ、全然見てません'],
               kai: ['#さん、余裕の表情', '#さん、鼻歌まじりです'] },
    close:   { ana: ['#さんと@さん並んだ！｜お互い譲る気ゼロです', '#さん@さん、接戦！', '#さんに@さん！｜近い近い！'],
               kai: ['#さんと@さん、バチバチです', '#さんと@さん、目が合った'] },
    chase:   { ana: ['#さん追い上げ！｜急にやる気が出ました', '#さん、ぐんぐん！', '#さん上がってきた！｜寝たふりでしたね'],
               kai: ['#さん、いい脚です', '#さん、本気モードです'] },
    drop:    { ana: ['#さん、下がった！｜お腹すいたんですかね', '#さん失速！｜電池切れでしょうか', '#さん、どうした！｜考えごとですかね'],
               kai: ['#さん、息切れです'] },
    last:    { ana: ['#さん最後尾！｜作戦です、たぶん', '#さん、まだまだ！｜景色を楽しんでますね', '#さん、ゆっくり！｜お散歩ペースです', '#さん、のんびり！｜発表の準備中ですかね'],
               kai: ['#さん、大物の風格', '#さん、マイペースです'] },
    look:    { ana: ['%の#さん！｜今日いちばんオシャレです', '%の#さん、目立つ！｜走りより帽子が目立ちます', '#さんの%、揺れてる！｜飛ばされないで！'],
               kai: ['%、似合いますね#さん'] },
    veh:     { ana: ['みなさん$に必死！｜大人が本気です', '$レース白熱！｜会議より白熱してます', '$、乗りこなしてます！｜練習してきましたね'],
               kai: ['$、意外と速いですね'] },
    start:   { ana: ['さあスタート！｜みなさん、いい顔です', '#さん好スタート！｜フライングでは？'], kai: ['まずは様子見です'] },
    goal:    { ana: ['#さんゴール！', '#さん、完走！'], kai: ['#さん、お疲れさま'] },
    freeze:  { ana: ['時が止まった！？｜放送事故ですか？'], kai: ['……止まった？'] },
    unfreeze:{ ana: ['ウソでした！続行！｜心臓に悪いです', 'ウソです！再開！'], kai: ['再開です'] }
  };
  // 割り込みで言う種類（短くしたいので本文の上限を小さく）
  var HIGHK = { stumble: 1, boost: 1, reverse: 1, swap: 1, lead: 1, spurt: 1, photo: 1, freeze: 1, unfreeze: 1 };
  var HAT_WORD = { '👑': '王冠', '🎩': 'シルクハット', '🧢': 'キャップ', '🎀': 'リボン', '🌸': 'お花', '⛑️': 'ヘルメット',
    '🎓': '角帽', '🪖': 'ヘルメット', '👒': '麦わら帽子', '🍄': 'キノコ帽', '🍓': 'イチゴ帽', '🌻': 'ひまわり', horn: 'ユニコーン角', prop: 'プロペラ帽' };

  function newCm() {
    return { subId: 0, cur: 0, shownId: 0, busy: false, replyPending: false, idleSince: -9999, lastRole: 'kai', anaRun: 0,
      lastGenT: -9999, lastHighT: -9999, nextAt: 900, recent: {}, lastKey: '', lastKind: '', lcIdx: 0, stable: -1, cand: -1,
      candSince: 0, lastLcT: -9999, spurt: false, preShot: false, frozeSaid: false, lookCount: 0, vehSaid: false };
  }
  function nm(i) { return S.names[i]; }
  function hatWord(i) {
    var lk = rend && rend.looks && rend.looks[i];
    return lk && typeof lk.hat === 'string' ? (HAT_WORD[lk.hat] || '') : '';
  }
  function fillTp(tp, a, b) {
    var needHat = tp.indexOf('%') >= 0, needVeh = tp.indexOf('$') >= 0;
    var hw = needHat ? hatWord(a) : '', vl = S.plan.vehicle && S.plan.vehicle.label;
    if (needHat && !hw) return null;
    if (needVeh && !vl) return null;
    return tp.replace(/#/g, function () { return nm(a); }).replace(/@/g, function () { return b == null ? '' : nm(b); })
      .replace(/%/g, function () { return hw; }).replace(/\$/g, function () { return vl || ''; });
  }

  function pickText(kind, role, a, b) {
    var pool = PH[kind]; if (!pool) return null;
    var useRole = pool[role] && pool[role].length ? role : (role === 'ana' ? 'kai' : 'ana');
    var list = pool[useRole];
    if (!list || !list.length) return null;
    var cm = S.cm, lim = HIGHK[kind] ? 16 : 20;
    var items = [];
    list.forEach(function (tp, i) {
      var parts = tp.split('｜');
      var main = fillTp(parts[0], a, b); if (main == null) return;
      var reply = parts[1] ? fillTp(parts[1], a, b) : null;
      if (reply && reply.length > 20) reply = null;
      items.push({ i: i, text: main, reply: reply });
    });
    if (!items.length) return null;
    var ok = items.filter(function (it) { return it.text.length <= lim; });
    if (!ok.length) {   // 名前が長くて全部上限超え：いちばん短いものを使う
      var bi = items[0]; items.forEach(function (it) { if (it.text.length < bi.text.length) bi = it; });
      ok = [bi];
    }
    // 直近で使った言い回しを避ける
    var key = kind + ':' + useRole, last = cm.recent[key];
    var cand = ok.filter(function (it) { return it.i !== last; });
    if (!cand.length) cand = ok;
    var it = cand[Math.floor(Math.random() * cand.length)];
    cm.recent[key] = it.i;
    return { text: it.text, role: useRole, reply: it.reply };
  }

  // ana（ボケ・煽り）を基本にし、3回続いたら kai に回す
  function chooseRole() { return S.cm.anaRun >= 2 ? 'kai' : 'ana'; }

  // 1文を生成して出す。valid() が偽なら（字幕が出る時点で状況が変わっていれば）字幕を出さず捨てる。
  function say(kind, a, b, pri, valid) {
    var pk = pickText(kind, chooseRole(), a, b);
    if (!pk) return;
    sayText(kind, pk.text, pk.role, pri, valid, pk.reply);
  }

  function sayText(kind, text, role, pri, valid, reply) {
    var cm = S.cm, st = S;
    var id = ++cm.subId, genT = Math.round(S.t);
    cm.cur = id; cm.busy = true; cm.replyPending = false; cm.lastGenT = S.t; cm.lastKind = kind;
    cm.lastRole = role; cm.anaRun = role === 'ana' ? cm.anaRun + 1 : 0;
    if (pri === 'high') cm.lastHighT = S.t;
    var started = false, real = false;
    function idle() { if (cm.cur === id) { cm.busy = false; cm.idleSince = S.t; } }
    function onstart(isReal) {
      if (S !== st || started) return;
      started = true; real = !!isReal;
      if (valid && !valid()) { cm.shownId = 0; aud('cancelSpeech'); idle(); return; }
      cm.shownId = id;
      showSub({ role: role, text: text });
      $('sub').classList.remove('hidden');
      log.subs.push({ t: Math.round(S.t), text: text, shownAt: real ? 'start' : 'timer', genT: genT, kind: kind });
    }
    function onend() {
      if (S !== st) return;
      idle();
      if (cm.shownId !== id) return;
      // ツッコミ：本文が最後まで言えたときだけ、相方がすぐ続ける
      if (reply && cm.cur === id) {
        cm.replyPending = true;
        later(function () {
          if (S !== st || cm.cur !== id) return;
          cm.replyPending = false;
          if (cm.busy || S.phase !== 'race' || S.t >= S.plan.slowFrom) return;
          sayText(kind + '+', reply, role === 'ana' ? 'kai' : 'ana', 'normal', valid, null);
        }, 120 / speed);
      }
      var d = real ? 600 : 0;
      later(function () { if (cm.shownId === id) { cm.shownId = 0; hideSub(); } }, d);
    }
    function ondrop() { if (S === st) idle(); }
    var r = aud('speak', text, role, {
      priority: pri, fallbackMs: 2200 / speed, maxWaitMs: 1200,
      onstart: onstart, onend: onend, ondrop: ondrop
    });
    if (r === undefined && !started) {   // audio 層が使えない：字幕のみ
      onstart(false);
      later(onend, 2200 / speed);
    }
  }

  // 現在の順位（先頭が [0]）
  function ranksAt(t) {
    var plan = S.plan, idx = [], i;
    for (i = 0; i < plan.n; i++) idx.push(i);
    idx.sort(function (x, y) { return (plan.progress(y, t) - plan.progress(x, t)) || (x - y); });
    return idx;
  }
  function leaderNow(t) {
    var plan = S.plan;
    try { var l = plan.leaderAt(t); if (typeof l === 'number' && l >= 0) return l; } catch (e) {}
    return ranksAt(t)[0];
  }
  function finalFromOf(plan) { return typeof plan.finalFrom === 'number' ? plan.finalFrom : plan.photo.t0 - 5000; }

  function onLeadChange(leader, t, now) {
    var cm = S.cm;
    cm.lastLcT = t;
    var eventTelop = S.telopKind === 'event' && S.telopUntil && now < S.telopUntil;
    if (!eventTelop) showTelop('先頭交代！', 1100 / speed, false, 'lc');
    if (t - cm.lastHighT >= 1200) {
      say('lead', leader, null, 'high', function () { return leaderNow(S.t) === leader; });
    }
  }

  function showSpurt() {
    var el = $('spurt');
    el.classList.remove('hidden');
    el.innerHTML = '<span>🔥 ラストスパート！ 🔥</span>';
    // 再生し直し
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    // 走者を隠す時間を短くするため、1.5秒で横切って消える
    later(function () { el.classList.add('hidden'); }, 1500 / speed);
  }

  function genNormal(t) {
    var plan = S.plan, cm = S.cm, n = plan.n;
    var order = ranksAt(t), lead = leaderNow(t);
    var pr = function (i, tt) { return plan.progress(i, tt == null ? t : tt); };
    var cands = [];
    if (t < 2500 && !cm.recent.started) {
      cm.recent.started = 1;
      say('start', lead, null, 'normal'); return;
    }
    if (n >= 2) {
      var second = order[0] === lead ? order[1] : order[0];
      if (pr(lead) - pr(second) < 0.012) cands.push({ k: 'close', a: lead, b: second, w: 3 });
    }
    var old = ranksAt(Math.max(0, t - 2000)), oldRank = {}, bestG = 0, bestI = -1;
    old.forEach(function (i, r) { oldRank[i] = r; });
    order.forEach(function (i, r) { var g = oldRank[i] - r; if (g > bestG && r > 0) { bestG = g; bestI = i; } });
    if (bestG >= 2) cands.push({ k: 'chase', a: bestI, w: 4 });
    // 2秒で2つ以上順位を落とした人をいじる
    var worstG = 0, worstI = -1;
    order.forEach(function (i, r) { var g = r - oldRank[i]; if (g > worstG) { worstG = g; worstI = i; } });
    if (worstG >= 2) cands.push({ k: 'drop', a: worstI, w: 3 });
    var lastI = order[n - 1];
    if (n >= 3 && t > 4000) cands.push({ k: 'last', a: lastI, w: 2.5 });
    var inFinal = t >= finalFromOf(plan);
    if (!inFinal && t > 3500) {
      // 帽子いじり（1レース2回まで）と乗り物いじり（1回）は中盤だけ
      if (cm.lookCount < 2) {
        var mids = order.slice(1, n).filter(function (i) { return hatWord(i); });
        if (mids.length) cands.push({ k: 'look', a: mids[Math.floor(Math.random() * mids.length)], w: 2 });
      }
      if (!cm.vehSaid) cands.push({ k: 'veh', a: lead, w: 1.5 });
    }
    cands.push({ k: 'leader', a: lead, w: 2 });
    // 直前と同じ種類・同じ話題を避ける
    var f = cands.filter(function (c) { return c.k !== cm.lastKind && (c.k + c.a) !== cm.lastKey; });
    if (!f.length) f = cands;
    var tot = 0; f.forEach(function (c) { tot += c.w; });
    var x = Math.random() * tot, pick = f[0];
    for (var i = 0; i < f.length; i++) { x -= f[i].w; if (x <= 0) { pick = f[i]; break; } }
    cm.lastKey = pick.k + pick.a;
    var valid = null;
    if (pick.k === 'leader') valid = function () { return leaderNow(S.t) === pick.a; };
    if (pick.k === 'last') valid = function () { var o = ranksAt(S.t); return o[o.length - 1] === pick.a; };
    if (pick.k === 'close') valid = function () {
      return Math.abs(plan.progress(pick.a, S.t) - plan.progress(pick.b, S.t)) < 0.02;
    };
    if (pick.k === 'look') cm.lookCount++;
    if (pick.k === 'veh') cm.vehSaid = true;
    say(pick.k, pick.a, pick.b, 'normal', valid);
  }

  // 毎フレーム（フリーズ中以外）呼ぶ
  function runCommentary(t, now, frozen) {
    var plan = S.plan, cm = S.cm;
    var inFinal = t >= finalFromOf(plan);

    // 先頭交代
    if (t >= 1200 && t < plan.slowFrom) {
      if (plan.leadChanges && plan.leadChanges.length) {
        var fire = null;
        while (cm.lcIdx < plan.leadChanges.length && plan.leadChanges[cm.lcIdx].t <= t) fire = plan.leadChanges[cm.lcIdx++];
        if (fire && t - fire.t < 600 && leaderNow(t) === fire.leader && t - cm.lastLcT >= 900) onLeadChange(fire.leader, t, now);
        cm.stable = leaderNow(t);
      } else {
        var cur = leaderNow(t);
        if (cm.stable < 0) cm.stable = cur;
        if (cur !== cm.stable) {
          if (cm.cand !== cur) { cm.cand = cur; cm.candSince = t; }
          else if (t - cm.candSince >= 250) {
            var prev = cm.stable; cm.stable = cur;
            if (t - cm.lastLcT >= 1000 && prev !== cur) onLeadChange(cur, t, now);
          }
        } else cm.cand = -1;
      }
    } else if (plan.leadChanges) {
      while (cm.lcIdx < plan.leadChanges.length && plan.leadChanges[cm.lcIdx].t <= t) cm.lcIdx++;
    }

    // ラストスパート
    if (!cm.spurt && inFinal) {
      cm.spurt = true;
      showSpurt();
      say('spurt', 0, null, 'high');
      cm.nextAt = Math.max(cm.nextAt, t + 1800);
    }
    // 写真判定直前（スロー突入）
    if (!cm.preShot && t >= plan.slowFrom) {
      cm.preShot = true;
      var o = ranksAt(t);
      if (plan.n >= 2) say('photo', o[0], o[1], 'high');
      return;
    }
    // 定期の状況実況
    // 掛け合いが途切れないよう、前の発話が終わって少し間（中盤0.5秒・終盤0.3秒）を置いたら次へ
    if (!cm.busy && !cm.replyPending && t >= cm.nextAt && t < plan.slowFrom && t - cm.lastGenT >= 900 &&
        t - cm.idleSince >= (inFinal ? 300 : 500)) {
      genNormal(t);
      cm.nextAt = t + (inFinal ? 1500 : 1800);
    }
  }

  // ---------- レース開始 ----------
  function beginRace(names) {
    if (S) clearTimers();
    aud('stopLoop'); aud('setSlow', false); aud('setTension', 0); aud('cancelSpeech');
    log.goalOrder.length = 0; log.resultOrder.length = 0; log.subs.length = 0; log.done = false;
    if (!(RR.Core && RR.Core.planRace)) { $('setupMsg').textContent = 'エラー: RR.Core が読み込まれていません'; logErr('RR.Core missing'); return; }
    var plan;
    try { plan = RR.Core.planRace(names); } catch (e) { logErr('planRace: ' + e.message); return; }
    if (!rend && RR.Renderer && RR.Renderer.create) {
      try { rend = RR.Renderer.create($('cv')); } catch (e) { logErr('renderer: ' + e.message); }
    }
    S = {
      plan: plan, names: names, phase: 'intro', t: 0, last: 0, slow: false, zoom: 0,
      ei: 0, ci: 0, goaled: [], goalCount: 0, allGoalT: -1, photoShot: false,
      freezeDone: false, freezeUntil: 0, wasFrozen: false, flashStart: -1,
      telopUntil: 0, telopKind: '', timers: [], introTimer: 0, skip: null,
      cm: newCm(), tension: 0, tensionSent: 0
    };
    hideOverlays();
    show('race');
    if (rend) { try { rend.setPlan(plan); rend.resize(); } catch (e) { logErr('setPlan: ' + e.message); } }
    runIntro();
  }

  var INTRO_MS = [1800, 1800, 1700];
  function runIntro() {
    var p = S.plan, st = S;
    var intro = $('intro');
    // 事前の天気・乗り物紹介（負の時刻の実況）は読み上げのみ（ボードが字幕を隠すため）
    var pre = (p.commentary || []).filter(function (l) { return l && l.t < 0; });
    function preSpeak(k) {
      var l = pre[k];
      if (l && speechOn) aud('speak', l.text, l.role, { priority: 'high', maxWaitMs: 0, fallbackMs: 1 });
    }
    var steps = [
      function () {
        preSpeak(0);
        intro.innerHTML = '<div class="board"><div class="bTitle">📺 本日のレース天気予報</div><div class="bBig">' + esc(p.weather.emoji) +
          '</div><div class="bLabel">' + esc(p.weather.label) + '</div><div class="bText">' + esc(p.weather.forecast || '') + '</div></div>';
        aud('play', 'tick');
      },
      function () {
        preSpeak(1);
        intro.innerHTML = '<div class="board"><div class="bTitle">🎰 本日の乗り物ガチャ</div><div class="bBig">' + esc(p.vehicle.emoji) +
          '</div><div class="bLabel">' + esc(p.vehicle.label) + '</div><div class="bText">' + p.n + esc(p.vehicle.counter || '人') + 'が出走！</div></div>';
        aud('play', 'tick');
      },
      function () {
        intro.innerHTML = '<div class="board envb"><div class="bTitle">🔏 封印の封筒</div><div class="bBig">✉️</div><div class="seal">' + esc(p.sealCode) +
          '</div><div class="bText">順位はたった今、決まりました。<br>中身は発表までヒミツ！</div></div>';
        aud('play', 'tick');
      }
    ];
    var idx = -1;
    intro.classList.remove('hidden');
    $('skipHint').classList.remove('hidden');
    function next() {
      if (S !== st || st.phase !== 'intro') return;
      clearTimeout(st.introTimer);
      idx++;
      if (idx >= steps.length) {
        intro.classList.add('hidden');
        $('skipHint').classList.add('hidden');
        st.skip = null;
        countdown();
        return;
      }
      steps[idx]();
      st.introTimer = setTimeout(next, INTRO_MS[idx] / speed);
    }
    st.skip = next;
    next();
  }

  function countdown() {
    var st = S;
    aud('cancelSpeech');
    st.phase = 'count';
    var seq = ['3', '2', '1', 'GO!'], i = 0, el = $('count');
    function step() {
      if (S !== st) return;
      if (i >= seq.length) { el.classList.add('hidden'); return; }
      el.innerHTML = '<span>' + seq[i] + '</span>';
      el.classList.remove('hidden');
      var go = (i === seq.length - 1);
      aud('play', go ? 'go' : 'tick');
      i++;
      if (go) {
        st.phase = 'race';
        st.last = performance.now();
        aud('startLoop');
        later(function () { el.classList.add('hidden'); }, 700 / speed);
      } else {
        later(step, 700 / speed);
      }
    }
    step();
  }

  // ---------- メインループ ----------
  var errSeen = {};
  function frame(now) {
    window.requestAnimationFrame(frame);
    if (!S) return;
    try {
      if (S.phase === 'race') stepRace(now);
      else if ((S.phase === 'intro' || S.phase === 'count') && rend) {
        rend.draw(0, { zoom: 0, slow: false, frozen: false, flash: 0 });
      }
    } catch (e) {
      var k = String(e && e.message);
      if (!errSeen[k]) { errSeen[k] = 1; logErr('frame: ' + k + (e && e.stack ? ' | ' + e.stack.split('\n')[1] : '')); }
    }
  }

  function stepRace(now) {
    var plan = S.plan;
    var dtReal = Math.min(Math.max(now - S.last, 0), 100);
    S.last = now;

    // フリーズ（レース時計停止）
    if (!S.freezeDone && plan.freeze && S.t >= plan.freeze.t) {
      S.freezeDone = true;
      S.freezeUntil = now + plan.freeze.dur / speed;
      var fz = $('freezeMsg');
      fz.className = '';
      fz.innerHTML = '<div class="fz">……（停止中）</div><div class="ring"></div>';
      aud('stopLoop'); aud('play', 'freeze');
      say('freeze', 0, null, 'high');
      S.cm.frozeSaid = true;
    }
    var frozen = now < S.freezeUntil;
    if (S.wasFrozen && !frozen) {
      var fm = $('freezeMsg');
      fm.className = 'liar';
      fm.innerHTML = '<div class="fz">ウソです！レース続行！</div>';
      later(function () { fm.className = 'hidden'; }, 1300 / speed);
      aud('play', 'unfreeze'); aud('startLoop');
      say('unfreeze', 0, null, 'high');
      S.cm.nextAt = Math.max(S.cm.nextAt, S.t + 2200);
    }
    S.wasFrozen = frozen;

    if (!frozen) S.t += dtReal * speed * (S.slow ? 0.3 : 1);
    var t = S.t;

    // イベント
    while (S.ei < plan.events.length && t >= plan.events[S.ei].t) {
      var e = plan.events[S.ei++];
      showTelop(e.text, (e.dur + 1500) / speed);   // 大テロップは発生時刻ぴったり（音声に依存しない）
      aud('play', e.type);
      if (e.type === 'swap') S.flashStart = now;
      if (PH[e.type]) say(e.type, e.runner, e.runner2, 'high');
    }
    if (S.telopUntil && now > S.telopUntil) { $('telop').classList.add('hidden'); S.telopUntil = 0; }

    // スロー・ズーム
    var wantSlow = (t >= plan.slowFrom) && !S.photoShot;
    if (wantSlow !== S.slow) { S.slow = wantSlow; aud('setSlow', wantSlow); }
    S.zoom = clamp(S.zoom + (wantSlow ? 1 : -1) * dtReal / 900, 0, 1);

    // 実況（状況から生成）
    if (!frozen) runCommentary(t, now, frozen);

    // 緊張度：finalFrom から徐々に上げ、スロー中は最大、写真判定後は解放
    var ff = finalFromOf(plan), target;
    if (S.photoShot) target = (S.hold && now < S.hold) ? 1 : 0;
    else if (t < ff) target = 0;
    else if (t >= plan.slowFrom) target = 1;
    else target = 0.2 + 0.8 * clamp((t - ff) / Math.max(1, plan.slowFrom - ff), 0, 1);
    var k = clamp(dtReal / (target > S.tension ? 500 : 250), 0, 1);
    S.tension += (target - S.tension) * k;
    if (Math.abs(S.tension - S.tensionSent) > 0.02 || (target === 0 && S.tension < 0.02 && S.tensionSent !== 0)) {
      S.tensionSent = S.tension < 0.02 ? 0 : S.tension;
      aud('setTension', S.tensionSent);
    }

    var flash = S.flashStart >= 0 ? Math.max(0, 1 - (now - S.flashStart) / 500) : 0;
    if (flash === 0) S.flashStart = -1;

    if (rend) rend.draw(t, { zoom: S.zoom, slow: S.slow, frozen: frozen, flash: flash, tension: S.tension });

    // 写真判定
    if (!S.photoShot && t >= plan.photo.t1) {
      S.photoShot = true;
      // レースは等速に戻すが、音は「心音だけ」の静けさを判定の瞬間まで保つ → 判定ランプ後に解放
      S.slow = false;
      S.hold = now + (2400 / speed) + 1700;
      aud('setSlow', true);
      later(function () { aud('setSlow', false); }, (2400 / speed) + 1700);
      var snap = null;
      if (rend) { try { snap = rend.snapshot(); } catch (er) { logErr('snapshot: ' + er.message); } }
      photoFinish(snap);
    }

    // ゴール通過検出
    var newly = [];
    for (var i = 0; i < plan.n; i++) {
      if (!S.goaled[i] && plan.progress(i, t) >= 1) { S.goaled[i] = true; newly.push(i); }
    }
    if (newly.length) {
      newly.sort(function (a, b) { return plan.finishTime[a] - plan.finishTime[b]; });
      newly.forEach(function (k) { log.goalOrder.push(plan.names[k]); S.goalCount++; });
      if (S.goalCount === 1) aud('play', 'cheer');
      newly.forEach(function (k2) {
        // 3着以降のゴールは短く実況（1・2着は写真判定の演出に任せる）
        if (S.photoShot && !S.cm.busy && !(S.hold && now < S.hold) && plan.rankOf && plan.rankOf[k2] >= 2) say('goal', k2, null, 'normal');
      });
      if (S.goalCount >= plan.n) S.allGoalT = t;
    }
    if (S.allGoalT >= 0 && t - S.allGoalT >= 1000) showResult();
  }

  // ---------- 写真判定 ----------
  function photoFinish(snap) {
    var plan = S.plan, st = S;
    var film = $('film'), cv = $('filmCv'), lamps = $('lamps').children, verdict = $('verdict');
    if (snap) {
      cv.width = snap.width; cv.height = snap.height;
      try { cv.getContext('2d').drawImage(snap, 0, 0); } catch (e) { logErr('film: ' + e.message); }
    } else { cv.width = 640; cv.height = 360; }
    for (var i = 0; i < lamps.length; i++) lamps[i].className = '';
    verdict.textContent = '判定中……';
    film.classList.remove('hidden');
    aud('play', 'shutter');
    var diff = ((plan.photo.t1 - plan.photo.t0) / 1000).toFixed(3);
    later(function () { lamps[0].className = 'on'; aud('play', 'lamp'); }, 400 / speed);
    later(function () { lamps[1].className = 'on'; aud('play', 'lamp'); }, 800 / speed);
    later(function () {
      lamps[2].className = 'on final'; aud('play', 'lampFinal');
      verdict.textContent = '1着 ' + plan.names[plan.photo.a] + 'さん！（ハナ差 ' + diff + '秒）';
    }, 2400 / speed);
    later(function () { if (S === st) film.classList.add('hidden'); }, 6200 / speed);
  }

  // ---------- 結果画面 ----------
  function timeStr(mins) { mins = ((mins % 1440) + 1440) % 1440; return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60); }

  // 走者の見た目（renderer.looks[i]）を乗り物＋帽子＋顔で小さく添える。looks が無ければ乗り物のみ。
  function lookHtml(i, rank) {
    var plan = S.plan, lk = rend && rend.looks && rend.looks[i];
    var veh = esc(plan.vehicle.emoji);
    if (!lk) return '<span class="vh">' + veh + '</span> ';
    var f = '';
    if (typeof lk.hue === 'number' && isFinite(lk.hue)) f = 'hue-rotate(' + Math.round(lk.hue) + 'deg) saturate(1.3)';
    else if (typeof lk.hue === 'string' && /^[a-z\-]+\([^;"<>]*\)(\s+[a-z\-]+\([^;"<>]*\))*$/i.test(lk.hue)) f = lk.hue;
    var hat = typeof lk.hat === 'string' ? ({ horn: '🦄', prop: '🌀' }[lk.hat] || lk.hat) : '';
    var face = rank === 0 ? '🥳' : (rank <= 2 ? '😄' : '😌');
    return '<span class="vh"' + (f ? ' style="filter:' + f + '"' : '') + '>' + veh + '</span>' +
      '<span class="lk">' + esc(hat) + esc(face) + '</span> ';
  }

  function showResult() {
    var plan = S.plan, st = S;
    S.phase = 'result';
    clearTimers();
    aud('stopLoop'); aud('setSlow', false); aud('setTension', 0); aud('cancelSpeech');
    hideOverlays();
    show('result');

    var startMin = parseTime($('optStart').value); if (startMin === null) startMin = 13 * 60;
    var per = parseInt($('optMin').value, 10); if (!(per >= 1)) per = 8;
    var order = plan.order, n = plan.n;

    // 表彰台
    var pod = $('podium'); pod.innerHTML = '';
    var medals = ['🥇', '🥈', '🥉'];
    [1, 0, 2].filter(function (r) { return r < Math.min(n, 3); }).forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'pod p' + (r + 1);
      d.innerHTML = '<div class="who">' + lookHtml(order[r], r) + esc(plan.names[order[r]]) + '</div><div class="block">' + medals[r] + ' ' + (r + 1) + '</div>';
      pod.appendChild(d);
    });

    // リスト＋タイムテーブル
    var ol = $('orderList'); ol.innerHTML = '';
    var rows = n > 6 ? Math.ceil(n / 2) : n;
    ol.classList.toggle('two', n > 6);
    ol.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 6.2vh))';
    var lines = [];
    log.resultOrder.length = 0;
    order.forEach(function (idx, k) {
      var s = startMin + k * per, e = s + per, name = plan.names[idx];
      var range = timeStr(s) + '〜' + timeStr(e);
      lines.push(range + ' ' + name + 'さん');
      log.resultOrder.push(name);
      var li = document.createElement('li');
      li.style.animationDelay = (0.3 + k * 0.12) + 's';
      li.innerHTML = '<span class="rk">' + (k + 1) + '</span><span class="nm">' + lookHtml(idx, k) + esc(name) + 'さん</span><span class="tm">' + range + '</span>';
      ol.appendChild(li);
    });
    st.timetable = lines.join('\n');

    // 封筒
    var env = $('envelope');
    env.classList.remove('open');
    env.innerHTML = '✉️ 封印の封筒を開封します……';
    st.envOpened = false;
    later(openEnvelope, 2200 / speed);

    // 紙吹雪（少なめ・大きめ・ゆっくり）
    var cf = $('confetti'); cf.innerHTML = '';
    var cols = ['#ffd23f', '#ff4d6d', '#3be0ff', '#5dff9c', '#ff9f1c', '#c58bff'];
    for (var i = 0; i < 40; i++) {
      var c = document.createElement('i');
      var sz = 18 + Math.random() * 14;
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.width = sz + 'px'; c.style.height = (sz * 0.6) + 'px';
      c.style.background = cols[i % cols.length];
      c.style.animationDuration = (7 + Math.random() * 5) + 's';
      c.style.animationDelay = (Math.random() * 3) + 's';
      cf.appendChild(c);
    }
    aud('play', 'fanfare');
    resultBanter(plan, st);
    log.done = true;
  }

  // 結果画面の締めの掛け合い（読み上げのみ。画面の発表順リストが字幕の代わり）
  function resultBanter(plan, st) {
    var first = plan.names[plan.order[0]], lastN = plan.names[plan.order[plan.n - 1]];
    var lines = [
      ['ana', 'トップバッターは' + first + 'さん！'],
      ['kai', pickOne(['いきなりですね', '準備できてますか？', '心の準備をどうぞ'])],
      ['ana', '大トリは' + lastN + 'さん！'],
      ['kai', pickOne(['ハードル上がりましたね', 'のんびり走った分、期待です', '最後に全部持っていく人です'])]
    ];
    function go(k) {
      if (S !== st || S.phase !== 'result' || k >= lines.length) return;
      aud('speak', lines[k][1], lines[k][0], { priority: 'high', maxWaitMs: 2000, fallbackMs: 1,
        onend: function () { later(function () { go(k + 1); }, 150 / speed); },
        ondrop: function () {} });
    }
    if (plan.n >= 2) later(function () { go(0); }, 1600 / speed);
  }
  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }

  function openEnvelope() {
    if (!S || S.phase !== 'result' || S.envOpened) return;
    S.envOpened = true;
    var env = $('envelope');
    env.classList.add('open');
    env.innerHTML = '📜 封印コード <b>' + esc(S.plan.sealCode) + '</b>（レース前と同じ！）';
    aud('play', 'tick');
  }

  function copyTimetable() {
    if (!S || !S.timetable) return;
    var text = S.timetable, btn = $('btnCopy');
    function done(msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = '📋 タイムテーブルをコピー'; }, 2200); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      done(ok ? 'コピーしました！' : 'コピーできませんでした');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done('コピーしました！'); }, fallback);
      } else fallback();
    } catch (e) { fallback(); }
  }

  // ---------- 起動 ----------
  function startFromSetup() {
    if (!validate()) return;
    saveSetup();
    beginRace(parsedNames.slice());
  }

  function init() {
    loadSetup();
    refreshControls();
    validate();

    $('names').addEventListener('input', function () { validate(); saveSetup(); });
    $('optStart').addEventListener('input', function () { validate(); saveSetup(); });
    $('optMin').addEventListener('input', function () { validate(); saveSetup(); });
    $('optSpeech').addEventListener('change', function () { setSpeech(this.checked); });
    $('btnStart').addEventListener('click', function () { this.blur(); startFromSetup(); });

    $('btnSound').addEventListener('click', function () {
      muted = !muted; aud('setMuted', muted); refreshControls(); this.blur();
    });
    $('btnSpeech').addEventListener('click', function () { setSpeech(!speechOn); this.blur(); });
    $('btnShare').addEventListener('click', function () { $('shareNote').hidden = !$('shareNote').hidden; this.blur(); });

    $('intro').addEventListener('click', function () { if (S && S.skip) S.skip(); });
    $('envelope').addEventListener('click', openEnvelope);
    $('btnCopy').addEventListener('click', function () { copyTimetable(); this.blur(); });
    $('btnAgain').addEventListener('click', function () { this.blur(); if (S) beginRace(S.names.slice()); });
    $('btnChange').addEventListener('click', function () {
      this.blur();
      if (S) { clearTimers(); S.phase = 'setup'; }
      aud('stopLoop'); aud('cancelSpeech');
      hideOverlays();
      show('setup'); validate();
    });

    document.addEventListener('pointerdown', initAudioOnce, true);
    document.addEventListener('keydown', initAudioOnce, true);

    document.addEventListener('keydown', function (e) {
      if (!(e.key === ' ' || e.code === 'Space' || e.key === 'Enter')) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT') return;
      e.preventDefault();
      if (e.repeat) return;
      if (currentScreen === 'setup') startFromSetup();
      else if (currentScreen === 'race') { if (S && S.phase === 'intro' && S.skip) S.skip(); }
      else if (currentScreen === 'result') openEnvelope();
    });

    window.addEventListener('resize', function () { if (rend) { try { rend.resize(); } catch (e) {} } });
    window.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  RR.App = { version: 1 };
})();
