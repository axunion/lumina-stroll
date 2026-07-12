# 03. リファレンス — 型・CONFIG・パレット・ワールドデータ

このドキュメントは **すべての数値・型・データの唯一の「正」** である。他ドキュメントと食い違ったら本書が勝つ。実装時はここからコピーすること。

## 1. 型定義

### 1.1 `gameStore.ts` に置く型（export する）

```ts
export type BiomeId = 'enchantedForest' | 'crystalCave'

export interface GameState {
  crystalsCollected: number
  litBraziersCount: number
  currentBiome: BiomeId
  isMenuOpen: boolean
  reducedMotion: boolean
  discoveredInscriptionIds: readonly number[]
  audioMuted: boolean
}

export type Rgb = readonly [number, number, number]

export interface Biome {
  id: BiomeId
  name: string
  startX: number
  background: Rgb
  tileAccent: Rgb
  ambientParticle: Rgb
  lightTint: Rgb
}

export interface Inscription {
  id: number
  x: number
  y: number
  text: string
}
```

`Inscription` を gameStore に置くのは、Journal タブ（GameUI）が詩文の表示に使うため（発見フラグは持たない — 発見状態は `GameState.discoveredInscriptionIds` が正）。

### 1.2 `GameCanvas.tsx` 内の非リアクティブ型（ローカル定義、export 不要）

```ts
interface Crystal {
  id: number
  x: number
  y: number
  collected: boolean
  phase: number // radians; per-crystal bob offset
}

interface Brazier {
  id: number
  x: number
  y: number
  lit: boolean
  litAt: number // ms timestamp (performance.now clock); 0 while unlit
}

interface Particle {
  x: number
  y: number
  vx: number // px/s
  vy: number // px/s
  bornAt: number
  lifetimeMs: number
  size: number // radius in px
  color: Rgb
  kind: 'footprint' | 'burst' | 'flame' | 'ambient'
}

interface FloatingText {
  x: number
  y: number
  text: string
  bornAt: number
}

interface Wisp {
  x: number
  y: number
  heading: number // radians; current drift direction, turns smoothly
  phase: number // radians; per-wisp offset for drift variation
}

interface GlowPlant {
  id: number
  x: number
  y: number
}
```

### 1.3 `src/assets.ts` に置く型（export する）

```ts
export type SpriteKey =
  | 'player'
  | 'crystal'
  | 'brazierUnlit'
  | 'brazierLit'
  | 'tileForest'
  | 'tileCave'
  | 'plantForest'
  | 'plantCave'
  | 'inscription'

export interface SpriteDef {
  key: SpriteKey
  path: string // e.g. '/assets/player.png' (served from public/)
  drawWidth: number // CSS px on canvas
  drawHeight: number // CSS px on canvas
  anchor: 'center' | 'topLeft' | 'bottomCenter'
}

export type SpriteMap = Partial<Record<SpriteKey, HTMLImageElement>>
```

### 1.4 `src/persistence.ts` に置く型（export する）

```ts
export interface SaveDataV1 {
  version: 1
  collectedCrystalIds: number[]
  litBrazierIds: number[]
  discoveredInscriptionIds: number[]
  audioMuted: boolean
}

export interface SaveTotals {
  crystals: number
  braziers: number
  inscriptions: number
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
```

## 2. CONFIG（`GameCanvas.tsx` 冒頭に単一オブジェクトとして定義）

