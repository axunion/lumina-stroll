# 01. アーキテクチャ契約

このドキュメントは状態管理・データフロー・ライフサイクル・ビルド設定の「正」である。ここに書かれた依存方向とリアクティビティ規則は **厳守**（要件で "IMPORTANT — follow exactly" と指定された契約）。

## 1. ファイル構成と責務

| ファイル | 責務 |
|---|---|
| `src/gameStore.ts` | UI 向け共有リアクティブストア。`GameState` と `Biome` 等の型定義もここ。 |
| `src/gameLogic.ts` | DOM 非依存の純粋関数群（一覧は `03-reference.md` §6.1 が正）。Vitest（node 環境）でテスト可能にするための分離。 |
| `src/GameCanvas.tsx` | Canvas レンダーループ。フレーム毎の全状態（プレイヤー座標・パーティクル・入力）を所有。モバイル D-pad の JSX もここ（§4）。 |
| `src/GameUI.tsx` | Kobalte ベースのオーバーレイ UI（HUD / Dialog / Tabs）。表示専用 + 設定の書き戻し + リセット操作のみ。 |
| `src/assets.ts` | スプライト定義（`SPRITE_DEFS`）・ロード・アンカー計算。非リアクティブ。ライフサイクルは §8。 |
| `src/persistence.ts` | セーブスナップショットの所有・シリアライズ・localStorage 入出力。`StorageLike` を引数注入（テスト用）。ライフサイクルは §10。 |
| `src/audio.ts` | Web Audio ノードグラフの生成と操作。非リアクティブなモジュールシングルトン。純粋なパラメータ計算（`equalPowerGains`）は gameLogic に置く。ライフサイクルは §9。 |
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
   │        discoverInscription(id)             gameState.discoveredInscriptionIds
   │                                                   │
   └───────────────────────────────────────────────────┘
        reads gameState.isMenuOpen (pause)         setMenuOpen()
        reads gameState.reducedMotion              setReducedMotion()
                                                   setAudioMuted()

             write-through on the same discrete events
GameCanvas ────────────────────▶  persistence  ◀──────────────────  GameUI
            markCrystalCollected(id)              setAudioMuted() / clear()
            markBrazierLit(id)                          │
            markInscriptionDiscovered(id)               │ initial (boot)
                                                        ▼
                                                    gameStore
