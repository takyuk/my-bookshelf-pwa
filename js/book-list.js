// Rendering reads application state through explicit dependencies.
const BookList = {
  create({
    $,
    getBooks,
    isBusy,
    hasStorageError,
    store,
    covers,
    openEditor,
    statusLabels
  }) {
    const grid = $('bookGrid'),
      empty = $('emptyState');
    function renderStats() {
      $('statTotal').textContent = getBooks().length;
      $('statUnread').textContent = getBooks().filter(
        (b) => b.status === 'unread'
      ).length;
      $('statReading').textContent = getBooks().filter(
        (b) => b.status === 'reading'
      ).length;
      $('statFinished').textContent = getBooks().filter(
        (b) => b.status === 'finished'
      ).length;
    }
    function filteredBooks() {
      const q = $('searchInput').value.trim().toLowerCase();
      const status = $('statusFilter').value;
      const rating = $('ratingFilter').value;
      let list = getBooks().filter((b) => {
        const hay = [
          b.title,
          b.volume,
          b.author,
          b.isbn,
          b.publisher,
          b.location,
          (b.tags || []).join(' ')
        ]
          .join(' ')
          .toLowerCase();
        return (
          (!q || hay.includes(q)) &&
          (status === 'all' || b.status === status) &&
          (rating === 'all' || Number(b.rating || 0) === Number(rating))
        );
      });
      switch ($('sortSelect').value) {
        case 'rating_desc':
          list.sort(
            (a, b) =>
              Number(b.rating || 0) - Number(a.rating || 0) ||
              (b.updatedAt || '').localeCompare(a.updatedAt || '')
          );
          break;
        case 'title_asc':
          list.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
          break;
        case 'author_asc':
          list.sort((a, b) =>
            (a.author || '').localeCompare(b.author || '', 'ja')
          );
          break;
        case 'finished_desc':
          list.sort((a, b) =>
            (b.finishedDate || '').localeCompare(a.finishedDate || '')
          );
          break;
        default:
          list.sort((a, b) =>
            (b.updatedAt || '').localeCompare(a.updatedAt || '')
          );
      }
      return list;
    }
    function render() {
      covers.clearCards();
      $('recoveryNotice').hidden = !hasStorageError();
      $('exportBtn').disabled = hasStorageError();
      $('addBookBtn').disabled = hasStorageError() || isBusy();
      $('rescueBtn').disabled = store.raw() == null;
      renderStats();
      grid.innerHTML = '';
      const list = filteredBooks();
      empty.hidden = list.length > 0;
      empty.textContent = getBooks().length
        ? '条件に一致する本がありません。'
        : '本がまだありません。「本を追加」から登録してください。';
      if (hasStorageError()) {
        empty.textContent =
          '保存データを表示できません。上の案内から復旧してください。';
        ['statTotal', 'statUnread', 'statReading', 'statFinished'].forEach(
          (id) => ($(id).textContent = '—')
        );
      }
      for (const b of list) {
        const node =
          $('bookCardTemplate').content.firstElementChild.cloneNode(true);
        node.querySelector('.status-badge').textContent =
          statusLabels[b.status] || '';
        node.querySelector('.rating').textContent = Number(b.rating)
          ? '★'.repeat(Number(b.rating))
          : '';
        node.querySelector('.book-title').textContent = [b.title, b.volume]
          .filter(Boolean)
          .join(' ');
        node.querySelector('.book-author').textContent =
          b.author || '著者未登録';
        const tags = node.querySelector('.tag-list');
        (b.tags || []).slice(0, 4).forEach((t) => {
          const s = document.createElement('span');
          s.className = 'tag';
          s.textContent = t;
          tags.appendChild(s);
        });
        const meta = [
          b.format,
          b.location,
          b.finishedDate ? `読了 ${b.finishedDate}` : ''
        ]
          .filter(Boolean)
          .join(' ・ ');
        node.querySelector('.book-meta').textContent = meta;
        node
          .querySelector('.card-hit')
          .addEventListener('click', () => openEditor(b.id));
        node
          .querySelector('.card-hit')
          .setAttribute(
            'aria-label',
            `${[b.title, b.volume].filter(Boolean).join(' ')}を編集`
          );
        grid.appendChild(node);
        covers.renderCard(node, b);
      }
    }

    return { render };
  }
};