| キー | 値 | 単位 | 意味 |
|---|---|---|---|
| `playerSpeed` | `220` | px/s | プレイヤー移動速度 |
| `playerRadius` | `12` | px | プレイヤー円の半径 |
| `lightRadius` | `180` | px | プレイヤー視界光の不透明コア半径 |
| `lightSoftness` | `120` | px | 光の縁のフェード幅（コア半径に加算） |
| `darknessAlpha` | `0.82` | 0–1 | 暗幕の濃さ |
| `brazierLightRadius` | `150` | px | 点灯ブレイジャーの恒久光半径 |
| `brazierProximity` | `70` | px | ブレイジャー自動点灯の距離 |
| `crystalPickupRadius` | `28` | px | クリスタル取得判定距離 |
| `particleLifetimeMs` | `1400` | ms | footprint パーティクル寿命 |
| `particleSpawnInterval` | `90` | ms | footprint スポーン間隔（移動中） |
| `burstParticleCount` | `18` | 個 | クリスタル取得バーストの個数 |
| `ambientParticleCount` | `60` | 個 | 常駐 ambient パーティクル数 |
| `maxParticles` | `400` | 個 | パーティクル総数上限（超過時はスポーン抑制） |
| `floatingTextDurationMs` | `900` | ms | "+1" テキストの表示時間 |
| `biomeBoundaryX` | `2400` | px | バイオーム切替の x しきい値 |
| `biomeBlendWidth` | `400` | px | 境界をまたぐ色ブレンド帯の幅 |
| `worldWidth` | `4800` | px | ワールド幅 |
| `worldHeight` | `1200` | px | ワールド高さ |
| `tileSize` | `64` | px | 背景タイルの一辺 |
| `maxDeltaMs` | `50` | ms | delta time の上限クランプ |
| `wispCount` | `5` | 体 | 常駐ウィスプの数 |
| `wispNoticeRadius` | `160` | px | ウィスプがプレイヤーに気づく距離 |
| `wispFollowSpeed` | `40` | px/s | 追従時のウィスプ速度 |
| `wispWanderSpeed` | `18` | px/s | 徘徊時のウィスプ速度 |
| `plantGlowInnerRadius` | `40` | px | 光る草が最大光量になる距離 |
| `plantGlowOuterRadius` | `140` | px | 光る草の光量が下限に落ちる距離 |
| `plantGlowFloor` | `0.15` | 0–1 | 光る草の明るさの下限（完全消灯しない） |
| `inscriptionProximity` | `60` | px | 碑文テキスト表示の距離 |
| `inscriptionTextDurationMs` | `4000` | ms | 碑文テキストの表示時間 |

各キーには実装時に上表の「意味」を英語コメントとして付ける。

### 2.1 GameUI 定数（`GameUI.tsx` ローカル）

| 定数 | 値 | 単位 | 意味 |
|---|---|---|---|
| `RESET_ARMED_DURATION_MS` | `4000` | ms | リセットボタンの armed 状態が自動解除されるまでの時間（`04-ui.md` §3.2） |

## 3. バイオーム定義とパレット

```ts
export const BIOMES: readonly Biome[] = [
  {
    id: 'enchantedForest',
    name: 'Enchanted Forest',
    startX: 0,
    background: [18, 38, 32],
    tileAccent: [24, 48, 40],
    ambientParticle: [180, 230, 160],
    lightTint: [255, 240, 200],
  },
  {
    id: 'crystalCave',
    name: 'Crystal Cave',
    startX: 2400, // == CONFIG.biomeBoundaryX
    background: [22, 20, 44],
    tileAccent: [30, 28, 58],
    ambientParticle: [150, 210, 255],
    lightTint: [210, 225, 255],
  },
] as const
```

### エンティティ色

| 対象 | Rgb |
|---|---|
| クリスタル本体 | `[140, 235, 255]` |
| 炎コア（根元） | `[150, 170, 255]` |
| 炎先端 | `[190, 120, 255]` |
| footprint パーティクル | プレイヤー光と同系: `[255, 240, 200]` |
| burst パーティクル | クリスタル本体色 `[140, 235, 255]` |
| "+1" テキスト | `[220, 245, 255]` |
| 暗幕 | 黒 `[0, 0, 0]`（alpha は `CONFIG.darknessAlpha`） |
| 光る草（Forest） | `[150, 230, 150]` |
| 光る草（Cave） | `[180, 150, 255]` |
| 碑文の石 | `[120, 130, 160]` |
| 碑文テキスト | "+1" テキストと同色 `[220, 245, 255]` |
| ウィスプ | 固有色なし（バイオームブレンド後の `ambientParticle` 色を使う） |

## 4. ワールドデータ（配置座標）

**決定: エンティティ配置はハードコードされたリテラル配列とする。** シード付き乱数による手続き配置は不採用（理由: 完全な決定性、個体ごとのチューニング可能性、simplest thing that works。要件の "procedural" は素材を使わないレンダリングを指し、配置生成を指さないと解釈）。

**制約: 各エンティティ種の id は 1 から始まる連番を維持する。** セーブの検証（§8）が「id は `1..total` の整数」という規則に依存しているため、歯抜け・飛び番を作らない。

### 4.1 プレイヤー初期位置

