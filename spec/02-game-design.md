# 02. ゲームデザイン詳細

このドキュメントは **挙動** の「正」である。数値はすべて `03-reference.md` の CONFIG・パレット・ワールドデータをキー名で参照する（値をここに書かない）。

## 1. ワールドとカメラ

- ワールドは横長の 1 枚（`CONFIG.worldWidth` × `CONFIG.worldHeight`、world 座標 = CSS px）。
- カメラはプレイヤーを画面中央に置き、ワールド端では画面がワールド外を映さないようにクランプする（画面がワールドより大きい軸は中央寄せ）。
- プレイヤーもワールド端でクランプする（跳ね返りなし、めり込みなし。壁に沿って滑る）。
- 背景は手続き的なタイルグリッド（`CONFIG.tileSize`）。市松模様で `background` 色と `tileAccent` 色（バイオームブレンド後、§8）を交互に塗る。**可視範囲のタイルのみ** 描画する（カメラ位置から開始インデックスを計算）。

## 2. 移動

- グリッドフリー。入力ベクトル（上下左右の合成）を **正規化** し、`CONFIG.playerSpeed × dt秒` を掛けて位置に加算する。斜め移動が速くならない。
- 加速・慣性・イージングは **なし**（即時速度）。
  - 決定の記録: 慣性つき移動も検討したが、非ゲーマーには「思ったところで止まらない」操作感がストレスになるため却下。「柔らかさ」は移動ではなくパーティクルと光の表現で出す。
- プレイヤーの見た目: 半径 `CONFIG.playerRadius` の柔らかく光る円（放射グラデーション）。スプライトなし。

## 3. 入力

- キーボード: `window` の keydown/keyup で `e.code` を `Set<string>` に出し入れする。対象コード: `ArrowUp` / `ArrowDown` / `ArrowLeft` / `ArrowRight` / `KeyW` / `KeyA` / `KeyS` / `KeyD`。
- モバイル D-pad: 4 ボタン（`04-ui.md` §4）。各ボタンは `pointerdown` で対応フラグを true、`pointerup` / `pointercancel` / `pointerleave` で false にする `{ up, down, left, right }` の plain object を持つ。
- 毎フレーム、キー Set と D-pad フラグを **OR でマージ** して入力ベクトルを作る（どちらで操作しても同じ挙動）。
- D-pad ボタンには `touch-action: none` を指定（スクロール・ダブルタップズームの誤発動防止）。
- `gameState.isMenuOpen` が true の間、入力は無視される（update 自体がスキップされる — `01-architecture.md` §5）。

## 4. ライティング

技法を以下に **固定** する:

1. offscreen の light canvas 全面を `rgba(0, 0, 0, CONFIG.darknessAlpha)` で塗りつぶす。
2. `globalCompositeOperation = 'destination-out'` に切り替え、光源ごとに放射グラデーション（中心: 不透明 → `半径 + CONFIG.lightSoftness` で透明）の円を塗って暗幕に「穴」を開ける。
   - プレイヤー: 半径 `CONFIG.lightRadius`
   - 点灯済みブレイジャー（画面内のみ）: 半径 `CONFIG.brazierLightRadius`
3. composite を戻し、light canvas を main canvas に `drawImage` で重ねる。

- 決定の記録: 単一の放射グラデーションを直接 main canvas に塗る方式は光源が 1 つしか扱えず、`destination-out` の穴あけ方式が **複数光源の重なりを正しく合成できる唯一の単純な技法** であるため採用。
- プレイヤーの光は sine で ±4% ゆっくり脈動する（`reducedMotion` 時は無効、§9）。
- 光の色味: 穴あけの後、light canvas 全体に薄く `lightTint`（バイオームブレンド後）を乗せてもよいが、MVP では省略可（やる場合も彩度は極めて低く）。

## 5. パーティクル

- **単一のプール配列** で全種類を管理する。各要素は `kind` を持つ: `footprint` / `burst` / `flame` / `ambient`（型は `03-reference.md`）。
- 総数が `CONFIG.maxParticles` に達したら新規スポーンを抑制する（最古を消すのではなく、スポーンをスキップ）。
- update: 経過時間で寿命判定（超過したら配列から除去）、速度で位置更新、寿命比率で alpha を減衰。
- render: `globalAlpha` を設定した塗りつぶし円（`ctx.arc`）。放射グラデーションは使わない（パーティクル数 × グラデーション生成は高コスト。柔らかさは低 alpha の重なりで出す — 決定として固定）。

