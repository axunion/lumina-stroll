# 01. アーキテクチャ契約

このドキュメントは状態管理・データフロー・ライフサイクル・ビルド設定の「正」である。ここに書かれた依存方向とリアクティビティ規則は **厳守**（要件で "IMPORTANT — follow exactly" と指定された契約）。

## 1. ファイル構成と責務

| ファイル | 責務 |
|---|---|
| `src/gameStore.ts` | UI 向け共有リアクティブストア。`GameState` と `Biome` 等の型定義もここ。 |
| `src/gameLogic.ts` | **（契約への唯一の拡張・追加提案）** DOM 非依存の純粋関数群。`lerp` / `lerpColor` / `smoothstep01` / `distSq` / `isWithinRadius` / `biomeBlendAt` / `biomeIdAt` / `clampDelta` / `detectReducedMotion`。Vitest（node 環境）でテスト可能にするための分離。 |
| `src/GameCanvas.tsx` | Canvas レンダーループ。フレーム毎の全状態（プレイヤー座標・パーティクル・入力）を所有。モバイル D-pad の JSX もここ（§4）。 |
| `src/GameUI.tsx` | Kobalte ベースのオーバーレイ UI（HUD / Dialog / Tabs）。表示専用 + 設定の書き戻しのみ。 |
| `src/Game.module.css` | レイアウト・HUD・Kobalte オーバーライド・テーマ色。 |
| `src/App.tsx` | GameCanvas + GameUI を合成するだけの最小エントリー。 |
| `src/vite-env.d.ts` | CSS Modules の型宣言（§6）。 |

### スキャフォールド掃除リスト（M0 で実施）

- 削除: `src/App.css`、`src/assets/`（hero.png / solid.svg / vite.svg）、`public/icons.svg`
- `src/index.css` は最小リセット + 全画面表示のみに置換（`html, body, #root { height: 100% }`、`margin: 0`、`overflow: hidden`、ダーク背景色）
- `src/App.tsx` はテンプレート内容を全削除して置換
- `index.html` の `<title>` を "Lumina Stroll" に変更

## 2. データフロー（依存方向）

```
             discrete events                    read for display
GameCanvas ────────────────────▶  gameStore  ────────────────────▶  GameUI
   ▲        collectCrystal()                    gameState.crystalsCollected
   │        lightBrazier()                      gameState.litBraziersCount
   │        setCurrentBiome()                   gameState.currentBiome
   │                                                   │
   └───────────────────────────────────────────────────┘
        reads gameState.isMenuOpen (pause)         setMenuOpen()
        reads gameState.reducedMotion              setReducedMotion()
```

- **GameCanvas → gameStore**: 離散イベント発生時のみアクション関数を呼ぶ。
- **gameStore → GameUI**: GameUI は表示のために読むだけ。
- **GameUI → gameStore**: 書き戻しは `setMenuOpen` / `setReducedMotion` の 2 つのみ。
- **gameStore → GameCanvas**: `isMenuOpen`（ポーズ判定）と `reducedMotion` を rAF ループ内で読む（untracked、§3）。

## 3. リアクティビティ規則（最重要）

### 3.1 Signal に置くもの / 置かないもの

- **store（Signal）に置くもの**: UI 表示用の状態 **のみ**。契約どおり **ちょうど 5 フィールド**: `crystalsCollected` / `litBraziersCount` / `currentBiome` / `isMenuOpen` / `reducedMotion`。フィールドの追加は禁止。
  - ポーズ状態は `isMenuOpen` から導出する（独立フィールドを作らない）。
  - クリスタル総数・ブレイジャー総数は `03-reference.md` のワールドデータから導出される定数であり、state にしない。
- **plain な mutable ローカル変数（GameCanvas 内）に置くもの**: フレーム毎に変わる値すべて。プレイヤー x/y・速度・カメラ・パーティクル配列・フローティングテキスト配列・入力キー Set・D-pad フラグ・クリスタル/ブレイジャーのワールド配列・前フレーム時刻・biome の前回値。**これらを Signal にしてはならない**（再レンダーストーム防止）。

### 3.2 Signal 更新のタイミング

Signal 更新（= store アクション呼び出し）は離散イベント発生時のみ:

1. クリスタル取得 → `collectCrystal()`
2. ブレイジャー点灯 → `lightBrazier()`
3. バイオーム境界越え → `biomeIdAt(player.x)` を毎フレーム計算し、**ローカルに保持した前回値と比較して変化した時だけ** `setCurrentBiome(next)` を呼ぶ。

### 3.3 store の構造

`createRoot` 内で `createStore` を使い、読み取り専用 state とアクション関数を export する:

```ts
// gameStore.ts — shape only; exact types and initial values live in 03-reference.md
import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'

function createGameStore() {
  const [state, setState] = createStore<GameState>(initialState())
  return {
    gameState: state, // consumers must not receive setState
    collectCrystal: () => setState('crystalsCollected', (n) => n + 1),
    lightBrazier: () => setState('litBraziersCount', (n) => n + 1),
    setCurrentBiome: (biome: BiomeId) => setState('currentBiome', biome),
    setMenuOpen: (open: boolean) => setState('isMenuOpen', open),
    setReducedMotion: (reduced: boolean) => setState('reducedMotion', reduced),
  }
}

export const { gameState, collectCrystal, lightBrazier, setCurrentBiome, setMenuOpen, setReducedMotion } =
  createRoot(createGameStore)
```

- `setState` は export しない。書き込みは必ずアクション関数経由。
- `reducedMotion` の初期値はモジュール初期化時に `detectReducedMotion(...)`（gameLogic）で 1 回だけ `matchMedia('(prefers-reduced-motion: reduce)')` を読んで決める。**以後はライブリスナーを張らず、設定トグルが値を所有する**（セッション中に OS 設定を変えても追従しない — 意図的な決定）。

