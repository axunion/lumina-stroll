# アセット制作ガイド — 画像素材と AI 生成プロンプト

## 1. 位置づけ

- Lumina Stroll の実装（M0〜M13）は完了済み。本書は spec/ に残る唯一のドキュメントで、この先の**画像アセット差し替え作業**（AI 画像生成での素材制作）だけを対象にする。挙動・アーキテクチャ・型は実装済みのコードと git 履歴が正である。制作の手順(正規化・検品スクリプトの使い方)は `docs/asset-pipeline.md` にある。
- 素材は 1 枚もなくてもゲームは完全に動く（手続き描画フォールバック）。1 枚だけ置いても、9 枚全部置いてもよい。
- 対象は **静的 PNG スプライト 9 種のみ**。アニメーションフレーム／スプライトアトラス、音声素材ファイルはこのゲームの非対象（実装しない・布石も不要）。
- 下記のサイズ・anchor・パレット値は `src/assets.ts`（`SPRITE_DEFS`）と `src/GameCanvas.tsx` の実装値を書き写したもの。コードを変更したら本書を追随させること。**食い違ったらコードが正。**

## 2. 共通規則（全素材に適用）

| 項目 | 規則 |
|---|---|
| 形式 | **PNG、透過アルファ必須**（webp・jpg 不可） |
| サイズ | 下表の「画像サイズ」どおり（描画サイズの 2 倍 = @2x）。1px でも違うと拡縮でにじむ |
| 背景 | **完全透過**（タイル 2 種のみ不透明）。書き出し時の市松模様・白背景の焼き込みは NG |
| グロー | **発光ハローを焼き込まない**。ゲーム側が背後にグローを描く。素材側にもグローがあると二重発光でぼやける |
| 輪郭線 | 黒・ダークグレーのアウトライン不可（暗幕の中で汚れて見える）。輪郭は形状と明度差で出す |
| ファイル名 | 下表と**完全一致**（小文字ケバブケース）。違うとエラーなくサイレントに手続き描画へフォールバックする（§7） |
| 置き場所 | リポジトリの `public/assets/`（ディレクトリがなければ作る） |
| 反映 | 置いてブラウザをリロードするだけ。ビルド・設定・コード変更は不要。消せば元の描画に戻る |

## 3. ファイル一覧（スプライトマニフェスト）

| key | ファイル | 画像サイズ px | 描画サイズ px | anchor | 用途 |
|---|---|---|---|---|---|
| `player` | `player.png` | 80 × 80 | 40 × 40 | `center` | プレイヤー |
| `crystal` | `crystal.png` | 64 × 64 | 32 × 32 | `center` | クリスタル |
| `brazierUnlit` | `brazier-unlit.png` | 96 × 96 | 48 × 48 | `bottomCenter` | ブレイジャー（未点灯） |
| `brazierLit` | `brazier-lit.png` | 96 × 96 | 48 × 48 | `bottomCenter` | ブレイジャー（点灯） |
| `tileForest` | `tile-forest.png` | 128 × 128 | 64 × 64 | `topLeft` | 森バイオームの床タイル |
| `tileCave` | `tile-cave.png` | 128 × 128 | 64 × 64 | `topLeft` | 洞窟バイオームの床タイル |
| `plantForest` | `plant-forest.png` | 64 × 64 | 32 × 32 | `bottomCenter` | 光る草（森） |
| `plantCave` | `plant-cave.png` | 64 × 64 | 32 × 32 | `bottomCenter` | 光る草（洞窟） |
| `inscription` | `inscription.png` | 64 × 96 | 32 × 48 | `bottomCenter` | 碑文の石碑 |

anchor の意味: `center` = 中心配置、`topLeft` = 左上基準（タイル）、`bottomCenter` = 接地物の底面中央基準。

## 4. 世界観スタイルガイド

### 4.1 トーンとムードワード

静かで、癒される、淡く光る地下世界。プロンプトに使うキーワード:

