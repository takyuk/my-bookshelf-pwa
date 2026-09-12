const BookBackup = (() => {
  const LIMIT=200*1024*1024;
  const MANIFEST_LIMIT=10*1024*1024;
  async function exportZip(books){
    const zip=new JSZip(),copy=books.map(b=>({...b})), warnings=[];
    let total=0;
    const entries=new Map();
    for(const book of copy){
      if(!book.coverId)continue;
      if(entries.has(book.coverId))continue;
      try{
        const record=await BookImages.get(book.coverId);
        if(!record?.blob)throw new Error();
        const image=ImageCodec.sanitize(await record.blob.arrayBuffer());
        total+=image.bytes.length;if(total>LIMIT)throw new RangeError('画像の合計が200MBを超えています。');
        const name=`images/${entries.size}.${image.extension}`;
        zip.file(name,image.bytes);entries.set(book.coverId,{path:name,source:record.source==='camera'?'camera':'file'});
      }catch(error){if(error instanceof RangeError)throw error;warnings.push(book.title);book.coverId=null;}
    }
    // References that could not be read must not remain in the exported manifest.
    for(const book of copy)if(book.coverId&&!entries.has(book.coverId))book.coverId=null;
    const manifest=JSON.stringify({version:2,exportedAt:new Date().toISOString(),books:copy,images:Object.fromEntries(entries)},null,2);
    if(new TextEncoder().encode(manifest).length>MANIFEST_LIMIT)throw new Error('書籍情報が大きすぎてZIPを作成できません。');
    zip.file('bookshelf.json',manifest);
    return {blob:await zip.generateAsync({type:'blob',compression:'STORE'}),warnings};
  }
  async function importFile(file){
    if(file.size>LIMIT+MANIFEST_LIMIT+1024*1024)throw new Error('バックアップのサイズ上限を超えています。');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes[0]!==80||bytes[1]!==75){
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if(!Array.isArray(data)&&(!data||(data.version!=null&&data.version!==1)))throw new Error('未対応のJSON形式です。');
      const books=validateBooks(Array.isArray(data)?data:data.books);
      return {books:books.map(b=>({...b,coverId:null})),records:[],warnings:books.filter(b=>b.coverId).map(b=>b.title)};
    }
    const zip=await JSZip.loadAsync(bytes),files=Object.values(zip.files);
    let total=0;
    // JSZip 3.10.1 exposes sizes before inflation. Bound allocations before async().
    for(const entry of files){
      if(entry.dir)continue;
      const size=entry._data?.uncompressedSize;
      if(!Number.isSafeInteger(size)||size<0||size>Math.max(ImageCodec.MAX_BYTES,MANIFEST_LIMIT))throw new Error('ZIP内のファイルが大きすぎます。');
      total+=size;
      if(total>LIMIT+MANIFEST_LIMIT||files.length>20000)throw new Error('ZIPの展開サイズが上限を超えています。');
      if(entry.unsafeOriginalName!==entry.name || !/^(bookshelf\.json|images\/[A-Za-z0-9_-]+\.(jpg|png|webp))$/.test(entry.name))throw new Error('ZIPに不正なファイル名が含まれています。');
    }
    const manifest=zip.file('bookshelf.json');
    if(!manifest||manifest._data.uncompressedSize>MANIFEST_LIMIT)throw new Error('書籍情報が見つかりません。');
    const read=entry=>new Promise((resolve,reject)=>{
      const parts=[];let length=0,failed=false;
      const max=entry.name==='bookshelf.json'?MANIFEST_LIMIT:ImageCodec.MAX_BYTES;
      const stream=entry.internalStream('uint8array');
      stream.on('data',part=>{
        if(failed)return;
        length+=part.length;
        if(length>max||length>entry._data.uncompressedSize){failed=true;stream.pause();reject(new Error('ZIPの展開サイズが不正です。'));return;}
        parts.push(part);
      }).on('error',reject).on('end',()=>{
        if(failed)return;
        const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
        if(length!==entry._data.uncompressedSize||ImageCodec.crc32(bytes)!==(entry._data.crc32>>>0)){reject(new Error('ZIP内のデータが破損しています。'));return;}
        resolve(bytes);
      }).resume();
    });
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await read(manifest)));
    if(data.version!==2||!data.images||typeof data.images!=='object'||Array.isArray(data.images))throw new Error('未対応のバックアップ形式です。');
    const books=validateBooks(data.books),records=[],warnings=[],mapped=new Map();
    for(const book of books){
      const old=book.coverId;if(!old)continue;
      if(mapped.has(old)){book.coverId=mapped.get(old);if(!book.coverId)warnings.push(book.title);continue;}
      try{
        const item=Object.hasOwn(data.images,old)?data.images[old]:null;
        if(!item||typeof item.path!=='string'||!/^images\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(item.path))throw new Error();
        const entry=zip.file(item.path);if(!entry)throw new Error();
        const image=await ImageCodec.fromFile(new Blob([await read(entry)]));
        const id=crypto.randomUUID();records.push({id,blob:image.blob,source:item.source==='camera'?'camera':'file'});book.coverId=id;
      }catch{book.coverId=null;warnings.push(book.title);}
      mapped.set(old,book.coverId);
    }
    return {books,records,warnings};
  }
  return {exportZip,importFile};
})();
