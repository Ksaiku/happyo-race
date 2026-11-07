# PROGRESS（進み具合）

再開時はこのファイルを最初に読むこと。

## 終わったこと
- [x] requirements.md / claude-code-prompt.md を読んだ
- [x] 全体設計（DECISIONS.md / SPEC.md 参照）
- [x] アイデア42個（IDEAS.md）→ 8個採用（DECISIONS.md）
- [x] package.json / Playwright(Edge使用) 準備

## 次にやること
- なし（すべて完了）

## 残っている問題
- なし

## 2026-11-07 時点
- [x] core/audio/render/app/build 実装完了。`node build.js` → dist/index.html (約95KB)
- [x] `node test/core.test.js` ALL PASS（n=8×1000回 カイ二乗 補正後59.0 / df49 / 臨界85.4）
- [x] `node test/e2e.js` ALL PASS（2/8/12人、ゴール順＝結果順、エラーなし、オフラインで外部通信なし、8人等速で約33秒）
- [x] スクショレビュー → 修正 → 再テスト ALL PASS
- [x] イベント対象を全順位に（1着も転ぶ）
- [x] README / LICENSE / DELIVERY / screenshots / 公開前チェック

## 状態：納品済み（GitHub公開は未実施。DELIVERY.md 5章の手順で本人が実行）

## v2（2026-11-07 ユーザー要望）
要望：①実況の文字・音声・レース状況のズレ解消 ②緊迫感 ③走者ごとの見た目の個性。設計は SPEC.md 末尾「v2 変更」。
- [x] 担当A（audio/app/style）：状況からその場で実況生成、字幕は読み上げ開始の瞬間に表示、古い文は捨てる／緊迫感の音と帯
- [x] 担当C（core）：raceEnd 18〜21秒、終盤の団子、先頭交代増、finalFrom/leadChanges/positionAt
- [x] 担当B（render）（＋大きさ・色の個性を強化）：走者ごとの色・帽子・表情が変わる顔・走り方・軌跡、tension の画面演出
- [x] 統合 → core/E2E テスト ALL PASS → スクショ確認（ラストスパート帯が走者を隠す件を修正）→ README/DELIVERY 更新
- 注意: C: ドライブ空き0。テスト時は TEMP/TMP を scratch/tmp に向ける
- [x] v3 ユーモア実況（ボケ＋ツッコミ、結果画面の締め、レース26〜29秒）→ core/E2E ALL PASS・字幕突き合わせ一致