> serene, soft, gentle, bioluminescent, cozy, dreamlike, quiet night, glass-like, hand-crafted, storybook, muted, tranquil

避けるもの（共通ネガティブ）:

> photorealistic, harsh contrast, black outlines, gritty, scary, horror, aggressive, saturated neon, text, watermark, background scenery

### 4.2 パレット対応表

| 対象 | Rgb | hex |
|---|---|---|
| プレイヤー光 / footprint | `[255, 240, 200]` | `#FFF0C8` |
| クリスタル本体 | `[140, 235, 255]` | `#8CEBFF` |
| 炎コア（根元） | `[150, 170, 255]` | `#96AAFF` |
| 炎先端 | `[190, 120, 255]` | `#BE78FF` |
| "+1" / 碑文テキスト | `[220, 245, 255]` | `#DCF5FF` |
| Forest 背景 | `[18, 38, 32]` | `#122620` |
| Forest タイルアクセント | `[24, 48, 40]` | `#183028` |
| Forest 環境パーティクル | `[180, 230, 160]` | `#B4E6A0` |
| Cave 背景 | `[22, 20, 44]` | `#16142C` |
| Cave タイルアクセント | `[30, 28, 58]` | `#1E1C3A` |
| Cave 環境パーティクル | `[150, 210, 255]` | `#96D2FF` |
| 光る草（Forest） | `[150, 230, 150]` | `#96E696` |
| 光る草（Cave） | `[180, 150, 255]` | `#B496FF` |
| 碑文の石 | `[120, 130, 160]` | `#7882A0` |

素材の色はこの表に**寄せる**（完全一致は不要。系統色を守ればゲーム側のグロー・暗幕と自然に馴染む）。

### 4.3 見え方の前提（重要）

ゲーム画面は暗幕に覆われ、プレイヤーの周囲だけが見える。つまり素材は **常に薄暗い環境光の下で見られる**。明るいモニタ上で単体で見て「地味かな」くらいの明度が、ゲーム内ではちょうどよい。純白・高彩度は浮く。

## 5. アセット別ブリーフ

各ブリーフのプロンプトは英語のまま画像生成 AI にコピペできる。生成後は §6 の検品を通すこと。

### 5.1 `player.png` — プレイヤー（80×80、anchor: center）

- 目的: 主人公。淡い暖色光の小さな旅人。やや斜め上から見たデフォルメでよい。
- 構図: キャンバス中央に配置、周囲に約 8px の透過余白。接地影は描かない（光る存在なので影が不自然）。
- 見た目: 柔らかい丸みのあるシルエット。ランタンを持つ小さな人影、または光の精霊のような姿。ディテールは少なく。

```
A tiny gentle traveler spirit for a cozy exploration game, soft warm cream light
tones (#FFF0C8), rounded simple silhouette holding a small lantern, storybook
style, minimal detail, viewed slightly from above, centered, 8px margin,
transparent background, 80x80 game sprite, no outline, no glow halo, no shadow
```

ネガティブ: `photorealistic, black outline, baked glow, drop shadow, background, text`

### 5.2 `crystal.png` — クリスタル（64×64、anchor: center）

- 目的: 収集アイテム。氷のような青いガラス細工。
- 構図: 中央配置、余白約 6px。単体の結晶クラスター（1〜3 本）。
- 見た目: 半透明感のある `#8CEBFF` 系。内側がほんのり明るい表現は可（外側へのハローは不可 — ゲームがボブ + グローを付ける）。

```
A small magical crystal cluster, translucent icy blue glass (#8CEBFF), one to
three faceted shards, soft internal light, storybook game item sprite, centered,
transparent background, 64x64, no outer glow halo, no outline, no base rock
```

ネガティブ: `photorealistic, outer glow, black outline, ground, shadow, text`

### 5.3 `brazier-unlit.png` — ブレイジャー未点灯（96×96、anchor: bottomCenter）

