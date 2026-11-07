# SPEC（モジュール間の約束ごと） — 実装担当はこれに従う

## 共通ルール
- 全ファイルは素のスクリプト（ES Modules / import 禁止）。先頭で
  `var RR = (typeof window !== 'undefined') ? (window.RR = window.RR || {}) : {};`
  core.js のみ末尾で `if (typeof module !== 'undefined') module.exports = RR.Core;` も行う。
- 外部通信・外部ファイル・画像ファイル・Webフォント禁止。図形・絵文字・CSS・Canvas・Web Audio のみ。
- 既存作品のキャラ・商標は使わない。サンプル名は架空。
- ビルド時の連結順：`core.js → audio.js → render.js → app.js`。読み込み時に副作用を起こさない（app.js だけ DOMContentLoaded で起動）。
- 時刻はすべて「レース時計」ms（0 = スタート。フリーズ中は止まる）。

## src/core.js → `RR.Core`（純粋ロジック。Nodeでテスト）
- `createRng(seed?) => () => number[0,1)` … mulberry32。seed省略時は crypto 由来（ブラウザ `crypto.getRandomValues` / Node `require('crypto').randomInt`）。
- `shuffle(arr, rng) => newArray` … Fisher–Yates。
- `VEHICLES` … `[{id, emoji, label, counter}]` 8種以上（例：horse🐎/馬/頭、snail🐌、turtle🐢、duck🦆、cart🛒、chair🪑、pig🐖、rocket🚀…）。
- `WEATHERS` … `[{id, emoji, label, forecast}]` 6種以上：sunny, rain, fog, snow, sunset, night, wind 等。`forecast` は天気予報ボードの一言（例「午後から濃霧、ところにより波乱」）。
- `planRace(names, opts?: {seed?, rng?}) => Plan`

```
Plan = {
  n, names,
  order: number[],          // ゴール順。order[0] = 1着の走者index
  rankOf: number[],         // rankOf[i] = 走者iの順位(0始まり)
  finishTime: number[],     // 走者iのゴール時刻(ms)
  raceEnd: number,          // 最下位ゴール時刻 (20000〜24000)
  photo: { a, b, t0, t1 },  // a=1着index, b=2着index, t0/t1=各ゴール時刻 (差40〜120ms)
  slowFrom: number,         // スロー開始時刻 = t0 - 1400 前後
  events: Event[],          // 時刻順、2〜4個
  freeze: {t, dur} | null,  // 約35%で発生。dur=1600。イベント・写真判定と重ならない。30%〜60%時点
  vehicle: VEHICLES[k], weather: WEATHERS[k],
  sealCode: string,         // 例 "K7-3QF-9M"。順位と名前から決まる短いハッシュ（同じ順位なら同じ）
  commentary: Line[],       // 実況字幕（時刻順）
  progress(i, t) => number, // 走者iの進捗 0..1。t<=0 →0、t>=finishTime[i] →1
  leaderAt(t) => index,     // その時点の先頭
}
Event = { t, dur, type: 'stumble'|'boost'|'reverse'|'swap', runner, runner2?, text }
  stumble: 0.8〜1.2秒 立ち止まる（テロップ例「○○さん、まさかの転倒！」「○○さん、落とし物を拾いに戻る！」）
  boost:   1.2秒で大きく前へ（光るエフェクト） 「○○さん、急加速！」
  reverse: 0.7秒 後ろ向きに戻る                  「○○さん、まさかの逆走！？」
  swap:    t の瞬間に runner と runner2 の位置が入れ替わる（画面が白く光る）「閃光！○○さんと△△さんが入れ替わった！？」
Line = { t, role: 'ana'|'kai', text }  // ana=実況(テンション高い), kai=解説(落ち着いた) の掛け合い。
  スタート前の天気・乗り物紹介、スタート、中盤の先頭紹介（leaderAt から実名で）、各イベントへの反応、フリーズ時、ゴール前大接戦、写真判定… を 8〜14 行程度。名前は「○○さん」。
```

