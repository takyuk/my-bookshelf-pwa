const BookCoverUI = {
  create({ isBusy }) {
    const el = (id) => document.getElementById(id);
    let coverId = null,
      record = null,
      loading = false,
      previewURL = null;
    let pendingFile = null;
    const google = GoogleCovers.create({
      isBusy,
      hasLocal: () => !!coverId,
      isLocalLoading: () => loading
    });
    function clearPending() {
      pendingFile = null;
      el('correctCover').hidden = true;
    }
    const task = BookAsyncTask.create();
    const cards = BookCoverList.create();
    function clearPreview() {
      if (previewURL) URL.revokeObjectURL(previewURL);
      previewURL = null;
      el('coverPreview').removeAttribute('src');
      el('coverPreview').hidden = true;
    }
    function preview(blob) {
      clearPreview();
      previewURL = URL.createObjectURL(blob);
      el('coverPreview').src = previewURL;
      el('coverPreview').hidden = false;
      google.show();
    }
    async function restorePreview(token) {
      if (previewURL || !coverId) return;
      const id = coverId;
      try {
        const stored = record?.blob ? record : await BookImages.get(id);
        if (task.isCurrent(token) && id === coverId && stored?.blob)
          preview(stored.blob);
      } catch {
        /* Keep the current error message and book metadata. */
      }
    }
    async function reset(book) {
      BookCorrection.cancel();
      clearPending();
      task.cancel();
      const token = task.token();
      loading = false;
      coverId = book?.coverId || null;
      record = null;
      clearPreview();
      el('coverStatus').textContent = '';
      google.reset(book);
      if (coverId) {
        try {
          const stored = await BookImages.get(coverId);
          if (!task.isCurrent(token)) return;
          if (!stored?.blob) throw new Error();
          preview(stored.blob);
        } catch {
          if (task.isCurrent(token))
            el('coverStatus').textContent =
              '書影が見つかりません。書籍情報は保持されています。撮影または選択で再登録できます。';
        }
      }
    }
    async function select(event, source) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || isBusy()) return;
      google.cancel();
      task.cancel();
      const token = task.token();
      loading = true;
      el('coverStatus').textContent = '画像を確認しています…';
      BookCorrection.cancel();
      try {
        const image = await ImageCodec.fromFile(file);
        if (!task.isCurrent(token)) return;
        if (source === 'camera') {
          const result = await BookCorrection.open(image, {
            source,
            retake: () => el('cameraCoverInput').click()
          });
          if (!task.isCurrent(token)) return;
          if (!result) {
            el('coverStatus').textContent =
              '撮影画像の登録を中止しました。元の書影は変更していません。';
            await restorePreview(token);
            return;
          }
          clearPending();
          adopt(result.blob, source, result.corrected);
        } else {
          pendingFile = {
            blob: image.blob,
            width: image.width,
            height: image.height
          };
          el('correctCover').hidden = false;
          adopt(image.blob, source, false);
        }
      } catch (error) {
        if (task.isCurrent(token)) {
          el('coverStatus').textContent =
            `画像を登録できません。${error.message} 元の書影は変更していません。`;
          await restorePreview(token);
        }
      } finally {
        if (task.isCurrent(token)) loading = false;
      }
    }
    function adopt(blob, source, corrected) {
      coverId = crypto.randomUUID();
      record = { id: coverId, blob, source };
      preview(blob);
      el('coverStatus').textContent = corrected
        ? '補正した画像を採用しました。「保存」で確定します。元画像はアプリに保存しません。'
        : 'プレビューを確認して「保存」を押してください。向き以外のExifを削除しました。';
    }
    el('correctCover').addEventListener('click', async () => {
      if (!pendingFile || isBusy() || loading) return;
      google.cancel();
      task.cancel();
      const token = task.token();
      loading = true;
      try {
        const result = await BookCorrection.open(pendingFile);
        if (!task.isCurrent(token) || !result) return;
        clearPending();
        adopt(result.blob, 'file', result.corrected);
      } catch {
        if (task.isCurrent(token))
          el('coverStatus').textContent =
            '補正できませんでした。選択済みの書影は変更していません。';
      } finally {
        if (task.isCurrent(token)) loading = false;
      }
    });
    for (const [button, input, source] of [
      ['takeCover', 'cameraCoverInput', 'camera'],
      ['chooseCover', 'fileCoverInput', 'file']
    ]) {
      el(button).addEventListener('click', () => {
        if (isBusy()) return;
        document.dispatchEvent(new Event('bookshelf-stop-camera'));
        el(input).click();
      });
      el(input).addEventListener('change', (event) => select(event, source));
    }
    el('removeCover').addEventListener('click', () => {
      if (isBusy()) return;
      task.cancel();
      BookCorrection.cancel();
      clearPending();
      loading = false;
      coverId = null;
      record = null;
      clearPreview();
      google.clear();
      el('coverStatus').textContent =
        '保存すると書影を削除します。書籍情報は残ります。';
    });
    el('bookDialog').addEventListener('close', () => {
      task.cancel();
      BookCorrection.cancel();
      clearPending();
      loading = false;
      record = null;
      clearPreview();
    });
    el('coverPreview').addEventListener('error', () => {
      el('coverStatus').textContent =
        '書影を表示できません。別の画像を選択してください。';
      clearPreview();
    });
    return {
      remoteData: google.data,
      reset,
      clearCards: cards.clearCards,
      renderCard: cards.renderCard,
      loading: () => loading,
      id: () => coverId,
      records: () => (record ? [record] : [])
    };
  }
};
