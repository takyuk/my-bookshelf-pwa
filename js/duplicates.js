const BookDuplicates = {
  matches(books, isbn, editingId) {
    const normalized = BookISBN.normalize(isbn);
    return normalized
      ? books.filter(book => book.id !== editingId && BookISBN.normalize(book.isbn) === normalized)
      : [];
  },
  create({ $, getBooks, isBusy }) {
    let accepted = '';
    const notice = $('duplicateNotice');
    function matches() {
      return BookDuplicates.matches(getBooks(), $('isbn').value, $('bookId').value);
    }
    function signature(books) {
      return JSON.stringify([BookISBN.normalize($('isbn').value), $('bookId').value, books.map(b => b.id).sort()]);
    }
    function update() {
      const books = matches();
      const approved = accepted === signature(books);
      if (!approved) accepted = '';
      notice.hidden = books.length === 0;
      $('duplicateBooks').replaceChildren();
      for (const book of books) {
        const row = document.createElement('p');
        const text = document.createElement('span');
        text.textContent = [book.title, book.volume && `巻次：${book.volume}`, book.format, `保管場所：${book.location || '未入力'}`].filter(Boolean).join(' ／ ');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ghost';
        button.textContent = '既存の本を確認';
        button.addEventListener('click', () => {
          if (isBusy()) return;
          // Read-only details preserve the form, pending cover and running lookup.
          alert([
            book.title, `巻次：${book.volume || '未入力'}`, `著者：${book.author || '未入力'}`,
            `ISBN：${book.isbn}`, `形式：${book.format || '未入力'}`,
            `保管場所：${book.location || '未入力'}`, `メモ：${book.notes || 'なし'}`
          ].join('\n'));
        });
        row.append(text, document.createElement('br'), button);
        $('duplicateBooks').append(row);
      }
      $('allowDuplicate').hidden = approved;
      $('duplicateDecision').textContent = approved ? '別の1冊として登録します。入力後に保存してください。' : '登録済みの本を確認するか、別の1冊として登録を続けてください。';
      return books.length === 0 || approved;
    }
    $('isbn').addEventListener('input', update);
    $('allowDuplicate').addEventListener('click', () => {
      if (isBusy()) return;
      accepted = signature(matches());
      update();
    });
    return {
      reset() { accepted = ''; update(); },
      check() {
        if (update()) return true;
        notice.scrollIntoView({ block: 'center' });
        $('allowDuplicate').focus({ preventScroll: true });
        return false;
      }
    };
  }
};