| kind | スポーン条件 | 挙動 |
|---|---|---|
| `footprint` | プレイヤー移動中、`CONFIG.particleSpawnInterval` ms ごと | プレイヤー足元に生成、ゆっくり上に漂いフェードアウト |
| `burst` | クリスタル取得の瞬間に `CONFIG.burstParticleCount` 個 | 取得位置から放射状にランダム方向へ飛散、減速しつつフェード |
| `flame` | 点灯済みブレイジャーごとに連続的に少量 | 炎の根元から上昇、コア色 → 先端色へ変化しつつ揺らめく |
| `ambient` | 起動時に `CONFIG.ambientParticleCount` 個を常駐 | 画面内をゆっくり漂う。寿命が尽きたら可視範囲内で再生成。色はバイオームブレンド色（§8） |

## 6. マジカルクリスタル

- 未取得のクリスタルは sine で上下にボブする。個体ごとに `phase` オフセットを持ち、同期して動かない。
- 取得判定: 毎フレーム、未取得クリスタルとプレイヤーの距離平方を比較（`distSq < CONFIG.crystalPickupRadius²`。平方根を取らない）。
- 取得時（1 回だけ発生する離散イベント）:
  1. `collected = true` にする（以後レンダリングも判定もしない。リスポーンなし）
  2. `burst` パーティクルをスポーン
  3. フローティングテキスト "+1" を生成（`CONFIG.floatingTextDurationMs` かけて上昇 + フェードアウト）
  4. `collectCrystal()` を呼ぶ

## 7. ブレイジャー

- 未点灯: 小さく暗い残り火のドット（かすかに視認できる程度）。
- プレイヤーが `CONFIG.brazierProximity` 内に入ったら **自動点灯**（ボタン不要）。1 回だけの離散イベント:
  1. `lit = true`、`litAt = now` を記録
  2. `lightBrazier()` を呼ぶ
- 点灯後:
  - 青紫の炎（`flame` パーティクル + コアのグロー円）を描画し続ける
  - `destination-out` の恒久光源になる（§4）。点灯直後は `litAt` から約 600ms かけて光半径を 0 → `CONFIG.brazierLightRadius` にイーズイン（ease-out カーブ）
  - **決して消えない**（セッション内永続 — `00-overview.md` §4）

## 8. バイオーム

- バイオームは x 範囲で決まる（定義は `03-reference.md`）: Enchanted Forest → Crystal Cave。
- **描画色は連続ブレンド**: 毎フレーム、プレイヤー x からブレンド係数を計算する。

```
t = smoothstep01((player.x - (CONFIG.biomeBoundaryX - CONFIG.biomeBlendWidth / 2)) / CONFIG.biomeBlendWidth)
```

  `t = 0` で Forest、`t = 1` で Cave。`background` / `tileAccent` / `ambientParticle` / `lightTint` の全チャンネルを `lerpColor` で補間する。ハードスワップ禁止。
- **`currentBiome` Signal は離散切替**: `biomeIdAt(player.x)` は `CONFIG.biomeBoundaryX` を境に ID を返し、前回値と変わった時だけ `setCurrentBiome()` を呼ぶ（HUD のバイオーム名表示用）。
- 描画の連続 lerp と Signal の離散切替は **意図的に分離** されている。HUD の名前は境界で 1 回だけ切り替わり、画面の色は境界帯（`biomeBlendWidth`）の間ずっと滑らかに変わる。これを「不整合」として同期させてはならない。

## 9. reduced-motion 挙動マトリクス（正規表）

`gameState.reducedMotion` が true の時の各エフェクトの挙動。この表が正であり、実装・QA はこの表に従う。

| エフェクト | 通常 | reduced-motion 時 |
|---|---|---|
| footprint パーティクル | `particleSpawnInterval` ごとにスポーン | **無効**（スポーンしない） |
| クリスタル取得バースト | `burstParticleCount` 個のパーティクル | パーティクルなし。**広がるリングのストローク 1 本** で代替（取得フィードバックは残す） |
| ambient パーティクル | 常駐・漂う | **無効** |
| クリスタルのボブ | sine で上下 | **静止**（phase 位置で固定） |
| ブレイジャーの炎 | フリッカー + `flame` パーティクル | **定常グロー**（揺らがない光の円のみ、パーティクルなし） |
| "+1" フローティングテキスト | 上昇しながらフェード | **その場でフェード**（移動しない） |
| プレイヤー光のパルス | sine ±4% | **無効**（固定半径） |
| バイオーム色 lerp | 有効 | **有効のまま**（位置に依存する状態表現でありアニメーションではない） |
| Kobalte Dialog の出入りアニメーション | CSS transition | **無効**（`04-ui.md` §6） |

- 初期値は `prefers-reduced-motion: reduce` の自動検出。設定メニューのトグルでいつでも変更可能（`01-architecture.md` §3.3）。
- トグルは即時反映される（次のフレームからマトリクスに従う）。既存のパーティクルは自然消滅に任せてよい（即時消去は不要）。