```ts
const PLAYER_SPAWN = { x: 240, y: 600 }
```

### 4.2 クリスタル（全 14 個: Forest 8 / Cave 6）

```ts
const CRYSTALS: Crystal[] = [
  // Enchanted Forest (x < 2400)
  { id: 1,  x: 420,  y: 380, collected: false, phase: 0.0 },
  { id: 2,  x: 700,  y: 820, collected: false, phase: 0.9 },
  { id: 3,  x: 1050, y: 300, collected: false, phase: 1.8 },
  { id: 4,  x: 1300, y: 640, collected: false, phase: 2.7 },
  { id: 5,  x: 1620, y: 950, collected: false, phase: 3.6 },
  { id: 6,  x: 1900, y: 420, collected: false, phase: 4.5 },
  { id: 7,  x: 2150, y: 760, collected: false, phase: 5.4 },
  { id: 8,  x: 2350, y: 260, collected: false, phase: 0.4 },
  // Crystal Cave (x >= 2400)
  { id: 9,  x: 2650, y: 540, collected: false, phase: 1.3 },
  { id: 10, x: 2980, y: 900, collected: false, phase: 2.2 },
  { id: 11, x: 3300, y: 350, collected: false, phase: 3.1 },
  { id: 12, x: 3700, y: 700, collected: false, phase: 4.0 },
  { id: 13, x: 4100, y: 980, collected: false, phase: 4.9 },
  { id: 14, x: 4500, y: 480, collected: false, phase: 5.8 },
]
```

### 4.3 ブレイジャー（全 6 個: 各バイオーム 3、うち 1 つは境界のランドマーク）

```ts
const BRAZIERS: Brazier[] = [
  // Enchanted Forest
  { id: 1, x: 600,  y: 600, lit: false, litAt: 0 },
  { id: 2, x: 1400, y: 350, lit: false, litAt: 0 },
  { id: 3, x: 2150, y: 850, lit: false, litAt: 0 },
  // Crystal Cave (id 4 stands at the biome boundary as a landmark)
  { id: 4, x: 2450, y: 600, lit: false, litAt: 0 },
  { id: 5, x: 3300, y: 450, lit: false, litAt: 0 },
  { id: 6, x: 4150, y: 800, lit: false, litAt: 0 },
]
```

### 4.4 光る草（全 12 株: Forest 7 / Cave 5、`GameCanvas.tsx` ローカル）

```ts
const PLANTS: GlowPlant[] = [
  // Enchanted Forest (x < 2400)
  { id: 1,  x: 520,  y: 470 },
  { id: 2,  x: 760,  y: 700 },
  { id: 3,  x: 980,  y: 940 },
  { id: 4,  x: 1250, y: 330 },
  { id: 5,  x: 1560, y: 760 },
  { id: 6,  x: 1840, y: 520 },
  { id: 7,  x: 2230, y: 940 },
  // Crystal Cave (x >= 2400)
  { id: 8,  x: 2550, y: 860 },
  { id: 9,  x: 2900, y: 420 },
  { id: 10, x: 3450, y: 620 },
  { id: 11, x: 3900, y: 940 },
  { id: 12, x: 4380, y: 360 },
]
```

### 4.5 碑文（全 6 基: Forest 3 / Cave 3、`gameStore.ts` から export）

```ts
export const INSCRIPTIONS: readonly Inscription[] = [
  // Enchanted Forest
  { id: 1, x: 340,  y: 900, text: 'Someone walked here before you, and smiled.' },
  { id: 2, x: 1150, y: 520, text: 'The dark is not empty. It is resting.' },
  { id: 3, x: 1980, y: 880, text: 'Slow steps hear more than fast ones.' },
  // Crystal Cave
  { id: 4, x: 2600, y: 300, text: 'Where the forest ends, the stars continue underground.' },
  { id: 5, x: 3500, y: 820, text: 'Every light you kindle remembers you.' },
  { id: 6, x: 4650, y: 600, text: 'There was never anything to win. Only this.' },
] as const
```

id 6 はワールド最深部（右端付近）に置き、踏破のささやかな結びとする。

### 4.6 導出定数（state にしない）

```ts
export const TOTAL_CRYSTALS = 14      // = CRYSTALS.length
export const TOTAL_BRAZIERS = 6       // = BRAZIERS.length
export const TOTAL_INSCRIPTIONS = 6   // = INSCRIPTIONS.length
```

