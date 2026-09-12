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
  let stream, controls, timer, scanSession=0, requestId=0, abortController;
  function message(text){ status.textContent=text; }
  function stopCamera(){
    ++scanSession;
    clearTimeout(timer);
    controls?.stop(); controls=null;
    stream?.getTracks().forEach(track=>track.stop());stream=null;
    video.srcObject=null;panel.hidden=true;scanButton.disabled=false;
  }
  function cancelLookup(){
    ++requestId;abortController?.abort();abortController=null;
    lookupButton.disabled=false;candidates.replaceChildren();
    byId('catalogSource').hidden=true;
  }
  function endpoint(){
    const configured=globalThis.BOOKSHELF_CATALOG?.endpoint;
    if(configured){
      const url=new URL(configured,location.href);
      if(url.protocol!=='https:' && !(['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.protocol==='http:')) throw new Error('書誌検索先の設定を確認してください。');
      return url;
    }
    if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)) return new URL('/api/ndl',location.href);
    throw new Error('書誌検索は準備中です。ISBNは入力済みです。タイトルなどは手入力できます。');
  }
  function apply(book, initial, id, overwrite){
    if(id!==requestId || !formDialog.open || BookISBN.normalize(isbnInput.value)!==book.isbn) return;
    let filled=0;
    for(const name of ['title','author','publisher','publishedDate']){
      const input=byId(name);
      // Never overwrite edits made while waiting for the API or choosing a record.
      if(book[name] && input.value===initial[name] && (overwrite || !input.value.trim())){input.value=book[name];filled++;}
    }
    const source=byId('catalogSource');source.hidden=!book.source;
    if(book.source){source.href=book.source;source.textContent='出典：国立国会図書館サーチ';}
    message(`${filled}項目を自動入力しました。内容を確認して「保存」を押してください。${book.issued && !book.publishedDate ? ` 刊行情報：${book.issued}（日付が確定しないため刊行日は未入力）` : ''}${!overwrite ? ' 入力済みの項目は保持しています。' : ''}`);
    candidates.replaceChildren();
  }
  async function lookup(){
    cancelLookup();stopCamera();
    const isbn=BookISBN.normalize(isbnInput.value);
    if(!isbn){message('正しいISBNを入力してください（10桁または978・979から始まる13桁）。');return;}
    isbnInput.value=isbn;
    const id=requestId;
    const initial=Object.fromEntries(['title','author','publisher','publishedDate'].map(name=>[name,byId(name).value]));
    const overwrite=byId('overwriteBibliography').checked;
    abortController=new AbortController();
    const controller=abortController;
    let timeout;
    try {
      const url=endpoint();url.searchParams.set('isbn',isbn);
      lookupButton.disabled=true;message('国立国会図書館サーチで検索しています…');
      timeout=setTimeout(()=>controller.abort(),15000);
      const response=await fetch(url,{signal:controller.signal,credentials:'omit',cache:'no-store'});
      if(!response.ok) throw new Error(response.status===429 ? '検索が混み合っています。少し待って再度お試しください。' : '書誌情報を取得できませんでした。通信を確認して再度検索してください。');
      const xml=await response.text();
      if(id!==requestId || !formDialog.open) return;
      const books=NdlBooks.parse(xml,isbn);
      if(!books.length){message('一致する書誌情報が見つかりませんでした。ISBNは保持しています。タイトルなどを手入力してください。');return;}
      if(books.length===1){apply(books[0],initial,id,overwrite);return;}
      message('複数の書誌情報が見つかりました。お手元の版を選択してください。');
      for(const book of books){
        const button=document.createElement('button');button.type='button';button.className='ghost catalog-choice';
        button.textContent=[book.title,book.author,book.publisher,book.issued].filter(Boolean).join(' / ');
        button.addEventListener('click',()=>apply(book,initial,id,overwrite));candidates.appendChild(button);
      }
    } catch(error){
      if(id===requestId) message(error.name==='AbortError' ? '検索がタイムアウトしました。ISBNは保持しています。再度お試しください。' : (error instanceof TypeError ? '書誌検索に接続できません。通信または検索先の設定を確認してください。' : error.message));
    } finally {clearTimeout(timeout);if(id===requestId){lookupButton.disabled=false;abortController=null;}}
  }
  async function startCamera(){
    cancelLookup();stopCamera();
    if(!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia){message('カメラはHTTPSで開いた対応ブラウザで利用できます。ISBNの手入力でも検索できます。');return;}
    if(!globalThis.ZXingBrowser){message('読み取り機能を読み込めませんでした。ページを再読み込みしてください。');return;}
    const session=scanSession;
    scanButton.disabled=true;panel.hidden=false;message('カメラを許可し、978または979から始まるバーコードを枠内に写してください。');
    let last='',hits=0;
    try {
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      if(session!==scanSession || !formDialog.open){acquired.getTracks().forEach(track=>track.stop());return;}
      stream=acquired;
      const reader=new ZXingBrowser.BrowserMultiFormatOneDReader(undefined,{delayBetweenScanAttempts:150,delayBetweenScanSuccess:150});
      const activeControls=await reader.decodeFromStream(stream,video,(result)=>{
        if(session!==scanSession || !result) return;
        const isbn=BookISBN.normalize(result.getText());
        if(!isbn){message('ISBN以外のバーコードです。978または979から始まる段を写してください。');return;}
        hits=last===isbn ? hits+1 : 1;last=isbn;
        if(hits<2) return;
        isbnInput.value=isbn;stopCamera();lookup();
      });
      if(session!==scanSession){activeControls.stop();return;}
      controls=activeControls;
      timer=setTimeout(()=>{if(session===scanSession){stopCamera();message('読み取りを終了しました。明るい場所で再度お試しいただくか、ISBNを手入力してください。');}},60000);
    } catch(error){
      if(session!==scanSession) return;
      stopCamera();
      const errors={NotAllowedError:'カメラの利用が許可されませんでした。ブラウザのカメラ設定を確認してください。',NotFoundError:'利用できるカメラが見つかりません。',NotReadableError:'カメラを起動できません。他のアプリが使用していないか確認してください。'};
      message(errors[error.name] || 'カメラを起動できませんでした。ISBNを手入力して検索できます。');
    }
  }
  scanButton.addEventListener('click',startCamera);
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
