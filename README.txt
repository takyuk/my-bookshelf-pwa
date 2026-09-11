My Bookshelf PWA版

■ この版で追加したもの
- Android/PCでのPWAインストール対応
- ホーム画面から単独アプリ風に起動
- Service Workerによるオフライン起動
- PWA用アイコン、manifest
- ローカルファイル直開き時も従来機能は利用可能

■ 重要
PWAの「インストール」「オフラインキャッシュ」は file:// では動きません。
HTTPSで公開する必要があります（localhostは例外）。

■ 既存データの移行
以前のローカル版とHTTPS公開版は保存領域が別になります。
1. 旧版で「書き出し」→ JSONを保存
2. HTTPS公開したPWA版を開く
3. 「読み込み」→ JSONを選択

■ 公開方法の例：GitHub Pages
1. GitHubで新しいリポジトリを作る
2. このフォルダ内の index.html / manifest.webmanifest / sw.js / icons フォルダをアップロード
3. Repository Settings → Pages
4. Deploy from a branch を選び、main / root を指定
5. 発行された https://... のURLをAndroid Chromeで開く
6. 画面の「ホーム画面に追加」またはChromeメニューの「アプリをインストール」を選ぶ

■ 簡易テスト（PC）
このフォルダで以下を実行:
  python -m http.server 8000
その後 http://localhost:8000 をブラウザで開きます。