HUD / Journal の「n / 総数」表示はこの定数を import して使う（`01-architecture.md` §3.1）。実装では配列の `length` から導出してよい。

## 5. store API（正確な export）

`gameStore.ts` が export するもの（実装骨格は `01-architecture.md` §3.3）:

| export | シグネチャ | 説明 |
|---|---|---|
| `gameState` | `GameState`（readonly な store proxy） | 読み取り専用 state |
| `collectCrystal` | `() => void` | `crystalsCollected` を +1 |
| `lightBrazier` | `() => void` | `litBraziersCount` を +1 |
| `setCurrentBiome` | `(biome: BiomeId) => void` | HUD 表示用バイオーム切替 |
| `setMenuOpen` | `(open: boolean) => void` | メニュー開閉（= ポーズ） |
| `setReducedMotion` | `(reduced: boolean) => void` | モーション削減トグル |
| `discoverInscription` | `(id: number) => void` | 発見済み id に追加。**既知の id は無視（冪等）** |
| `setAudioMuted` | `(muted: boolean) => void` | サウンドのミュートトグル |
| `BiomeId` / `GameState` / `Rgb` / `Biome` / `Inscription` | 型 | §1.1 |
| `BIOMES` | `readonly Biome[]` | §3 |
| `INSCRIPTIONS` | `readonly Inscription[]` | §4.5 |
| `TOTAL_CRYSTALS` / `TOTAL_BRAZIERS` / `TOTAL_INSCRIPTIONS` | `number` | §4.6 |
| `createGameStore` | `(save: SaveDataV1 | null) => …` | テスト用に export するファクトリ（`06-test-plan.md` §1） |

### 初期状態

モジュール初期化時に `persistence.initial`（`01-architecture.md` §10）を渡してファクトリを呼ぶ:
`createRoot(() => createGameStore(persistence.initial))`。

```ts
function initialState(save: SaveDataV1 | null): GameState {
  return {
    crystalsCollected: save?.collectedCrystalIds.length ?? 0,
    litBraziersCount: save?.litBrazierIds.length ?? 0,
    currentBiome: 'enchantedForest', // position is not saved — every stroll starts at the entrance
    isMenuOpen: false,
    // NOTE: wrap in a lambda — passing window.matchMedia unbound loses `this`
    // and throws "Illegal invocation" when called.
    reducedMotion: detectReducedMotion(
      typeof window !== 'undefined' ? (query) => window.matchMedia(query) : undefined,
    ),
    discoveredInscriptionIds: save?.discoveredInscriptionIds ?? [],
    audioMuted: save?.audioMuted ?? false,
  }
}
```

セーブ済み id の妥当性は `parseSave`（§8）が保証するため、ここでは件数を数えるだけでよい。

## 6. 関数シグネチャ

### 6.1 `gameLogic.ts`

```ts
export function lerp(a: number, b: number, t: number): number
export function lerpColor(a: Rgb, b: Rgb, t: number): Rgb
export function smoothstep01(t: number): number // clamps t to [0,1], returns 3t^2 - 2t^3
export function distSq(ax: number, ay: number, bx: number, by: number): number
export function isWithinRadius(ax: number, ay: number, bx: number, by: number, radius: number): boolean
export function clampDelta(deltaMs: number, maxMs: number): number
export function biomeBlendAt(x: number, boundaryX: number, blendWidth: number): number // 0..1
export function biomeIdAt(x: number, boundaryX: number): BiomeId
export function detectReducedMotion(
  matchMediaLike: ((query: string) => { matches: boolean }) | undefined,
): boolean // undefined -> false
export function proximityGlow01(
  distSqValue: number,
  innerRadius: number,
  outerRadius: number,
): number // 1 within innerRadius, 0 beyond outerRadius, smoothstep in between
export function equalPowerGains(t: number): { a: number; b: number }
// clamps t to [0,1]; a = cos(t * PI / 2), b = sin(t * PI / 2); a^2 + b^2 === 1
```

- すべて純粋関数。DOM・Canvas・store に依存しない（`Rgb` / `BiomeId` の型 import のみ可）。
- `detectReducedMotion` は `matchMedia` 互換関数を **引数注入** で受ける（テストで DOM モック不要にするため — `06-test-plan.md`）。
- `proximityGlow01` は光る草の明るさ計算に使う。呼び出し側で `CONFIG.plantGlowFloor` の下限を適用する:
  `alpha = CONFIG.plantGlowFloor + (1 - CONFIG.plantGlowFloor) * proximityGlow01(...)`。
