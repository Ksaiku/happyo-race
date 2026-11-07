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

## 状態：納品済み・GitHub 公開済み（2026-11-08）

## v2（2026-11-07 ユーザー要望）
要望：①実況の文字・音声・レース状況のズレ解消 ②緊迫感 ③走者ごとの見た目の個性。設計は SPEC.md 末尾「v2 変更」。
- [x] 担当A（audio/app/style）：状況からその場で実況生成、字幕は読み上げ開始の瞬間に表示、古い文は捨てる／緊迫感の音と帯
- [x] 担当C（core）：raceEnd 18〜21秒、終盤の団子、先頭交代増、finalFrom/leadChanges/positionAt
- [x] 担当B（render）（＋大きさ・色の個性を強化）：走者ごとの色・帽子・表情が変わる顔・走り方・軌跡、tension の画面演出
- [x] 統合 → core/E2E テスト ALL PASS → スクショ確認（ラストスパート帯が走者を隠す件を修正）→ README/DELIVERY 更新
- 注意: C: ドライブ空き0。テスト時は TEMP/TMP を scratch/tmp に向ける
- [x] v3 ユーモア実況（ボケ＋ツッコミ、結果画面の締め、レース26〜29秒）→ core/E2E ALL PASS・字幕突き合わせ一致

## 2026-11-08 公開と次の段取り
- [x] GitHub 公開（Public＋Pages）。コミットのメールは noreply
- [x] 新セッション向け準備：CLAUDE.md 追加、字幕突き合わせを test/subs-check.js に移動（`npm run subs`）、scratch の旧ファイルを scratch/archive-v3/ へ
- [ ] 次：別セッションで修正点を洗い出して ISSUES.md にまとめる → ユーザーが優先度を決める → 改善
- 未確認のまま：実機スピーカーでの音・読み上げ、Teams 越しの見え方、緊迫感の音量バランス

## 2026-11-08 v4（派手さ・面白さの改善。ISSUES.md を基に）
- [x] 修正点の洗い出し → ISSUES.md（30件）。ユーザーが「派手さ・面白さ」中心のおすすめセットを選択
- [x] I-01 団子の解消（core の走りを作り直し）、I-06 レース本体 40〜44秒
- [x] I-02 / I-03 実況：言い終わりでも正しい文だけ、イベント前に言いかけない、先頭交代は割り込まない、レース前の文を短く
- [x] I-04 / I-05 写真判定：発表まで結果画面に進まない、1・2着を伏せる、2人のレーンを切り出したフィルム、ズーム調整
- [x] 新演出 B 勝者カットイン、D 着順スタンプ
- [x] I-14 声（解説役は男性の声）、I-15 / I-16 台詞の追加・差し替え、I-09 名前の記号が化ける件
- [x] I-07 表彰台の名前、I-08 字幕の大きさ・重なり、I-21 字幕の枠、I-13 描画の軽量化とレース時計
- [x] テスト更新（core の新基準、E2E に判定表示、subs-check を実測の速さに）→ ALL PASS
- 次の候補（ISSUES.md の残り）：案A ライブ順位ボード、案C 名場面リプレイ、案E うそオッズ表、I-11 走り方の癖、I-10 封印コード、I-17 同名・タブ入力 ほか
- 未確認のまま：実機スピーカーでの音・読み上げ（男女の声の聞こえ方、カットインとファンファーレの音量）、Teams 越しの見え方、社内PCでの fps