### core が守ること（test/core.test.js で検査）
1. `order` は一様ランダム（1000回で各人×各順位の回数に偏りなし。カイ二乗検定 p>0.001 程度）。
2. `progress(i, finishTime[i]) === 1`、`t < finishTime[i]` では `< 1`。
3. `finishTime` は order 順に厳密増加。1着-2着差 40〜120ms。他の着差は 200〜900ms 程度。`raceEnd` 20000〜24000。
4. イベント 2〜4 個。各イベントのオフセットは関係する走者のゴール 2500ms 前までに 0 に戻り、`slowFrom` より前に終わる。
5. 抜きつ抜かれつ：50% 時点の先頭が1着ではない回が 60% 以上。最後の 2 秒は 1・2 着が並走し、2着が一時的に前に出る瞬間がある。
6. 進捗は reverse 中と swap の瞬間以外は単調非減少。0 未満にならない。

## src/audio.js → `RR.Audio`（Web Audio 合成。音声ファイル禁止）
```
init()                      // 最初のユーザー操作時に呼ばれる。AudioContext作成。何度呼んでも安全
setMuted(bool), isMuted()   // ミュート時は全ての音と読み上げを止める
play(name)                  // 'tick','go','boost','stumble','reverse','swap','freeze','unfreeze',
                            // 'lamp','lampFinal','shutter','fanfare','cheer'
startLoop(), stopLoop()     // レース中の足音リズム＋軽いBGM（控えめ音量）
setSlow(bool)               // スロー中はループのテンポ/ピッチを落とし、心音(heartbeat)を重ねる
speak(text, role)           // Web Speech。ja-JP かつ voice.localService===true の音声のみ使う。
                            // ana は pitch 1.3/rate 1.25、kai は pitch 0.8/rate 1.0。該当音声が無ければ何もしない
setSpeech(bool), isSpeechOn(), speechAvailable()
cancelSpeech()
```
例外を投げない（AudioContext が使えない環境でも黙って無視）。

## src/render.js → `RR.Renderer`（Canvas 描画）
```
const r = RR.Renderer.create(canvas)
r.setPlan(plan)
r.resize()                  // 親要素いっぱい・devicePixelRatio対応
r.draw(t, view)             // view = { zoom:0..1, slow:bool, frozen:bool, flash:0..1 }
r.snapshot() => HTMLCanvasElement   // 今の画面のコピー（写真判定フィルム用）
r.laneRect(i) => {x,y,w,h}  // CSSピクセル
```
- 横向きレーン、左がスタート・右がゴール。全員1画面。レーン色は高コントラストの12色。
- 走者 = 乗り物の絵文字（大きく、右向きに見えるよう必要なら左右反転）＋レーン色の札に名前（太字・大きく、白縁取り）。名前札は走者と一緒に動く。
- 天気ごとの背景・前景（雨＝大きめの雨粒少数、霧＝半透明の帯、雪＝大きめの雪片少数、夕焼け/夜＝色調）。細かい粒子大量は禁止。
- イベント中の見た目：stumble=傾いて止まる＋「!?」、boost=光の尾、reverse=逆向き＋「↩」、swap=view.flash が来たら全面白フラッシュ。
- `zoom` はゴール線付近の 1・2 着レーンへ寄る（写真判定直前）。`frozen` は灰色っぽくして止める。
- ゴール線と、ゴール済み走者の着順バッジ（大きい数字）を表示。

## src/app.js + src/index.html + src/style.css（画面遷移と統合） + build.js
- 画面：準備 → レース → 結果。`?speed=N` で時間 N 倍速（テスト用）。
- 準備：textarea（1行1人、貼り付け可）。localStorage に保存/復元（try/catch）。2〜12人以外は注意表示しスタート不可。
  初期サンプル名（架空）：あおい, はると, こはる, そうた, みなと, ゆい, れん, さくら。
  オプション：発表開始時刻（例 13:00）、1人あたり分数（例 8）、読み上げ ON/OFF。
