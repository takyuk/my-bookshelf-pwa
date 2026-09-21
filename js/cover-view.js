const BookCoverView = (() => {
  const placeholder = './icons/cover-unavailable.png';
  const logo = './icons/powered-by-google.png';
  function fallback(container, message) {
    const image = document.createElement('img');
    image.src = placeholder;
    image.alt = '書影なし';
    image.className = 'cover-placeholder';
    container.replaceChildren(image);
    if (message) {
      const note = document.createElement('small');
      note.textContent = message;
      container.append(note);
    }
  }
  function mount(
    container,
    value,
    status,
    { showLogo = true, linkImage = true, title = '' } = {}
  ) {
    container.hidden = false;
    if (navigator.onLine === false) {
      fallback(container, 'オフラインのため書影を表示できません。');
      return;
    }
    if (!value) {
      fallback(
        container,
        status === 'error' ? '書影を取得できませんでした。' : ''
      );
      return;
    }
    const link = document.createElement('a');
    link.href = value.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'google-cover-link';
    link.setAttribute('aria-label', '書影をGoogle Booksで見る');
    const img = document.createElement('img');
    img.alt = 'Google Booksの書影';
    img.referrerPolicy = 'no-referrer';
    img.className = 'google-cover-image';
    const credit = document.createElement('div');
    credit.className = 'google-credit';
    const brand = document.createElement('img');
    brand.src = logo;
    brand.alt = 'Powered by Google';
    const source = document.createElement('a');
    source.href = value.link;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Google Booksで見る ↗';
    if (title)
      source.setAttribute('aria-label', title + 'をGoogle Booksで見る');
    if (showLogo) credit.append(brand);
    credit.append(source);
    link.append(img);
    container.replaceChildren(linkImage ? link : img, credit);
    img.onerror = () => {
      if (container.contains(img))
        fallback(
          container,
          navigator.onLine === false
            ? 'オフラインのため書影を表示できません。'
            : '書影を表示できません。'
        );
    };
    img.src = value.url;
  }
  return { mount, fallback };
})();
