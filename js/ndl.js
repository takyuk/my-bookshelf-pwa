const NdlBooks = (() => {
  const DC='http://purl.org/dc/elements/1.1/';
  const NDL='http://ndl.go.jp/dcndl/terms/';
  const TERMS='http://purl.org/dc/terms/';
  const XSI='http://www.w3.org/2001/XMLSchema-instance';
  function cleanAuthor(value){
    let name=String(value ?? '').trim().replace(/[０-９]/g,char=>String(char.charCodeAt(0)-0xff10));
    // Remove recognized authority-record qualifiers, not arbitrary parts of a name.
    const dates='(?:[約?]?\\d{3,4}\\??\\s*(?:[-–—−〜～]\\s*(?:[約?]?\\d{3,4}\\??)?)?|[-–—−〜～]\\s*\\d{3,4}\\??)(?:年)?(?:生|没)?';
    const roles='著|著者|共著|編|編者|編集|編著|共編|監修|訳|訳者|翻訳|編訳|作|原作|文|絵|画|写真|撮影|author|editor|translator|illustrator';
    const qualifiers=`(?:${dates}|${roles}|小説家|詩人|作家|文学者|翻訳家|漫画家|画家)`;
    const bracketed=new RegExp(`\\s*[(（\\[［]\\s*${qualifiers}\\s*[)）\\]］]\\s*$`,'i');
    const trailing=new RegExp(`(?:[,，]\\s*|\\s+)${qualifiers}\\s*$`,'i');
    let previous;
    do {previous=name;name=name.replace(bracketed,'').replace(trailing,'').trim();} while(name!==previous);
    // Japanese authority headings separate family and given names with commas.
    // Preserve Western name order, initials, hyphens, and generational suffixes.
    if(!/[A-Za-z]/.test(name)) name=name.replace(/[,，]\s*/g,'');
    return name.trim();
  }
  function fullDate(value){
    const match=String(value).trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if(!match) return '';
    const result=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
    const parsed=new Date(result+'T00:00:00Z');
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10)===result ? result : '';
  }
  function parse(xml, isbn){
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    if(doc.getElementsByTagName('parsererror').length || !doc.getElementsByTagName('channel').length) throw new Error('書誌情報の応答を読み取れませんでした。');
    const texts=(item,ns,name)=>Array.from(item.getElementsByTagNameNS(ns,name)).map(node=>node.textContent.trim()).filter(Boolean);
    const books=[];
    for(const item of doc.getElementsByTagName('item')){
      const identifiers=Array.from(item.getElementsByTagNameNS(DC,'identifier'));
      if(!identifiers.some(node=>/ISBN/.test(node.getAttributeNS(XSI,'type') || '') && BookISBN.normalize(node.textContent)===isbn)) continue;
      const title=texts(item,DC,'title')[0] || '';
      if(!title) continue;
      const issued=texts(item,TERMS,'issued')[0] || texts(item,DC,'date')[0] || '';
      const link=item.getElementsByTagName('link')[0]?.textContent.trim() || '';
      const source=/^https:\/\/ndlsearch\.ndl\.go\.jp\/books\//.test(link) ? link : '';
      books.push({isbn,title,volume:texts(item,NDL,'volume')[0] || '',author:[...new Set(texts(item,DC,'creator').map(cleanAuthor).filter(Boolean))].join(' / '),publisher:[...new Set(texts(item,DC,'publisher'))].join(' / '),publishedDate:fullDate(issued),issued,source});
    }
    return books;
  }
  return {parse,fullDate,cleanAuthor};
})();
