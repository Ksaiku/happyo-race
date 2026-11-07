/*
 * src/audio.js -> RR.Audio  (Web Audio API で合成。音声ファイル不使用)
 *
 * API:
 *   init()                 最初のユーザー操作時に呼ぶ。AudioContext作成/resume。何度呼んでも安全
 *   setMuted(bool)         ミュート（全ての音と読み上げを止める）
 *   isMuted()
 *   play(name)             'tick','go','boost','stumble','reverse','swap','freeze','unfreeze',
 *                          'lamp','lampFinal','shutter','fanfare','cheer','stamp','cutin'
 *   startLoop()            足音リズム＋控えめベース
 *   stopLoop()
 *   setSlow(bool)          ループのテンポ/ピッチを落とし、心音を重ねる
 *   speak(text, role)      'ana' | 'kai'。ja-JP かつ localService===true の音声のみ
 *   setSpeech(bool)
 *   isSpeechOn()
 *   speechAvailable()
 *   cancelSpeech()
 *
 * どの関数も例外を投げない。AudioContext が無い環境（Node 等）では黙って無視する。
 */
var RR = (typeof window !== 'undefined') ? (window.RR = window.RR || {}) : {};

RR.Audio = (function () {
  'use strict';

  var MASTER_VOL = 0.35;

  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var muted = false;
  var speechOn = true;
  var slow = false;

  // ---- loop state ----
  var loopOn = false;
  var loopTimer = null;
  var loopBus = null;
  var nextStepTime = 0;
  var stepIdx = 0;
  var nextBeatTime = 0;
  var tension = 0;
  var ambBus = null, heartBus = null, ambNodes = [];

  // ---- speech state ----
  var voices = [];
  var voicesLoaded = false;
  var speaking = false;      // 実発話が進行中（またはキュー済み）
  var speakSeq = 0;
  var curFinish = null;

  function safe(fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (e) { return undefined; }
    };
  }

  // ---------------------------------------------------------------- core
  function ready() { return !!(ctx && master); }

  var init = safe(function () {
    if (!ctx) {
      var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (AC) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : MASTER_VOL;
        var comp = ctx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(ctx.destination);
        var len = Math.floor(ctx.sampleRate * 2);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
    }
    if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
    initSpeech();
  });

  // tone: oscillator with envelope. o: {type, vol, a, r, lp, to, dest}
  function tone(freq, t, dur, o) {
    o = o || {};
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + dur);
    var vol = o.vol == null ? 0.3 : o.vol;
    var a = o.a == null ? 0.005 : o.a;
    var r = o.r == null ? 0.05 : o.r;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, Math.max(t + a, t + dur - r));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var node = osc;
    if (o.lp) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur);
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.dest || master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // noise burst through a filter. o: {type, freq, freqTo, q, vol, a, dest}
  function noise(t, dur, o) {
    o = o || {};
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqTo), t + dur);
    f.Q.value = o.q == null ? 1 : o.q;
    var g = ctx.createGain();
    var vol = o.vol == null ? 0.3 : o.vol;
    var a = o.a == null ? 0.003 : o.a;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  function thump(t, f0, f1, dur, vol, dest) {
    tone(f0, t, dur, { type: 'sine', vol: vol, a: 0.003, r: dur * 0.6, to: f1, dest: dest });
  }

  // ---------------------------------------------------------------- sounds
  var NOTE = {
    C3: 130.81, G3: 196.0, A3: 220.0, F3: 174.61,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0
  };

  function brass(freq, t, dur, vol) {
    // ノコギリ波2本(わずかにデチューン) + ローパス（アタックで開く）
    tone(freq, t, dur, { type: 'sawtooth', vol: vol, a: 0.04, r: 0.12, lp: 900, lpTo: 2200 });
    tone(freq * 1.006, t, dur, { type: 'sawtooth', vol: vol * 0.6, a: 0.05, r: 0.12, lp: 800, lpTo: 2000 });
  }

  function fanfare(t0) {
    var b = 0.26; // 1拍
    // [旋律, 開始拍, 長さ拍, 和音の根音(3度・5度を重ねる), 和音種別]
    var seq = [
      ['G4', 0,    0.5, 'C4', 'M'],
      ['C5', 0.5,  0.5, 'C4', 'M'],
      ['E5', 1,    0.5, 'C4', 'M'],
      ['D5', 1.5,  0.5, 'G3', 'M'],
      ['F5', 2,    0.5, 'F3', 'M'],
      ['E5', 2.5,  0.5, 'C4', 'M'],
      ['A4', 3,    0.5, 'F3', 'M'],
      ['D5', 3.5,  0.5, 'G3', 'M'],
      ['G5', 4,    1.0, 'C4', 'M'],
      ['E5', 5,    0.5, 'A3', 'm'],
      ['A5', 5.5,  0.5, 'F3', 'M'],
      ['G5', 6,    1.0, 'G3', 'M'],
      ['C5', 7.5,  0.5, 'C4', 'M'],
      ['E5', 8,    0.5, 'C4', 'M'],
      ['G5', 8.5,  4.0, 'C4', 'M']
    ];
    for (var i = 0; i < seq.length; i++) {
      var s = seq[i];
      var t = t0 + s[1] * b;
      var d = s[2] * b + 0.04;
      var last = i === seq.length - 1;
      brass(NOTE[s[0]], t, last ? 1.5 : d, last ? 0.2 : 0.17);
      var root = NOTE[s[3]];
      var third = root * (s[4] === 'm' ? 1.189 : 1.26);
      var fifth = root * 1.498;
      var cv = last ? 0.12 : 0.08;
      var cd = last ? 1.6 : d;
      brass(root, t, cd, cv);
      brass(third, t, cd, cv);
      brass(fifth, t, cd, cv);
    }
    // 終止の和音の上に太鼓とシンバル風
    var te = t0 + 8.5 * b;
    thump(te, 110, 55, 0.4, 0.5);
    noise(te, 1.2, { type: 'highpass', freq: 4500, q: 0.5, vol: 0.06 });
    for (var k = 0; k < 4; k++) thump(t0 + (k * 2) * b, 100, 55, 0.2, 0.3);
  }

  function lamp(t) {
    tone(880, t, 0.12, { type: 'square', vol: 0.15, a: 0.004, r: 0.04, lp: 2500 });
  }

  function lampFinal(t) {
    // ドラムロール（徐々に加速・増大） → ジャン！
    var dur = 1.6, n = 36, i, tt;
    for (i = 0; i < n; i++) {
      var p = i / n;
      tt = t + dur * (1 - Math.pow(1 - p, 1.6));
      noise(tt, 0.07, { type: 'bandpass', freq: 220 + 150 * p, q: 0.8, vol: 0.12 + 0.28 * p, a: 0.002 });
      thump(tt, 160, 90, 0.07, 0.1 + 0.15 * p);
    }
    var te = t + dur + 0.05;
    var chord = ['C4', 'G4', 'C5', 'E5'];
    for (i = 0; i < chord.length; i++) brass(NOTE[chord[i]], te, 1.0, 0.16);
    brass(NOTE.C3, te, 1.0, 0.18);
    thump(te, 120, 50, 0.4, 0.55);
    noise(te, 0.9, { type: 'highpass', freq: 4000, q: 0.5, vol: 0.08 });
  }

  function shutter(t) {
    noise(t, 0.03, { type: 'bandpass', freq: 2500, q: 1.5, vol: 0.4, a: 0.001 });
    tone(180, t, 0.04, { type: 'square', vol: 0.12, a: 0.001, r: 0.02, lp: 900 });
    noise(t + 0.07, 0.05, { type: 'bandpass', freq: 1500, q: 1.5, vol: 0.35, a: 0.001 });
    tone(130, t + 0.07, 0.06, { type: 'square', vol: 0.1, a: 0.001, r: 0.03, lp: 700 });
  }

  function cheer(t) {
    // 観客のどよめき：帯域ノイズを揺らして膨らませる 約1.5秒
    var dur = 1.5;
    noise(t, dur, { type: 'bandpass', freq: 500, freqTo: 900, q: 0.7, vol: 0.45, a: 0.35 });
    noise(t, dur, { type: 'bandpass', freq: 1100, freqTo: 700, q: 0.9, vol: 0.28, a: 0.4 });
    noise(t + 0.2, dur - 0.2, { type: 'lowpass', freq: 400, q: 0.5, vol: 0.25, a: 0.4 });
  }

  var SOUNDS = {
    tick: function (t) {
      tone(660, t, 0.09, { type: 'triangle', vol: 0.3, a: 0.003, r: 0.05 });
    },
    go: function (t) {
      tone(523.25, t, 0.45, { type: 'sawtooth', vol: 0.2, a: 0.01, r: 0.1, lp: 1800 });
      tone(659.25, t, 0.45, { type: 'sawtooth', vol: 0.15, a: 0.01, r: 0.1, lp: 1800 });
      tone(784.0, t, 0.45, { type: 'sawtooth', vol: 0.12, a: 0.01, r: 0.1, lp: 1800 });
      thump(t, 140, 60, 0.25, 0.4);
    },
    boost: function (t) {
      tone(300, t, 0.5, { type: 'sawtooth', vol: 0.15, a: 0.02, r: 0.15, to: 1100, lp: 1800 });
      noise(t, 0.5, { type: 'bandpass', freq: 600, freqTo: 3000, q: 1, vol: 0.12, a: 0.05 });
    },
    stumble: function (t) {
      thump(t, 220, 60, 0.18, 0.4);
      tone(400, t + 0.12, 0.25, { type: 'triangle', vol: 0.2, to: 150, a: 0.01, r: 0.1 });
      thump(t + 0.3, 120, 50, 0.15, 0.3);
    },
    reverse: function (t) {
      tone(900, t, 0.5, { type: 'square', vol: 0.1, to: 200, a: 0.01, r: 0.15, lp: 1600 });
      noise(t, 0.4, { type: 'bandpass', freq: 2500, freqTo: 400, q: 1, vol: 0.12, a: 0.02 });
    },
    swap: function (t) {
      tone(500, t, 0.18, { type: 'triangle', vol: 0.2, to: 1000, a: 0.005, r: 0.05 });
      tone(1000, t + 0.15, 0.2, { type: 'triangle', vol: 0.18, to: 500, a: 0.005, r: 0.06 });
      noise(t, 0.3, { type: 'bandpass', freq: 3000, q: 2, vol: 0.12, a: 0.005 });
    },
    freeze: function (t) {
      tone(600, t, 0.9, { type: 'sine', vol: 0.25, to: 70, a: 0.01, r: 0.4 });
      noise(t, 0.8, { type: 'lowpass', freq: 2000, freqTo: 100, q: 0.7, vol: 0.18, a: 0.01 });
    },
    unfreeze: function (t) {
      tone(220, t, 0.25, { type: 'triangle', vol: 0.25, to: 440, a: 0.005, r: 0.08 });
      tone(440, t + 0.2, 0.2, { type: 'triangle', vol: 0.25, to: 880, a: 0.005, r: 0.08 });
      tone(660, t + 0.35, 0.25, { type: 'triangle', vol: 0.22, a: 0.005, r: 0.1 });
    },
    // 着順スタンプ「ドン！」
    stamp: function (t) {
      thump(t, 150, 45, 0.28, 0.55);
      noise(t, 0.08, { type: 'lowpass', freq: 900, q: 0.7, vol: 0.3, a: 0.002 });
    },
    // 勝者カットイン「シュバッ → ジャーン」
    cutin: function (t) {
      noise(t, 0.35, { type: 'bandpass', freq: 800, freqTo: 5000, q: 0.8, vol: 0.22, a: 0.02 });
      var ch = ['C5', 'E5', 'G5', 'C4'];
      for (var i = 0; i < ch.length; i++) brass(NOTE[ch[i]] || 523.25, t + 0.3, 0.9, 0.13);
      thump(t + 0.3, 120, 50, 0.35, 0.5);
    },
    lamp: lamp,
    lampFinal: lampFinal,
    shutter: shutter,
    fanfare: fanfare,
    cheer: cheer
  };

  var play = safe(function (name) {
    if (muted || !ready()) return;
    var fn = SOUNDS[name];
    if (!fn) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    fn(ctx.currentTime + 0.02);
  });

  // ---------------------------------------------------------------- loop
  // 8ステップ(1小節)。足音: ドコドコ ドコドコ
  var STEP_PATTERN = [1, 0.5, 0.8, 0.5, 1, 0.5, 0.8, 0.6]; // 足音の強さ
  var BASS_PATTERN = ['C3', null, 'C3', null, 'G3', null, 'F3', null];

  function scheduleStep(t, idx, rate) {
    var s = idx % 8;
    var v = STEP_PATTERN[s];
    var pitch = rate * (1 + 0.12 * tension); // 0.6..1.1 程度
    // ドコ（低い足音）
    thump(t, (s % 2 === 0 ? 120 : 160) * pitch, 55 * pitch, 0.12, 0.35 * v, loopBus);
    noise(t, 0.04, { type: 'bandpass', freq: 700 * pitch, q: 1, vol: 0.05 * v, a: 0.002, dest: loopBus });
    // 控えめベース
    var n = BASS_PATTERN[s];
    if (n) {
      tone(NOTE[n] * pitch, t, 0.28, { type: 'triangle', vol: 0.14, a: 0.01, r: 0.1, lp: 500, dest: loopBus });
    }
  }

  function scheduleHeart(t, vol) {
    // ドクン…ドクン
    var v = vol == null ? 1 : vol;
    thump(t, 70, 40, 0.18, 0.7 * v, heartBus || loopBus);
    thump(t + 0.2, 60, 38, 0.2, 0.5 * v, heartBus || loopBus);
  }

  // 緊張度・スローに応じてバスの音量を合わせる（スロー中は心音だけ残す）
  function applyMix() {
    if (!ready()) return;
    var t = ctx.currentTime;
    try {
      if (loopBus) loopBus.gain.setTargetAtTime(slow ? 0.06 : 0.8, t, slow ? 0.25 : 0.05);
      if (ambBus) ambBus.gain.setTargetAtTime(slow ? 0.0 : tension, t, slow ? 0.2 : 0.15);
      for (var i = 0; i < ambNodes.length; i++) {
        var nd = ambNodes[i];
        if (nd.baseFreq) nd.osc.frequency.setTargetAtTime(nd.baseFreq * (1 + 0.3 * tension), t, 0.3);
      }
    } catch (e) { /* ignore */ }
  }

  function loopTick() {
    try {
      if (!loopOn || !ready()) return;
      var now = ctx.currentTime;
      var rate = slow ? 0.65 : 1.0;
      var stepDur = 0.17 / (rate * (1 + 0.6 * tension));
      if (nextStepTime < now - 0.5) nextStepTime = now + 0.02;
      while (nextStepTime < now + 0.12) {
        scheduleStep(nextStepTime, stepIdx, rate);
        stepIdx++;
        nextStepTime += stepDur;
      }
      if (slow || tension > 0.06) {
        var iv = slow ? (1.15 - 0.3 * tension) : (1.15 - 0.7 * tension);
        var hv = slow ? 1.0 : (0.25 + 0.75 * tension);
        if (nextBeatTime < now - 0.5) nextBeatTime = now + 0.02;
        while (nextBeatTime < now + 0.12) {
          scheduleHeart(nextBeatTime, hv);
          nextBeatTime += iv;
        }
      } else {
        nextBeatTime = now + 0.02;
      }
    } catch (e) { /* ignore */ }
  }

  function buildAmbience() {
    // 低いドローン（ノコギリ波2本 + ローパス）と観客のざわめき（帯域ノイズ）
    ambNodes = [];
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    var dg = ctx.createGain(); dg.gain.value = 0.22;
    lp.connect(dg); dg.connect(ambBus);
    [[55, 'sawtooth'], [82.4, 'sawtooth'], [110.5, 'triangle']].forEach(function (p) {
      var o = ctx.createOscillator();
      o.type = p[1]; o.frequency.value = p[0];
      o.connect(lp); o.start();
      ambNodes.push({ osc: o, baseFreq: p[0] });
    });
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.6;
    var ng = ctx.createGain(); ng.gain.value = 0.28;
    src.connect(bp); bp.connect(ng); ng.connect(ambBus);
    src.start(0, Math.random());
    ambNodes.push({ osc: src, baseFreq: 0 });
  }

  var startLoop = safe(function () {
    if (!ready() || loopOn) return;
    loopOn = true;
    loopBus = ctx.createGain();
    loopBus.gain.value = slow ? 0.06 : 0.8;
    loopBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = slow ? 0 : tension;
    ambBus.connect(master);
    heartBus = ctx.createGain();
    heartBus.gain.value = 1;
    heartBus.connect(master);
    buildAmbience();
    stepIdx = 0;
    nextStepTime = ctx.currentTime + 0.05;
    nextBeatTime = ctx.currentTime + 0.05;
    loopTick();
    loopTimer = setInterval(loopTick, 40);
  });

  var stopLoop = safe(function () {
    loopOn = false;
    if (loopTimer !== null) { clearInterval(loopTimer); loopTimer = null; }
    var buses = [loopBus, ambBus, heartBus].filter(Boolean);
    var nodes = ambNodes;
    loopBus = null; ambBus = null; heartBus = null; ambNodes = [];
    buses.forEach(function (bus) {
      try {
        bus.gain.cancelScheduledValues(ctx.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
        bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
      } catch (e) { /* ignore */ }
    });
    setTimeout(function () {
      buses.forEach(function (bus) { try { bus.disconnect(); } catch (e) { /* ignore */ } });
      nodes.forEach(function (n) { try { n.osc.stop(); } catch (e) { /* ignore */ } });
    }, 400);
  });

  var setSlow = safe(function (b) {
    slow = !!b;
    if (loopOn && ready()) {
      nextBeatTime = ctx.currentTime + 0.05;
      applyMix();
    }
  });

  // 0..1: 終盤に向けて足音テンポ↑・ドローン↑・心音が速く大きく・どよめき↑
  var setTension = safe(function (v) {
    v = Number(v);
    tension = isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    applyMix();
  });

  // ---------------------------------------------------------------- mute
  var setMuted = safe(function (b) {
    muted = !!b;
    if (ready()) {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.01);
      } catch (e) { /* ignore */ }
    }
    if (muted) cancelSpeech();
  });

  function isMuted() { return muted; }

  // ---------------------------------------------------------------- speech
  function synth() {
    return (typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance !== 'undefined')
      ? window.speechSynthesis : null;
  }

  function loadVoices() {
    try {
      var s = synth();
      if (!s) return;
      var all = s.getVoices() || [];
      var list = [];
      for (var i = 0; i < all.length; i++) {
        var v = all[i];
        var lang = String(v.lang || '').replace('_', '-').toLowerCase();
        if (lang === 'ja-jp' && v.localService === true) list.push(v);
      }
      voices = list;
      if (all.length) voicesLoaded = true;
    } catch (e) { /* ignore */ }
  }

  function initSpeech() {
    try {
      var s = synth();
      if (!s) return;
      loadVoices();
      if (!initSpeech.bound) {
        initSpeech.bound = true;
        if (s.addEventListener) s.addEventListener('voiceschanged', loadVoices);
        else s.onvoiceschanged = loadVoices;
      }
    } catch (e) { /* ignore */ }
  }

  // v4: 実況役と解説役で声を分ける。解説役は男性の声（Ichiro など）を優先し、実況役は女性の声にする
  var MALE_RE = /ichiro|keita|daichi|naoki|男性|male/i;
  function pickVoices() {
    var kai = null, ana = null, i;
    for (i = 0; i < voices.length; i++) if (MALE_RE.test(voices[i].name)) { kai = voices[i]; break; }
    for (i = 0; i < voices.length; i++) if (voices[i] !== kai && !MALE_RE.test(voices[i].name)) { ana = voices[i]; break; }
    if (!ana) ana = voices[0];
    if (!kai) kai = voices.length > 1 ? (voices[1] === ana ? voices[0] : voices[1]) : voices[0];
    return { ana: ana, kai: kai, kaiMale: !!(kai && MALE_RE.test(kai.name)) };
  }

  function cb(f, a) { if (typeof f === 'function') { try { f(a); } catch (e) { /* ignore */ } } }

  // speak(text, role, opts)  opts = {priority:'high'|'normal', onstart(real), onend(), ondrop(), fallbackMs, maxWaitMs}
  //  - 実発話: onstart は発話が実際に始まった瞬間、onend は読み終わり。
  //    high は発話中の音声を cancel して即発話、normal は発話中なら捨てる（ondrop）。
  //    maxWaitMs（既定1200）以内に始まらなければ古い文として捨てる（ondrop）。
  //  - 音声なし/ミュート/読み上げOFF: onstart(false) を即時、onend を fallbackMs（既定2200）後に呼ぶ。
  //  戻り値: 'speech' | 'timer' | 'dropped'
  var speak = safe(function (text, role, opts) {
    opts = opts || {};
    if (!text) return 'dropped';
    var high = opts.priority === 'high';
    var fb = opts.fallbackMs > 0 ? opts.fallbackMs : 2200;
    var s = synth();
    if (s && !voices.length) loadVoices();
    var real = !!(s && voices.length && !muted && speechOn);
    if (!real) {
      cb(opts.onstart, false);
      setTimeout(function () { cb(opts.onend); }, fb);
      return 'timer';
    }
    if (speaking && !high) { cb(opts.ondrop); return 'dropped'; }
    if (speaking && curFinish) curFinish('preempt');

    var isAna = role === 'ana';
    var vp = pickVoices();
    var voice = isAna ? vp.ana : vp.kai;
    var u = new window.SpeechSynthesisUtterance(String(text));
    u.voice = voice;
    u.lang = 'ja-JP';
    // 解説役が男性の声なら高さはそのまま、同じ声しかないときは高さで区別する
    u.pitch = isAna ? 1.3 : (vp.kaiMale ? 1.0 : 0.8);
    u.rate = isAna ? 1.45 : 1.25;
    u.volume = 1;

    var tok = ++speakSeq;
    var started = false, ended = false, waitTimer = null, dogTimer = null;
    function finish(why) {
      if (ended) return;
      ended = true;
      if (waitTimer) clearTimeout(waitTimer);
      if (dogTimer) clearTimeout(dogTimer);
      if (tok === speakSeq) { speaking = false; curFinish = null; }
      if (started) cb(opts.onend);
      else cb(opts.ondrop);
    }
    u.onstart = function () {
      if (ended || started) return;
      started = true;
      if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
      dogTimer = setTimeout(function () { finish('watchdog'); }, 9000);
      cb(opts.onstart, true);
    };
    u.onend = function () { finish('end'); };
    u.onerror = function () { finish('error'); };
    var maxWait = opts.maxWaitMs === undefined ? 1200 : opts.maxWaitMs;
    if (maxWait > 0) {
      waitTimer = setTimeout(function () {
        if (started || ended) return;
        try { s.cancel(); } catch (e) { /* ignore */ }
        finish('stale');
      }, maxWait);
    }
    speaking = true;
    curFinish = finish;
    if (high) { try { s.cancel(); } catch (e) { /* ignore */ } }
    s.speak(u);
    return 'speech';
  });

  var cancelSpeech = safe(function () {
    var s = synth();
    if (s) s.cancel();
    if (curFinish) curFinish('cancel');
    speaking = false;
  });

  var setSpeech = safe(function (b) {
    speechOn = !!b;
    if (!speechOn) cancelSpeech();
  });

  function isSpeechOn() { return speechOn; }

  var speechAvailable = safe(function () {
    if (!synth()) return false;
    if (!voices.length) loadVoices();
    return voices.length > 0;
  });

  return {
    init: init,
    setMuted: setMuted,
    isMuted: isMuted,
    play: play,
    startLoop: startLoop,
    stopLoop: stopLoop,
    setSlow: setSlow,
    setTension: setTension,
    speak: speak,
    setSpeech: setSpeech,
    isSpeechOn: isSpeechOn,
    speechAvailable: function () { return !!speechAvailable(); },
    cancelSpeech: cancelSpeech
  };
})();
