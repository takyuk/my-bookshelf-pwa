# 書影・非同期処理のリファクタリング

## 復元基準

- 正常動作確認済みコミット: `afa7130beed352a0a592f0bea7d754c3250e46df`
- 作業ブランチ: `codex/refactor-cover-lifecycle`
- 元ソースのローカルZIP: `dist/refactor-baseline-afa7130.zip`（Git管理外）
- ZIPはソースの控えです。端末の書籍・画像データは含みません。利用者が保存した画像付きバックアップZIPを別途保管してください。
- 元版を確認する場合は上記コミットを別の作業フォルダに展開してください。未コミットの改修を消すresetは不要です。

## 役割と依存関係

- `cover-view.js`: Google書影・代替画像・帰属表示のDOM生成。
- `cover-list.js`: 一覧の書影表示、IndexedDBからの画像取得、一覧のBlob URL解放。
- `google-cover-client.js`: 中継APIへの通信と応答検証。DOMには触れません。
- `google-covers.js`: 編集画面のGoogle検索状態、入力値との対応、表示更新。
- `covers.js`: 撮影・選択・補正中の画像と保存前レコード、編集プレビューの管理。
- `async-task.js`: 世代番号による古い結果の破棄と通信のキャンセル。
  呼出側がcancelして前の世代を無効化してからtoken/startで次の処理を始めます。
  タイムアウトは呼出側が従来の時間・メッセージを維持して管理します。
  カメラ停止、補正Worker停止、Blob URL解放は各機能の責任のままです。
- 公開APIは既存呼出側に合わせて維持し、HTMLとService Workerへ新しい依存ファイルを登録しています。

## 維持する仕様

保存キー・保存形式・ZIP形式・刊行年月、入力中の上書き防止、ローカル書影優先、
15秒の検索タイムアウト、表示文言・レイアウト、画像補正とExifの扱い、
Access認証・マニフェストの認証情報送信・PWA更新方針は変更していません。
公開方式の整理と旧開発経路の見直しは今回の対象外です。

## 確認

- `node tests/regression.cjs`: 改修前後に成功。
- 古い検索の応答・finallyと新しい検索の競合、キャンセル、画像世代管理、Google検索時間切れのテストを追加。
- Chromeで `tests/browser-google-covers.html`、`browser-images.html`、`browser-catalog.html`、`browser-correction.html` が成功。
  通信はテスト応答、画像・IndexedDB・ZIP・補正Workerはブラウザ上で検証。
- `node scripts/prepare.cjs --preview --invite`: 成功。新しいファイルは公開用出力へコピーされます。
- Android実機のカメラ・認証・PWAインストール・オフライン起動は次の確認工程です。
- 公開は別工程です。コミット済みコードから `node scripts/prepare.cjs --publish --invite` で生成し、`npx wrangler deploy --config invite/wrangler.toml` で反映します。