- 目的: まだ火の入っていない篝火台。「何かが起こりそう」な佇まい。
- 構図: **bottomCenter 接地** — 器の底をキャンバス下端から 4px 以内に置く。左右中央。上半分は空き（点灯版と同じ器を使うため）。
- 見た目: 石または鉄の小さな器。中に暗い熾火（ごく小さな `#96AAFF` の点）がかすかに見える。全体は暗く沈んだ色（`#7882A0` 系の石色）。

```
A small stone brazier bowl, unlit, dormant, dark muted grey-blue stone
(#7882A0), a faint tiny dim ember (#96AAFF) inside, cozy fantasy game prop,
base at bottom edge, bottom-center anchored, transparent background, 96x96,
no fire, no glow, no outline
```

ネガティブ: `flames, bright light, glow halo, black outline, background, text`

### 5.4 `brazier-lit.png` — ブレイジャー点灯（96×96、anchor: bottomCenter）

- 目的: 点灯後の篝火台。**炎そのものは描かない** — 炎はゲーム側のパーティクルが常時立ち上る。素材が担うのは「火の入った器」まで。
- 構図: 5.3 と同じ器・同じ位置（切り替わっても器がズレないこと）。器の中に明るい熾火・青紫の光の溜まりを描く。
- 見た目: 熾火は `#96AAFF` → `#BE78FF` のグラデーション系。器の縁が下から照らされる表現は可。器の外への光のハローは不可。

```
The same small stone brazier bowl, now lit: glowing blue-violet embers
(#96AAFF to #BE78FF) pooled inside the bowl, rim softly lit from within, no
flames rising, cozy fantasy game prop, base at bottom edge, bottom-center
anchored, transparent background, 96x96, no outer glow halo, no outline
```

ネガティブ: `rising flames, fire plume, outer glow, black outline, background, text`

### 5.5 `tile-forest.png` / 5.6 `tile-cave.png` — 床タイル（128×128、anchor: topLeft）

- 目的: 床の全面テクスチャ。**両方揃って初めて使われる**（片方だけなら市松フォールバック）。
- **最重要要件: シームレス（tileable）であること。** 上下左右にリピートしたとき継ぎ目が見えないこと。生成 AI の "seamless tile" 指定を必ず入れ、§6 の敷き詰め検品を行う。
- 見た目は**背景に徹する**: コントラスト低め・ディテール控えめ。この上をエンティティとパーティクルが歩く。明度は §4.2 の背景色 ±10% 程度に収める。
- `tile-forest.png`: `#122620`〜`#183028` 系。苔・柔らかい下草・かすかな根のパターン。
- `tile-cave.png`: `#16142C`〜`#1E1C3A` 系。滑らかな岩肌・かすかな結晶の粒。
- ブレンド帯では forest の上に cave が半透明で重なる。どちらも同程度の明度にすると遷移が美しい。

```
Seamless tileable ground texture for a quiet enchanted forest floor at night,
very dark muted green (#122620 to #183028), soft moss and faint undergrowth
pattern, low contrast, subtle, top-down, game background tile, 128x128,
perfectly seamless edges, no objects, no creatures, no light sources
```

```
Seamless tileable ground texture for a dark crystal cave floor, very dark
muted indigo (#16142C to #1E1C3A), smooth stone with faint tiny crystal
speckles, low contrast, subtle, top-down, game background tile, 128x128,
perfectly seamless edges, no objects, no creatures, no light sources
```

ネガティブ（共通）: `visible seams, high contrast, bright spots, photorealistic, text, watermark`

### 5.7 `plant-forest.png` / 5.8 `plant-cave.png` — 光る草（64×64、anchor: bottomCenter）

