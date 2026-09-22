// Shared checksum validation for browser and relay. ISBN-10 is normalized to ISBN-13.
const BookISBN = (() => {
  function normalize(value){
    let isbn=String(value ?? '').normalize('NFKC').replace(/[\s-]/g,'').toUpperCase();
    if(/^\d{9}[\dX]$/.test(isbn)){
      const sum=[...isbn].reduce((total,char,index)=>total+(char==='X' ? 10 : Number(char))*(10-index),0);
      if(sum%11) return null;
      isbn='978'+isbn.slice(0,9);
      const check=(10-[...isbn].reduce((sum,char,index)=>sum+Number(char)*(index%2 ? 3 : 1),0)%10)%10;
      return isbn+check;
    }
    if(!/^97[89]\d{10}$/.test(isbn)) return null;
    return [...isbn].reduce((sum,char,index)=>sum+Number(char)*(index%2 ? 3 : 1),0)%10===0 ? isbn : null;
  }
  const kindle = '電子書籍(Kindle)';
  function asin(value) {
    const text = String(value ?? '').normalize('NFKC').trim().toUpperCase();
    return /^[A-Z0-9]{10}$/.test(text) ? text : null;
  }
  function identify(value, format) {
    const text = String(value ?? '').trim();
    if (!text) return {type: '', value: ''};
    if (format === kindle) return {type: asin(text) ? 'ASIN' : '', value: asin(text) || text};
    const isbn = normalize(text);
    if (isbn) return {type: 'ISBN', value: format === 'その他' ? text : isbn};
    if (format === 'その他' && asin(text)) return {type: 'ASIN', value: text};
    return {type: '', value: text};
  }
  function identifier(book) {
    // Old records only had ISBN. Do not reinterpret malformed legacy ISBNs as ASINs.
    return book?.identifier || {type: normalize(book?.isbn) ? 'ISBN' : '', value: String(book?.isbn ?? '')};
  }
  function key(book) {
    const id = identifier(book);
    const value = id.type === 'ISBN' ? normalize(id.value) : id.type === 'ASIN' ? asin(id.value) : null;
    return value ? `${id.type}:${value}` : '';
  }
  return {normalize, asin, identify, identifier, key, kindle};
})();
if(typeof module !== 'undefined') module.exports=BookISBN;
