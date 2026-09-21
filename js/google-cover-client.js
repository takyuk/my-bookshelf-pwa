const GoogleCoverClient = {
  async search(isbn, signal) {
    const url = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
      ? new URL('/api/google-cover', location.href)
      : new URL(CatalogClient.endpoint());
    url.pathname = '/api/google-cover';
    url.search = '';
    url.searchParams.set('isbn', isbn);
    const response = await (
      typeof BookAccess !== 'undefined' ? BookAccess.request : fetch
    )(url, { signal: signal, credentials: 'omit', cache: 'no-store' });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('書影検索の応答を読み取れませんでした。');
    }
    if (!response.ok) {
      const messages = {
        'GOOGLE-CONFIG':
          '書影検索は未設定です。管理者によるAPIキーの設定が必要です。',
        'GOOGLE-TIMEOUT': '書影検索が時間切れになりました。再度お試しください。'
      };
      throw new Error(
        messages[data.error] ||
          (response.status === 429
            ? '書影検索が混み合っています。時間を置いて再度お試しください。'
            : '書影を取得できませんでした。再度お試しください。')
      );
    }
    const cover = GoogleCoverData.clean(data.cover, isbn);
    if (data.cover && !cover)
      throw new Error('書影検索の応答を読み取れませんでした。');
    return cover;
  }
};
