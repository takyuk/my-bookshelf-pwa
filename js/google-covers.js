const GoogleCovers = (() => {
  function create({ isBusy, hasLocal, isLocalLoading }) {
    const el = (id) => document.getElementById(id),
      view = el('googleCoverPreview'),
      button = el('searchGoogleCover');
    let value = null,
      status = '';
    const task = BookAsyncTask.create();
    function cancel() {
      task.cancel();
      button.disabled = false;
    }
    function current() {
      if (el('format').value === BookISBN.kindle) return null;
      return GoogleCoverData.clean(value, el('isbn').value);
    }
    function show() {
      view.hidden = hasLocal();
      if (!hasLocal())
        BookCoverView.mount(view, value, status, { showLogo: false });
    }
    function reset(book) {
      cancel();
      value = GoogleCoverData.clean(book?.googleCover, book?.isbn);
      status = book?.googleCoverStatus || '';
      show();
      el('googleCoverStatus').textContent = '';
    }
    function clear() {
      cancel();
      value = null;
      status = '';
      show();
    }
    async function search() {
      if (isBusy() || isLocalLoading()) return;
      cancel();
      if (hasLocal()) {
        el('googleCoverStatus').textContent =
          '撮影・選択した画像を優先しています。Google書影へ変更する場合は、先に書影を削除してください。';
        return;
      }
      if (el('format').value === BookISBN.kindle) { el('googleCoverStatus').textContent = 'ASINでのGoogle書影検索には対応していません。撮影・画像選択をご利用ください。'; return; }
      const isbn = BookISBN.normalize(el('isbn').value);
      if (!isbn) {
        el('googleCoverStatus').textContent = '正しいISBNを入力してください。';
        return;
      }
      value = null;
      status = '';
      show();
      if (navigator.onLine === false) {
        status = 'error';
        el('googleCoverStatus').textContent =
          'オフラインのため書影を検索できません。';
        show();
        return;
      }
      const token = task.token();
      const active = task.start();
      let timer;
      button.disabled = true;
      el('googleCoverStatus').textContent =
        'Google Booksで書影を検索しています…';
      try {
        timer = setTimeout(() => active.abort(), 15000);
        const cover = await GoogleCoverClient.search(isbn, active.signal);
        if (
          !task.isCurrent(token) ||
          hasLocal() ||
          BookISBN.normalize(el('isbn').value) !== isbn ||
          !el('bookDialog').open
        )
          return;
        value = cover;
        status = cover ? '' : 'missing';
        show();
        el('googleCoverStatus').textContent = cover
          ? '書影を取得しました。「保存」で確定します。'
          : 'このISBNの書影が見つかりませんでした。書誌情報は保存できます。';
      } catch (error) {
        if (task.isCurrent(token) && !hasLocal() && el('bookDialog').open) {
          status = 'error';
          show();
          el('googleCoverStatus').textContent =
            error.name === 'AbortError'
              ? '書影検索が時間切れになりました。再度お試しください。'
              : error instanceof TypeError
                ? '書影検索に接続できませんでした。通信を確認してください。'
                : error.message;
        }
      } finally {
        clearTimeout(timer);
        if (task.isCurrent(token)) {
          task.finish(token);
          button.disabled = false;
        }
      }
    }
    button.addEventListener('click', search);
    el('isbn').addEventListener('input', () => {
      if (value && current()) return;
      clear();
      el('googleCoverStatus').textContent = '';
    });
    el('format').addEventListener('change', () => {
      cancel();
      if (el('format').value === BookISBN.kindle) clear();
    });
    document.addEventListener('bookshelf-save-start', cancel);
    el('bookDialog').addEventListener('close', cancel);
    window.addEventListener('pagehide', cancel);
    window.addEventListener('offline', show);
    window.addEventListener('online', show);
    return {
      reset,
      clear,
      cancel,
      show,
      data: () => ({ googleCover: current(), googleCoverStatus: status })
    };
  }
  return {
    create,
    mount: BookCoverView.mount,
    fallback: BookCoverView.fallback
  };
})();
