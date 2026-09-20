(() => {
  const byId=id=>document.getElementById(id);
  const formDialog=byId('bookDialog');
  const isbnInput=byId('isbn');
  const status=byId('catalogStatus');
  const scanButton=byId('scanIsbnBtn');
  const lookupButton=byId('lookupIsbnBtn');
  const panel=byId('scannerPanel');
  const video=byId('barcodeVideo');
  const candidates=byId('catalogCandidates');
  let requestId=0, abortController;
  function message(text){ status.textContent=text; }
  function cancelLookup(){
    ++requestId;abortController?.abort();abortController=null;
    lookupButton.disabled=false;candidates.replaceChildren();
    byId('catalogSource').hidden=true;
  }
  const errorText=CatalogErrors.text;
  function apply(book, initial, id, overwrite){
    if(id!==requestId || !formDialog.open || BookISBN.normalize(isbnInput.value)!==book.isbn) return;
    let filled=0;
    for(const name of ['title','volume','author','publisher','publishedDate']){
      const input=byId(name);
      // Never overwrite edits made while waiting for the API or choosing a record.
      if(book[name] && input.value===initial[name] && (overwrite || !input.value.trim())){input.value=book[name];filled++;}
    }
    const source=byId('catalogSource');source.hidden=!book.source;
    if(book.source){source.href=book.source;source.textContent='出典：国立国会図書館サーチ';}
    message(`${filled}項目を自動入力しました。内容を確認して「保存」を押してください。${book.issued && !book.publishedDate ? ` 刊行情報：${book.issued}（年月が確定しないため刊行年月の自動入力は省略）` : ''}${!overwrite ? ' 入力済みの項目は保持しています。' : ''}`);
    candidates.replaceChildren();
  }
  async function lookup(){
    cancelLookup();stopCamera();
    const isbn=BookISBN.normalize(isbnInput.value);
    if(!isbn){message('正しいISBNを入力してください（10桁または978・979から始まる13桁）。');return;}
    isbnInput.value=isbn;
    const id=requestId;
    const initial=Object.fromEntries(['title','volume','author','publisher','publishedDate'].map(name=>[name,byId(name).value]));
    const overwrite=byId('overwriteBibliography').checked;
    abortController=new AbortController();
    const controller=abortController;
    let timeout;
    try {
      const url=CatalogClient.endpoint();url.searchParams.set('isbn',isbn);
      lookupButton.disabled=true;message('国立国会図書館サーチで検索しています…');
      timeout=setTimeout(()=>controller.abort(),15000);
      const xml=await CatalogClient.fetchXml(url,controller.signal);
      if(id!==requestId || !formDialog.open) return;
      const books=CatalogClient.parse(xml,isbn);
      if(!books.length){message(errorText('NDL-NOT-FOUND'));return;}
      if(books.length===1){apply(books[0],initial,id,overwrite);return;}
      message('複数の書誌情報が見つかりました。お手元の版を選択してください。');
      for(const book of books){
        const button=document.createElement('button');button.type='button';button.className='ghost catalog-choice';
        button.textContent=[book.title,book.volume,book.author,book.publisher,book.issued].filter(Boolean).join(' / ');
        button.addEventListener('click',()=>apply(book,initial,id,overwrite));candidates.appendChild(button);
      }
    } catch(error){
      if(id===requestId) message(error.name==='AbortError' ? errorText('APP-TIMEOUT') : (error instanceof TypeError ? errorText('APP-CONNECTION') : error.message));
    } finally {clearTimeout(timeout);if(id===requestId){lookupButton.disabled=false;abortController=null;}}
  }
  const scanner=IsbnScanner.create({scanButton,panel,video,formDialog,message,beforeStart:cancelLookup,onISBN:isbn=>{isbnInput.value=isbn;isbnInput.dispatchEvent(new Event('input',{bubbles:true}));lookup();}});
  function stopCamera(){scanner.stop();}
  scanButton.addEventListener('click',scanner.start);
  lookupButton.addEventListener('click',lookup);
  byId('stopScanBtn').addEventListener('click',()=>{stopCamera();message('読み取りを中止しました。');});
  isbnInput.addEventListener('input',()=>{cancelLookup();message('');});
  function reset(){stopCamera();cancelLookup();message('');}
  document.addEventListener('bookshelf-form-reset',reset);
  document.addEventListener('bookshelf-stop-camera',stopCamera);
  document.addEventListener('bookshelf-save-start',reset);
  formDialog.addEventListener('close',reset);
  window.addEventListener('pagehide',reset);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden') stopCamera();});
})();