```

- **GameCanvas → gameStore**: 離散イベント発生時のみアクション関数を呼ぶ。
- **gameStore → GameUI**: GameUI は表示のために読むだけ。
- **GameUI → gameStore**: 書き戻しは `setMenuOpen` / `setReducedMotion` / `setAudioMuted` の 3 つのみ。
- **gameStore → GameCanvas**: `isMenuOpen`（ポーズ判定）と `reducedMotion` を rAF ループ内で読む（untracked、§3）。
- **persistence への書き込み**: gameStore のアクションは persistence に触れない（store を純粋に保ちテストを単純にする）。write-through は **id 情報を持つ発生源** が行う — 進捗系（取得・点灯・発見）は GameCanvas、`audioMuted` とリセット（`clear`）は GameUI。
  - 決定の記録: クリスタル/ブレイジャーの id は canvas ローカル配列にしか存在せず、store は集計数しか持たない。セーブスナップショット全体を組み立てられる単一の場所がないため、persistence がスナップショットを所有し、各発生源が差分を書き込む形にする。
- **persistence → gameStore**: 起動時に 1 回だけ `persistence.initial` を `createGameStore(save)` に渡す（`03-reference.md` §5）。GameCanvas もワールド配列の復元に `persistence.initial` を読む（§10）。
- **audio**: GameCanvas（ワンショット・ベッドのクロスフェード）と GameUI（`setMuted`）から呼ぶ一方向の出口。audio は store を読まない。ミュートはマスターゲインで一元処理されるため、GameCanvas はワンショットを鳴らす際に `audioMuted` を気にしなくてよい。

## 3. リアクティビティ規則（最重要）

### 3.1 Signal に置くもの / 置かないもの

- **store（Signal）に置くもの**: UI 表示用の状態 **のみ**。契約どおり **ちょうど 7 フィールド**: `crystalsCollected` / `litBraziersCount` / `currentBiome` / `isMenuOpen` / `reducedMotion` / `discoveredInscriptionIds` / `audioMuted`。フィールドの追加は禁止。
  - ポーズ状態は `isMenuOpen` から導出する（独立フィールドを作らない）。
  - クリスタル総数・ブレイジャー総数・碑文総数は `03-reference.md` のワールドデータから導出される定数であり、state にしない。
  - `discoveredInscriptionIds` が id 配列なのは Journal が詩文本文を表示するため（集計数では足りない）。クリスタル/ブレイジャーは集計数のままとする。
- **plain な mutable ローカル変数（GameCanvas 内）に置くもの**: フレーム毎に変わる値すべて。プレイヤー x/y・速度・カメラ・パーティクル配列・フローティングテキスト配列・入力キー Set・D-pad フラグ・クリスタル/ブレイジャー/光る草/ウィスプのワールド配列・碑文の近接前回値と発見済み id の `Set<number>`（`persistence.initial` から seed — §10）・前フレーム時刻・biome の前回値。**これらを Signal にしてはならない**（再レンダーストーム防止）。
- **Signal にしないもの（新モジュール）**: `SpriteMap` の `HTMLImageElement`・Web Audio の各ノード・セーブスナップショットは、それぞれ assets / audio / persistence が plain なモジュール内オブジェクトとして持つ。リアクティブにしない。

### 3.2 Signal 更新のタイミング

Signal 更新（= store アクション呼び出し）は離散イベント発生時のみ:

1. クリスタル取得 → `collectCrystal()` + `persistence.markCrystalCollected(id)`
2. ブレイジャー点灯 → `lightBrazier()` + `persistence.markBrazierLit(id)`
3. バイオーム境界越え → `biomeIdAt(player.x)` を毎フレーム計算し、**ローカルに保持した前回値と比較して変化した時だけ** `setCurrentBiome(next)` を呼ぶ。
4. 碑文の初回発見 → `discoverInscription(id)` + `persistence.markInscriptionDiscovered(id)`
5. ミュート切替（GameUI） → `setAudioMuted(muted)` + `persistence.setAudioMuted(muted)` + `audio.setMuted(muted)`

### 3.3 store の構造

`createRoot` 内で `createStore` を使い、読み取り専用 state とアクション関数を export する:

```ts
// gameStore.ts — shape only; exact types and initial values live in 03-reference.md
import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { persistence } from './persistence'

export function createGameStore(save: SaveDataV1 | null) {
  const [state, setState] = createStore<GameState>(initialState(save))
  return {
    gameState: state, // consumers must not receive setState
    collectCrystal: () => setState('crystalsCollected', (n) => n + 1),
    lightBrazier: () => setState('litBraziersCount', (n) => n + 1),
    setCurrentBiome: (biome: BiomeId) => setState('currentBiome', biome),
    setMenuOpen: (open: boolean) => setState('isMenuOpen', open),
    setReducedMotion: (reduced: boolean) => setState('reducedMotion', reduced),
    discoverInscription: (id: number) =>
      setState('discoveredInscriptionIds', (ids) => (ids.includes(id) ? ids : [...ids, id])),
    setAudioMuted: (muted: boolean) => setState('audioMuted', muted),
  }
}

export const {
  gameState, collectCrystal, lightBrazier, setCurrentBiome,
  setMenuOpen, setReducedMotion, discoverInscription, setAudioMuted,
} = createRoot(() => createGameStore(persistence.initial))
```

- アクション関数は Signal を書くだけで、persistence には触れない（write-through は発生源の責務 — §2）。`createGameStore` はテスト用にも export する（`06-test-plan.md` §1）。

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
  3. persistence.initial からワールド配列を復元（§10）
  4. loadSprites(sprites) を fire-and-forget で開始（§8）
  5. resize handler 登録 + 初回実行（§5.1）
  6. keydown / keyup / blur リスナー登録（window）
  7. audio のジェスチャー起動リスナー登録（§9 — keydown / pointerdown、once）
  8. requestAnimationFrame(loop) 開始

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
- [ ] **`Image.decode()` の reject を必ず catch する** — 未配置素材の 404 で unhandled rejection を出さない（§8）。
- [ ] **`AudioContext` の生成・`resume()` はユーザージェスチャーのハンドラー内で行う** — それ以外では autoplay 制限で suspended のままになる（§9）。
- [ ] **localStorage へのアクセスはすべて try-catch** — Safari プライベートモードは `setItem` が、環境によっては `window.localStorage` への参照自体が throw する（§10）。
- [ ] **`JSON.parse` は try-catch** — 破損セーブで絶対にクラッシュしない（`03-reference.md` §8）。
- [ ] **復元したブレイジャーの `litAt` はイーズ完了済みとして扱う** — 起動直後に点灯アニメーションを再生しない（`02-game-design.md` §11）。

## 8. アセットライフサイクル

```
onMount（§5）:
  const sprites: SpriteMap = {}   // GameCanvas ローカルの plain object
  loadSprites(sprites)            // fire-and-forget — await しない

