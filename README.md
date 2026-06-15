# GeoGuessr メタ暗記フラッシュカード

GeoGuessr のビジュアルメタ（画像から国を当てる手がかり）を、フラッシュカード＋間隔反復で覚えるための個人用静的サイト。

🔗 公開URL: https://159265moneys.github.io/geoguessr-meta-flashcards/
🔍 監査ビュー: https://159265moneys.github.io/geoguessr-meta-flashcards/audit.html

出題方向は **画像 → 国名（再認）の一方向のみ**。5カテゴリ（国旗 / ボラード / ナンバープレート / 車線ライン / 文字）。

---

## 最重要原則：データが嘘でないこと

このツールの価値は「データが正確であること」に懸かっている。以下を構造的に担保している。

1. **全レコードに `source_url` 必須**（空は検証で落とす）。
2. **`meta_text`（説明文）は取得元ページからの転記のみ**。記憶・推論からの加筆はしない。各レコードに `source_quote`（出典本文に実在する根拠の原文一文）を持たせ、機械照合できるようにしている。
3. **取得できなかった項目は空欄で残す**（推測で埋めない）。空欄は監査ビューで人間が後から埋める。
4. **検証スクリプト**で source_url 欠落 / 重複 / 必須欠落 / 画像リンク切れ / 引用の実在を自動検出。
5. **監査ビュー**で全レコードを目視チェックできる。

## データ出典

| カテゴリ | 画像 | メタ情報の出典 |
|---|---|---|
| 国旗 | [flagcdn.com](https://flagcdn.com)（パブリックドメイン相当） | [mledoze/countries](https://github.com/mledoze/countries)（国名・地域・ISO） |
| ナンバープレート | Wikimedia Commons | Wikipedia「Vehicle registration plates of …」 |
| ボラード | Wikimedia Commons | 各言語版 Wikipedia（Leitpfosten / Délinéateur / Reflectorpaal 等） |
| 車線ライン | Wikimedia Commons（一部） | Wikipedia「Road surface marking」 |
| 文字 | サンプル文字列（各言語の native 表記） | Wikipedia 各文字体系の記事 |

画像はすべて **ホットリンク**（リポジトリには同梱しない）。各カードに出典リンクを表示する。

---

## 使い方（学習）

- 画像を見て、4択から国名を選ぶ → 正誤＋解説＋出典が出る。
- **ジオゲッサ圏のみ**（既定ON）: Google ストリートビューの公式カバー国だけを出題（圏外の国・選択肢を除外）。OFFで全件。
- **カテゴリ／地域フィルタ**、**苦手だけ**モード（正答率の低いカードに集中）。
- 間隔反復（Leitner方式5箱）：間違えたカードは高頻度、正解が続くと間隔が伸びる。
- 進捗はブラウザの localStorage に保存。メニューの「進捗を完全消去」でリセット。

## データの追加・更新（開発）

データの正本は `data/*.json`。編集したら必ず以下を通す。

```bash
# 1) 検証（source_url欠落・重複・必須欠落などを検出。0エラーが必須）
npm run verify
node scripts/verify.mjs --verbose      # 警告（meta_text空・画像なし等）も表示
node scripts/verify.mjs --images       # 画像URLの到達性も確認（ネット必要）
node scripts/verify.mjs --csv          # 監査用CSVを audit/ に出力

# 2) 引用の実在監査（source_quote が出典本文に逐語で存在するか再取得して照合）
node scripts/check_quotes.mjs data

# 3) ブラウザ用バンドル生成（data/*.json → data/bundle.js）
npm run bundle

# 1〜3まとめて（bundle→verify）
npm run build

# ローカル確認
npm run serve   # http://localhost:8000
```

### 国旗データの再生成
```bash
node scripts/build_flags.mjs   # mledoze/countries + flagcdn から194主権国を生成
```

### カバー範囲（ジオゲッサ/SV）の再生成
```bash
node scripts/build_coverage.mjs --write   # data/coverage.json を出典から生成
```
出典: Wikipedia「Google Street View coverage」§ Current coverage。表の凡例「Bold with an
asterisk (*) indicates countries with public street view available」に基づき、アスタリスク付き
（公開ストリートビューあり＝実際に走れる国）を `in_coverage` とする。国名の表記差は app.js / audit.js の
`COV_ALIAS`（例: Türkiye→Turkey, Czechia→Czech Republic）で吸収。

## 構成

```
index.html / audit.html      画面（クイズ / 監査ビュー）
css/style.css
js/app.js                    出題エンジン（SRS・フィルタ・苦手・消去）
js/audit.js                  監査ビュー
data/*.json                  データ正本（カテゴリ別）
data/bundle.js               自動生成（ブラウザが読む）
scripts/build_flags.mjs      国旗データ生成
scripts/verify.mjs           検証
scripts/check_quotes.mjs     引用実在監査
scripts/bundle.mjs           バンドル生成
```

## スキーマ

```json
{
  "id": "plate_germany",
  "category": "flag | bollard | plate | roadline | script",
  "answer_country": "Germany",
  "answer_country_ja": "ドイツ",
  "region": "Africa | Americas | Asia | Europe | Oceania",
  "image_url": "https://…（ホットリンク）",
  "image_local": "",
  "sample_text": "（文字カテゴリのみ：その文字体系のサンプル文字列）",
  "meta_text": "見分けポイント（出典からの転記）",
  "source_quote": "meta_text の根拠となる出典本文の原文一文",
  "source_url": "https://…（★必須）",
  "fetched_at": "2026-06-16"
}
```

画像も `sample_text` も無いレコードは **出題対象外**（監査ビューには残り、後で画像を追加できる）。

---

個人専用・非配布。覚えたら進捗を消去して使い捨てる運用を想定。
