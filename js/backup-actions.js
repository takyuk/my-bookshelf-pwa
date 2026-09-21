const BackupActions = {
  init({
    $,
    getBooks,
    isBusy,
    hasStorageError,
    store,
    storeKey,
    backup,
    refreshBooks,
    setBusy,
    saveBooks,
    render,
    download
  }) {
    $('exportBtn').addEventListener('click', async () => {
      if (isBusy()) return;
      refreshBooks();
      if (hasStorageError()) return;
      setBusy(true);
      try {
        const expected = store.snapshot();
        const result = await navigator.locks.request(storeKey, async () => {
          if (localStorage.getItem(storeKey) !== expected)
            throw new Error(
              '別の画面で変更されました。再度書き出してください。'
            );
          return backup.exportZip(getBooks());
        });
        if (
          result.warnings.length &&
          !confirm(
            `${result.warnings.length}冊の書影を読み込めませんでした。書籍情報を優先し、該当の書影なしで書き出しますか？`
          )
        )
          return;
        download(
          result.blob,
          `my-bookshelf-${new Date().toISOString().slice(0, 10)}.zip`,
          'application/zip'
        );
      } catch (error) {
        alert(`書き出しを開始できませんでした。${error.message}`);
      } finally {
        setBusy(false);
        refreshBooks();
      }
    });
    $('importInput').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (isBusy()) return;
      refreshBooks();
      const expected = store.snapshot();
      setBusy(true);
      try {
        const result = await backup.importFile(file),
          incoming = result.books;
        const warning = hasStorageError()
          ? '読み込めなかった元の保存データを置き換えます。先に「元データを救出」で保管してください。'
          : `現在の${getBooks().length}冊を置き換えます。`;
        const imageWarning = result.warnings.length
          ? `\n${result.warnings.length}冊は書影を復元できないため、書籍情報のみ復元します。`
          : '';
        if (
          confirm(
            `${warning}\n${incoming.length}冊を読み込みますか？${imageWarning}`
          ) &&
          (await saveBooks(incoming, expected, true, result.records))
        ) {
          render();
        }
      } catch (error) {
        alert(
          `読み込みに失敗しました。\n${error.message || '書き出したZIPまたはJSONファイルを選択してください。'}`
        );
      } finally {
        setBusy(false);
        e.target.value = '';
        refreshBooks();
      }
    });
  }
};
