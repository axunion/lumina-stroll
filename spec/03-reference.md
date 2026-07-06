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
```

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

各キーには実装時に上表の「意味」を英語コメントとして付ける。

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

## 4. ワールドデータ（配置座標）

**決定: エンティティ配置はハードコードされたリテラル配列とする。** シード付き乱数による手続き配置は不採用（理由: 完全な決定性、個体ごとのチューニング可能性、simplest thing that works。要件の "procedural" は素材を使わないレンダリングを指し、配置生成を指さないと解釈）。

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

### 4.4 導出定数（state にしない）

```ts
export const TOTAL_CRYSTALS = 14 // = CRYSTALS.length
export const TOTAL_BRAZIERS = 6  // = BRAZIERS.length
```

HUD の「取得数 / 総数」表示はこの定数を import して使う（`01-architecture.md` §3.1）。実装では `CRYSTALS.length` から導出してよい。

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
| `BiomeId` / `GameState` / `Rgb` / `Biome` | 型 | §1.1 |
| `BIOMES` | `readonly Biome[]` | §3 |
| `TOTAL_CRYSTALS` / `TOTAL_BRAZIERS` | `number` | §4.4 |

### 初期状態

```ts
function initialState(): GameState {
  return {
    crystalsCollected: 0,
    litBraziersCount: 0,
    currentBiome: 'enchantedForest',
    isMenuOpen: false,
    // NOTE: wrap in a lambda — passing window.matchMedia unbound loses `this`
    // and throws "Illegal invocation" when called.
    reducedMotion: detectReducedMotion(
      typeof window !== 'undefined' ? (query) => window.matchMedia(query) : undefined,
    ),
  }
}
```

## 6. `gameLogic.ts` の関数シグネチャ

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
```

- すべて純粋関数。DOM・Canvas・store に依存しない（`Rgb` / `BiomeId` の型 import のみ可）。
- `detectReducedMotion` は `matchMedia` 互換関数を **引数注入** で受ける（テストで DOM モック不要にするため — `06-test-plan.md`）。
