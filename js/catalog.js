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
  const errorMessages={
  "NDL-NOT-FOUND": "このISBNに一致する書誌情報が見つかりませんでした。ISBNを確認するか、手入力してください。",
  "NDL-400": "国会図書館への検索条件が受け付けられませんでした。",
  "NDL-401": "国会図書館へのアクセスが拒否されました。時間を置いて再度お試しください。",
  "NDL-403": "国会図書館へのアクセスが拒否されました。時間を置いて再度お試しください。",
  "NDL-404": "国会図書館の検索APIが見つかりませんでした。検索先の確認が必要です。",
  "NDL-429": "国会図書館からアクセス制限の応答がありました。しばらく待って再度お試しください。",
  "NDL-REDIRECT": "国会図書館から転送の応答があり、取得を完了できませんでした。",
  "NDL-TIMEOUT": "国会図書館からの応答待ちが時間切れになりました。再度検索してください。",
  "NDL-NETWORK": "中継APIから国会図書館への通信に失敗しました。再度検索してください。",
  "NDL-TOO-LARGE": "国会図書館の応答が大きすぎるため、取得を中断しました。",
  "NDL-INVALID-RESPONSE": "国会図書館の応答を読み取れませんでした。再度検索してください。",
  "RELAY-400": "中継APIがISBNを受け付けませんでした。入力内容を確認してください。",
  "RELAY-403": "このアプリから中継APIへのアクセスが許可されていません。公開URLの設定確認が必要です。",
  "RELAY-404": "書誌検索の中継APIが見つかりませんでした。検索先の設定確認が必要です。",
  "RELAY-405": "中継APIが検索の通信方法を受け付けませんでした。",
  "RELAY-429": "中継APIで検索が混み合っています。少し待って再度お試しください。",
  "RELAY-INTERNAL": "中継APIの処理中にエラーが発生しました。",
  "RELAY-UNKNOWN": "中継APIからエラーが返されましたが、詳細を確認できませんでした。",
  "APP-TIMEOUT": "書誌検索全体の待ち時間が上限に達しました。通信や中継APIの待ち時間が原因の可能性があります。",
  "APP-CONNECTION": "中継APIへ接続できませんでした。通信状態、アクセス許可、検索先の設定を確認してください。",
  "APP-CONFIG": "書誌検索先が設定されていないか、設定が不正です。"
};
  function errorText(code){
    let text=errorMessages[code];
    if(!text && /^NDL-[1-5][0-9]{2}$/.test(code)) text=/^NDL-5/.test(code) ? '国会図書館からサーバーエラーが返されました。時間を置いて再度お試しください。' : '国会図書館から想定外の応答が返されました。';
    if(!text && /^RELAY-5[0-9]{2}$/.test(code)) text='中継サービスからエラーが返されました。時間を置いて再度お試しください。';
    if(!text){code='RELAY-UNKNOWN';text=errorMessages[code];}
    return text+'【'+code+'】';
  }
  async function responseError(response){
    let data;
    try {data=JSON.parse(await response.text());} catch(error){if(error.name==='AbortError' || error instanceof TypeError) throw error;}
    const code=data?.error?.code;
    if(typeof code==='string' && /^(NDL|RELAY)-/.test(code) && (Object.hasOwn(errorMessages,code) || /^(NDL-[1-5]|RELAY-5)[0-9]{2}$/.test(code))) return errorText(code);
    if([400,403,404,405,429].includes(response.status) || response.status>=500 && response.status<=599) return errorText('RELAY-'+response.status);
    return errorText('RELAY-UNKNOWN');
  }
  function endpoint(){
    const configured=globalThis.BOOKSHELF_CATALOG?.endpoint;
    if(configured){
      let url;try{url=new URL(configured,location.href);}catch{throw new Error(errorText('APP-CONFIG'));}
      if(url.protocol!=='https:' && !(['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.protocol==='http:')) throw new Error(errorText('APP-CONFIG'));
      return url;
    }
    if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)) return new URL('/api/ndl',location.href);
    throw new Error(errorText('APP-CONFIG'));
  }
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
    message(`${filled}項目を自動入力しました。内容を確認して「保存」を押してください。${book.issued && !book.publishedDate ? ` 刊行情報：${book.issued}（日付が確定しないため刊行日は未入力）` : ''}${!overwrite ? ' 入力済みの項目は保持しています。' : ''}`);
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
      const url=endpoint();url.searchParams.set('isbn',isbn);
      lookupButton.disabled=true;message('国立国会図書館サーチで検索しています…');
      timeout=setTimeout(()=>controller.abort(),15000);
      const response=await fetch(url,{signal:controller.signal,credentials:'omit',cache:'no-store'});
      if(!response.ok) throw new Error(await responseError(response));
      const xml=await response.text();
      if(id!==requestId || !formDialog.open) return;
      let books;try{books=NdlBooks.parse(xml,isbn);}catch{throw new Error(errorText('NDL-INVALID-RESPONSE'));}
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
