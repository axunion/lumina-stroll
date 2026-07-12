# 06. テスト計画（Vitest）

## 1. 方針

- ランナー: Vitest（設定は `vite.config.ts` の `test` ブロック — `01-architecture.md` §6.1）。`environment: 'node'`、DOM モックフレームワークは使わない。
- 対象: **純粋ロジック・store アクション・セーブのシリアライズ/検証のみ**。テスト可能にするための分離が `src/gameLogic.ts` と `src/persistence.ts` の純粋関数部の存在理由（`01-architecture.md` §1）。
- 配置: 実装ファイルの隣に `*.test.ts`（`src/gameLogic.test.ts`、`src/gameStore.test.ts`、`src/persistence.test.ts`、`src/assets.test.ts`）。
- 各テストは自己完結。テスト間で mutable state を共有しない。
  - 注意: `gameStore.ts` はモジュールシングルトンなので、store テストは export された `createGameStore(save)` ファクトリを直接テストする（`03-reference.md` §5）。各テストで新しいインスタンスを作る。
  - 注意: `persistence` のシングルトンではなく `createPersistence(storage, totals)` に **インメモリの `StorageLike` スタブ** を注入してテストする（DOM モック不要）。
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

### proximityGlow01
17. `distSq <= innerRadius²` で `1`
18. `distSq >= outerRadius²` で `0`
19. inner と outer の中間で 0 と 1 の間の値を返し、距離に対して単調減少

### equalPowerGains
20. `t = 0` で `{ a: 1, b: 0 }`、`t = 1` で `{ a: 0, b: 1 }`（浮動小数の許容誤差内）
21. 任意の `t`（例: 0.25 / 0.5 / 0.75）で `a² + b² ≈ 1`
22. `t` が範囲外（`-1` / `2`）でも [0,1] にクランプされる

## 3. テストケース一覧（`gameStore.test.ts`）

23. `createGameStore(null)` の初期状態が `03-reference.md` §5 の初期値と一致する（counts 0 / `'enchantedForest'` / menu closed / 空の碑文配列 / `audioMuted: false`）
24. `collectCrystal()` を 2 回呼ぶと `crystalsCollected` が `2`
25. `lightBrazier()` で `litBraziersCount` が加算される
26. `setCurrentBiome('crystalCave')` で `currentBiome` が変わる
27. `setMenuOpen` / `setReducedMotion` / `setAudioMuted` が対応フィールドだけを変え、他のフィールドに影響しない
28. `discoverInscription(id)` で id が追加される。**同じ id を再度呼んでも増えない（冪等）**
29. セーブを渡した `createGameStore(save)` が初期値を導出する（`crystalsCollected = collectedCrystalIds.length` 等、`audioMuted` 反映）

## 4. テストケース一覧（`persistence.test.ts`）

`totals` は `{ crystals: 14, braziers: 6, inscriptions: 6 }` を使う（`03-reference.md` §4.6）。

### parseSave / serializeSave（純粋関数）
30. `serializeSave` → `parseSave` のラウンドトリップで同値が戻る
31. `null` / 破損 JSON（`'{oops'`）で `null`
32. `version` が `1` 以外（`2`・欠落・文字列）で `null`
33. id フィールドのいずれかが配列でない（`null`・数値・オブジェクト）で `null`
34. id 配列内の範囲外（`0`・`15`）・非整数（`1.5`・`'3'`）・重複は **要素だけ捨てられ**、残りは生きる
35. `audioMuted` が boolean でない場合は `false` に落ちる

### createPersistence（StorageLike スタブ注入）
36. `storage` が `undefined` → `initial` は `null`、全 mutator が throw せず no-op
37. mutator（`markCrystalCollected` 等）が呼ばれるたびに `setItem` され、保存内容を `parseSave` すると反映されている。同じ id の再呼び出しで重複しない（冪等）
38. `setItem` が throw するスタブ（quota / プライベートモード相当）でも mutator が throw しない
39. `clear()` で `removeItem` が呼ばれる

## 5. テストケース一覧（`assets.test.ts`）

`spriteDrawOrigin`（純粋関数）のみ対象:

40. `center`: `(x - drawWidth/2, y - drawHeight/2)`
41. `topLeft`: `(x, y)`
42. `bottomCenter`: `(x - drawWidth/2, y - drawHeight)`

## 6. スコープ外（意図的な非対象）

以下はテストしない。省略ではなく決定である。

- Canvas 描画（ピクセル検証・レンダリングスナップショット）— `drawImage` の出力を含む
- Solid コンポーネントのレンダーテスト（GameCanvas / GameUI / App）
- Kobalte のフォーカス管理・aria（ライブラリの責務。手動 QA — `07-verification-checklist.md` — で確認）
- 画像のロード・decode（`loadSprites`）— ブラウザ実装の責務。差し替え・フォールバックは手動 QA（`07-verification-checklist.md` §11）
- Web Audio のノードグラフ（`audio.ts`）— 音は聴いて確認するもの。純粋なゲイン計算だけ `equalPowerGains` として切り出してテストする
- 実ブラウザの localStorage — `StorageLike` スタブで代替（実環境の挙動は `07-verification-checklist.md` §12）
- E2E テスト

理由: このプロジェクトの規模でこれらの自動化はコストが利益を上回る。挙動の確認は `05-roadmap.md` の各マイルストーン検証と最終チェックリストで担保する。
