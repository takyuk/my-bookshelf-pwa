# NDL書誌検索の中継API

GitHub PagesからNDL APIへ直接fetchするためのCORSヘッダーが確認できないため、ISBN専用の中継を使用します。
ローカルでは `node scripts/serve.cjs 8002` が `/api/ndl?isbn=...` を提供します。
カメラ映像は端末内で処理し、中継にはISBNのみを送ります。書誌検索はオンライン専用です。

## Cloudflare Workersへの導入（今回は未公開）

1. CloudflareアカウントでWranglerを利用できる状態にします。
2. `proxy/wrangler.toml` の `ALLOWED_ORIGIN` をPWAのオリジンに設定します。現在の公開先は `https://takyuk.github.io` です。
3. プロジェクトのルートから `npx wrangler deploy --config proxy/wrangler.toml` を実行します（外部への公開操作）。
4. `js/catalog-config.js` の `endpoint` に、発行されたWorkerのHTTPS URLと `/api/ndl` を設定します。
5. PWAを公開し、実機で検索を確認します。APIキーやCloudflareトークンはブラウザ側ファイルに書きません。

中継先はNDL OpenSearch固定、検索対象は国立国会図書館蔵書（`iss-ndl-opac`）、件数は10件です。
チェック桁を含むISBN検証、オリジン制限、タイムアウト、1MB応答上限を設けています。
同一実行環境内で検索を直列化し、最大4件まで待機、最大100件を24時間メモリキャッシュします。
この制限は実行環境をまたぐ厳密なレート制限ではありません。CORSも認証の代用ではありません。
多数の利用者向けに公開する場合はCloudflare側のレート制限なども設定してください。

書誌情報はNDLサーチAPIを利用しています。個人の非営利利用を想定しています。
公式仕様・利用条件：
- https://ndlsearch.ndl.go.jp/help/api/specifications
- https://ndlsearch.ndl.go.jp/help/api
- https://developers.cloudflare.com/workers/wrangler/configuration/

## スマホでの一時テスト

スマホのカメラにはHTTPSが必要です。Cloudflare Quick TunnelなどでPCに接続します。
`BOOKSHELF_PUBLIC_ORIGIN` 環境変数を一時HTTPS URLに設定し、
`node scripts/serve.cjs 8003 --remote-test` を起動します。
このモードではアプリ用ファイルとISBN APIだけを提供し、検索先設定を同一URLのAPIへ切り替えます。
PCとトンネルを止めると一時URLは使えなくなります。URLごとにブラウザ保存領域が異なります。

## 検証

- `node tests/regression.cjs`：ISBN・中継・カメラの中止と終了処理を含む自動チェック。
- ローカルの `/tests/browser-catalog.html`：実ブラウザでXML解析とEAN-13画像の復号を検証。
- スマホ実機：許可/拒否、背面カメラ、上下2段のバーコード、明るさ、読み取り中止、画面を閉じた後のカメラ終了を確認。
