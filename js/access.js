const BookAccess=(()=>{
 function required(){
  document.querySelectorAll('.access-notice').forEach(node=>{node.hidden=false;});
 }
 async function request(url,options={}){
  const protectedApp=globalThis.BOOKSHELF_CATALOG?.access===true;
  const response=await fetch(url,{...options,credentials:'same-origin',...(protectedApp?{redirect:'manual'}:{})});
  if(protectedApp&&(response.type==='opaqueredirect'||response.redirected||[401,403].includes(response.status))){
   required();throw new Error('認証の有効期限が切れたか、アクセスが許可されていません。「再ログイン」後に検索をやり直してください。');
  }
  if(protectedApp&&response.headers.get('content-type')?.includes('text/html')){
   required();throw new Error('認証が必要です。「再ログイン」後に検索をやり直してください。');
  }
  return response;
 }
 if(typeof navigator!=='undefined')navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='ACCESS_REQUIRED')required();});
 return {request};
})();
