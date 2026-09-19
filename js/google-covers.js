const GoogleCovers=(()=>{
 const placeholder='./icons/cover-unavailable.png';
 const logo='./icons/powered-by-google.png';
 function fallback(container,message){
  const image=document.createElement('img');image.src=placeholder;image.alt='書影なし';image.className='cover-placeholder';
  const note=document.createElement('small');note.textContent=message;container.replaceChildren(image,note);
 }
 function mount(container,value,status,{showLogo=true,linkImage=true,title=''}={}){
  container.hidden=false;
  if(navigator.onLine===false){fallback(container,'オフラインのため書影を表示できません。');return;}
  if(!value){fallback(container,status==='error'?'書影を取得できませんでした。':'書影がありません。');return;}
  const link=document.createElement('a');link.href=value.link;link.target='_blank';link.rel='noopener noreferrer';link.className='google-cover-link';link.setAttribute('aria-label','書影をGoogle Booksで見る');
  const img=document.createElement('img');img.alt='Google Booksの書影';img.referrerPolicy='no-referrer';img.className='google-cover-image';
  const credit=document.createElement('div');credit.className='google-credit';
  const brand=document.createElement('img');brand.src=logo;brand.alt='Powered by Google';
  const source=document.createElement('a');source.href=value.link;source.target='_blank';source.rel='noopener noreferrer';source.textContent='Google Booksで見る ↗';
  if(title)source.setAttribute('aria-label',title+'をGoogle Booksで見る');
  if(showLogo)credit.append(brand);
  credit.append(source);link.append(img);container.replaceChildren(linkImage?link:img,credit);
  img.onerror=()=>{if(container.contains(img))fallback(container,navigator.onLine===false?'オフラインのため書影を表示できません。':'書影を表示できません。');};
  img.src=value.url;
 }
 function create({isBusy,hasLocal,isLocalLoading}){
  const el=id=>document.getElementById(id),view=el('googleCoverPreview'),button=el('searchGoogleCover');
  let value=null,status='',serial=0,controller=null;
  function cancel(){serial++;controller?.abort();controller=null;button.disabled=false;}
  function current(){return GoogleCoverData.clean(value,el('isbn').value);}
  function show(){view.hidden=hasLocal();if(!hasLocal())mount(view,value,status,{showLogo:false});}
  function reset(book){cancel();value=GoogleCoverData.clean(book?.googleCover,book?.isbn);status=book?.googleCoverStatus||'';show();el('googleCoverStatus').textContent='';}
  function clear(){cancel();value=null;status='';show();}
  async function search(){
   if(isBusy()||isLocalLoading())return;
   cancel();
   if(hasLocal()){el('googleCoverStatus').textContent='撮影・選択した画像を優先しています。Google書影へ変更する場合は、先に書影を削除してください。';return;}
   const isbn=BookISBN.normalize(el('isbn').value);
   if(!isbn){el('googleCoverStatus').textContent='正しいISBNを入力してください。';return;}
   value=null;status='';show();
   if(navigator.onLine===false){status='error';el('googleCoverStatus').textContent='オフラインのため書影を検索できません。';show();return;}
   const token=serial;controller=new AbortController();const active=controller;let timer;
   button.disabled=true;el('googleCoverStatus').textContent='Google Booksで書影を検索しています…';
   try{
    const url=['localhost','127.0.0.1','[::1]'].includes(location.hostname)?new URL('/api/google-cover',location.href):new URL(CatalogClient.endpoint());url.pathname='/api/google-cover';url.search='';url.searchParams.set('isbn',isbn);
    timer=setTimeout(()=>active.abort(),15000);
    const response=await fetch(url,{signal:active.signal,credentials:'omit',cache:'no-store'});
    let data;try{data=await response.json();}catch{throw new Error('書影検索の応答を読み取れませんでした。');}
    if(!response.ok){
     const messages={'GOOGLE-CONFIG':'書影検索は未設定です。管理者によるAPIキーの設定が必要です。','GOOGLE-TIMEOUT':'書影検索が時間切れになりました。再度お試しください。'};
     throw new Error(messages[data.error]||(response.status===429?'書影検索が混み合っています。時間を置いて再度お試しください。':'書影を取得できませんでした。再度お試しください。'));
    }
    const cover=GoogleCoverData.clean(data.cover,isbn);if(data.cover&&!cover)throw new Error('書影検索の応答を読み取れませんでした。');
    if(token!==serial||hasLocal()||BookISBN.normalize(el('isbn').value)!==isbn||!el('bookDialog').open)return;
    value=cover;status=cover?'':'missing';show();el('googleCoverStatus').textContent=cover?'書影を取得しました。「保存」で確定します。':'このISBNの書影が見つかりませんでした。書誌情報は保存できます。';
   }catch(error){if(token===serial&&!hasLocal()&&el('bookDialog').open){status='error';show();el('googleCoverStatus').textContent=error.name==='AbortError'?'書影検索が時間切れになりました。再度お試しください。':error instanceof TypeError?'書影検索に接続できませんでした。通信を確認してください。':error.message;}}
   finally{clearTimeout(timer);if(token===serial){controller=null;button.disabled=false;}}
  }
  button.addEventListener('click',search);
  el('isbn').addEventListener('input',()=>{if(value&&current())return;clear();el('googleCoverStatus').textContent='';});
  document.addEventListener('bookshelf-save-start',cancel);
  el('bookDialog').addEventListener('close',cancel);window.addEventListener('pagehide',cancel);
  window.addEventListener('offline',show);window.addEventListener('online',show);
  return {reset,clear,cancel,show,data:()=>({googleCover:current(),googleCoverStatus:status})};
 }
 return {create,mount,fallback};
})();
