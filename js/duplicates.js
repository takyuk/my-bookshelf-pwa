const BookDuplicates = {
  matches(books, isbn, editingId, format) {
    const normalized = BookISBN.key({identifier:BookISBN.identify(isbn, format)});
    return normalized ? books.filter(book => book.id !== editingId && BookISBN.key(book) === normalized) : [];
  },
  create({ $, getBooks, isBusy, onReturn }) {
    const modal = $('duplicateDialog');
    let accepted = '', shown = '', identity = '', displayed = '';
    let returnFocus;
    function state() {
      const key = JSON.stringify([BookISBN.key({identifier:BookISBN.identify($('isbn').value, $('format').value)}), $('bookId').value]);
      if (identity !== key) { identity = key; accepted = ''; shown = ''; }
      const books = BookDuplicates.matches(getBooks(), $('isbn').value, $('bookId').value, $('format').value);
      return { books, signature: JSON.stringify([key, books.map(book => book.id).sort()]) };
    }
    function close() { if (modal.open) modal.close(); }
    function show({ books, signature }) {
      shown = displayed = signature;
      $('duplicateTitle').textContent = '同じISBN/ASINの本が登録されています。';
      $('duplicateBooks').replaceChildren();
      for (const book of books) {
        const row = document.createElement('section');
        const summary = document.createElement('p');
        summary.textContent = [book.title, book.volume && `巻次：${book.volume}`, book.format, `保管場所：${book.location || '未入力'}`].filter(Boolean).join(' ／ ');
        const details = document.createElement('details');
        const heading = document.createElement('summary');
        heading.textContent = '既存の本を確認';
        const text = document.createElement('p');
        text.className = 'duplicate-details';
        text.textContent = [`著者：${book.author || '未入力'}`, `ISBN/ASIN：${BookISBN.identifier(book).value}`, `出版社：${book.publisher || '未入力'}`, `メモ：${book.notes || 'なし'}`].join('\n');
        details.append(heading, text); row.append(summary, details); $('duplicateBooks').append(row);
      }
      if (!modal.open) { returnFocus = document.activeElement; modal.showModal(); }
      $('duplicateTitle').focus({ preventScroll: true });
    }
    function detect() {
      const next = state();
      if (!next.books.length || accepted === next.signature) { close(); return; }
      if ($('bookDialog').open && !isBusy() && shown !== next.signature) show(next);
    }
    $('isbn').addEventListener('input', detect);
    $('format').addEventListener('change', detect);
    $('closeDuplicate').addEventListener('click', () => {
      if (isBusy()) return;
      returnFocus = null;
      close();
      onReturn();
    });
    // Escape / Android back never grants consent or closes the editor.
    modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
    modal.addEventListener('close', () => {
      if ($('bookDialog').open && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    });
    $('bookDialog').addEventListener('close', close);
    $('allowDuplicate').addEventListener('click', () => {
      if (isBusy()) return;
      const next = state();
      if (next.books.length && next.signature !== displayed) { show(next); return; }
      accepted = next.signature; close();
    });
    return {
      reset() { close(); accepted = shown = identity = displayed = ''; detect(); },
      check() {
        const next = state();
        if (!next.books.length || accepted === next.signature) return true;
        show(next); return false;
      }
    };
  }
};