### 3.4 rAF 内での store 読み取りは untracked（意図的）

`gameState.isMenuOpen` / `gameState.reducedMotion` を rAF コールバック内で読むのはリアクティブスコープ外の読み取りであり、追跡されない。**これはバグではなく設計**: ループは毎フレーム走るので、次フレームで最新値を読めば十分。`createEffect` でループへ値をコピーする仕組みを作ってはならない。

## 4. 入力の所有権

- キーボード入力（`window` の keydown/keyup）と **モバイル D-pad の JSX** は GameCanvas.tsx が所有する。GameCanvas が返すのは `<div class={styles.canvasWrapper}>` で、その中に `<canvas>` と D-pad ボタン群を置く。
- 理由: 入力はフレーム毎の高频度状態であり、store（UI 状態専用）にも GameUI（表示専用）にも流してはならない。ファイルをまたぐ mutable シングルトンも作らない。
- GameUI は入力を扱わない。設定メニューの開閉のみ（`setMenuOpen`）。

## 5. Canvas ライフサイクル

```
onMount:
  1. canvas.getContext('2d') — null なら return（SSR / 未対応環境ガード）
  2. offscreen light canvas を生成（document.createElement('canvas')）
  3. resize handler 登録 + 初回実行（§5.1）
  4. keydown / keyup / blur リスナー登録（window）
  5. requestAnimationFrame(loop) 開始

loop(now):
  rafId = requestAnimationFrame(loop)
  dt = clampDelta(now - lastTime, CONFIG.maxDeltaMs); lastTime = now
  if (!gameState.isMenuOpen) update(dt)   // メニュー中は update スキップ
  render()                                 // 描画は常に行う（リサイズ後の再描画のため）

onCleanup:
  cancelAnimationFrame(rafId)
  すべてのリスナー（resize / keydown / keyup / blur / D-pad の pointer 系）を remove
```

- `update(dt)` と `render()` は分離する。update は状態変更のみ、render は描画のみ。
- delta-time ベース移動（`px/s × dt秒`）。フレームレート非依存。タブ復帰時の巨大 delta は `clampDelta` で `CONFIG.maxDeltaMs` に抑える。

### 5.1 devicePixelRatio 対応リサイズ

```ts
function handleResize() {
  const dpr = window.devicePixelRatio || 1
  const { clientWidth, clientHeight } = wrapper
  canvas.width = clientWidth * dpr
  canvas.height = clientHeight * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // resize the offscreen light canvas identically (same size, same transform)
}
```

- 以後の描画コードはすべて CSS px 単位で書ける。
- offscreen light canvas も **同じハンドラー内で** 同サイズにリサイズする（忘れると点灯がぼやける／ずれる）。

## 6. ビルド設定の変更

### 6.1 `vite.config.ts`（最終形）

```ts
import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- `defineConfig` を `vitest/config` から import するのは `test` ブロックの型を通すため（vite の `defineConfig` では型エラーになる）。
- `camelCaseOnly` によりケバブケースのクラス名も camelCase でのみアクセス可能になる（CSS は最初から camelCase で書く — `04-ui.md` §5）。

### 6.2 `src/vite-env.d.ts`（新規作成）

```ts
/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
```

- 注意: `vite/client` 自体にも `*.module.css` の宣言が含まれる。明示宣言が原因で重複エラーが出た場合のフォールバック規則: **reference 行だけ残して明示宣言を削除**し、`pnpm check` が通ることを確認する。

## 7. 落とし穴付録（実装時チェックリスト）

- [ ] **Solid の props / store を分割代入しない** — リアクティビティが切れる。常に `props.x` / `gameState.x` で読む。
- [ ] **rAF 内の store 読み取りは untracked で正しい**（§3.4）— effect でブリッジしない。
- [ ] **Kobalte Dialog は `<body>` に Portal する** — canvas との重なりは z-index 計画（`04-ui.md` §1）で管理。Dialog 内スタイルはグローバルでなく `class={styles.x}` を各パーツに渡す。
- [ ] **メニューが開いたら押下キー Set を clear する** — Dialog のフォーカストラップで keyup が canvas に届かず「押しっぱなし」状態が残る（Escape で閉じた瞬間に歩き出す stuck key バグ）。`isMenuOpen` が true になるのを検知した update 冒頭、または keydown ハンドラーで対処。
- [ ] **`preventDefault` は矢印キーのみ**（ページスクロール防止）。WASD には呼ばない。また `e.metaKey || e.ctrlKey || e.altKey` の時は何もしない（ブラウザショートカットを壊さない）。
- [ ] **`window` の `blur` で押下キー Set を clear** — タブ切替中の keyup 取りこぼし対策。
- [ ] **Escape の処理を自前実装しない** — Kobalte が `onOpenChange(false)` を呼ぶ。canvas 側の keydown は `gameState.isMenuOpen` 中は early return。
- [ ] **lucide-solid はアイコン個別パスで import** — `import Sparkles from 'lucide-solid/icons/sparkles'`（バレル import は dev サーバーが重くなり、tree-shaking も甘くなる）。
- [ ] **`verbatimModuleSyntax`** — 型のみの import は `import type { ... }` にする。
- [ ] **`erasableSyntaxOnly`** — `enum` 禁止（string union を使う）。コンストラクタの parameter properties 禁止。
- [ ] **`noUnusedLocals` / `noUnusedParameters`** — 未使用シンボルはビルドエラーになる。
- [ ] **`matchMedia` は store 初期化時に 1 回だけ読む**（§3.3）。
