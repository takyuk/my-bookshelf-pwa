const BookImages = (() => {
  let database;
  function open(){
    if(!database)database=new Promise((resolve,reject)=>{
      const request=indexedDB.open('my-bookshelf-images',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('images',{keyPath:'id'});
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('別の本棚画面を閉じてからやり直してください。'));
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
    }).catch(error=>{database=null;throw error;});
    return database;
  }
  async function transact(mode,action){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('images',mode);let result;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(tx.error||new Error('画像を保存できませんでした。'));
      tx.onerror=()=>{};
      try{action(tx.objectStore('images'),value=>{result=value;});}catch(error){tx.abort();reject(error);}
    });
  }
  const get=id=>transact('readonly',(store,done)=>{const r=store.get(id);r.onsuccess=()=>done(r.result);});
  const putAll=records=>transact('readwrite',store=>{for(const record of records)store.put(record);});
  // Only call while holding BookStorage.key's Web Lock and after the book commit.
  const collect=books=>transact('readwrite',store=>{
    const live=new Set(books.map(b=>b.coverId).filter(Boolean));
    const r=store.openCursor();r.onsuccess=()=>{const cursor=r.result;if(cursor){if(!live.has(cursor.key))cursor.delete();cursor.continue();}};
  });
  return {get,putAll,collect};
})();
