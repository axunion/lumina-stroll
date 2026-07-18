# アセット制作パイプライン

`spec/asset-guide.md` が「何を作るか」(レギュレーション・ブリーフ・パレット)を定め、本書は「どう作るか」(制作の手順とツール)を定める。恒久ドキュメントとして `docs/` に置く。

## 設計: 3 層パイプライン

レギュレーション準拠(正確な px サイズ・anchor 位置・透過・シームレス)を画像生成 AI に求めると失敗しやすい。責務を分離する:

| 層 | 担当 | 実体 |
|---|---|---|
| 1. 生成 | 見た目・質感・キャラクター性のみ | 外部の画像生成 AI(手動) |
| 2. 正規化 | サイズ・anchor・余白・透過などの規則準拠すべて | `scripts/` の決定論的スクリプト |
| 3. 検品 | spec §6 のうち機械化できる項目 + ゲーム内目視 | `scripts/check-assets.ts` + `pnpm dev` |

素材別の作り方:

- **床タイル 2 種**(`tileForest` / `tileCave`): 生成 AI を使わず**手続き生成**。シームレス性と明度帯が構造的に保証される。
- **`brazierLit`**: 生成せず、正規化済み `brazier-unlit.png` から**スクリプトで派生**(同じ器に熾火を合成)。ペアの位置ズレが構造的に起こらない。
- **残り 6 種**(player / crystal / brazierUnlit / plantForest / plantCave / inscription): 生成 AI → 正規化。

## 手順

### 1. 元画像を生成する(タイルと brazierLit 以外)

- プロンプトは `spec/asset-guide.md` §5 の英語ブリーフを使う。ただし**サイズ・anchor・余白・centered 系の指定行は不要**(正規化スクリプトが担当)。見た目・色・ネガティブ指定だけ残す。
- **透過背景は必須**(gpt-image の `background: "transparent"` など)。背景が焼き込まれた画像は正規化スクリプトが拒否する(クロマキーはスコープ外)。
- 大きめ(1024×1024 目安)に生成する。縮小はスクリプト側が高品質に行い、縮小によって storybook 調の柔らかさも出る。

### 2. intake ディレクトリに置く

リポジトリ直下の `assets-intake/`(gitignore 済み)に任意のファイル名で置く。コミットされるのは正規化後の `public/assets/` のみ。

### 3. 正規化する

```
node scripts/normalize-sprite.ts assets-intake/<file>.png <spriteKey>
```

alpha 境界のトリム → アスペクト維持の縮小 → anchor 配置(bottomCenter は底面を下端 −2px、center は約 10% 余白)→ 規定サイズで `public/assets/` へ出力、まで自動。spriteKey は `src/assets.ts` の `SPRITE_DEFS` と同じ(player, crystal, brazierUnlit, plantForest, plantCave, inscription)。

### 4. 派生・生成スクリプト

```
node scripts/compose-brazier-lit.ts   # brazier-unlit.png から brazier-lit.png を派生
node scripts/generate-tiles.ts [seed] # 床タイル 2 枚を手続き生成(既定 seed 1)
```

**注意: `brazier-unlit.png` を差し替えたら必ず compose を再実行する**(lit は派生物)。古いペアは検品の IoU チェックが検出する。

### 5. 機械検品

```
node scripts/check-assets.ts              # public/assets/ にある全ファイル
node scripts/check-assets.ts player       # 指定キーのみ
```

サイズ・形式・縁の透過・接地位置・タイルのシーム/明度帯・ブレイジャーペアの一致を PASS/FAIL/WARN で報告し、FAIL があれば exit 1。WARN(soft-alpha fringe)はグロー焼き込みの兆候 — spec §7 を参照。

### 6. ゲーム内目視

`pnpm dev` で spec §6 の手順 4–5(暗幕下の見え方・ハローとの馴染み。タイルは端から端まで歩いて継ぎ目確認)。ここだけは機械化できない。

### 7. 不合格なら再生成

FAIL/WARN の内容を spec §7 の失敗表と照らし、プロンプトを修正して手順 1 からやり直す。よくあるフィードバック:

- グロー焼き込み → ネガティブに `glow, halo, light rays` を強める
- 背景焼き込み → 透過背景オプションを確認
- 黒フチ → `no outline` を強める / スタイル指定を storybook 系に寄せる

## チューニング定数の場所

出来上がりの微調整はスクリプト先頭の定数を編集して再実行する(すべてコミットされるので再現可能):

- 余白・接地インセット: `scripts/normalize-sprite.ts`
- 熾火の位置・大きさ・色: `scripts/compose-brazier-lit.ts`
- タイルのノイズ粒度・スペックル数・混合率: `scripts/tile-texture.ts`
- 検品の閾値: `scripts/check-assets.ts`

タイルの模様替えは seed を変えるだけでもよい: `node scripts/generate-tiles.ts 7`

## 関連

- レギュレーション・ブリーフ: `spec/asset-guide.md`(サイズ・anchor は `src/assets.ts` の `SPRITE_DEFS` が正)
- AI エージェント向けの操作手順: `.claude/skills/asset-pipeline/SKILL.md`
