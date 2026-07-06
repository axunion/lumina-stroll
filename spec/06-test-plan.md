# 06. テスト計画（Vitest）

## 1. 方針

- ランナー: Vitest（設定は `vite.config.ts` の `test` ブロック — `01-architecture.md` §6.1）。`environment: 'node'`、DOM モックフレームワークは使わない。
- 対象: **純粋ロジックと store アクションのみ**。テスト可能にするための分離が `src/gameLogic.ts` の存在理由（`01-architecture.md` §1）。
- 配置: 実装ファイルの隣に `*.test.ts`（`src/gameLogic.test.ts`、`src/gameStore.test.ts`）。
- 各テストは自己完結。テスト間で mutable state を共有しない。
  - 注意: `gameStore.ts` はモジュールシングルトンなので、store テストは `createGameStore` 相当のファクトリを直接テストできるよう、ファクトリ関数を export する（`export function createGameStore()` — 内部でも `createRoot(createGameStore)` に使う同一関数）。各テストで新しいインスタンスを作る。
- 観測可能な結果をテストする（実装詳細・内部表現はテストしない）。

## 2. テストケース一覧（`gameLogic.test.ts`）

### lerp / lerpColor
1. `lerp(a, b, 0)` は `a`、`lerp(a, b, 1)` は `b` を返す
2. `lerp(0, 10, 0.5)` は `5` を返す
3. `lerpColor` は各チャンネルを独立に補間する（端点と中点）

### smoothstep01
4. `t <= 0` で `0`、`t >= 1` で `1` にクランプされる
5. `smoothstep01(0.5)` は `0.5`（対称性）

### distSq / isWithinRadius
6. `distSq` が距離の平方を返す（3-4-5 の三角形で 25）
7. `isWithinRadius` は境界ちょうど（`dist === radius`）で `true`（当たり判定は inclusive と定義）
8. `isWithinRadius` は半径超過で `false`

### clampDelta
9. `maxMs` 以下の値はそのまま返す
10. `maxMs` を超える値は `maxMs` に切り詰める

### biomeBlendAt / biomeIdAt
11. ブレンド帯の左端より左で `0`、右端より右で `1`
12. `biomeBlendAt(boundaryX, ...)` は `0.5`（境界中央）
13. `biomeIdAt` は `x < boundaryX` で `'enchantedForest'`、`x >= boundaryX` で `'crystalCave'`

### detectReducedMotion
14. `matches: true` を返す matchMedia 互換関数を注入すると `true`
15. `matches: false` なら `false`
16. `undefined`（SSR / 非対応環境）なら `false`

## 3. テストケース一覧（`gameStore.test.ts`）

17. 初期状態が `03-reference.md` §5 の初期値と一致する（counts 0 / `'enchantedForest'` / menu closed）
18. `collectCrystal()` を 2 回呼ぶと `crystalsCollected` が `2`
19. `lightBrazier()` で `litBraziersCount` が加算される
20. `setCurrentBiome('crystalCave')` で `currentBiome` が変わる
21. `setMenuOpen` / `setReducedMotion` が対応フィールドだけを変え、他のフィールドに影響しない

## 4. スコープ外（意図的な非対象）

以下はテストしない。省略ではなく決定である。

- Canvas 描画（ピクセル検証・レンダリングスナップショット）
- Solid コンポーネントのレンダーテスト（GameCanvas / GameUI / App）
- Kobalte のフォーカス管理・aria（ライブラリの責務。手動 QA — `07-verification-checklist.md` — で確認）
- E2E テスト

理由: このプロジェクトの規模でこれらの自動化はコストが利益を上回る。挙動の確認は `05-roadmap.md` の各マイルストーン検証と最終チェックリストで担保する。