- `equalPowerGains` の `a` が Forest ベッド、`b` が Cave ベッドのゲイン係数（`02-game-design.md` §12）。

### 6.2 `persistence.ts`

```ts
export function parseSave(json: string | null, totals: SaveTotals): SaveDataV1 | null
export function serializeSave(save: SaveDataV1): string
export function createPersistence(storage: StorageLike | undefined, totals: SaveTotals): Persistence

export interface Persistence {
  readonly initial: SaveDataV1 | null // loaded and validated once at creation
  markCrystalCollected(id: number): void
  markBrazierLit(id: number): void
  markInscriptionDiscovered(id: number): void
  setAudioMuted(muted: boolean): void
  clear(): void
}

export const persistence: Persistence // singleton bound to window.localStorage (undefined if unavailable)
```

- `parseSave` / `serializeSave` は純粋関数。検証規則は §8。
- `createPersistence` はセーブスナップショット（mutable なモジュール内オブジェクト）を所有する。各 mutator は冪等で、呼ばれるたびに同期的に `setItem` へ write-through する。`storage` が `undefined` の場合、`initial` は `null`、全 mutator は no-op。
- `getItem` / `setItem` / `removeItem` の例外（Safari プライベートモード・quota 超過）はすべて握りつぶす（`02-game-design.md` §11 — 絶対にクラッシュしない）。シングルトン生成時の `window.localStorage` への参照自体も try-catch で包む。

### 6.3 `assets.ts`

```ts
export const SPRITE_DEFS: readonly SpriteDef[] // 9 entries — §7 が正
export function spriteDrawOrigin(
  def: SpriteDef,
  x: number,
  y: number,
): { dx: number; dy: number } // pure; anchor-adjusted top-left for drawImage
export function loadSprites(target: SpriteMap): void
```

- `spriteDrawOrigin` は純粋関数: `center` → `(x - drawWidth/2, y - drawHeight/2)`、`topLeft` → `(x, y)`、`bottomCenter` → `(x - drawWidth/2, y - drawHeight)`。
- `loadSprites` は fire-and-forget: 各 `SpriteDef` について `new Image()` → `src = path` → `decode()` 成功時に `target[key] = img`。失敗（404・decode 不能）は握りつぶす（`01-architecture.md` §8）。

### 6.4 `audio.ts`

```ts
export function init(): void // create AudioContext + beds; call ONLY from a user-gesture handler
export function setBiomeBlend(t: number): void
export function setMuted(muted: boolean): void
export function playCollectChime(): void
export function playBrazierSwell(): void
export function playInscriptionBell(): void
```

- すべて `init()` 前は無音の no-op（`01-architecture.md` §9）。パラメータは §9 が正。DOM 非依存だが Web Audio 依存のためユニットテスト対象外（`06-test-plan.md` §6）。

## 7. スプライトマニフェスト

差し替え可能な全スプライトの正。ファイルは `public/assets/` に置く（Vite が `/assets/…` として静的配信する）。挙動は `02-game-design.md` §10、制作手順は `08-asset-guide.md`。

| key | path | 画像サイズ px | 描画サイズ px | anchor | フォールバック（手続き描画） |
|---|---|---|---|---|---|
| `player` | `/assets/player.png` | 80 × 80 | 40 × 40 | `center` | グロー円（`CONFIG.playerRadius`） |
| `crystal` | `/assets/crystal.png` | 64 × 64 | 32 × 32 | `center` | グロー円（クリスタル色） |
| `brazierUnlit` | `/assets/brazier-unlit.png` | 96 × 96 | 48 × 48 | `bottomCenter` | 残り火ドット |
| `brazierLit` | `/assets/brazier-lit.png` | 96 × 96 | 48 × 48 | `bottomCenter` | コアグロー + 炎パーティクル |
| `tileForest` | `/assets/tile-forest.png` | 128 × 128 | 64 × 64（`CONFIG.tileSize`） | `topLeft` | 市松タイル |
| `tileCave` | `/assets/tile-cave.png` | 128 × 128 | 64 × 64（`CONFIG.tileSize`） | `topLeft` | 市松タイル |
| `plantForest` | `/assets/plant-forest.png` | 64 × 64 | 32 × 32 | `bottomCenter` | 小さなグロー円（光る草 Forest 色） |
| `plantCave` | `/assets/plant-cave.png` | 64 × 64 | 32 × 32 | `bottomCenter` | 小さなグロー円（光る草 Cave 色） |
| `inscription` | `/assets/inscription.png` | 64 × 96 | 32 × 48 | `bottomCenter` | 石碑の縦長ラウンド矩形（碑文の石色） |