- 右上に常に：音 ON/OFF ボタン、読み上げ ON/OFF、「音の共有」注意書きの表示切替（「Teamsで音を共有するには『コンピューターのサウンドを含める』をオン」）。
- レース前演出：天気予報ボード（天気絵文字・予報文）＋乗り物ガチャ発表 →「封印の封筒」（sealCode を表示、中身は隠す）→ 3・2・1・GO。スタートボタンまたはスペースキー。
- レース中：上部に大きなテロップ（イベント text）、下部に実況字幕（ana/kai で色を変える）、読み上げ。freeze 中はレース時計を止め、灰色化＋オリジナル風の「……（停止中）」表示 → 「ウソです！レース続行！」。
- 写真判定：t>=slowFrom で 0.3 倍スロー＋zoom。1着通過時に snapshot をフィルム風の帯に表示、ランプ3つ（2つは速く、最後は長く焦らす）→「1着 ○○さん！」。その裏でレースは等速に戻り続行。
- 結果：表彰台(1〜3着)＋大きめで数の少ない紙吹雪＋ファンファーレ → 全員の発表順リスト（大きな文字）。封筒を開封し sealCode を再表示。タイムテーブル（開始時刻＋分数で計算）＋「コピー」ボタン。「もう一度」ボタン（同じメンバーで再レース）、「メンバー変更」ボタン。
- テスト用 `window.__raceLog = { goalOrder: [名前…(実際にゴール通過を検出した順)], resultOrder: [名前…(結果画面のリストの順)], done: bool, errors: [] }`。
- build.js：`src/index.html` の `<!--STYLE-->` と `<!--SCRIPTS-->` を、style.css と 4つの JS のインラインに置換して `dist/index.html` へ。Node 標準モジュールのみ。

---
# v2 変更（2026-11-07 ユーザー要望：①実況と音声・レース状況のズレ解消 ②緊迫感アップ ③走者ごとの見た目の個性）

## core.js（担当C）
- `raceEnd` を 18000〜21000 に短縮（テンポと緊迫感のため）。他の着差・写真判定の約束は維持。
- 終盤の団子：`finalFrom = photo.t0 - 5000` 付近から全員の進捗差を詰め、残り約3秒まで「誰が勝つか分からない」状態にしてから散らす。
- 先頭交代を増やす：後半40%で先頭交代が 2 回以上起きる回が多いこと（テストで割合を出す）。1着は時々「最後の3秒で後方から差す」。
- 追加プロパティ：
  - `plan.finalFrom: number`
  - `plan.leadChanges: [{t, leader}]` … 50ms刻みで leaderAt を調べ、先頭が変わった時刻（同じ人への 400ms 以内の戻りは除外してチカチカさせない）。
  - `plan.positionAt(t) => number[]` … その時点の順位（先頭=0）を走者index順で返す。
- `plan.commentary` は「事前の天気・乗り物紹介（負の時刻）」の2行だけ残し、レース中の実況は app 側で生成（下記）。core は実況文テンプレの素材として `Core.PHRASES` を公開してもよい。

