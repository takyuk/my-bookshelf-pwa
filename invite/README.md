# 招待制公開への移行手順

現時点はコード準備のみ。既存の GitHub Pages と `proxy/wrangler.toml` の中継 API は変更していません。
チームドメインは画面で確認した `https://old-steel.cloudflareaccess.com` です。

## 構成

- 新 Worker: `bookshelf-invite`。本体と `/api/ndl`、`/api/google-cover` を同一オリジンで配信。
- Worker全体を Cloudflare Access の **All traffic** で保護。許可条件は招待する個別メールアドレス、ログイン方法は One-time PIN。
- `run_worker_first = true` により静的ファイルも含め署名・発行者・AUD・有効期限を検証。設定が空なら503、未認証なら401。Accessを設定し忘れてもアプリは公開されません。
- Google APIキーはこのWorkerの `GOOGLE_BOOKS_API_KEY` Secret。既存Workerから自動では引き継がれません。
- プレビューURLは無効。追加ホスト名も同じWorker単位のAccessで保護し、より優先される別ポリシーのBypassは作らないでください。
- 認証はオンラインアクセスの許可のみ。端末内データはメールアドレス別に分離しません。ログアウトや招待解除で保存済みの本棚やキャッシュは消えません。

## 次の手順（手順4以降で実施）

1. 各利用端末で旧アプリからバックアップZIPを保存。移行確認まで旧アプリ・サイトデータを削除しない。
2. 準備内容を確認後、プロジェクト直下で `node scripts/prepare.cjs --preview --invite` を実行。`dist/invite` にアプリ用ファイルだけを生成します。リポジトリやバックアップZIPは配信しません。
3. `npx wrangler deploy --config invite/wrangler.toml` で新Workerを作成。`ACCESS_AUD` が空なのでこの時点では503になります。これは正常です。既存の中継Workerには影響しません。
4. Workers & Pages → bookshelf-invite → Access → Protect this Worker behind Access → **All traffic**。あなたのメールアドレスのみをAllowに設定。Everyone、メールドメイン全体、One-time PINだけをInclude条件にしない。
5. Zero Trust → Access controls → Applications で該当アプリの **Application Audience (AUD) Tag** を確認。認証方法として One-time PIN が選ばれていることも確認。
6. AUDを `invite/wrangler.toml` の `ACCESS_AUD` へ入力（公開識別子でありAPIキーではありません）。`ACCESS_ISSUER` はチームドメインのまま。
7. `npx wrangler secret put GOOGLE_BOOKS_API_KEY --config invite/wrangler.toml` でキーを登録。チャットやファイルへキーを貼らない。
8. 再度 `npx wrangler deploy --config invite/wrangler.toml` を実行。
9. 表示された新URLをChromeで開き、メール認証、規約同意、ZIP復元を実施。新URLでPWAをインストール。

最終公開はコミット後に `node scripts/prepare.cjs --publish --invite` を実行してから同じdeployコマンドを実行します。公開先を変えるため、現在の `.github/workflows/pages.yml` はここでは変更していません。移行時は旧Pagesへの自動公開停止と、新Workerの公開運用への切替が必要です。

## 検証項目

- 未招待のメール、新規ブラウザ、API直接アクセスで拒否される。
- 同じWorkerの全ホスト名・プレビューから回避できない。
- 認証済みでアプリ、NDL、Google書影検索が動く。
- 認証失効時は「再ログイン」を別タブで開き、認証後に元の画面へ戻って検索できる。未保存の入力を再読込で失わない。
- インストール、再起動、カメラ許可、オフラインの保存・閲覧、オンライン復帰がAndroid Chromeで動く。
- ZIP復元後の登録冊数・撮影画像・評価・刊行年月が一致する。
- 同じブラウザを複数人で共有しない。認証方法を切り替えても本棚データは同じ。

## 旧URLの停止（全員の移行確認後のみ）

旧GitHub Pagesを公開解除し、Pages workflowを停止。旧 `bookshelf-ndl` の公開経路も停止または認証必須にして、未認証で検索できないことを確認します。既存のオフラインコピーは遠隔停止できません。旧サイトを先に停止すると、未移行利用者のバックアップ取得を妨げる可能性があります。

## 運用

- 招待追加: Access Allowポリシーへ個別メール追加後、新URLを本人へ案内。
- 利用停止: ポリシーから削除し、既存セッションも必要に応じ失効。
- 静的ファイルもWorker処理を通す構成なので、アプリのファイル取得もWorkersのリクエスト枠を使用。無料枠の使用量・CPU制限を実運用で確認してください。
- 公開検証はメール認証を設定した実環境で必要です。ローカルテストは実際のCloudflare設定の正しさを保証しません。

参考: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
参考: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
