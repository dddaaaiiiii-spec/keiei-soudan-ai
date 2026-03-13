# 経営相談 思考補助アプリ（試作版）

> **まずは `index-standalone.html` をダブルクリックで開いて使ってください。**  
> ローカルサーバー不要で、そのまま主ページ・蓄積ページ・提案生成・保存・類似案件検索を試せます。

経営相談の現場で、ヒアリング内容を入力しながら論点整理・提案候補を確認できる **フロントエンド単体 Web アプリ**です。  
主ページ（現場用）と蓄積ページ（過去議事録取り込み用）の2ページ構成です。

## 主な機能

- 主ページ（現場用）
  - 相談情報フォーム入力（日本語UI）
  - Chrome Web Speech API 音声入力（主要テキスト欄に追記）
  - 提案生成（ダミーAI）
  - 提案生成時に相談タイプ（consultationType）を自動分類
  - 保存 / 入力クリア / 類似案件検索 / 要約表示
  - 保存済み一覧・詳細表示
  - キーワード、業種、相談タイプ、課題タグ、施策タグ、手入力/取り込みで絞り込み
- 蓄積ページ（取り込み用）
  - テキスト貼り付け
  - txt/md/json/csv 読み込み
  - PDF/Word、音声は将来対応UI（未対応表示）
  - 要約生成、タグ生成（ダミーAI）
  - タグ編集後に保存
- 類似案件検索
  - 相談タイプ一致（20%）を含む重み付きスコアリング
  - 上位5件を表示
- データ保存
  - localStorage に統一オブジェクトで保存
  - 手入力記録（manual）と取り込み記録（imported）を統合管理
- サンプルデータ
  - 飲食 / 小売 / 製造業 / サービス業 を含む4件を初期投入

## ファイル構成

- `index-standalone.html` : **最優先の単一ファイル版**（CSS/JS内包、ダブルクリックで即利用可）
- `index.html` : 2ページのルートレイアウト、上部ナビ、エントリーポイント
- `styles.css` : 業務向けの落ち着いたカードUI、レスポンシブ調整
- `src/main.js` : 画面描画、イベント制御、保存・検索・取り込みフロー
- `src/dataModel.js` : 相談記録の統一データモデル
- `src/storage.js` : localStorage 永続化・サンプル初期化
- `src/sampleData.js` : 初期サンプルデータ
- `src/aiService.js` : AI 抽象化レイヤー（差し替えポイント）
- `src/voice.js` : 音声入力ユーティリティ（Web Speech API）

## すぐ使う（サーバー不要）

1. `index-standalone.html` をエクスプローラ/Finderからダブルクリック
2. Chromeで開いたらそのまま利用開始

## GitHub Pages で使う（サーバー不要）

- このリポジトリは **相対パス** で参照する構成にしているため、`https://<user>.github.io/<repo>/` 配下でも動作します。
- GitHub Pages では `index.html`（モジュール版）または `index-standalone.html`（単一ファイル版）をそのまま公開可能です。
- ルートに `.nojekyll` を配置しており、静的ファイルをそのまま配信できます。

## ローカル起動手順（モジュール版・Chrome推奨）

### 1) リポジトリに移動

```bash
cd /workspace/keiei-soudan-ai
```

### 2) ローカルサーバ起動（例: Python）

```bash
python3 -m http.server 5173
```

### 3) Chrome でアクセス

```text
http://localhost:5173
```

> `file://` 直開きでも表示できますが、ブラウザ制約回避のためローカルサーバ起動を推奨します。

## データモデル（統一オブジェクト）

`src/dataModel.js` の `createEmptyRecord()` に、将来DB移行しやすい形で以下を定義しています。

- id
- sourceType（manual / imported）
- createdAt
- consultationDate
- consultantName
- clientName
- companyName
- industry
- productFeatures
- valueProposition
- targetCustomer
- businessModel
- strengths
- consultationDetails
- currentIssues
- desiredDirection
- consultationType
- proposalSummary
- nextActions
- notes
- rawText
- summary（overview / keyIssues / proposalPoints / nextCheckpoints）
- tags（industryTags / issueTags / actionTags）
- aiOutput（situationSummary / issueAnalysis / topPriorities / quickActions / midTermStrategies / differentiationIdeas / copyIdeas / homework / consultationSummary）

## OpenAI API接続時の差し替えポイント

現在は **AI未接続でも動くダミー実装**です。  
将来のAPI接続は `src/aiService.js` の以下関数を置換してください。

- `generateConsultationAdvice(input)`
- `summarizeImportedRecord(input)`
- `generateTags(input)`
- `classifyConsultationType(input)`
- `findSimilarCases(currentCase, savedCases)`
- `explainSimilarityReason(context)`

### 接続方針

1. まず `src/aiService.js` の6関数（`generateConsultationAdvice` / `summarizeImportedRecord` / `generateTags` / `classifyConsultationType` / `findSimilarCases` / `explainSimilarityReason`）をAPI呼び出し実装に差し替える。
2. APIキーはフロントコードへ直書きせず、将来バックエンドの環境変数（例: `OPENAI_API_KEY`）に設定する想定。
3. フロント側は `.env` の公開設定（例: `AI_PROVIDER=dummy|openai-proxy`）で接続先を切替える。
4. フロント直書きを避ける理由: APIキー漏えい防止、利用制限・監査ログ・レート制御をサーバ側で統一管理するため。
5. 返却JSONスキーマは現状オブジェクト形（提案/要約/タグ/類似結果）に合わせて固定する。

## 補足

- 音声入力は Chrome の Web Speech API 前提です
- まずは使える試作版として、操作性と見やすさを優先しています

### aiService の入出力統一ルール

- 入力は相談記録オブジェクト互換（不足項目は内部で正規化）
- 出力は各関数ごとの固定JSON形で返却（UIはこの形のみ参照）
- `findSimilarCases` は `{ record, score, similarityReason }` 配列を返却
