var RR = (typeof window !== 'undefined') ? (window.RR = window.RR || {}) : {};

RR.Renderer = (function () {
  'use strict';

  var EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  var TEXT_FONT = '"Yu Gothic UI","Meiryo","Hiragino Sans","Noto Sans JP","Segoe UI",sans-serif';

  // 高コントラスト12色（白文字が乗る濃さ）
  var LANE_COLORS = [
    '#d32f2f', '#1565c0', '#2e7d32', '#ef6c00', '#7b1fa2', '#00838f',
    '#c2185b', '#5d4037', '#283593', '#8a7a00', '#37474f', '#ad4a00'
  ];

  // 乗り物ごとの向き補正。flip:true=左右反転して右向きにする / rot:ラジアン回転
  // 不明な id は反転（Windows の絵文字は左向きが多い）
  var VEHICLE_FIX = {
    horse: { flip: true },
    snail: { flip: true },
    turtle: { flip: true },
    duck: { flip: true },
    cart: { flip: true },
    chair: { flip: true },
    pig: { flip: true },
    rocket: { flip: false, rot: Math.PI / 4 }
  };

  // 天気ごとの配色
  var WEATHER_STYLE = {
    sunny:  { skyA: '#8fd3ff', skyB: '#dff3ff', mix: '#ffffff', amt: 0.82, ink: '#12202e', line: 'rgba(0,0,0,0.25)' },
    rain:   { skyA: '#5b6f86', skyB: '#8da0b4', mix: '#b9c7d6', amt: 0.78, ink: '#10202e', line: 'rgba(0,0,0,0.3)' },
    fog:    { skyA: '#aeb6bd', skyB: '#d6dadd', mix: '#e8eaec', amt: 0.84, ink: '#1c262e', line: 'rgba(0,0,0,0.25)' },
    snow:   { skyA: '#9fb7d6', skyB: '#e8f0fb', mix: '#f4f8ff', amt: 0.86, ink: '#12202e', line: 'rgba(30,60,100,0.35)' },
    sunset: { skyA: '#ff7a45', skyB: '#ffd08a', mix: '#ffd6a8', amt: 0.72, ink: '#2e1408', line: 'rgba(80,20,0,0.35)' },
    night:  { skyA: '#050a22', skyB: '#1a2350', mix: '#0a1030', amt: 0.78, ink: '#f2f5ff', line: 'rgba(255,255,255,0.3)' },
    wind:   { skyA: '#7fcfc0', skyB: '#e3f6ee', mix: '#eefaf3', amt: 0.82, ink: '#10261f', line: 'rgba(0,0,0,0.25)' },
    cloudy: { skyA: '#8995a3', skyB: '#c3cad2', mix: '#dde1e6', amt: 0.82, ink: '#16202a', line: 'rgba(0,0,0,0.28)' },
    thunder:{ skyA: '#2f3447', skyB: '#59607a', mix: '#9aa0b6', amt: 0.72, ink: '#101420', line: 'rgba(0,0,0,0.35)' },
    storm:  { skyA: '#2f3447', skyB: '#59607a', mix: '#9aa0b6', amt: 0.72, ink: '#101420', line: 'rgba(0,0,0,0.35)' },
    rainbow:{ skyA: '#8fd3ff', skyB: '#fff1f8', mix: '#ffffff', amt: 0.82, ink: '#12202e', line: 'rgba(0,0,0,0.25)' }
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function ease(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }
  function frac(x) { return x - Math.floor(x); }
  function hash(k, s) { return frac(Math.sin(k * 127.1 + (s || 0) * 311.7) * 43758.5453); }

  // ---------- 個性（looks）の素材 ----------
  // 頭の飾り。'horn' と 'prop' は図形で描く
  var HATS = ['👑', '🎩', '🧢', '🎀', '🌸', '⛑️', '🎓', '🪖', '👒', '🍄', '🍓', '🌻', 'horn', 'prop'];
  // 顔セット（状況 → 絵文字）
  var FACE_SETS = {
    human: { lead: '😎', up: '😆', mid: '🙂', nerv: '😬', back: '😰', stumble: '😵', boost: '😤', reverse: '🙃', swap: '😲', win: '🥳', podium: '😄', other: '😌' },
    cat:   { lead: '😼', up: '😸', mid: '😺', nerv: '🙀', back: '😿', stumble: '🙀', boost: '😾', reverse: '🙃', swap: '🙀', win: '😻', podium: '😸', other: '😽' }
  };
  // 走り方（大きくゆっくり）
  var GAITS = [
    { id: 'hop',   label: 'ぴょんぴょん型' },
    { id: 'sway',  label: 'ゆらゆら型' },
    { id: 'tiny',  label: 'ちょこまか型' },
    { id: 'flip',  label: 'くるりん型' },
    { id: 'wave',  label: 'うねうね型' },
    { id: 'lean',  label: '前のめり型' },
    { id: 'float', label: 'ふわふわ型' }
  ];
  // 軌跡（名札の後ろに流れる。drawn=図形）
  var TRAILS = [
    { id: 'dust', ch: '💨' }, { id: 'note', ch: '🎵' }, { id: 'star', ch: '⭐' },
    { id: 'heart', ch: '💗' }, { id: 'bubble', ch: null }, { id: 'leaf', ch: '🍃' }, { id: 'spark', ch: '✨' }
  ];

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // レース内で被らないよう、素材を巡回させて割り当てる（順位とは無関係：毎回乱数）
  function makeLooks(n) {
    var hats = shuffled(HATS);
    var gaits = shuffled(GAITS);
    var trails = shuffled(TRAILS);
    var sizes = shuffled([0.85, 0.89, 0.93, 0.96, 1.0, 1.03, 1.06, 1.09, 1.12, 1.15, 0.87, 0.98]);
    var hueSlots = shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    var out = [];
    for (var i = 0; i < n; i++) {
      var hue = Math.round(hueSlots[i % 12] * 30 + Math.random() * 14 - 7);
      var gait = gaits[i % gaits.length];
      var fset = Math.random() < 0.6 ? 'human' : 'cat';
      var faces = FACE_SETS[fset];
      out.push({
        hue: ((hue % 360) + 360) % 360,
        sat: +(1.1 + Math.random() * 0.5).toFixed(2),
        face: faces.mid,
        faces: faces,
        faceSet: fset,
        hat: hats[i % hats.length],
        gait: gait.id,
        trail: trails[i % trails.length].id,
        trailCh: trails[i % trails.length].ch,
        size: sizes[i % sizes.length],
        label: gait.label,
        phase: Math.random() * 6.283,
        tint: 'hsl(' + (((hue % 360) + 360) % 360) + ',85%,52%)'
      });
    }
    return out;
  }

  // 走り方 → { dy(負=上), rot, sx, sy }。lh=レーン高さ、mv=動いている度合い 0..1
  function gaitPose(kind, t, ph, lh, mv) {
    var s, a;
    var P = { dy: 0, rot: 0, sx: 1, sy: 1 };
    if (kind === 'hop') {
      s = Math.abs(Math.sin(t * 0.0072 + ph));
      P.dy = -s * lh * 0.17 * mv;
      P.sy = 1 - 0.12 * Math.pow(1 - s, 6) * mv;
      P.sx = 1 + 0.08 * Math.pow(1 - s, 6) * mv;
      P.rot = 0.06 * Math.sin(t * 0.0072 + ph) * mv;
    } else if (kind === 'sway') {
      a = Math.sin(t * 0.0048 + ph);
      P.rot = 0.24 * a * mv;
      P.dy = -Math.abs(a) * lh * 0.04 * mv;
    } else if (kind === 'tiny') {
      s = Math.sin(t * 0.028 + ph);
      P.dy = -s * s * lh * 0.045 * mv;
      P.rot = 0.04 * Math.sin(t * 0.037 + ph) * mv;
    } else if (kind === 'flip') {
      var per = 3400;
      var k = (((t + ph * 420) % per) + per) % per / per;
      var jump = 0.26;
      if (k < jump && mv > 0.5) {
        var u = k / jump;
        P.dy = -Math.sin(u * Math.PI) * lh * 0.3;
        P.rot = -ease(u) * 6.283;
      } else {
        s = Math.abs(Math.sin(t * 0.0068 + ph));
        P.dy = -s * lh * 0.07 * mv;
      }
    } else if (kind === 'wave') {
      a = Math.sin(t * 0.0042 + ph);
      P.dy = a * lh * 0.07 * mv;
      P.sx = 1 + 0.1 * Math.sin(t * 0.0084 + ph) * mv;
      P.sy = 1 - 0.1 * Math.sin(t * 0.0084 + ph) * mv;
      P.rot = 0.08 * Math.cos(t * 0.0042 + ph) * mv;
    } else if (kind === 'lean') {
      s = Math.abs(Math.sin(t * 0.0115 + ph));
      P.rot = (0.2 + 0.03 * Math.sin(t * 0.0115 + ph)) * mv;
      P.dy = -s * lh * 0.05 * mv;
      P.sx = 1 + 0.07 * mv;
      P.sy = 1 - 0.04 * mv;
    } else { // float
      a = Math.sin(t * 0.0029 + ph);
      P.dy = (-lh * 0.07 - a * lh * 0.09) * mv;
      P.rot = 0.09 * Math.sin(t * 0.0029 + ph + 1.2) * mv;
    }
    return P;
  }

  function hex2rgb(h) {
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }
  function mix(h1, h2, k) {
    var a = hex2rgb(h1), b = hex2rgb(h2);
    return 'rgb(' + Math.round(lerp(a[0], b[0], k)) + ',' + Math.round(lerp(a[1], b[1], k)) + ',' + Math.round(lerp(a[2], b[2], k)) + ')';
  }

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // 縁取り付き文字
  function outlined(ctx, text, x, y, fs, fill, stroke, lw) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw || Math.max(3, fs * 0.2);
    ctx.strokeStyle = stroke || '#101018';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill || '#fff';
    ctx.fillText(text, x, y);
  }

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var plan = null;
    var W = 960, H = 540, dpr = 1;
    var L = null; // レイアウト
    var plates = []; // 名前札の測定結果
    var looks = [];
    var sprites = [];  // 走者ごとの色味付き乗り物スプライト
    var faceMem = [];  // 表情の変化検出（ポップ演出用）
    var hb = { ph: 0, last: null };
    var plateQueue = [];
    var pc = 0;        // 1フレームで描いた粒子数（上限 60 の検証用）
    var api = null;
    var emojiCache = {}; // v4: 絵文字は1度だけ小さな画像に描いて使い回す（毎フレームの文字描画は重い）

    function esprite(ch) {
      var c = emojiCache[ch];
      if (c) return c;
      var F = Math.round(Math.min(160, Math.max(48, (L ? L.emoji : 80)) * dpr));
      var side = Math.ceil(F * 1.4);
      c = document.createElement('canvas');
      c.width = c.height = side;
      var x = c.getContext('2d');
      x.font = F + 'px ' + EMOJI_FONT;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = '#000';
      x.fillText(ch, side / 2, side / 2);
      c.__f = F;
      emojiCache[ch] = c;
      return c;
    }
    // 絵文字 ch を、中心 (x, y)・文字サイズ px で描く（fillText と同じ見た目）
    function drawEmoji(ch, x, y, px) {
      if (typeof document === 'undefined') { ctx.font = Math.round(px) + 'px ' + EMOJI_FONT; ctx.fillText(ch, x, y); return; }
      var c = esprite(ch), dw = c.width * px / c.__f;
      ctx.drawImage(c, x - dw / 2, y - dw / 2, dw, dw);
    }

    function resize() {
      var par = canvas.parentElement;
      var w = par ? par.clientWidth : 0;
      var h = par ? par.clientHeight : 0;
      if (!w || !h) { w = canvas.clientWidth || canvas.width || 960; h = canvas.clientHeight || canvas.height || 540; }
      dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      W = w; H = h;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      layout();
    }

    function setPlan(p) {
      plan = p;
      looks = makeLooks((p && (p.n || (p.names && p.names.length))) || 0);
      faceMem = [];
      hb = { ph: 0, last: null };
      if (api) api.looks = looks;
      layout();
    }

    function buildSprites() {
      sprites = [];
      if (!plan || !L || !plan.vehicle || typeof document === 'undefined') return;
      var font = Math.min(L.emoji * 1.15 * 2.2 * dpr, 300);
      var side = Math.ceil(font * 1.5);
      for (var i = 0; i < L.n; i++) {
        var c = document.createElement('canvas');
        c.width = c.height = side;
        var x = c.getContext('2d');
        var lk = looks[i];
        try { if ('filter' in x) x.filter = 'hue-rotate(' + lk.hue + 'deg) saturate(' + lk.sat + ')'; } catch (e) { /* 無視 */ }
        x.font = Math.round(font) + 'px ' + EMOJI_FONT;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillStyle = '#000';
        x.fillText(plan.vehicle.emoji, side / 2, side / 2 + font * 0.04);
        sprites.push({ c: c, font: font });
      }
    }

    function layout() {
      if (!plan) { L = null; return; }
      var n = plan.n || plan.names.length;
      var top = Math.round(H * 0.08);
      var bot = Math.round(H * 0.125);  // v4: 字幕（画面下）と最下段のレーンが重ならない高さ
      var laneH = (H - top - bot) / n;
      var emoji = laneH * 1.0;
      var fs = Math.min(laneH * 0.5, 46);
      var minFs = Math.min(n <= 8 ? 40 : 30, fs);
      var capW = Math.min(W * 0.2, 380);
      plates = [];
      var maxPlate = 0;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (var i = 0; i < n; i++) {
        var name = String(plan.names[i]);
        var f = fs;
        var tw;
        var padX = 0;
        for (;;) {
          ctx.font = '900 ' + f + 'px ' + TEXT_FONT;
          padX = f * 0.45;
          tw = ctx.measureText(name).width;
          if (tw + padX * 2 <= capW || f <= minFs) break;
          f = Math.max(minFs, f - 2);
        }
        var shown = name;
        while (tw + padX * 2 > capW && shown.length > 1) {
          shown = shown.slice(0, -1);
          tw = ctx.measureText(shown + '…').width;
        }
        if (shown !== name) shown += '…';
        plates.push({ text: shown, fs: f, w: tw + padX * 2 });
        if (tw + padX * 2 > maxPlate) maxPlate = tw + padX * 2;
      }
      ctx.restore();
      var labelW = Math.max(laneH * 0.95, 44);
      var x0 = labelW + 10 + maxPlate + 6 + emoji * 0.12;
      var cs = Math.max(10, laneH / 3);
      var rightMargin = cs * 2 + Math.max(laneH * 1.0, 56) + 8;
      var x1 = W - rightMargin;
      L = { cs: cs, n: n, top: top, bot: bot, laneH: laneH, emoji: emoji, fs: fs, labelW: labelW, x0: x0, x1: x1, maxPlate: maxPlate };
      emojiCache = {};
      buildSprites();
    }

    function laneRect(i) {
      if (!L) return { x: 0, y: 0, w: W, h: H };
      return { x: 0, y: L.top + i * L.laneH, w: W, h: L.laneH };
    }

    function weatherId() {
      var id = plan && plan.weather && plan.weather.id;
      return WEATHER_STYLE[id] ? id : 'sunny';
    }

    function vfix() {
      var id = plan && plan.vehicle && plan.vehicle.id;
      var f = VEHICLE_FIX[id];
      if (!f) f = { flip: true };
      return f;
    }

    // ---------- 背景(空) ----------
    function drawSky(wid, t) {
      var st = WEATHER_STYLE[wid];
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, st.skyA);
      g.addColorStop(1, st.skyB);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      var r = Math.max(26, L.top * 0.45);
      if (wid === 'sunny' || wid === 'rainbow' || wid === 'wind') {
        drawSun(W * 0.76, L.top * 0.5, r, t, '#ffd93b');
      } else if (wid === 'sunset') {
        drawSun(W * 0.82, L.top + L.laneH * 0.4, r * 1.9, t, '#ff5a2a');
      } else if (wid === 'night') {
        for (var k = 0; k < 14; k++) {
          var sx = hash(k, 1) * W, sy = hash(k, 2) * H;
          var tw = 0.5 + 0.5 * Math.sin(t * 0.002 + k * 3.1);
          ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.55 * tw).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(sx, sy, 2 + hash(k, 3) * 2.5, 0, 6.283); ctx.fill();
        }
        // 月
        var mx = W * 0.76, my = L.top * 0.5;
        ctx.fillStyle = '#fff6c8';
        ctx.beginPath(); ctx.arc(mx, my, r, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#0d1536';
        ctx.beginPath(); ctx.arc(mx + r * 0.45, my - r * 0.2, r * 0.9, 0, 6.283); ctx.fill();
      } else if (wid === 'cloudy' || wid === 'rain' || wid === 'thunder' || wid === 'storm' || wid === 'snow') {
        var dark = (wid === 'thunder' || wid === 'storm') ? 'rgba(30,34,50,0.85)' : (wid === 'rain' ? 'rgba(80,92,110,0.85)' : 'rgba(255,255,255,0.9)');
        for (var c = 0; c < 4; c++) {
          var cx = ((hash(c, 5) * W + t * 0.012 * (1 + c * 0.3)) % (W + 400)) - 200;
          cloud(cx, L.top * (0.3 + 0.2 * hash(c, 6)), L.top * (0.9 + 0.5 * hash(c, 7)), dark);
        }
      }
      if (wid === 'rainbow') {
        var bx = W * 0.5, by = H * 0.9, br = H * 0.78;
        var cols = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];
        ctx.lineWidth = 12;
        for (var q = 0; q < cols.length; q++) {
          ctx.strokeStyle = cols[q];
          ctx.globalAlpha = 0.55;
          ctx.beginPath(); ctx.arc(bx, by, br - q * 12, Math.PI, 0); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    function cloud(x, y, s, col) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.35, 0, 6.283);
      ctx.arc(x + s * 0.35, y - s * 0.12, s * 0.42, 0, 6.283);
      ctx.arc(x + s * 0.75, y, s * 0.32, 0, 6.283);
      ctx.rect(x, y, s * 0.75, s * 0.32);
      ctx.fill();
    }

    function drawSun(x, y, r, t, col) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.0003);
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(4, r * 0.18);
      ctx.lineCap = 'round';
      for (var k = 0; k < 12; k++) {
        var a = k / 12 * 6.283;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
        ctx.lineTo(Math.cos(a) * r * 1.75, Math.sin(a) * r * 1.75);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, 6.283); ctx.fill();
    }

    // ---------- コース ----------
    function drawTrack(wid, t) {
      var st = WEATHER_STYLE[wid];
      var n = L.n, lh = L.laneH, x0 = L.x0, x1 = L.x1;
      var i, y;
      for (i = 0; i < n; i++) {
        y = L.top + i * lh;
        var col = LANE_COLORS[i % LANE_COLORS.length];
        ctx.fillStyle = mix(col, st.mix, st.amt + (i % 2 ? 0.04 : -0.02));
        ctx.fillRect(0, y, W, lh);
      }
      // レーン境界線
      ctx.strokeStyle = st.line;
      ctx.lineWidth = 2;
      for (i = 0; i <= n; i++) {
        y = L.top + i * lh;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // 距離マーカー
      var marks = [0.25, 0.5, 0.75];
      var mfs = Math.max(20, Math.min(30, L.top * 0.34));
      ctx.font = '800 ' + mfs + 'px ' + TEXT_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var m = 0; m < marks.length; m++) {
        var mx = x0 + L.emoji * 0.5 + marks[m] * (x1 - x0 - L.emoji) ;
        ctx.setLineDash([10, 10]);
        ctx.strokeStyle = st.line;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(mx, L.top); ctx.lineTo(mx, H - L.bot); ctx.stroke();
        ctx.setLineDash([]);
        var label = Math.round(marks[m] * 100) + '%';
        ctx.fillStyle = st.ink;
        ctx.globalAlpha = 0.85;
        ctx.fillText(label, mx, L.top - mfs * 0.7);
        ctx.globalAlpha = 1;
      }
      // スタートゲート
      var gy0 = L.top, gy1 = L.top + n * lh;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 - 5, gy0, 10, gy1 - gy0);
      ctx.fillStyle = '#d32f2f';
      for (i = 0; i < n * 2; i++) {
        if (i % 2 === 0) ctx.fillRect(x0 - 5, gy0 + i * lh / 2, 10, lh / 2);
      }
      ctx.fillStyle = st.ink;
      ctx.font = '900 ' + mfs + 'px ' + TEXT_FONT;
      ctx.fillText('START', x0, L.top - mfs * 0.7);
      // ゴールのチェッカー
      var cs = L.cs;
      var cols = 1;
      var gx = x1 + 2;
      var rows = Math.ceil((gy1 - gy0) / cs);
      for (var rr = 0; rr < rows; rr++) {
        for (var cc = 0; cc < cols * 2; cc++) {
          ctx.fillStyle = ((rr + cc) % 2 === 0) ? '#111' : '#fff';
          var ch = Math.min(cs, gy1 - (gy0 + rr * cs));
          ctx.fillRect(gx + cc * cs / 1, gy0 + rr * cs, cs, ch);
        }
      }
      ctx.fillStyle = st.ink;
      ctx.font = '900 ' + mfs + 'px ' + TEXT_FONT;
      ctx.textAlign = 'right';
      ctx.fillText('GOAL', W - 6, L.top - mfs * 0.7);
      ctx.textAlign = 'center';

      // レーン番号
      for (i = 0; i < n; i++) {
        y = L.top + i * lh;
        var c2 = LANE_COLORS[i % LANE_COLORS.length];
        ctx.fillStyle = c2;
        ctx.fillRect(0, y + 2, L.labelW, lh - 4);
        var nf = Math.min(lh * 0.72, 56);
        ctx.font = '900 ' + nf + 'px ' + TEXT_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        outlined(ctx, String(i + 1), L.labelW / 2, y + lh / 2 + nf * 0.04, nf, '#fff', 'rgba(0,0,0,0.55)', Math.max(3, nf * 0.14));
      }
      ctx.textAlign = 'left';
    }

    // ---------- 走者 ----------
    function activeEvents(i, t) {
      var res = { stumble: null, boost: null, reverse: null, swap: null };
      var ev = plan.events || [];
      for (var k = 0; k < ev.length; k++) {
        var e = ev[k];
        if (e.type === 'swap') {
          if ((e.runner === i || e.runner2 === i) && t >= e.t - 100 && t <= e.t + 1600) res.swap = e;
        } else if (e.runner === i && t >= e.t && t <= e.t + (e.dur || 1000)) {
          res[e.type] = e;
        }
      }
      return res;
    }

    // いまの順位（先頭=0）。plan.positionAt があれば使い、無ければ progress から計算
    function ranksAt(t) {
      var n = L.n, i, j, out = [];
      if (typeof plan.positionAt === 'function') {
        try {
          var a = plan.positionAt(t);
          if (a && a.length >= n) return a;
        } catch (e) { /* fallthrough */ }
      }
      var ps = [];
      for (i = 0; i < n; i++) ps.push(plan.progress(i, t));
      for (i = 0; i < n; i++) {
        var r = 0;
        for (j = 0; j < n; j++) if (ps[j] > ps[i] || (ps[j] === ps[i] && j < i)) r++;
        out.push(r);
      }
      return out;
    }

    // 状況 → 表情の種類
    function faceKind(i, t, ev, rk, tension, hidden) {
      var n = L.n;
      var ft = plan.finishTime[i];
      if (t >= ft) {
        if (hidden) return 'nerv';          // 写真判定の発表待ち（1着・2着とも同じ顔）
        var rank = plan.rankOf[i];
        return rank === 0 ? 'win' : (rank <= 2 ? 'podium' : 'other');
      }
      if (ev.stumble) return 'stumble';
      if (ev.swap) return 'swap';
      if (ev.reverse) return 'reverse';
      if (ev.boost) return 'boost';
      if (t <= 0) return 'mid';
      if (rk === 0) return 'lead';
      if (rk <= Math.max(1, Math.round(n * 0.3) - 1)) return 'up';
      if (n >= 3 && rk >= Math.ceil(n * 0.7)) return 'back';
      return tension > 0.6 ? 'nerv' : 'mid';
    }

    function drawStar(x, y, r, rot) {
      ctx.beginPath();
      for (var k = 0; k < 10; k++) {
        var rr = k % 2 ? r * 0.45 : r;
        var a = rot + k * Math.PI / 5 - Math.PI / 2;
        if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }

    // 頭の飾り（原点=頭のてっぺん、上向きに描く）
    function drawHat(look, hs, t) {
      if (look.hat === 'horn') {
        var g = ctx.createLinearGradient(0, 0, 0, -hs * 1.1);
        g.addColorStop(0, '#fff6c8'); g.addColorStop(1, '#ffb300');
        ctx.fillStyle = g;
        ctx.strokeStyle = '#7a4a00';
        ctx.lineWidth = Math.max(2, hs * 0.07);
        ctx.beginPath();
        ctx.moveTo(-hs * 0.28, 0); ctx.lineTo(hs * 0.28, 0); ctx.lineTo(0, -hs * 1.1);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-hs * 0.2, -hs * 0.35); ctx.lineTo(hs * 0.2, -hs * 0.45);
        ctx.moveTo(-hs * 0.13, -hs * 0.68); ctx.lineTo(hs * 0.13, -hs * 0.74);
        ctx.stroke();
      } else if (look.hat === 'prop') {
        ctx.strokeStyle = '#37474f';
        ctx.lineWidth = Math.max(2, hs * 0.1);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -hs * 0.4); ctx.stroke();
        ctx.save();
        ctx.translate(0, -hs * 0.42);
        ctx.scale(Math.cos(t * 0.012 + look.phase), 1);
        ctx.fillStyle = look.tint;
        ctx.strokeStyle = '#102030';
        ctx.lineWidth = Math.max(2, hs * 0.06);
        ctx.beginPath(); ctx.ellipse(-hs * 0.4, 0, hs * 0.42, hs * 0.12, 0, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(hs * 0.4, 0, hs * 0.42, hs * 0.12, 0, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else {
        drawEmoji(look.hat, 0, -hs * 0.42, hs * 1.05);
      }
    }

    // 名札の後ろに流れる軌跡（少数・大きめ）。名札より後ろに描く
    function drawTrail(i, t, px, yc, size, look) {
      var cnt = L.n <= 8 ? 3 : 2;
      var lh = L.laneH;
      for (var j = 0; j < cnt; j++) {
        var ph = frac(t / 1700 + j / cnt + look.phase / 6.283);
        var x = px + size * 0.1 - ph * size * 3.4;
        if (x < L.labelW + size * 0.4) continue;
        var y = yc + Math.sin(ph * 9 + j * 2 + i) * lh * 0.16 - ph * lh * 0.12;
        var a = Math.sin(ph * Math.PI);
        if (a < 0.05) continue;
        var s = size * (0.5 + 0.22 * hash(i * 7 + j, 4)) * (1 - 0.25 * ph);
        ctx.globalAlpha = Math.min(1, a * 1.3);
        pc++;
        if (look.trailCh) {
          ctx.save();
          ctx.translate(x, y);
          if (look.trail === 'star' || look.trail === 'spark' || look.trail === 'leaf') ctx.rotate(ph * 4 + j);
          drawEmoji(look.trailCh, 0, 0, s);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.strokeStyle = look.tint;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, s * 0.36, 0, 6.283); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(x - s * 0.12, y - s * 0.12, s * 0.09, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // rv = 写真判定の発表時刻（レース時計）。-1 なら発表前：1着・2着のバッジ・表情・喜びのポーズを伏せる。undefined なら伏せない
    function drawRunner(i, t, rk, tension, rv) {
      var lh = L.laneH;
      var yc = L.top + i * lh + lh / 2;
      var p = clamp(plan.progress(i, t), 0, 1);
      var look = looks[i];
      var base = L.emoji;
      var size = base * (0.96 + (look.size - 1) * 0.6);
      var plateQ = plateQueue;
      var cx = L.x0 + base / 2 + p * (L.x1 - L.x0 - base);
      var ev = activeEvents(i, t);
      var finished = t >= plan.finishTime[i];
      var started = p > 0;
      var running = started && !finished && !ev.stumble;
      var rank = plan.rankOf[i];
      var color = LANE_COLORS[i % LANE_COLORS.length];
      var fix = vfix();
      var py = plates[i];
      var sinceFin = t - plan.finishTime[i];
      var hidden = rank <= 1 && rv !== undefined && !(rv >= 0 && t >= rv);
      var pr2 = hidden ? 1 : rank;             // ポーズ用の順位（発表前は1着も2着と同じ動き）
      var sinceStamp = rank <= 1 ? (rv >= 0 ? t - rv : (rv === undefined ? sinceFin : -1)) : sinceFin;

      // 光の尾 / グロー(boost)
      if (ev.boost) {
        var k = (t - ev.boost.t) / (ev.boost.dur || 1200);
        var a = Math.sin(clamp(k, 0, 1) * Math.PI);
        var tl = size * 3.6;
        var g = ctx.createLinearGradient(cx - tl, 0, cx, 0);
        g.addColorStop(0, 'rgba(255,240,120,0)');
        g.addColorStop(1, 'rgba(255,250,200,' + (0.9 * a).toFixed(2) + ')');
        ctx.fillStyle = g;
        for (var s = 0; s < 3; s++) {
          var yy = yc + (s - 1) * size * 0.2;
          ctx.fillRect(cx - tl * (1 - s * 0.18), yy - size * 0.05, tl * (1 - s * 0.18), size * 0.1);
        }
        var rg = ctx.createRadialGradient(cx, yc, size * 0.1, cx, yc, size * 1.1);
        rg.addColorStop(0, 'rgba(255,255,160,' + (0.95 * a).toFixed(2) + ')');
        rg.addColorStop(1, 'rgba(255,220,0,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(cx, yc, size * 1.1, 0, 6.283); ctx.fill();
      }

      // 姿勢（走り方）。ゴール後は喜ぶ/がっかりポーズ
      var pose;
      if (finished) {
        var fadeIn = ease(sinceFin / 300);
        if (pr2 === 0) {
          pose = gaitPose('hop', t, look.phase, lh * 1.5, 1);
          pose.dy *= fadeIn; pose.rot = 0.12 * Math.sin(t * 0.0144) * fadeIn;
        } else if (pr2 <= 2) {
          pose = gaitPose('hop', t, look.phase, lh * 0.9, 1);
          pose.dy *= fadeIn; pose.rot = 0;
        } else {
          pose = { dy: size * 0.05 * fadeIn, rot: 0.14 * fadeIn, sx: 1, sy: 1 - 0.04 * fadeIn };
        }
      } else {
        pose = gaitPose(look.gait, t, look.phase, lh, running ? 1 : (started ? 0.1 : 0.25));
      }
      var restY = size * 0.04; // 乗り物を少し下げて、顔と帽子の高さを確保
      var hatDy = (gaitPose(finished ? 'hop' : look.gait, t - 110, look.phase, lh, running || finished ? 1 : 0.2).dy - pose.dy) * 0.9;

      // 影＋走者色のマット（乗り物の絵文字の色に頼らず色違いが分かる）
      var air = clamp(-pose.dy / (lh * 0.3), 0, 1);
      var gy = yc + restY + size * 0.4;
      var mrx = size * (0.56 - 0.12 * air), mry = size * (0.1 - 0.02 * air);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.28 - 0.12 * air).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(cx, gy + mry * 0.35, mrx * 1.05, mry * 1.1, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = look.tint;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(3, size * 0.035);
      ctx.beginPath(); ctx.ellipse(cx, gy, mrx, mry, 0, 0, 6.283); ctx.fill(); ctx.stroke();

      // 軌跡（名札の下）
      var ph = Math.min(lh * 0.74, py.fs * 1.5);
      var pr = cx - size * 0.5;
      var px = pr - py.w;
      if (running) drawTrail(i, t, px, yc, size, look);

      // 名前札（走者の後ろ＝左）。揺らさない。全走者を描いた後に最前面へ描く
      plateQ.push(function () {
        var pyy = yc - ph / 2;
        // 影は shadowBlur を使わず、ずらした半透明の板で（描画を軽くする）
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        rrect(ctx, px + 2, pyy + 3, py.w, ph, ph * 0.28);
        ctx.fill();
        ctx.fillStyle = color;
        rrect(ctx, px, pyy, py.w, ph, ph * 0.28);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        rrect(ctx, px, pyy, py.w, ph, ph * 0.28);
        ctx.stroke();
        ctx.font = '900 ' + py.fs + 'px ' + TEXT_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        outlined(ctx, py.text, px + py.w / 2, yc + py.fs * 0.05, py.fs, '#fff', 'rgba(0,0,0,0.75)', Math.max(3, py.fs * 0.16));
        // v4: 着順スタンプ（ゴールの瞬間に名前札の左へ「ドン！」。1・2着は写真判定の発表のとき）
        if (finished && !hidden && sinceStamp >= 0) drawStamp(px - lh * 0.5, yc, rank + 1, sinceStamp, lh);
      });

      // 乗り物＋乗り手（グループで同じ姿勢）
      var rotTilt = 0;
      var dyTilt = 0;
      if (ev.stumble) {
        var sk = (t - ev.stumble.t) / (ev.stumble.dur || 1000);
        rotTilt = -0.55 * Math.sin(clamp(sk, 0, 1) * Math.PI * 0.5 + 0.2) - 0.1 * Math.sin(t * 0.03);
        dyTilt = size * 0.1;
      }
      ctx.save();
      ctx.translate(cx, yc + restY + pose.dy + dyTilt);
      ctx.rotate(pose.rot + rotTilt);
      ctx.scale(pose.sx, pose.sy);

      // 乗り物本体
      ctx.save();
      var flip = fix.flip;
      if (ev.reverse) flip = !flip;
      var vrot = 0;
      if (fix.rot) vrot = fix.rot * (ev.reverse ? -1 : 1);
      if (flip) ctx.scale(-1, 1);
      if (vrot) ctx.rotate(flip ? -vrot : vrot);
      var sp = sprites[i];
      if (sp) {
        var dw = sp.c.width * size / sp.font;
        ctx.drawImage(sp.c, -dw / 2, -dw / 2, dw, dw);
      } else {
        ctx.font = Math.round(size) + 'px ' + EMOJI_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(plan.vehicle.emoji, 0, size * 0.04);
      }
      ctx.restore();

      // ゼッケン（走者色の布＋レーン番号）
      var zw = size * 0.36, zh = size * 0.26, zx = size * 0.08 - zw / 2, zy = size * 0.2;
      ctx.fillStyle = look.tint;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(3, size * 0.035);
      rrect(ctx, zx, zy, zw, zh, zh * 0.25); ctx.fill(); ctx.stroke();
      ctx.font = '900 ' + Math.round(zh * 0.8) + 'px ' + TEXT_FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      outlined(ctx, String(i + 1), zx + zw / 2, zy + zh / 2 + zh * 0.04, zh * 0.8, '#fff', 'rgba(0,0,0,0.6)', Math.max(2, zh * 0.14));

      // 顔（丸窓）
      var kind = faceKind(i, t, ev, rk, tension, hidden);
      var emo = look.faces[kind] || look.face;
      var mem = faceMem[i];
      if (!mem || t < mem.since) mem = faceMem[i] = { e: emo, since: -99999 };
      if (mem.e !== emo) { mem.e = emo; mem.since = t; }
      var popk = (t - mem.since) / 320;
      var pop = popk >= 0 && popk < 1 ? 1 + 0.4 * Math.sin(popk * Math.PI) : 1;
      var fr = base * 0.255 * (0.9 + 0.1 * look.size);
      var fcx = size * 0.03, fcy = -size * 0.3;
      ctx.save();
      ctx.translate(fcx, fcy);
      ctx.scale(pop, pop);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = fr * 0.5;
      ctx.beginPath(); ctx.arc(0, 0, fr * 1.03, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = look.tint;
      ctx.lineWidth = fr * 0.34;
      ctx.beginPath(); ctx.arc(0, 0, fr * 1.03, 0, 6.283); ctx.fill(); ctx.stroke();
      drawEmoji(emo, 0, fr * 0.06, fr * 1.7);
      ctx.restore();

      // スカーフ（走者色。顔の下にたなびく）
      ctx.save();
      ctx.translate(fcx, fcy + fr * 1.08);
      ctx.fillStyle = look.tint;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(2.5, fr * 0.14);
      var fl = Math.sin(t * 0.012 + look.phase) * fr * 0.12 * (running ? 1 : 0.3);
      ctx.beginPath();
      ctx.moveTo(-fr * 0.5, -fr * 0.1);
      ctx.lineTo(-fr * 1.5, fr * 0.1 + fl);
      ctx.lineTo(-fr * 1.15, fr * 0.45 + fl);
      ctx.lineTo(-fr * 0.3, fr * 0.2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, fr * 0.78, fr * 0.26, 0, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.restore();

      // 帽子（慣性で遅れて揺れる）
      ctx.save();
      ctx.translate(fcx, fcy - fr * 0.95);
      ctx.translate(0, hatDy);
      ctx.rotate(-pose.rot * 0.6 + 0.2 * Math.sin(t * 0.011 + look.phase) * (running ? 1 : 0.3) - hatDy / lh * 1.6);
      drawHat(look, fr * 1.15, t);
      ctx.restore();

      // 汗（後方・緊張）
      if (!finished && (kind === 'back' || (kind === 'nerv' && tension > 0.8))) {
        var sw2 = frac(t / 900 + look.phase);
        ctx.fillStyle = 'rgba(120,200,255,' + (0.95 - sw2 * 0.6).toFixed(2) + ')';
        ctx.strokeStyle = 'rgba(20,70,140,0.9)';
        ctx.lineWidth = 2;
        var sx0 = fcx + fr * 1.15, sy0 = fcy - fr * 0.5 + sw2 * fr * 1.1;
        ctx.beginPath();
        ctx.moveTo(sx0, sy0 - fr * 0.4);
        ctx.quadraticCurveTo(sx0 + fr * 0.38, sy0 + fr * 0.1, sx0, sy0 + fr * 0.3);
        ctx.quadraticCurveTo(sx0 - fr * 0.38, sy0 + fr * 0.1, sx0, sy0 - fr * 0.4);
        ctx.fill(); ctx.stroke();
      }
      // ぐるぐる星（つまずき）
      if (ev.stumble) {
        ctx.fillStyle = '#ffd400';
        ctx.strokeStyle = '#8a5a00';
        ctx.lineWidth = 2;
        for (var q = 0; q < 3; q++) {
          var qa = t * 0.008 + q * 2.094;
          pc++;
          drawStar(fcx + Math.cos(qa) * fr * 1.5, fcy - fr * 1.3 + Math.sin(qa) * fr * 0.4, fr * 0.42, qa);
          ctx.stroke();
        }
      }
      ctx.restore();

      // イベント記号
      var big = Math.min(lh * 0.95, 80);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (ev.stumble) {
        var wob = 1 + 0.12 * Math.sin(t * 0.02);
        ctx.font = '900 ' + Math.round(big * wob) + 'px ' + TEXT_FONT;
        outlined(ctx, '!?', cx + size * 0.62, yc - lh * 0.3, big, '#ffe600', '#c62828', big * 0.2);
      }
      if (ev.reverse) {
        ctx.font = '900 ' + Math.round(big) + 'px ' + TEXT_FONT;
        outlined(ctx, '↩', cx + size * 0.6, yc - lh * 0.3, big, '#00e5ff', '#003a5c', big * 0.2);
      }
      if (ev.swap) {
        var sw = Math.sin(t * 0.03) * 0.15;
        ctx.save();
        ctx.translate(cx + size * 0.6, yc - lh * 0.3);
        ctx.rotate(sw);
        drawEmoji('⚡', 0, 0, big);
        ctx.restore();
      }

      // ゴール後：1着はキラキラ
      if (finished && rank === 0 && !hidden) {
        for (var z = 0; z < 2; z++) {
          pc++;
          var za = t * 0.004 + z * 3.1;
          drawEmoji('✨', cx + (z ? 1 : -1) * size * 0.62, yc - size * 0.15 + Math.sin(za) * size * 0.2, size * 0.5);
        }
      }

      // ゴール済みバッジ
      if (finished) {
        var bd = Math.min(lh * 0.92, 90);
        var bx = L.x1 + 2 * L.cs + 4 + (W - L.x1 - 2 * L.cs - 4) / 2;
        var bcol, tcol = '#fff', ecol = '#fff';
        var rn = rank + 1;
        if (rn === 1) { bcol = '#f5b800'; tcol = '#3a2600'; }
        else if (rn === 2) { bcol = '#c3cad2'; tcol = '#1e252b'; }
        else if (rn === 3) { bcol = '#c9772b'; tcol = '#2e1600'; }
        else { bcol = '#24304a'; }
        var bpop = ease((hidden ? sinceFin : sinceStamp) / 250);
        var rad = bd / 2 * (0.6 + 0.4 * bpop);
        if (hidden) { bcol = '#5a6170'; tcol = '#fff'; }   // 発表前は「?」
        ctx.fillStyle = bcol;
        ctx.beginPath(); ctx.arc(bx, yc, rad, 0, 6.283); ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = ecol;
        ctx.stroke();
        var rf = rad * (rn >= 10 ? 1.0 : 1.3);
        ctx.font = '900 ' + Math.round(rf) + 'px ' + TEXT_FONT;
        ctx.fillStyle = tcol;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hidden ? '?' : String(rn), bx, yc + rf * 0.06);
      }
      ctx.textAlign = 'left';
    }

    // 着順スタンプ：丸い判子に「N着」。押した瞬間は大きく、0.22秒で縮んで止まる
    function drawStamp(x, y, rn, since, lh) {
      var k = clamp(since / 220, 0, 1);
      var sc = 1 + 1.3 * (1 - ease(k));
      var r = lh * 0.42;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.22);
      ctx.scale(sc, sc);
      ctx.globalAlpha = 0.25 + 0.7 * ease(k);
      ctx.fillStyle = rn === 1 ? 'rgba(255,215,64,0.95)' : 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      ctx.lineWidth = Math.max(3, r * 0.14);
      ctx.strokeStyle = '#d0021b';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, 6.283); ctx.lineWidth = Math.max(1.5, r * 0.05); ctx.stroke();
      var fs = r * (rn >= 10 ? 0.62 : 0.78);
      ctx.font = '900 ' + Math.round(fs) + 'px ' + TEXT_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d0021b';
      ctx.fillText(rn + '着', 0, fs * 0.06);
      ctx.restore();
    }

    // ---------- 緊迫感の演出 ----------
    // 心拍の位相は積分して、テンポが変わってもカクつかないようにする
    function heartBeat(t, tension) {
      var period = lerp(1500, 760, tension);
      if (hb.last === null || t < hb.last || t - hb.last > 400) {
        hb.ph = frac(t / period);
      } else {
        hb.ph = frac(hb.ph + (t - hb.last) / period);
      }
      hb.last = t;
      var x = hb.ph;
      var b1 = Math.exp(-Math.pow((x - 0.05) / 0.07, 2));
      var b2 = 0.6 * Math.exp(-Math.pow((x - 0.28) / 0.07, 2));
      return clamp(b1 + b2, 0, 1);
    }

    // コース上（走者の下）：スピード線・ゴール線の光
    function drawTensionUnder(wid, t, tension, beat) {
      if (tension <= 0.02) return;
      var st = WEATHER_STYLE[wid];
      var trackH = L.n * L.laneH;
      // スピード線（太め・少数・色は天気のインク色）
      if (tension > 0.12) {
        var cnt = Math.round(3 + 7 * tension);
        ctx.lineCap = 'round';
        ctx.strokeStyle = st.ink;
        for (var k = 0; k < cnt; k++) {
          var len = 220 + hash(k, 21) * 360;
          var spd = (0.5 + hash(k, 22) * 0.5) * (0.5 + tension);
          var span = W + len;
          var x = W - (((t * spd + hash(k, 23) * span * 3) % span));
          var y = L.top + (0.05 + hash(k, 24) * 0.9) * trackH;
          var lg = ctx.createLinearGradient(x, 0, x + len, 0);
          lg.addColorStop(0, st.ink);
          lg.addColorStop(1, 'rgba(128,128,128,0)');
          ctx.strokeStyle = lg;
          ctx.globalAlpha = clamp(0.15 + 0.5 * tension, 0, 0.65);
          ctx.lineWidth = 4 + hash(k, 25) * 2;
          pc++;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // ゴール線の光
      var gx = L.x1;
      var a = tension * (0.4 + 0.4 * beat);
      var gw = L.cs * 2 + 70 + 50 * tension;
      var gg = ctx.createLinearGradient(gx - gw, 0, gx + L.cs, 0);
      gg.addColorStop(0, 'rgba(255,220,60,0)');
      gg.addColorStop(1, 'rgba(255,235,120,' + a.toFixed(3) + ')');
      ctx.fillStyle = gg;
      ctx.fillRect(gx - gw, L.top, gw + L.cs, trackH);
      ctx.save();
      ctx.shadowColor = 'rgba(255,230,80,' + clamp(a * 1.4, 0, 1).toFixed(2) + ')';
      ctx.shadowBlur = 30 + 30 * tension;
      ctx.fillStyle = 'rgba(255,250,200,' + clamp(0.35 + 0.65 * tension * (0.6 + 0.4 * beat), 0, 1).toFixed(2) + ')';
      ctx.fillRect(gx - 4, L.top, 8, trackH);
      ctx.restore();
    }

    // 画面端の赤い心拍ビネット
    function drawHeartVignette(tension, beat) {
      if (tension <= 0.02) return;
      var a = tension * (0.4 + 0.45 * beat);
      var diag = Math.sqrt(W * W + H * H);
      var g = ctx.createRadialGradient(W / 2, H / 2, diag * lerp(0.3, 0.14, tension), W / 2, H / 2, diag * 0.5);
      g.addColorStop(0, 'rgba(210,0,25,0)');
      g.addColorStop(1, 'rgba(215,0,30,' + clamp(a, 0, 0.85).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // ---------- 天気の前景（粒子数は控えめ。全体予算: 天気<=24 + 軌跡<=24 + スピード線<=10 で 60 以内） ----------
    function drawWeatherFront(wid, t) {
      var k, x, y;
      if (wid === 'rain' || wid === 'thunder' || wid === 'storm') {
        ctx.fillStyle = 'rgba(30,50,80,0.14)';
        ctx.fillRect(0, 0, W, H);
        var cnt = wid === 'rain' ? 18 : 20;
        ctx.lineCap = 'round';
        for (k = 0; k < cnt; k++) {
          var sp = 0.55 + hash(k, 4) * 0.25;
          y = ((hash(k, 2) + t * 0.0007 * sp) % 1) * (H + 120) - 60;
          x = hash(k, 1) * (W + 200) - 100 - (y * 0.25);
          ctx.strokeStyle = 'rgba(40,90,170,0.7)';
          ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 14, y + 52); ctx.stroke();
          ctx.strokeStyle = 'rgba(200,225,255,0.85)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 14, y + 52); ctx.stroke();
        }
        if (wid !== 'rain') {
          var ph = (t % 4000) / 4000;
          if (ph < 0.06) {
            ctx.fillStyle = 'rgba(255,255,255,' + (0.35 * (1 - ph / 0.06)).toFixed(2) + ')';
            ctx.fillRect(0, 0, W, H);
          }
        }
      } else if (wid === 'snow') {
        for (k = 0; k < 16; k++) {
          var r = 8 + hash(k, 3) * 7;
          y = ((hash(k, 2) + t * 0.00007 * (0.7 + hash(k, 5))) % 1) * (H + 40) - 20;
          x = hash(k, 1) * W + Math.sin(t * 0.0011 + k) * 24;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.strokeStyle = 'rgba(70,110,170,0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.stroke();
        }
      } else if (wid === 'fog') {
        for (k = 0; k < 5; k++) {
          y = H * (0.14 + 0.17 * k) + Math.sin(t * 0.0004 + k) * 14;
          var bw = W * 0.55, bh = H * 0.07;
          var off = ((t * 0.02 * (0.6 + k * 0.15) + k * 500) % (W + bw * 2)) - bw;
          ctx.save();
          ctx.translate(off, y);
          ctx.scale(1, bh / bw);
          var g = ctx.createRadialGradient(0, 0, 0, 0, 0, bw);
          g.addColorStop(0, 'rgba(240,242,246,0.5)');
          g.addColorStop(1, 'rgba(240,242,246,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, bw, 0, 6.283); ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = 'rgba(225,230,235,0.08)';
        ctx.fillRect(0, 0, W, H);
      } else if (wid === 'sunset') {
        var sg = ctx.createLinearGradient(0, 0, W, 0);
        sg.addColorStop(0, 'rgba(255,90,40,0.22)');
        sg.addColorStop(1, 'rgba(255,150,60,0.05)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, W, H);
        var vg = ctx.createLinearGradient(0, H * 0.6, 0, H);
        vg.addColorStop(0, 'rgba(120,30,40,0)');
        vg.addColorStop(1, 'rgba(120,30,40,0.25)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, H * 0.6, W, H * 0.4);
      } else if (wid === 'night') {
        ctx.fillStyle = 'rgba(5,10,40,0.16)';
        ctx.fillRect(0, 0, W, H);
        for (k = 0; k < 8; k++) {
          // ふわふわ光る蛍
          x = hash(k, 8) * W + Math.sin(t * 0.0006 + k * 2) * 40;
          y = L.top + hash(k, 9) * (H - L.top - L.bot);
          var a = 0.4 + 0.4 * Math.sin(t * 0.003 + k);
          ctx.fillStyle = 'rgba(255,255,140,' + a.toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.283); ctx.fill();
        }
      } else if (wid === 'wind') {
        ctx.lineCap = 'round';
        for (k = 0; k < 8; k++) {
          var spd = 0.5 + hash(k, 4) * 0.5;
          x = ((hash(k, 1) + t * 0.00035 * spd) % 1) * (W + 600) - 300;
          y = hash(k, 2) * H;
          var len = 140 + hash(k, 6) * 160;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + len * 0.3, y - 14, x + len * 0.6, y + 14, x + len, y);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(30,110,100,0.55)';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        // 舞う葉っぱ
        for (k = 0; k < 3; k++) {
          x = ((hash(k, 11) + t * 0.0003) % 1) * (W + 200) - 100;
          y = hash(k, 12) * H + Math.sin(t * 0.002 + k) * 30;
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.003 + k); drawEmoji('🍃', 0, 0, 40); ctx.restore();
        }
        ctx.textAlign = 'left';
      } else if (wid === 'cloudy') {
        ctx.fillStyle = 'rgba(70,80,95,0.12)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    function draw(t, view) {
      if (!plan || !L) return;
      view = view || {};
      t = t || 0;
      var wid = weatherId();
      var zoom = ease(view.zoom || 0);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // ズーム
      var s = 1 + 1.2 * zoom;
      var tx = 0, ty = 0;
      if (zoom > 0 && plan.photo) {
        var ra = laneRect(plan.photo.a), rb = laneRect(plan.photo.b);
        // v4: 1着・2着のレーンが離れていても2人とも画面に入るよう、寄りを弱める
        var span = Math.abs(ra.y - rb.y) + ra.h + L.laneH * 0.6;
        var sMax = clamp(H * 0.92 / span, 1, 2.2);
        s = 1 + (sMax - 1) * zoom;
        var fx = L.x1 - L.emoji * 0.6;
        var fy = (ra.y + ra.h / 2 + rb.y + rb.h / 2) / 2;
        var cx = lerp(fx, W * 0.6, zoom);
        var cy = lerp(fy, H * 0.5, zoom);
        tx = cx - fx * s;
        ty = cy - fy * s;
        tx = clamp(tx, W - W * s, 0);
        ty = clamp(ty, H - H * s, 0);
      }

      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(s, s);
      var tension = clamp(view.tension || 0, 0, 1);
      var beat = tension > 0 ? heartBeat(t, tension) : 0;
      pc = 0;
      drawSky(wid, t);
      drawTrack(wid, t);
      drawTensionUnder(wid, t, tension, beat);
      drawWeatherFront(wid, t);   // 天気は走者・名前札の背面
      var i;
      var ranks = ranksAt(t);
      plateQueue = [];
      for (i = 0; i < L.n; i++) drawRunner(i, t, ranks[i], tension, view.reveal);
      for (i = 0; i < plateQueue.length; i++) plateQueue[i]();
      plateQueue = [];
      ctx.restore();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawHeartVignette(tension, beat);
      api.particles = pc;

      if (view.slow) {
        var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
      }

      if (view.frozen) {
        ctx.save();
        ctx.globalCompositeOperation = 'saturation';
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        ctx.fillStyle = 'rgba(80,80,90,0.28)';
        ctx.fillRect(0, 0, W, H);
      }

      if (view.flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + clamp(view.flash, 0, 1).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }

    // 写真判定のフィルム用：演出なしの1枚を裏で描き、1着・2着のレーンのゴール付近だけを切り出して上下に並べる
    //（レーンが離れていても2人とも写る。どちらが1着かは分からないよう、レーン番号の順に並べる）
    function photo(t) {
      if (!plan || !L || typeof document === 'undefined') return snapshot();
      var off = document.createElement('canvas');
      off.width = canvas.width; off.height = canvas.height;
      var keep = ctx;
      ctx = off.getContext('2d');
      try { draw(t, { zoom: 0, slow: false, frozen: false, flash: 0, tension: 0, reveal: -1 }); } finally { ctx = keep; }
      var lanes = [plan.photo.a, plan.photo.b].sort(function (x, y) { return x - y; });
      var lh = L.laneH, gap = Math.max(4, lh * 0.06);
      var cw = Math.min(W, L.maxPlate + L.emoji * 2.2 + L.cs * 2 + 16);
      var sx = Math.max(0, L.x1 + L.cs * 2 + 8 - cw);
      var out = document.createElement('canvas');
      out.width = Math.round(cw * dpr); out.height = Math.round((lh * 2 + gap) * dpr);
      var o = out.getContext('2d');
      o.fillStyle = '#000'; o.fillRect(0, 0, out.width, out.height);
      lanes.forEach(function (i, k) {
        o.drawImage(off, sx * dpr, (L.top + i * lh) * dpr, cw * dpr, lh * dpr, 0, k * (lh + gap) * dpr, cw * dpr, lh * dpr);
      });
      var gx = (L.x1 - sx) * dpr;
      o.strokeStyle = 'rgba(255,30,30,0.95)'; o.lineWidth = Math.max(2, 3 * dpr);
      o.beginPath(); o.moveTo(gx, 0); o.lineTo(gx, out.height); o.stroke();
      return out;
    }

    function snapshot() {
      var c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      var cx = c.getContext('2d');
      cx.drawImage(canvas, 0, 0);
      return c;
    }

    api = { setPlan: setPlan, resize: resize, draw: draw, snapshot: snapshot, photo: photo, laneRect: laneRect, looks: looks, particles: 0 };
    return api;
  }

  return { create: create, LANE_COLORS: LANE_COLORS };
})();