## audio.js + app.js + style.css（担当A）
### 実況の同期（最重要）
- 実況はその瞬間の状況から生成する（事前スケジュール読み上げは廃止）。字幕は**実際に読み上げが始まった瞬間（utterance.onstart）**に表示し、読み終わり（onend）＋0.6秒で消す。読み上げOFF／音声なし環境では、生成した瞬間に字幕表示し 2.2秒で消す。
- `RR.Audio.speak(text, role, opts)`：`opts = {priority:'high'|'normal', onstart, onend}`。high は現在の発話を cancel して即時発話。normal は発話中なら**捨てる**（キューに溜めない）。ana rate 1.45 / kai rate 1.25 程度。onstart/onend は音声なしでも必ず（即時/タイマーで）呼ぶ。
- 実況文は短く（原則 14 文字以内、名前込み）。生成のきっかけ：イベント発生（high, 例「○○さん転倒！」）、先頭交代（high, 「先頭交代！○○さん！」）、終盤突入（high「ラストスパート！」）、写真判定直前（high「○○さんか！△△さんか！」）、それ以外は発話していない時に 2.5 秒おきに normal の状況実況（先頭・追い上げ・最下位の奮闘など、その時点の実データから）。ana/kai を交互気味に。
- 古くなった文は出さない：生成から 1.2 秒以内に始まらなかった発話は捨てる。
- 上部の大テロップ（イベント）は発生時刻ぴったりに出す（音声に依存させない）。
### 緊迫感
- `finalFrom` から：BGMのテンポを徐々に上げる（`RR.Audio.setTension(0..1)` を追加：足音テンポ↑、低いドローン音↑、心音が速く大きく、観客のどよめき↑）。スロー中は心音だけ残して他を絞る（無音に近い静けさ→ゴールで解放）。
- 画面：`view.tension`（0..1）を renderer に渡す。先頭交代時に上部テロップ「先頭交代！」を短く。終盤に「ラストスパート！」の大きな帯。写真判定のランプ中は心音。
- 結果画面の表彰台・発表順リストに、各走者の見た目（`renderer.looks[i]` の顔・帽子・色）を小さく添えて個性を引き継ぐ（`looks` が無ければ省略）。

## render.js（担当B）
- `r.looks[i]`（setPlan 時に毎回ランダムに割り当て、レース内で被らない）= `{ hue, face, hat, gait, trail, size, label }`：
  - `hue`: 乗り物の色味（ctx.filter の hue-rotate／saturate。走者ごとに違う色の乗り物になる）
  - `hat`: 頭の飾り（👑🎩🧢🎀🌸⛑️🎓🪖🦄角 等の絵文字 or 図形）、`size`: 0.85〜1.15
  - `face`: 乗っている人の顔の絵文字。**状況で表情が変わる**：先頭😎、上位😆、中位🙂、後方😰、つまずき😵、急加速😤、逆走🙃、入れ替わり😲、ゴール後は1着🥳・2-3着😄・それ以外😌
  - `gait`: 走り方（ぴょんぴょん跳ねる／左右にゆらゆら／小刻み高速／たまに一回転 など 5種以上。大きくゆっくり）
  - `trail`: 後ろに残すもの（土ぼこり／♪音符／★／ハート／泡 など。少数・大きめ）
  - `label`: 走り方の短い二つ名（例「ぴょんぴょん型」）— 使わなくてもよい
- `view.tension`（0..1）：画面端の赤い心拍ビネットがゆっくり脈打つ、背景に横向きのスピード線、ゴール線が光る。終盤に向けて強く。画面共有で伝わる大きさ・ゆっくりさで。
- 名前の読みやすさは維持（8人で 40px 以上、12人で 30px 以上）。顔・帽子が名前札に重ならないこと。


# v3 変更（2026-11-07 ユーザー要望：実況にユーモア、走者を煽る。尺は延ばしてよい）
- `raceEnd` を 26000〜29000 に延長。他の約束（着差・写真判定・終盤の団子・先頭交代）は維持。
- 実況台詞は「本文｜ツッコミ」形式。本文（ana＝煽り役）を言い終えたら、0.12秒後に相方（kai）がツッコミを言う。ツッコミも同じ valid() で状況を再確認し、変わっていれば出さない。割り込み系（high）の本文は16文字以内、普通は20文字以内。
- 普通の実況の種類を追加：失速（2秒で2つ以上順位を落とした人）、帽子いじり（1レース2回まで、中盤のみ）、乗り物いじり（1回、中盤のみ）。最後尾いじりの比重を上げた。
- 普通の実況は、前の発話が終わって0.5秒（終盤0.3秒）空いたら次へ。
- 結果画面で「トップバッターは○○さん！」「大トリは△△さん！」と締めの掛け合いを読み上げのみで行う。
