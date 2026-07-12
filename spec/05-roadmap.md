# 05. 実装ロードマップ

マイルストーンを順に実装する。各マイルストーンは **検証が通ってから** 次へ進む（CLAUDE.md の Goal-driven 方針）。コミットはマイルストーン単位を推奨。**次にやるべきものは、常に下の未完了マイルストーンの先頭（現在: M8）。**

検証コマンドの前提: `pnpm check`（biome + tsc）/ `pnpm test`（vitest）/ `pnpm dev` / `pnpm build && pnpm preview`。

---

## 完了済み（M0〜M7）

Phase 1（プロシージャル描画のみの MVP）は完了。詳細な当時のスコープは git 履歴と `07-verification-checklist.md` §1〜§10 が記録している。

| マイルストーン | 内容 | コミット |
|---|---|---|
| M0 | ツーリングとスキャフォールド掃除 | `8dff1f4` |
| M1 | gameStore + gameLogic + ユニットテスト | `674b944` |
| M2 | Canvas 骨格（ループ・リサイズ・移動） | `800ec31` |
| M3 | ライティング + バイオーム lerp | `4968acf` |
| M4 | GameUI（HUD / Dialog / Tabs / ポーズ） | `87f6ed3` |
| M5 | エンティティ（クリスタル / ブレイジャー / パーティクル） | `c7cac74` |
| M6 | reduced-motion + モバイル D-pad + 仕上げ | `579f0ec` |
| M7 | 出荷チェック（手動 QA、コードなし） | — （2026-07-12 実施済み） |

---

## M8 — スプライト基盤（フラッグシップ）

**スコープ**: `src/assets.ts` 新規（`03-reference.md` §1.3 / §6.3 / §7）と、全 render 関数へのスプライトディスパッチ（`02-game-design.md` §10）。碑文・光る草エンティティ自体はまだ実装しない（M11 / M12）が、`SPRITE_DEFS` は 9 キー全部を定義してロードする。

- `SPRITE_DEFS`・`spriteDrawOrigin`（+ ユニットテスト）・`loadSprites`
- GameCanvas: `sprites` ローカル + onMount でロード開始（`01-architecture.md` §8）
- player / crystal / brazier のディスパッチ + ハロー維持則
- タイルの all-or-nothing テクスチャモード + ブレンド帯の重ね描き

**検証**（手動、`pnpm dev` — 検品用のダミー PNG は手描きで可）:
- 素材ゼロの状態で従来と描画が 1px も変わらない（フォールバックが正）
- `player.png` を置いてリロードすると差し替わり、消すと戻る（ビルド不要）
- 一部の素材だけ置いても正常。タイルは片方だけなら市松のまま、両方で全面テクスチャ + ブレンド帯クロスフェード
- DPR・ブラウザズームで crisp。ライティング・reduced-motion の挙動が不変
- 未配置素材の 404 以外のコンソールエラーがない
- `pnpm check` / `pnpm test` が green（spriteDrawOrigin のテスト追加 — `06-test-plan.md` §5）

## M9 — 進捗セーブ

**スコープ**: `src/persistence.ts` 新規（`03-reference.md` §1.4 / §6.2 / §8、`01-architecture.md` §10）+ store ファクトリ変更（`createGameStore(save)`、7 フィールド化）+ GameCanvas の復元と write-through + リセットボタン（`04-ui.md` §3.2）。スキーマは最初から碑文 id と `audioMuted` を含む（M10 / M12 での v2 移行を避ける — それまで各フィールドは空配列 / false のまま動く）。

- `parseSave` / `serializeSave` / `createPersistence` + ユニットテスト（`06-test-plan.md` §4）
- store: `discoveredInscriptionIds` / `audioMuted` フィールドと `discoverInscription` / `setAudioMuted` アクション（UI 連動は M10 / M12）
- 復元ブレイジャーは点灯イーズなしで即時フル半径（`02-game-design.md` §11）

**検証**:
- `pnpm test` / `pnpm check` が green
- クリスタル取得 + ブレイジャー点灯 → リロードで HUD とワールドが保持される
- DevTools で localStorage の JSON を手動で破壊 → リロードでクラッシュせず新規開始
- リセットボタンの 2 段階確認 → 初期状態に戻る。armed 状態が `RESET_ARMED_DURATION_MS` で自動解除される
- stuck key・メニューポーズ等の既存挙動に回帰がない

## M10 — サウンド

**スコープ**: `src/audio.ts` 新規（`03-reference.md` §6.4 / §9、`01-architecture.md` §9、`02-game-design.md` §12）+ `equalPowerGains`（gameLogic + テスト）+ Settings の Sound トグル（`04-ui.md` §3.2、ミュートのセーブ連動）。

**検証**（手動）:
- ページロード直後は完全に無音で、コンソールに autoplay 警告が出ない。最初のキー入力/タップでアンビエントが始まる
- バイオーム境界を往復すると、色の変化と同じ帯域で音が滑らかにクロスフェードする
- 取得チャイム・点灯スウェルが鳴る（碑文ベルは M12 で確認）
- ミュートトグルが即時効き、リロード後も保持される。メニューを開いてもアンビエントが途切れない
- `pnpm check` / `pnpm test` が green

## M11 — ウィスプと光る草

**スコープ**: `Wisp` / `GlowPlant`（`03-reference.md` §1.2 / §4.4、`02-game-design.md` §13.1 / §13.2）+ `proximityGlow01`（gameLogic + テスト）+ reduced-motion マトリクスの新規 2 行 + `plantForest` / `plantCave` スプライトの実描画確認。state・セーブ・UI 変更なし。

**検証**（手動）:
- ウィスプが漂い、近づくとゆるやかに寄ってきて、離れると徘徊に戻る（急な動きがない）
- 光る草が近接で明るくなり、離れても微光が残る
- reduced-motion ON: ウィスプが消え、草のグローは効いたまま（`02-game-design.md` §9）
- plant スプライトを置くと差し替わる（グローは背後に残る）
- 5 分放置ソークでパーティクル上限・FPS が安定
- `pnpm check` / `pnpm test` が green

## M12 — 碑文と Journal

**スコープ**: `INSCRIPTIONS`（`03-reference.md` §4.5、`02-game-design.md` §13.3）+ 近接表示（エッジトリガー）+ 発見イベント（store + セーブ + ベル）+ Journal の碑文欄（`04-ui.md` §3.1）+ `inscription` スプライト確認。

**検証**（手動）:
- 石碑に近づくと詩文が表示され、離れて再訪すると再表示される。発見イベント（Journal 追加・セーブ・ベル）は初回のみ
- Journal に発見済みの詩文が並び、未発見は "…" のロック行。集計が `n / 6` で一致
- リロード後も発見済み碑文が保持される
- reduced-motion ON で碑文テキストがその場フェードになる
- `pnpm check` / `pnpm test` が green

## M13 — Phase 2 出荷チェック

**スコープ**: 新規コードなし。ビルドと総合 QA のみ。

**検証**:
- `pnpm check` / `pnpm test` が green
- `pnpm build && pnpm preview` が成功し、preview で全機能が動く
- `07-verification-checklist.md` の §11〜§15 を全項目実施（§15 は素材を置いた状態での Phase 1 全回帰を含む）
