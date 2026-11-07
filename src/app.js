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
    ['telop', 'sub', 'freezeMsg', 'count', 'intro', 'film', 'skipHint', 'spurt', 'cutin'].forEach(function (id) { $(id).classList.add('hidden'); });
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
  //   & = その走者の着順（例「3着」）
  //   v4: 各種類の台詞を増やし、職場で引っかかりそうな言い回し（発表・評価・反則を連想するもの）を差し替えた。
  var PH = {
    stumble: { ana: ['#さん転倒！｜受け身は百点です', 'あっ、#さんが！｜見なかったことにしましょう', '#さんつまずいた！｜何もない所でしたね',
                     '#さん、止まった！｜景色を見てますね', '#さん、ずっこけた！｜お約束を守る人です', '#さん、まさかの！｜今のは練習です、たぶん',
                     '#さん、転んだ！｜立ち上がりが早い！'],
               kai: ['#さん、今のはノーカンで', '#さん、大丈夫ですか！', '#さん、靴ひもですね'] },
    boost:   { ana: ['#さん急加速！｜朝ごはん何食べたんですか', '#さん、きた！｜急に本気出しましたね', '#さん猛ダッシュ！｜お昼ごはんが待ってます',
                     '#さん、飛んだ！｜今、浮いてました？', '#さん、ギア全開！｜隠してましたね', '#さんが光った！｜ターボ付きでしたか'],
               kai: ['#さん、大人げない！', '#さん、速い速い！', '#さん、本気モードです'] },
    reverse: { ana: ['#さん逆走！？｜忘れ物ですかね', '#さん、どこへ！？｜帰ろうとしてます', '#さん、逆です！｜ゴールはあっちです！',
                     '#さん、Uターン！｜寄り道は後で！', '#さん戻った！？｜ガスの元栓ですかね'],
               kai: ['#さん、向きが逆です', '#さん、地図が逆さまです'] },
    swap:    { ana: ['入れ替わった！？｜手品でしょうか', '#さんと@さん！？｜場所交換です', '何が起きた！？｜私も見てませんでした',
                     '瞬間移動！？｜これは新技術です'],
               kai: ['位置が入れ替わった？', '今、ワープしました？'] },
    lead:    { ana: ['先頭交代！#さん！', '#さんがトップ！', '#さん抜いた！｜容赦ないですね', '#さん前へ！｜ここで仕掛けた！',
                     '#さん先頭に！｜いい顔してます'],
               kai: ['#さん、ドヤ顔です', 'トップは#さんに'] },
    spurt:   { ana: ['ラストスパート！｜ここで本気出す人います', 'ここから勝負！｜全員、目が本気です', '最後の直線！｜もう誰にも分かりません',
                     '勝負どころ！｜手に汗にぎります'],
               kai: ['ここからが勝負です'] },
    photo:   { ana: ['#さん！@さん！どっちだ！', '並んだ！#さんと@さん！', '#さんと@さん、横一線！'], kai: ['#さんと@さん、僅差！'] },
    leader:  { ana: ['#さん先頭！｜まだ油断できません', '#さんリード！｜もう勝った顔してます', '#さんが引っ張る！｜風よけ役ですね',
                     '先頭は#さん！｜後ろ、全然見てません', '#さん、逃げる！｜追いつけるか！', '#さん独走！？｜まだ半分ありますよ'],
               kai: ['#さん、余裕の表情', '#さん、鼻歌まじりです', '#さん、快調です'] },
    close:   { ana: ['#さんと@さん並んだ！｜お互い譲る気ゼロです', '#さん@さん、接戦！｜目が離せません', '#さんに@さん！｜近い近い！',
                     '#さんと@さん！｜火花が散ってます'],
               kai: ['#さんと@さん、バチバチです', '#さんと@さん、目が合った'] },
    melee:   { ana: ['抜きつ抜かれつ！｜目が離せません', '先頭が分からない！｜全員いい顔です', '団子のまま最終盤！｜誰が抜け出す！',
                     '横一線！｜これは写真判定か！', '大混戦です！｜手に汗にぎります'],
               kai: ['先頭集団、大混戦です', '誰が勝ってもおかしくない'] },
    chase:   { ana: ['#さん追い上げ！｜急にやる気が出ました', '#さん、ぐんぐん！｜エンジンかかりました', '#さん上がってきた！｜寝たふりでしたね',
                     '#さん、来てる来てる！｜ここからの人です', '#さん、まくる！｜作戦どおりですね'],
               kai: ['#さん、いい脚です', '#さん、本気モードです'] },
    drop:    { ana: ['#さん、下がった！｜お腹すいたんですかね', '#さん失速！｜電池切れでしょうか', '#さん、どうした！｜考えごとですかね',
                     '#さん、ペースダウン！｜休憩タイムです'],
               kai: ['#さん、息切れです', '#さん、充電中です'] },
    last:    { ana: ['#さん最後尾！｜作戦です、たぶん', '#さん、まだまだ！｜景色を楽しんでますね', '#さん、ゆっくり！｜お散歩ペースです',
                     '#さん、のんびり！｜景色を独り占めです', '#さん、しんがり！｜大物は最後に来ます', '#さん、後ろから！｜全員が見えて安心です'],
               kai: ['#さん、大物の風格', '#さん、マイペースです'] },
    look:    { ana: ['%の#さん！｜今日いちばんオシャレです', '%の#さん、目立つ！｜走りより帽子が目立ちます', '#さんの%、揺れてる！｜飛ばされないで！',
                     '#さん、%が光る！｜勝負服ですね'],
               kai: ['%、似合いますね#さん'] },
    veh:     { ana: ['みなさん$に必死！｜大人が本気です', '$レース白熱！｜観客席も前のめりです', '$、乗りこなしてます！｜練習してきましたね',
                     '$、意外と速い！｜見直しました'],
               kai: ['$、意外と速いですね'] },
    start:   { ana: ['さあスタート！｜みなさん、いい顔です', '#さん好スタート！｜フライングでは？', '各者いっせいに！｜きれいなスタートです'],
               kai: ['まずは様子見です'] },
    goal:    { ana: ['#さん、&ゴール！', '#さん&！｜お疲れさまでした', '#さん、&でゴール！'], kai: ['#さん、&です'] },
    freeze:  { ana: ['時が止まった！？｜放送事故ですか？'], kai: ['……止まった？'] },
    unfreeze:{ ana: ['ウソでした！続行！｜心臓に悪いです', 'ウソです！再開！｜寿命が縮みました'], kai: ['再開です'] }
  };
  // 割り込みで言う種類（短くしたいので本文の上限を小さく）。v4: 先頭交代は割り込まない（普通の優先度）
  var HIGHK = { stumble: 1, boost: 1, reverse: 1, swap: 1, spurt: 1, photo: 1, freeze: 1, unfreeze: 1 };
  // 1レースで同じ人をいじる回数の上限（最後尾・失速・帽子）
  var TEASE = { last: 1, drop: 1, look: 1 };
  var HAT_WORD = { '👑': '王冠', '🎩': 'シルクハット', '🧢': 'キャップ', '🎀': 'リボン', '🌸': 'お花', '⛑️': 'ヘルメット',
    '🎓': '角帽', '🪖': 'ヘルメット', '👒': '麦わら帽子', '🍄': 'キノコ帽', '🍓': 'イチゴ帽', '🌻': 'ひまわり', horn: 'ユニコーン角', prop: 'プロペラ帽' };

  function newCm() {
    return { subId: 0, cur: 0, shownId: 0, busy: false, replyPending: false, idleSince: -9999, lastRole: 'kai', anaRun: 0,
      lastGenT: -9999, lastHighT: -9999, nextAt: 900, recent: {}, lastKey: '', lastKind: '', lcIdx: 0, stable: -1, cand: -1,
      candSince: 0, lastLcT: -9999, lastLcTelop: -9999, spurt: false, preShot: false, frozeSaid: false, lookCount: 0, vehSaid: false,
      teased: {}, curStartReal: 0, curEstReal: 0 };
  }
  function nm(i) { return S.names[i]; }
  // 読み上げが実際に鳴るか（鳴らないときは字幕だけを 2.2 秒出す）
  function speechReal() { return !!(speechOn && !muted && aud('speechAvailable')); }
  // 文を言い終わるまでのおおよその時間。PC内蔵音声の実測（約185ms/字＋開始の遅れ）から
  function estRealMs(text) { return 300 + String(text).length * 190; }
  // 同じ時間をレース時計(ms)に直したもの（言い終わる時点のレース状況を確かめるのに使う）
  function estRace(text) { return speechReal() ? estRealMs(text) * speed : 2200; }
  function hatWord(i) {
    var lk = rend && rend.looks && rend.looks[i];
    return lk && typeof lk.hat === 'string' ? (HAT_WORD[lk.hat] || '') : '';
  }
  function fillTp(tp, a, b) {
    var needHat = tp.indexOf('%') >= 0, needVeh = tp.indexOf('$') >= 0;
    var hw = needHat ? hatWord(a) : '', vl = S.plan.vehicle && S.plan.vehicle.label;
    if (needHat && !hw) return null;
    if (needVeh && !vl) return null;
    // 1回でまとめて置き換える（名前に @ % $ & が入っていても化けない）
    return tp.replace(/[#@%$&]/g, function (c) {
      if (c === '#') return nm(a);
      if (c === '@') return b == null ? '' : nm(b);
      if (c === '%') return hw;
      if (c === '$') return vl || '';
      return (S.plan.rankOf ? S.plan.rankOf[a] + 1 : '') + '着';
    });
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

  // 1文を生成して出す。valid(t, tEnd) が偽なら（字幕が出る時点、または言い終わる時点で状況が変わっていれば）出さない。
  // v4: 言う前にも「言い終わるまで状況が続くか」を確かめ、続かない文は最初から言わない（戻り値 false）。
  function say(kind, a, b, pri, valid) {
    var pk = pickText(kind, chooseRole(), a, b);
    if (!pk) return false;
    if (valid && !valid(S.t, S.t + estRace(pk.text))) return false;
    if (pri !== 'high' && !fitsBeforeHigh(pk.text)) return false;
    sayText(kind, pk.text, pk.role, pri, valid, pk.reply);
    return true;
  }
  // v4: 次の割り込み（イベント・ラストスパート・写真判定・フリーズ）は計画で分かっている。
  //     普通の文は、それまでに言い終わるときだけ言う（言いかけで切られないように）
  function fitsBeforeHigh(text) {
    var plan = S.plan, cm = S.cm, t = S.t, end = t + estRace(text), next = Infinity, k;
    for (k = 0; k < plan.events.length; k++) if (plan.events[k].t > t) { next = Math.min(next, plan.events[k].t); break; }
    if (!cm.spurt) next = Math.min(next, finalFromOf(plan));
    if (plan.freeze && !S.freezeDone) next = Math.min(next, plan.freeze.t);
    next = Math.min(next, plan.slowFrom);
    return end + 150 * speed <= next;
  }

  function sayText(kind, text, role, pri, valid, reply, deferred) {
    var cm = S.cm, st = S;
    // v4: 割り込みでも、今の文があと1.5秒以内に言い終わるなら、言い終わってから言う（文を途中で切らない）
    if (pri === 'high' && !deferred && cm.busy && cm.curStartReal && speechReal()) {
      var remain = cm.curEstReal - (performance.now() - cm.curStartReal);
      if (remain > 0 && remain < 1500) {
        later(function () {
          if (S !== st || S.phase !== 'race') return;
          sayText(kind, text, role, pri, valid, reply, true);
        }, remain + 80);
        return;
      }
    }
    var id = ++cm.subId, genT = Math.round(S.t);
    cm.cur = id; cm.busy = true; cm.replyPending = false; cm.lastGenT = S.t; cm.lastKind = kind;
    cm.lastRole = role; cm.anaRun = role === 'ana' ? cm.anaRun + 1 : 0;
    if (pri === 'high') cm.lastHighT = S.t;
    var started = false, real = false;
    function idle() { if (cm.cur === id) { cm.busy = false; cm.idleSince = S.t; } }
    function onstart(isReal) {
      if (S !== st || started) return;
      started = true; real = !!isReal;
      if (valid && !valid(S.t, S.t + estRace(text))) { cm.shownId = 0; aud('cancelSpeech'); idle(); return; }
      cm.shownId = id;
      cm.curStartReal = performance.now(); cm.curEstReal = estRealMs(text);
      showSub({ role: role, text: text });
      $('sub').classList.remove('hidden');
      log.subs.push({ t: Math.round(S.t), text: text, shownAt: real ? 'start' : 'timer', genT: genT, kind: kind });
    }
    function onend() {
      if (S !== st) return;
      if (cm.cur === id) cm.curStartReal = 0;
      idle();
      if (cm.shownId !== id) return;
      // ツッコミ：本文が最後まで言えたときだけ、相方がすぐ続ける
      if (reply && cm.cur === id) {
        cm.replyPending = true;
        later(function () {
          if (S !== st || cm.cur !== id) return;
          cm.replyPending = false;
          if (cm.busy || S.phase !== 'race' || S.t >= S.plan.slowFrom || !fitsBeforeHigh(reply)) return;
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

  // v4: 先頭交代は割り込まない。言い終わるまで先頭が続く場合だけ言う。終盤の団子では個別に言わず「大混戦」系にまとめる。
  function onLeadChange(leader, t, now) {
    var cm = S.cm, plan = S.plan;
    cm.lastLcT = t;
    var eventTelop = S.telopKind === 'event' && S.telopUntil && now < S.telopUntil;
    if (!eventTelop && t - cm.lastLcTelop >= 1500) { cm.lastLcTelop = t; showTelop('先頭交代！', 1100 / speed, false, 'lc'); }
    if (t < finalFromOf(plan) && !cm.busy && !cm.replyPending && t - cm.lastHighT >= 1200 && t - cm.lastGenT >= 900) {
      say('lead', leader, null, 'normal', function (t1, t2) { return leaderNow(t1) === leader && leaderNow(t2) === leader; });
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
    cands.push({ k: 'leader', a: lead, w: inFinal ? 1 : 2 });
    // 終盤の団子は、先頭がすぐ入れ替わるので名前なしの「大混戦」系を多めに
    if (inFinal) cands.push({ k: 'melee', a: lead, w: 4 });
    // 同じ人を何度もいじらない
    cands = cands.filter(function (c) { return !TEASE[c.k] || (cm.teased[c.a] || 0) < 2; });
    // 直前と同じ種類・同じ話題を避ける
    var f = cands.filter(function (c) { return c.k !== cm.lastKind && (c.k + c.a) !== cm.lastKey; });
    if (!f.length) f = cands;
    // 重みつきで順に試し、「言い終わるまで状況が続く」ものを言う
    while (f.length) {
      var tot = 0; f.forEach(function (c) { tot += c.w; });
      var x = Math.random() * tot, pi = 0;
      for (var i = 0; i < f.length; i++) { x -= f[i].w; if (x <= 0) { pi = i; break; } }
      var pick = f.splice(pi, 1)[0];
      var valid = validFor(pick);
      if (say(pick.k, pick.a, pick.b, 'normal', valid)) {
        cm.lastKey = pick.k + pick.a;
        if (pick.k === 'look') cm.lookCount++;
        if (pick.k === 'veh') cm.vehSaid = true;
        if (TEASE[pick.k]) cm.teased[pick.a] = (cm.teased[pick.a] || 0) + 1;
        return;
      }
    }
  }
  // 種類ごとの「その文が正しい状況か」。t1 = 字幕が出る時刻、t2 = 言い終わる時刻（レース時計）
  function validFor(pick) {
    var plan = S.plan;
    if (pick.k === 'leader') return function (t1, t2) { return leaderNow(t1) === pick.a && leaderNow(t2) === pick.a; };
    if (pick.k === 'last') return function (t1, t2) {
      var o1 = ranksAt(t1), o2 = ranksAt(t2);
      return o1[o1.length - 1] === pick.a && o2[o2.length - 1] === pick.a;
    };
    if (pick.k === 'close') return function (t1, t2) {
      return Math.abs(plan.progress(pick.a, t1) - plan.progress(pick.b, t1)) < 0.02 &&
        Math.abs(plan.progress(pick.a, t2) - plan.progress(pick.b, t2)) < 0.025;
    };
    if (pick.k === 'chase') return function (t1, t2) { return ranksAt(t2).indexOf(pick.a) <= ranksAt(t1).indexOf(pick.a); };
    if (pick.k === 'drop') return function (t1, t2) { return ranksAt(t2).indexOf(pick.a) >= ranksAt(t1).indexOf(pick.a); };
    return null;
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
    log.goalOrder.length = 0; log.resultOrder.length = 0; log.subs.length = 0; log.done = false; log.verdictShown = false;
    if (!(RR.Core && RR.Core.planRace)) { $('setupMsg').textContent = 'エラー: RR.Core が読み込まれていません'; logErr('RR.Core missing'); return; }
    var plan;
    try { plan = RR.Core.planRace(names); } catch (e) { logErr('planRace: ' + e.message); return; }
    if (!rend && RR.Renderer && RR.Renderer.create) {
      try { rend = RR.Renderer.create($('cv')); } catch (e) { logErr('renderer: ' + e.message); }
    }
    S = {
      plan: plan, names: names, phase: 'intro', t: 0, last: 0, slow: false, zoom: 0,
      ei: 0, ci: 0, goaled: [], goalCount: 0, allGoalT: -1, photoShot: false,
      freezeDone: false, freezeUntil: 0, wasFrozen: false, flashStart: -1, snap: null, revealT: -1, verdictAt: 0,
      telopUntil: 0, telopKind: '', timers: [], introTimer: 0, skip: null,
      cm: newCm(), tension: 0, tensionSent: 0
    };
    hideOverlays();
    show('race');
    if (rend) { try { rend.setPlan(plan); rend.resize(); } catch (e) { logErr('setPlan: ' + e.message); } }
    runIntro();
  }

  // v4: 紹介ボードは読み上げが終わるまで待つ（最大 +2.5秒）。文はレース前に切られないよう短くした
  var INTRO_MS = [2200, 2200, 1900];
  var INTRO_WAIT_MAX = 2500;
  function runIntro() {
    var p = S.plan, st = S;
    var intro = $('intro');
    // 事前の天気・乗り物紹介（負の時刻の実況）は読み上げのみ（ボードが字幕を隠すため）
    var pre = (p.commentary || []).filter(function (l) { return l && l.t < 0; });
    var preBusy = false;
    function preSpeak(k) {
      var l = pre[k];
      if (!l || !speechOn) return;
      preBusy = true;
      var r = aud('speak', l.text, l.role, { priority: 'high', maxWaitMs: 0, fallbackMs: 1,
        onend: function () { preBusy = false; }, ondrop: function () { preBusy = false; } });
      if (r !== 'speech') preBusy = false;
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
      preBusy = false;
      steps[idx]();
      var waited = 0;
      st.introTimer = setTimeout(function wait() {
        if (S !== st || st.phase !== 'intro') return;
        if (preBusy && waited < INTRO_WAIT_MAX) { waited += 150; st.introTimer = setTimeout(wait, 150); return; }
        next();
      }, INTRO_MS[idx] / speed);
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
    // v4: 描画が遅いPCでもレースが実時間どおり進むよう、1フレームで進める上限を 250ms にした
    //     （タブを裏にしたときなど、それ以上空いたら止まっていたものとして扱う）
    var dtReal = Math.min(Math.max(now - S.last, 0), 250);
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

    // reveal = 写真判定の結果を出したレース時刻（それまで1・2着のバッジ・表情・喜びのポーズは伏せる）
    if (rend) rend.draw(t, { zoom: S.zoom, slow: S.slow, frozen: frozen, flash: flash, tension: S.tension, reveal: S.revealT });

    // 写真判定：1着がゴールした瞬間の1・2着のレーンを撮っておく（フィルム用）
    if (!S.snap && t >= plan.photo.t0 && rend) {
      try { S.snap = rend.photo ? rend.photo(t) : rend.snapshot(); } catch (er) { logErr('photo: ' + er.message); S.snap = null; }
    }
    if (!S.photoShot && t >= plan.photo.t1) {
      S.photoShot = true;
      // レースは等速に戻すが、音は「心音だけ」の静けさを判定の瞬間まで保つ → 判定ランプ後に解放
      S.slow = false;
      S.hold = now + 4100 / speed;
      aud('setSlow', true);
      later(function () { aud('setSlow', false); }, 4100 / speed);
      photoFinish(S.snap);
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
        if (!(plan.rankOf && plan.rankOf[k2] >= 2)) return;
        // 3着以降はゴールの瞬間に着順スタンプ（音）。実況は判定の発表が済んでから短く
        aud('play', 'stamp');
        if (S.photoShot && !S.cm.busy && S.revealT >= 0 && !(S.hold && now < S.hold)) say('goal', k2, null, 'normal');
      });
      if (S.goalCount >= plan.n) S.allGoalT = t;
    }
    // v4: 写真判定の発表とカットインを見せ終わるまで結果画面に切り替えない（2〜4人でも判定が見える）
    if (S.allGoalT >= 0 && t - S.allGoalT >= 1000 && S.verdictAt && now - S.verdictAt >= RESULT_AFTER_VERDICT_MS / speed) showResult();
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
    }, 2400 / speed);
    // ドラムロール（約1.6秒）が終わった瞬間に発表 → 勝者カットイン
    later(function () {
      if (S !== st) return;
      verdict.textContent = '1着 ' + plan.names[plan.photo.a] + 'さん！（ハナ差 ' + diff + '秒）';
      st.verdictAt = performance.now();
      st.revealT = st.t;
      log.verdictShown = true;
      aud('play', 'stamp');
      aud('speak', '1着は' + plan.names[plan.photo.a] + 'さん！', 'ana', { priority: 'high', maxWaitMs: 1500, fallbackMs: 1 });
      showCutin(plan.photo.a);
    }, 4050 / speed);
    later(function () { if (S === st) film.classList.add('hidden'); }, 5000 / speed);
  }

  // 勝者カットイン：1着の顔と名前を画面いっぱいの斜めの帯で「ドン！」と出す
  var RESULT_AFTER_VERDICT_MS = 2600;
  function showCutin(i) {
    var el = $('cutin'), lk = rend && rend.looks && rend.looks[i];
    var face = lk && lk.faces ? lk.faces.win : '🥳';
    var hat = lk && typeof lk.hat === 'string' ? ({ horn: '🦄', prop: '🌀' }[lk.hat] || lk.hat) : '';
    el.innerHTML = '<div class="ciBand"><div class="ciFace">' + esc(hat) + '<br>' + esc(face) + '</div>' +
      '<div class="ciText"><div class="ciRank">🏆 1着</div><div class="ciName">' + esc(S.plan.names[i]) + 'さん</div>' +
      '<div class="ciSub">トップバッター決定！</div></div></div>';
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    aud('play', 'cutin');
    later(function () { el.classList.add('hidden'); }, 2300 / speed);
  }

  // ---------- 結果画面 ----------
  // 名前の見た目の幅（全角=1、半角=0.55）から、表彰台に1行で収まる文字の大きさ(em)を決める
  function fitEm(name, fitChars) {
    var w = 0;
    for (var i = 0; i < name.length; i++) w += /[\u0000-\u00ff\uff61-\uff9f]/.test(name.charAt(i)) ? 0.55 : 1;
    return w <= fitChars ? 1 : Math.max(0.45, fitChars / w);
  }
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
      // v4: 絵文字は名前の上の行に分け、名前は長さに合わせて文字を小さくする（「前後…」のように切れないように）
      var name = plan.names[order[r]];
      d.innerHTML = '<div class="who"><div class="whoLk">' + lookHtml(order[r], r) + '</div><div class="whoNm" style="font-size:' +
        fitEm(name, r === 0 ? 5 : 5.5).toFixed(2) + 'em">' + esc(name) + '</div></div><div class="block">' + medals[r] + ' ' + (r + 1) + '</div>';
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
      ['kai', pickOne(['先陣、お願いします', '一番乗りです！', '勢いそのままでどうぞ'])],
      ['ana', '大トリは' + lastN + 'さん！'],
      ['kai', pickOne(['締めくくり、楽しみです', '最後まで目が離せません', '主役は最後に登場です'])]
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