規則:

- **画像サイズは描画サイズの 2 倍（@2x）で用意する。** canvas は CSS px + devicePixelRatio プリスケールで描画されるため、`drawImage` に描画サイズを渡すだけで DPR ≦ 2 の環境で crisp になる。
- 形式は **PNG・透過アルファ必須**。webp は不採用（決定の記録: AI 画像生成ツールの標準出力とアルファ互換性のため PNG に固定）。
- ファイル名は上表と完全一致（小文字ケバブケース）。一致しない場合はサイレントにフォールバックする。

## 8. セーブスキーマ

- localStorage キー: `'luminaStroll.save'`
- 現行バージョン: `1`（`SaveDataV1` — §1.4）

```json
{
  "version": 1,
  "collectedCrystalIds": [1, 3, 9],
  "litBrazierIds": [1, 4],
  "discoveredInscriptionIds": [2],
  "audioMuted": false
}
```

`parseSave(json, totals)` の検証規則（上から順に適用）:

1. `json` が `null`、または `JSON.parse` が throw → `null`（新規開始）
2. パース結果がオブジェクトでない、または `version !== 1` → `null`
3. 3 つの id フィールドのいずれかが配列でない → `null`
4. 各 id 配列: 「`1..total`（対応する `SaveTotals` の値）の整数」以外の要素は **捨てる**（配列全体は生かす）。重複も捨てる
5. `audioMuted` が boolean でなければ `false` に落とす

破損時にエラーを表示・記録しない（`02-game-design.md` §11 — 黙って新規開始）。

## 9. オーディオパラメータ

Web Audio ノードグラフの正。挙動は `02-game-design.md` §12。実装時のチューニングは許可するが、**変更した値は必ず本表に書き戻す**（「実装時はここからコピー」の原則を保つ）。

### 9.1 共通

| キー | 値 | 意味 |
|---|---|---|
| マスターゲイン | `0.25` | 全体音量（控えめに固定。音量スライダーは作らない） |
| ミュートランプ | `setTargetAtTime(0, now, 0.05)` | ミュート切替時のゲインランプ（クリックノイズ防止） |
| クロスフェード | `equalPowerGains(t)` を `setTargetAtTime(gain, now, 0.3)` で適用 | `t` は `biomeBlendAt` と同一。スロットルは audio 内部: 前回適用値から変化が `0.01` 未満なら何もしない（呼び出し側は毎フレーム呼んでよい — `01-architecture.md` §9） |

### 9.2 アンビエントベッド

| ベッド | 構成 | パラメータ |
|---|---|---|
| Forest ドローン | sawtooth → lowpass | 55 Hz / カットオフ 220 Hz / ゲイン 0.10 |
| Forest 葉ずれ | ホワイトノイズ（2 秒ループバッファ） → bandpass | 中心 800 Hz / Q 0.8 / ゲイン 0.04 |
| Forest ゆらぎ | ドローンゲインへの LFO | 0.05 Hz / 深さ ±20% |
| Cave ドローン | sine × 2（完全五度） | 41 Hz + 61.5 Hz / ゲイン 0.12 |
| Cave 雫 | sine の短いプラック（880 → 440 Hz を 0.3 秒で exp ランプ） | 発生間隔 7–15 秒の一様乱数 / ゲイン 0.08 |

### 9.3 ワンショット

| イベント | 波形 | パラメータ |
|---|---|---|
| クリスタル取得チャイム | sine | 660 / 880 / 990 Hz から乱択、attack 5 ms、release 600 ms、ゲイン 0.15 |
| ブレイジャー点灯スウェル | sine | 110 Hz、1.2 秒かけてゲイン 0 → 0.2 → 0 |
| 碑文発見ベル | triangle | 528 Hz、減衰 2 秒、ゲイン 0.12 |
