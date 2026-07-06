# 05. 実装ロードマップ

マイルストーン M0〜M7 を順に実装する。各マイルストーンは **検証が通ってから** 次へ進む（CLAUDE.md の Goal-driven 方針）。コミットはマイルストーン単位を推奨。

検証コマンドの前提: `pnpm check`（biome + tsc）/ `pnpm test`（vitest）/ `pnpm dev` / `pnpm build && pnpm preview`。

---

## M0 — ツーリングとスキャフォールド掃除

**スコープ**: ビルド設定を要件に合わせ、テンプレート残骸を消す。

- `vite.config.ts` を `01-architecture.md` §6.1 の最終形に置換
- `src/vite-env.d.ts` を新規作成（§6.2。重複エラー時はフォールバック規則に従う）
- スキャフォールド掃除（`01-architecture.md` §1 の掃除リスト）
- `src/App.tsx` を空の `appRoot` div だけの仮実装に置換、`index.html` のタイトル変更

**検証**:
- `pnpm check` が green
- `pnpm dev` でエラーなくダーク背景の空ページが表示される

## M1 — gameStore + gameLogic + ユニットテスト

**スコープ**: `src/gameStore.ts`・`src/gameLogic.ts` と、そのテスト（`06-test-plan.md` の全ケース）。

- 型・初期値・store API は `03-reference.md` §1 / §5 のとおり
- `gameLogic.ts` の関数は `03-reference.md` §6 のシグネチャどおり
- テストを先に（または並行して）書く

**検証**:
- `pnpm test` が green（06 のテストがすべて存在し通過）
- `pnpm check` が green

## M2 — Canvas 骨格（ループ・リサイズ・移動）

**スコープ**: `src/GameCanvas.tsx` の土台。CONFIG オブジェクト、onMount/onCleanup、DPR 対応リサイズ、delta クランプ付き rAF ループ、update/render 分離、タイル背景（まだ単色ブレンドなしで可）、カメラ、キーボード移動、プレイヤー描画。

**検証**（手動、`pnpm dev`）:
- 矢印キーと WASD の両方で移動できる。斜め移動が速くない
- 矢印キーでページがスクロールしない。Cmd/Ctrl+キーのブラウザショートカットは生きている
- ウィンドウリサイズ・ブラウザズーム後も描画が crisp（にじまない）
- ワールド端で止まり、カメラがワールド外を映さない
- タブを離れて戻ってもワープしない（delta クランプ）

## M3 — ライティング + バイオーム lerp

**スコープ**: offscreen light canvas（`02-game-design.md` §4）、プレイヤー光 + パルス、バイオーム色ブレンド（§8）、`setCurrentBiome` の離散発火。

**検証**（手動）:
- 画面が暗幕で覆われ、プレイヤー周囲だけ柔らかく見える
- x=2400 付近を歩くと背景色が **滑らかに** 森 → 洞窟に変わる（ハードスワップなし）
- 境界を往復しても色が跳ねない
- （一時的に console.log で）`setCurrentBiome` が境界越えの瞬間に 1 回だけ呼ばれる

## M4 — GameUI（HUD / Dialog / Tabs / ポーズ）

**スコープ**: `src/GameUI.tsx`・`src/Game.module.css`・`src/App.tsx` の合成。`04-ui.md` の全構造。メニュー中の update スキップとキー Set クリア。

**検証**（手動）:
- HUD に 0/14・0/6・"Enchanted Forest" が表示される
- Settings ボタンでメニューが開き、フォーカスがダイアログ内にトラップされる
- メニュー中は移動が止まる。Escape で閉じる。**移動キーを押したまま Escape で閉じても歩き続けない**（stuck key）
- Tab キーでダイアログ内を巡回でき、閉じると Settings ボタンにフォーカスが戻る

## M5 — エンティティ（クリスタル / ブレイジャー / パーティクル）

**スコープ**: ワールドデータ配置（`03-reference.md` §4）、クリスタル（ボブ・取得・burst・"+1"）、ブレイジャー（近接点灯・イーズイン・恒久光・炎）、footprint・ambient パーティクル、HUD カウンター連動。

**検証**（手動）:
- クリスタルに触れると burst + "+1" が出て HUD が +1 される。**同じクリスタルで 2 回加算されない**。再訪しても復活しない
- ブレイジャーに近づくと自動点灯し、離れても点いたまま。その一帯が明るいまま残る。HUD の Flame カウントが +1
- 移動中だけ足跡が残り、止まると出ない
- Journal タブの集計が HUD と一致する

## M6 — reduced-motion + モバイル D-pad + 仕上げ

**スコープ**: `02-game-design.md` §9 のマトリクス全行、D-pad（`04-ui.md` §4）、Dialog アニメーション無効化（§6）。

**検証**（手動）:
- Settings のトグルを ON にして、マトリクスの各行を 1 つずつ目視確認する
- DevTools の Rendering → `prefers-reduced-motion: reduce` をエミュレートしてリロードすると、トグルが最初から ON
- DevTools のデバイスエミュレーション（touch）で D-pad が表示され、押している間だけ移動する。デスクトップ（fine pointer）では非表示

## M7 — 出荷チェック

**スコープ**: 新規コードなし。ビルドと総合 QA のみ。

**検証**:
- `pnpm check` / `pnpm test` が green
- `pnpm build && pnpm preview` が成功し、preview で全機能が動く
- `07-verification-checklist.md` を全項目実施してすべてチェック