loadSprites（assets.ts — 03-reference.md §6.3）:
  SPRITE_DEFS の各 def について:
    img = new Image(); img.src = def.path
    img.decode()
      .then(() => { target[def.key] = img })   // 成功したものから順次登録
      .catch(() => {})                          // 404 / decode 失敗 → フォールバック続行
```

- **プログレッシブ差し替え**: ローディング画面は作らない。rAF ループは即座に始まり、各 render 関数は毎フレーム `sprites[key]` を見て、ロード済みになった素材から次のフレードで使い始める（`02-game-design.md` §10）。
- 未配置素材の 404 がブラウザコンソールのネットワークログに残るのは **許容**（`07-verification-checklist.md` §1）。事前に fetch で存在確認する複雑化はしない（YAGNI）。
- リトライ・キャッシュ無効化・動的リロードは作らない。素材の反映はページリロードで十分（受け入れ基準 — `02-game-design.md` §10）。

## 9. オーディオライフサイクル

```
onMount（§5）:
  window に keydown / pointerdown の once リスナーを登録
    → 発火時: audio.init()（AudioContext 生成 + resume + ベッド構築）に続けて
      呼び出し側が audio.setMuted(gameState.audioMuted) を呼ぶ
      （初期ミュートの反映。audio 自身は store を読まない — §2）

rAF ループ（update 内）:
  t = biomeBlendAt(player.x, ...)   // 色 lerp と同一の係数
  audio.setBiomeBlend(t)            // 毎フレーム呼んでよい。スロットルは audio 内部（03-reference.md §9.1）

離散イベント時:
  audio.playCollectChime() / playBrazierSwell() / playInscriptionBell()

GameUI（ミュートトグル時）:
  audio.setMuted(muted)             // マスターゲインをランプで 0 / 規定値（03-reference.md §9.1）に

onCleanup:
  ジェスチャーリスナーの remove（未発火の場合）。AudioContext は close しない（アプリと同寿命）
```

- `audio.init()` 前に呼ばれた操作関数（`setBiomeBlend` / ワンショット / `setMuted`）はすべて **無音の no-op**（内部で未初期化ガード）。
- ベッドは常時鳴らしっぱなしにし、クロスフェードのゲインだけを動かす（ノードの生成・破棄を繰り返さない）。
- メニュー中は update がスキップされるためワンショットは発生せず、ベッドはそのまま鳴り続ける（`02-game-design.md` §12 — 特別扱い不要）。

## 10. セーブライフサイクル

```
モジュール初期化（persistence.ts）:
  storage = try { window.localStorage } catch { undefined }
  persistence = createPersistence(storage, totals)
    → initial = parseSave(storage?.getItem(KEY), totals)   // 1 回だけ load + 検証

起動:
  gameStore  — createGameStore(persistence.initial)（§3.3。counts / ids の初期値を導出）
  GameCanvas — onMount で persistence.initial を読み、CRYSTALS / BRAZIERS のワールド
               配列に collected / lit を反映（brazier は litAt をイーズ完了済み扱いに）。
               碑文は INSCRIPTIONS 自体が readonly なので、発見済み id を plain ローカルの
               Set<number> に seed し、初回発見判定はこの Set で行う（store は読まない）

プレイ中:
  離散イベントごとに mutator を呼ぶ（§3.2）。各 mutator はスナップショットを更新して
  同期的に setItem する（write-through。デバウンス・フレーム毎書き込みはしない）

リセット（GameUI の 2 段階確認ボタン — 04-ui.md §3.2）:
  persistence.clear() → location.reload()
```

- 決定の記録: リロードによるリセットは、canvas ローカルのワールド配列・パーティクル・ウィスプを個別に初期化するイベント配線を作らずに済む最小手段。リセットは稀な操作であり、リロードのコストは問題にならない。
- セーブ量は最大でも数百バイト（id 配列 3 本 + boolean）。同期 `setItem` で性能問題は起きない。
