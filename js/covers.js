const BookCovers = (() => {
  const el=id=>document.getElementById(id);
  let coverId=null,record=null,generation=0,loading=false,previewURL=null;
  const urls=new Set();
  function clearPreview(){if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;el('coverPreview').removeAttribute('src');el('coverPreview').hidden=true;}
  function preview(blob){clearPreview();previewURL=URL.createObjectURL(blob);el('coverPreview').src=previewURL;el('coverPreview').hidden=false;}
  async function reset(book){
    const token=++generation;loading=false;coverId=book?.coverId||null;record=null;clearPreview();el('coverStatus').textContent='';
    if(coverId){try{const stored=await BookImages.get(coverId);if(token!==generation)return;if(!stored?.blob)throw new Error();preview(stored.blob);}catch{if(token===generation)el('coverStatus').textContent='書影が見つかりません。書籍情報は保持されています。撮影または選択で再登録できます。';}}
  }
  async function select(event,source){
    const file=event.target.files?.[0];event.target.value='';if(!file||busy)return;
    const token=++generation;loading=true;el('coverStatus').textContent='画像を確認しています…';
    try{
      const image=await ImageCodec.fromFile(file);
      if(token!==generation)return;
      coverId=crypto.randomUUID();record={id:coverId,blob:image.blob,source};preview(image.blob);
      el('coverStatus').textContent='プレビューを確認して「保存」を押してください。向き以外のExifを削除しました。';
    }catch(error){if(token===generation)el('coverStatus').textContent=`画像を登録できません。${error.message} 元の書影は変更していません。`;}
    finally{if(token===generation)loading=false;}
  }
  for(const [button,input,source] of [['takeCover','cameraCoverInput','camera'],['chooseCover','fileCoverInput','file']]){
    el(button).addEventListener('click',()=>{if(busy)return;document.dispatchEvent(new Event('bookshelf-stop-camera'));el(input).click();});
    el(input).addEventListener('change',event=>select(event,source));
  }
  el('removeCover').addEventListener('click',()=>{if(busy)return;++generation;loading=false;coverId=null;record=null;clearPreview();el('coverStatus').textContent='保存すると書影を削除します。書籍情報は残ります。';});
  el('bookDialog').addEventListener('close',()=>{++generation;loading=false;record=null;clearPreview();});
  el('coverPreview').addEventListener('error',()=>{el('coverStatus').textContent='書影を表示できません。別の画像を選択してください。';clearPreview();});
  function clearCards(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
  async function renderCard(node,book){
    if(!book.coverId)return;
    const cover=node.querySelector('.cover');
    try{
      const stored=await BookImages.get(book.coverId);if(!node.isConnected)return;if(!stored?.blob)throw new Error();
      const img=document.createElement('img'),url=URL.createObjectURL(stored.blob);urls.add(url);img.alt='';img.src=url;
      img.onerror=()=>{img.remove();cover.textContent='画像なし';URL.revokeObjectURL(url);urls.delete(url);};cover.replaceChildren(img);
    }catch{if(node.isConnected){cover.textContent='画像なし';cover.title='書影を読み込めません。書籍情報は保持されています。';}}
  }
  return {reset,clearCards,renderCard,loading:()=>loading,id:()=>coverId,records:()=>record?[record]:[]};
})();
