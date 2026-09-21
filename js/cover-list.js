const BookCoverList = {
  create() {
    const el = (id) => document.getElementById(id);
    const urls = new Set();
    function clearCards() {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
      el('googleListCredit').hidden = true;
    }
    async function renderCard(node, book) {
      if (!book.coverId) {
        const value = GoogleCoverData.clean(book.googleCover, book.isbn);
        if (value && navigator.onLine !== false)
          el('googleListCredit').hidden = false;
        const box = document.createElement('div');
        box.className = 'google-card-cover';
        node.querySelector('.cover').replaceWith(box);
        BookCoverView.mount(box, value, book.googleCoverStatus, {
          showLogo: false,
          linkImage: false,
          title: [book.title, book.volume].filter(Boolean).join(' ')
        });
        return;
      }
      const cover = node.querySelector('.cover');
      try {
        const stored = await BookImages.get(book.coverId);
        if (!node.isConnected) return;
        if (!stored?.blob) throw new Error();
        const img = document.createElement('img'),
          url = URL.createObjectURL(stored.blob);
        urls.add(url);
        img.alt = '';
        img.src = url;
        img.onerror = () => {
          img.remove();
          cover.textContent = '画像なし';
          URL.revokeObjectURL(url);
          urls.delete(url);
        };
        cover.replaceChildren(img);
      } catch {
        if (node.isConnected) {
          cover.textContent = '画像なし';
          cover.title = '書影を読み込めません。書籍情報は保持されています。';
        }
      }
    }
    return { clearCards, renderCard };
  }
};
