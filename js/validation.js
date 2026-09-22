const statusLabels = { unread: "未読", reading: "読書中", finished: "読了", paused: "中断" };
// Shared by stored books, backup imports and NDL metadata. Never invent a month.
function normalizePublicationMonth(value){
  const text=String(value ?? '').trim();
  const match=text.match(/^(\d{4})([-./])(\d{1,2})(?:\2(\d{1,2}))?$/) || text.match(/^(\d{4})(年)(\d{1,2})月(?:(\d{1,2})日)?$/);
  if(!match)return '';
  const year=Number(match[1]),month=Number(match[3]);
  if(year<1||month<1||month>12)return '';
  if(match[4]){
    const leap=year%4===0&&(year%100!==0||year%400===0);
    const max=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
    if(Number(match[4])<1||Number(match[4])>max)return '';
  }
  return `${match[1]}-${String(month).padStart(2,'0')}`;
}
function validateBooks(value){
  if(!Array.isArray(value)) throw new Error('書籍の一覧ではありません。');
  const ids = new Set();
  return value.map(book => {
    if(!book || typeof book !== 'object' || Array.isArray(book) ||
      typeof book.id !== 'string' || !book.id.trim() || ids.has(book.id) ||
      typeof book.title !== 'string' || !book.title.trim()) throw new Error('書籍のIDまたはタイトルが不正です。');
    ids.add(book.id);
    for(const key of ['volume','author','isbn','publisher','publishedDate','purchaseDate','format','location','startedDate','finishedDate','notes','createdAt','updatedAt']){
      if(book[key] != null && typeof book[key] !== 'string') throw new Error('書籍の項目が不正です。');
    }
    if(book.status != null && !Object.hasOwn(statusLabels, book.status)) throw new Error('読書状態が不正です。');
    if(book.tags != null && (!Array.isArray(book.tags) || book.tags.some(tag => typeof tag !== 'string'))) throw new Error('タグが不正です。');
    if(book.rating != null && typeof book.rating !== 'number' && typeof book.rating !== 'string') throw new Error('評価が不正です。');
    const rating = book.rating == null ? 0 : Number(book.rating);
    if(!Number.isInteger(rating) || rating < 0 || rating > 5) throw new Error('評価が不正です。');
    if(book.price != null && (typeof book.price !== 'number' || !Number.isFinite(book.price) || book.price < 0)) throw new Error('購入価格が不正です。');
    if (book.identifier != null && (typeof book.identifier !== 'object' || !['','ISBN','ASIN'].includes(book.identifier.type) || typeof book.identifier.value !== 'string')) throw new Error('識別子が不正です。');
    const identifier = BookISBN.identifier(book);
    book = {...book, identifier, format:book.format === '電子書籍' ? '電子書籍(その他)' : book.format,
      isbn:identifier.type === 'ISBN' ? identifier.value : '',
      asinConfirmed:identifier.type === 'ASIN' && book.asinConfirmed === BookISBN.asin(identifier.value) ? book.asinConfirmed : ''};
    const coverId = typeof book.coverId === 'string' && /^[A-Za-z0-9-]{1,100}$/.test(book.coverId) ? book.coverId : null;
    return {...book, publishedDate:normalizePublicationMonth(book.publishedDate), googleCover:GoogleCoverData.clean(book.googleCover,book.isbn), googleCoverStatus:['missing','error'].includes(book.googleCoverStatus)?book.googleCoverStatus:'', coverId, status:book.status ?? 'unread', tags:book.tags ?? [], rating};
  });
}
