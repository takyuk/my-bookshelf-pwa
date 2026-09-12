const statusLabels = { unread: "未読", reading: "読書中", finished: "読了", paused: "中断" };
function validateBooks(value){
  if(!Array.isArray(value)) throw new Error('書籍の一覧ではありません。');
  const ids = new Set();
  return value.map(book => {
    if(!book || typeof book !== 'object' || Array.isArray(book) ||
      typeof book.id !== 'string' || !book.id.trim() || ids.has(book.id) ||
      typeof book.title !== 'string' || !book.title.trim()) throw new Error('書籍のIDまたはタイトルが不正です。');
    ids.add(book.id);
    for(const key of ['author','isbn','publisher','publishedDate','purchaseDate','format','location','startedDate','finishedDate','notes','createdAt','updatedAt']){
      if(book[key] != null && typeof book[key] !== 'string') throw new Error('書籍の項目が不正です。');
    }
    if(book.status != null && !Object.hasOwn(statusLabels, book.status)) throw new Error('読書状態が不正です。');
    if(book.tags != null && (!Array.isArray(book.tags) || book.tags.some(tag => typeof tag !== 'string'))) throw new Error('タグが不正です。');
    if(book.rating != null && typeof book.rating !== 'number' && typeof book.rating !== 'string') throw new Error('評価が不正です。');
    const rating = book.rating == null ? 0 : Number(book.rating);
    if(!Number.isInteger(rating) || rating < 0 || rating > 5) throw new Error('評価が不正です。');
    if(book.price != null && (typeof book.price !== 'number' || !Number.isFinite(book.price) || book.price < 0)) throw new Error('購入価格が不正です。');
    const coverId = typeof book.coverId === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(book.coverId) ? book.coverId : null;
    return {...book, coverId, status:book.status ?? 'unread', tags:book.tags ?? [], rating};
  });
}