- 目的: 近づくと明るくなる発光植物。明るさの変化はゲーム側が背後のグローで表現するため、素材は**発光していない状態の姿**を描く。
- 構図: bottomCenter 接地 — 根元を下端から 4px 以内、左右中央。小さな一株。
- `plant-forest.png`: `#96E696` 系の淡い緑。丸い葉の小さな草・キノコ・シダなど。
- `plant-cave.png`: `#B496FF` 系の淡い紫。結晶質の芽・洞窟キノコなど。

```
A tiny bioluminescent forest plant, soft pale green (#96E696), small rounded
leaves, gentle storybook style, rooted at bottom edge, bottom-center anchored,
transparent background, 64x64 game sprite, not glowing, no glow halo, no outline
```

```
A tiny cave-dwelling crystalline sprout, soft pale violet (#B496FF), small
glassy buds like a mushroom, gentle storybook style, rooted at bottom edge,
bottom-center anchored, transparent background, 64x64 game sprite, not glowing,
no glow halo, no outline
```

ネガティブ（共通）: `glowing, light rays, black outline, soil patch, background, text`

### 5.9 `inscription.png` — 碑文の石碑（64×96、anchor: bottomCenter）

- 目的: 詩文が刻まれた小さな立石。未発見でもかすかに見える、静かな道しるべ。
- 構図: 縦長。bottomCenter 接地 — 石の底を下端から 4px 以内。
- 見た目: `#7882A0` 系の風化した立石。表面にかすかに光る刻線（`#DCF5FF` 系、ごく控えめ）。**読める文字・実在の文字体系は刻まない**（詩文はゲームがテキストで表示する）。

```
A small ancient standing stone stele, weathered muted grey-blue (#7882A0),
faint softly glowing carved line patterns (#DCF5FF), abstract marks that are
not real letters, quiet and mossy, storybook fantasy game prop, base at bottom
edge, bottom-center anchored, transparent background, 64x96, no outline,
no readable text
```

ネガティブ: `readable letters, runes alphabet, bright glow, black outline, background, text`

## 6. 検品手順

手順 1〜3 とタイルのシーム検査は `node scripts/check-assets.ts` が機械化済み(docs/asset-pipeline.md)。手順 4〜5 は引き続き目視で行う。

1 枚生成するごとに:

1. **サイズ・形式**: PNG であること、ピクセルサイズがブリーフと完全一致していること。
2. **透過**: 透過部分が本当にアルファ 0 であること（市松や白の焼き込みがない）。画像ビューアの透過表示で確認。
3. **命名・配置**: §2 の表どおりのファイル名で `public/assets/` に置く。
4. **ゲーム内確認**: `pnpm dev` → リロード。差し替わったことを確認し、ファイルを一時的にリネームしてフォールバックに戻ることも確認。
5. **暗幕下の見え方**: プレイヤーを近づけて、暗い環境光の中で形が判別できるか・ハローと馴染むか・二重発光でぼやけていないかを目視。
6. **タイルのみ**: 端から端まで歩いて継ぎ目が見えないこと。ブレンド帯で 2 種の重なりが自然なこと。

## 7. よくある失敗

| 症状 | 原因 | 対処 |
|---|---|---|
| 置いたのに反映されない | ファイル名の不一致（大文字・拡張子・ハイフン）。**エラーは出ない**（サイレントフォールバック） | DevTools Network タブで 404 になっているパスを確認し、名前を合わせる |
| ぼやける・にじむ | ピクセルサイズがマニフェストと違う | 指定サイズで再書き出し |
| 白フチ・黒フチが出る | 半透明縁のマット焼き込み | ストレートアルファで書き出す。縁の付き方を透過表示で確認 |
| ゲーム内で光がぼやけて見える | グローの焼き込み（ハロー二重化） | 素材からグローを外す。発光はゲーム側の担当 |
| タイルに格子模様が見える | シームレスでない | seamless 指定で再生成 or オフセット確認ツールで継ぎ目を消す |
| 点灯/未点灯で器が横にずれる | 2 枚のブレイジャーで器の位置が違う | 同一の器の構図で生成し直す（5.3 と 5.4 はペアで作る） |
