const BookEditor = {
  create({
    $,
    getBooks,
    isBusy,
    hasStorageError,
    store,
    covers,
    refreshBooks,
    saveBooks,
    render,
    uid,
    terms
  }) {
    const dialog = $('bookDialog'),
      form = $('bookForm');
    let editSnapshot;
    const duplicates = BookDuplicates.create({ $, getBooks, isBusy });
    function resetForm() {
      form.reset();
      document.dispatchEvent(new Event('bookshelf-form-reset'));
      $('bookId').value = '';
      $('status').value = 'finished';
      $('format').value = '紙';
      $('rating').value = '0';
    }
    function openDialog(id = null) {
      refreshBooks();
      if (!terms.allowed() || hasStorageError() || isBusy()) return;
      const books = getBooks();
      if (id && !books.some((book) => book.id === id)) {
        alert('この本は別の画面で削除されています。');
        return;
      }
      editSnapshot = store.snapshot();
      resetForm();
      const editing = id ? books.find((b) => b.id === id) : null;
      covers.reset(editing);
      $('dialogTitle').textContent = editing ? '本を編集' : '本を追加';
      $('deleteBtn').classList.toggle('hidden', !editing);
      if (editing) {
        $('bookId').value = editing.id;
        [
          'title',
          'volume',
          'author',
          'isbn',
          'publisher',
          'publishedDate',
          'purchaseDate',
          'price',
          'format',
          'location',
          'status',
          'startedDate',
          'finishedDate',
          'rating',
          'notes'
        ].forEach((k) => ($(k).value = editing[k] ?? ''));
        $('tags').value = (editing.tags || []).join(', ');
      }
      if (!dialog.open) dialog.showModal();
      duplicates.reset();
      // Reset both the remembered focus and scroll position whenever the form opens.
      $('closeDialogBtn').focus({ preventScroll: true });
      form.querySelector('.book-form-scroll').scrollTop = 0;
    }
    function closeDialog() {
      if (!isBusy()) dialog.close();
    }
    dialog.addEventListener('cancel', (event) => {
      if (isBusy()) event.preventDefault();
    });
    dialog.addEventListener('close', refreshBooks);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isBusy()) return;
      if (covers.loading()) {
        alert('画像の確認が終わるまでお待ちください。');
        return;
      }
      if (!duplicates.check()) return;
      const books = getBooks();
      const continueEntry = e.submitter?.id === 'saveNextBtn';
      const id = $('bookId').value || uid();
      const old = books.find((b) => b.id === id);
      const book = {
        id,
        coverId: covers.id(),
        ...covers.remoteData(),
        title: $('title').value.trim(),
        volume: $('volume').value.trim(),
        author: $('author').value.trim(),
        isbn: $('isbn').value.trim(),
        publisher: $('publisher').value.trim(),
        publishedDate: $('publishedDate').value,
        purchaseDate: $('purchaseDate').value,
        price: $('price').value ? Number($('price').value) : null,
        format: $('format').value,
        location: $('location').value.trim(),
        status: $('status').value,
        startedDate: $('startedDate').value,
        finishedDate: $('finishedDate').value,
        rating: Number($('rating').value),
        tags: $('tags')
          .value.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notes: $('notes').value.trim(),
        createdAt: old?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (!book.title) {
        alert('タイトルを入力してください。');
        return;
      }
      const idx = books.findIndex((b) => b.id === id);
      const nextBooks = [...books];
      if (idx >= 0) nextBooks[idx] = book;
      else nextBooks.unshift(book);
      if (await saveBooks(nextBooks, editSnapshot, false, covers.records())) {
        if (continueEntry) openDialog();
        else closeDialog();
        render();
      }
    });

    $('deleteBtn').addEventListener('click', async () => {
      if (isBusy()) return;
      const books = getBooks();
      const id = $('bookId').value;
      const b = books.find((x) => x.id === id);
      if (
        b &&
        confirm(`「${b.title}」を削除しますか？`) &&
        (await saveBooks(
          books.filter((x) => x.id !== id),
          editSnapshot
        ))
      ) {
        closeDialog();
        render();
      }
    });
    $('addBookBtn').addEventListener('click', () => openDialog());
    $('closeDialogBtn').addEventListener('click', closeDialog);
    $('cancelBtn').addEventListener('click', closeDialog);

    return { open: openDialog, close: closeDialog };
  }
};
