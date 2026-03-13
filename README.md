# 経営相談 思考補助アプリ（Google Drive同期版）

> **まずは `index-standalone.html` を開いて使ってください。**  
> この版は Googleログイン必須 + Google Drive保存（`consultations.json`）で、PC/スマホ/別PCで同じデータを共有できます。

## 現在の動作仕様（完成版）

- Google OAuthログイン必須（未ログインではアプリUIを表示しない）
- `allowedUsers = ["あなたのGmail"]` でアクセス制御
- 不一致時は「このアプリにアクセスする権限がありません」を表示
- 相談データは Google Drive の `keiei-soudan-ai-data/consultations.json` に保存
- PDF/Word/音声/画像は Google Drive の `keiei-soudan-ai-files` に保存
- `localStorage` は本運用フローで使用しない（保存はDriveのみ）
- 相談入力 / 相談履歴 / タグ / 類似案件検索 / AI提案生成を維持
- 画面上部に「ログイン中: user@gmail.com」表示 + ログアウトボタン
- トークンはブラウザセッションのみ保持（`sessionStorage`）
- ソースコードに秘密情報（APIキー等）は埋め込まない


## 保存仕様（Driveのみ）

- 保存先フォルダ（自動作成）
  - `keiei-soudan-ai-data`
  - `keiei-soudan-ai-files`
- 相談データ本体: `keiei-soudan-ai-data/consultations.json`
- 添付ファイル: `keiei-soudan-ai-files`
- 対応添付形式: `pdf / docx / mp3 / wav / m4a / jpg / jpeg / png`
- 保存成功時: 画面に **「Google Driveに保存しました」** を表示
- 保存失敗時: エラーメッセージを表示

### 保存確認（デバッグ）

1. 画面内の保存メッセージを確認（保存成功/失敗を表示）
2. Google Driveで以下を確認
   - `keiei-soudan-ai-data/consultations.json` が更新されている
   - `keiei-soudan-ai-files` に添付ファイルが追加されている
3. 相談レコード詳細で、添付のDriveリンクが表示される

### 過去事例130件活用

- 蓄積ページの「130件サンプル投入」で大量データをDriveへ投入可能
- 蓄積ページの一括取込み（`csv/json/txt`）で既存事例を検索対象へ追加
- 取り込んだ事例は通常レコードと同じく、
  - 類似案件検索
  - 業種検索
  - 課題検索
  - AI提案生成（過去事例の類似上位を参照）
  の対象になる

---

## 使い方

### 1) 設定

`index-standalone.html` の先頭スクリプト内を設定してください。

- `GOOGLE_CLIENT_ID`
- `allowedUsers`

```js
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
const allowedUsers = ['あなたのGmail'];
```

### 2) 起動

- ローカル確認: `index-standalone.html` をブラウザで開く（推奨は localhost 配信）
- 公開運用: GitHub Pages で `index-standalone.html` を配信

---

## Google Drive API 設定手順

1. Google Cloud でプロジェクト作成
2. 「Google Drive API」を有効化
3. OAuth 同意画面を設定（テストユーザーに利用者Gmailを追加）
4. OAuth クライアントID（Webアプリ）を作成
5. 承認済みJavaScript生成元を設定
   - ローカル: `http://localhost:5173`
   - GitHub Pages: `https://<user>.github.io`
6. `GOOGLE_CLIENT_ID` に発行値を設定

> Drive保存先フォルダは初回ログイン時に自動作成されます。

---

## OAuth 設定で必要なポイント

- スコープ: `https://www.googleapis.com/auth/drive`
- 同意画面で「外部」を使う場合、公開前はテストユーザー登録が必要
- `allowedUsers` のメール一致チェックでアプリ利用者を制限

---

## ローカルテスト方法

Google OAuthの都合上、`file://` 直開きより localhost 配信を推奨します。

```bash
cd /workspace/keiei-soudan-ai
python3 -m http.server 5173
```

ブラウザで:

- `http://localhost:5173/index-standalone.html`

---

## GitHub Pages 公開方法

1. リポジトリの Settings > Pages でデプロイ有効化
2. Branch を `main`（または対象ブランチ）に設定
3. 公開URLで `index-standalone.html` を開く
   - `https://<user>.github.io/<repo>/index-standalone.html`
4. OAuthの承認済みJavaScript生成元に `https://<user>.github.io` を追加

`.nojekyll` は配置済みです。

---

## 補足

- `index.html` は `index-standalone.html` へリダイレクトします。
- 既存の `src/*` モジュール版は残していますが、運用は standalone を優先してください。
