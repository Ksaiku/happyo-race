# CLAUDE.md（このリポジトリで作業する Claude 向け）

月例発表会の発表順を「レース」で決める、HTML 1ファイルのアプリ。進行役が Teams で画面共有して使う。
公開先：https://github.com/Ksaiku/happyo-race （Public）／ GitHub Pages：https://ksaiku.github.io/happyo-race/dist/

## 最初に読むもの
1. `requirements.md`（元の要件。守るべき制約の原典）
2. `PROGRESS.md`（どこまで終わったか）
3. `ISSUES.md` があればそれ（修正点リスト。改善作業はここを起点にする）
4. 必要に応じて `SPEC.md`（モジュールごとの約束）、`DECISIONS.md`（なぜそうしたか）

## 絶対に守る制約
- 完成品は **`dist/index.html` 1ファイル**。CSS/JS は中に埋め込む。外部通信なし（CDN・フォント・画像ファイルも不可）。絵は図形・絵文字・CSS・Canvas、音は Web Audio 合成と Web Speech API のみ。
- **順位はスタート時に乱数で確定**し、走りはその順位に合わせて逆算する（`core.js` の `planRace`）。演出・実況・イベントで順位を変えてはいけない。ゴール順＝結果画面の発表順。
- Edge / Chrome でダブルクリックして開くだけで動くこと。localStorage は失敗しても動くこと。
- Teams 共有前提：文字は大きく、コントラスト強く、細かい粒子を大量に出さない。

## ファイル構成
- `src/core.js` → `RR.Core`：純粋ロジック（乱数・順位確定・軌跡・イベント・`planRace`）。Node でテストできる。
- `src/audio.js` → `RR.Audio`：Web Audio の効果音・BGM、Web Speech の読み上げ `speak(text, role, opts)`。
- `src/render.js` → `RR.Renderer`：Canvas 描画（走者の見た目、天気、乗り物、演出）。
- `src/app.js`：画面遷移、レース進行、**実況の生成**（台詞表 `PH`、`say`/`sayText`、`genNormal`、`runCommentary`、結果画面の締め `resultBanter`）。
- `src/index.html` / `src/style.css`：画面の骨組みとスタイル。
- `build.js`：src を結合して `dist/index.html` を作る（外部 URL が混ざると警告）。
- `test/core.test.js`：公平性（カイ二乗）・順位一致・時間・先頭交代などの検査。
- `test/e2e.js`：ヘッドレス Edge で 2/8/12人を最後まで走らせ、結果一致・エラーなし・外部通信なしを検査。`screenshots/` も更新する。
- `test/subs-check.js`：実況字幕が「表示した瞬間のレース状況」と合っているかを一覧表示（`node test/subs-check.js voice` で読み上げを疑似再現）。
- `scratch/`：過去の作業ファイル置き場（git 管理外）。参考にしなくてよい。

## コマンド
**C: ドライブの空きが無いため、Node / Playwright を動かす前に必ず TEMP を D: に向ける。**（Bash の場合）
```bash
export TEMP="$PWD/scratch/tmp" TMP="$PWD/scratch/tmp"; mkdir -p scratch/tmp
node build.js            # dist/index.html を作り直す（src を変えたら毎回）
node test/core.test.js   # ロジック検査
node test/e2e.js         # 画面込みの検査（1〜2分。Microsoft Edge を使う）
node test/subs-check.js voice 3 # 実況と画面のズレ確認（3レース。最後まで言えた割合・言い終わりの一致率を出す）
```
- 動作確認用 URL パラメータ：`dist/index.html?speed=3`（3倍速）。テストは `window.__raceLog`（subs / errors / done）を見ている。
- C: ドライブのファイルは消さない（ユーザーの PC。空き不足は TEMP の付け替えで回避する）。

## 実況の仕組み（壊しやすいので注意）
- 字幕は **読み上げが始まった瞬間** に出す。始まる前に状況が変わったら `valid()` で捨てる。
- high 優先は割り込み、normal は喋り中なら捨てる。1200ms 以内に始まらない文は捨てる。
- v4：`valid(t1, t2)` は「字幕が出る時刻」と「言い終わる時刻（`estRace` で見積もり）」の両方で確かめる。普通の文は、次のイベント・ラストスパート・写真判定までに言い終わるときだけ言う（`fitsBeforeHigh`）。先頭交代は割り込まない。
- 台詞は `'本文｜ツッコミ'` 形式。`#`=走者名、`@`=2人目、`%`=帽子、`$`=乗り物、`&`=着順（例「3着」）。ana＝煽り（ボケ）、kai＝ツッコミ。本文の上限は high 16字 / normal 20字。
- 変更したら `node test/subs-check.js voice` で、字幕とレース状況が合っているかを必ず見る。

## 公開リポジトリとしてのルール
- コミット・push はユーザーに確認してから。`dist/index.html` は Pages で配信しているので、src を変えたら build してから一緒にコミットする。
- コミットのメールは GitHub の noreply（リポジトリ内の git 設定済み）。gmail など個人のアドレスを入れない。
- 公開ファイルに、実名・会社名・PC 内の絶対パス（`D:/...` や `C:\Users\...`）を書かない。
- `claude-code-prompt.md`、`scratch/`、`node_modules/`、`next-session-prompt.md` は公開しない（.gitignore 済み）。
- ドキュメント（README / DELIVERY / SPEC / DECISIONS / PROGRESS）は変更内容に合わせて更新する。文章は日本語。
