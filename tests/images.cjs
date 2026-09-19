const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const JSZip=require('../vendor/jszip-3.10.1.min.js');
module.exports=async()=>{
  const context=vm.createContext({URL,Uint8Array,DataView,Blob,TextEncoder,TextDecoder,JSZip,crypto:require('node:crypto').webcrypto});
  for(const name of ['isbn','google-cover-data','validation','image-codec','backup','storage'])vm.runInContext(fs.readFileSync(path.join(__dirname,`../js/${name}.js`),'utf8'),context);
  const codec=vm.runInContext('ImageCodec',context),backup=vm.runInContext('BookBackup',context);
  // Two IFD entries (orientation and private artist), with a GPS/sub-IFD tail.
  const tiff=Buffer.alloc(68);tiff.write('II');tiff.writeUInt16LE(42,2);tiff.writeUInt32LE(8,4);tiff.writeUInt16LE(2,8);
  tiff.writeUInt16LE(0x112,10);tiff.writeUInt16LE(3,12);tiff.writeUInt32LE(1,14);tiff.writeUInt16LE(6,18);
  tiff.writeUInt16LE(0x13b,22);tiff.writeUInt16LE(2,24);tiff.writeUInt32LE(8,26);tiff.writeUInt32LE(40,30);tiff.write('PRIVATE',40);tiff.write('GPS PRIVATE',50);
  const jpeg=Buffer.concat([Buffer.from([255,216,255,225,0,tiff.length+8]),Buffer.from('Exif\0\0'),tiff,Buffer.from([255,218,0,2,17,255,0,99,255,217])]);
  function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);data.copy(b,8);b.writeUInt32BE(codec.crc32(b.subarray(4,-4)),b.length-4);return b;}
  const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',Buffer.alloc(13)),chunk('eXIf',tiff),chunk('IDAT',Buffer.from([1,2,3])),chunk('IEND',Buffer.alloc(0))]);
  const webChunk=(type,data)=>{const b=Buffer.alloc(8+data.length+(data.length%2));b.write(type);b.writeUInt32LE(data.length,4);data.copy(b,8);return b;};
  const webp=Buffer.concat([Buffer.from('RIFF0000WEBP'),webChunk('VP8X',Buffer.from([8,0,0,0,0,0,0,0,0,0])),webChunk('EXIF',tiff),webChunk('VP8 ',Buffer.from([1,2,3,4]))]);webp.writeUInt32LE(webp.length-8,4);
  for(const input of [jpeg,png,webp]){
    const clean=codec.sanitize(input);assert.equal(clean.orientation,6);assert.equal(Buffer.from(clean.bytes).includes(Buffer.from('PRIVATE')),false);
    assert.deepEqual(codec.sanitize(clean.bytes).bytes,clean.bytes);
    assert.throws(()=>codec.sanitize(input.subarray(0,input.length-1)));
  }
  assert.deepEqual(Buffer.from(codec.sanitize(jpeg).bytes.slice(-10)),jpeg.slice(-10));
  const noOrientation=Buffer.from(jpeg);noOrientation.writeUInt16LE(0x13a,22);assert.equal(codec.sanitize(noOrientation).orientation,null);
  const wrong=Buffer.from(jpeg);wrong.writeUInt16LE(9,30);assert.throws(()=>codec.sanitize(wrong));
  const big=Buffer.from(jpeg),base=12;big.write('MM',base);big.writeUInt16BE(42,base+2);big.writeUInt32BE(8,base+4);big.writeUInt16BE(1,base+8);big.writeUInt16BE(0x112,base+10);big.writeUInt16BE(3,base+12);big.writeUInt32BE(1,base+14);big.writeUInt16BE(8,base+18);big.writeUInt32BE(0,base+22);assert.equal(codec.sanitize(big).orientation,8);
  assert.throws(()=>codec.sanitize(Buffer.from('<svg/>')));
  const stored=new Map([['cover-one',{blob:new Blob([jpeg]),source:'camera'}]]);
  context.BookImages={get:async id=>stored.get(id)};
  // Decode validation is covered by the browser suite; unit tests isolate archive logic.
  codec.fromFile=async file=>{const image=codec.sanitize(await file.arrayBuffer());return {...image,blob:new Blob([image.bytes],{type:image.type})};};
  const books=[{id:'a',title:'本',coverId:'cover-one'},{id:'b',title:'欠損',coverId:'missing'}];
  books[0].volume='上巻';
  books[1].isbn='9784101010014';books[1].googleCover={isbn:books[1].isbn,id:'test123',url:'https://books.google.com/books?id=test123&img=1',link:'https://books.google.com/books?id=test123'};
  const out=await backup.exportZip(books);assert.equal(out.warnings.length,1);
  const restored=await backup.importFile(out.blob);assert.equal(restored.books.length,2);assert.equal(restored.books[1].googleCover.url,books[1].googleCover.url);assert.equal(restored.books[0].volume,'上巻');assert.equal(restored.records.length,1);assert.notEqual(restored.books[0].coverId,'cover-one');assert.equal(restored.books[1].coverId,null);
  assert.equal(Buffer.from(await restored.records[0].blob.arrayBuffer()).includes(Buffer.from('PRIVATE')),false);
  const legacy=await backup.importFile(new Blob([JSON.stringify({version:1,books})]));assert.equal(legacy.records.length,0);assert.equal(legacy.books[0].coverId,null);
  const bad=new JSZip();bad.file('bookshelf.json','{"version":99}');await assert.rejects(backup.importFile(new Blob([await bad.generateAsync({type:'uint8array'})])));
  const corrupted=Buffer.from(await out.blob.arrayBuffer()),at=corrupted.indexOf(Buffer.from('"version": 2'));assert.ok(at>0);corrupted[at+11]=51;await assert.rejects(backup.importFile(new Blob([corrupted])));
  const missing=new JSZip();missing.file('bookshelf.json',JSON.stringify({version:2,books,images:{}}));assert.equal((await backup.importFile(new Blob([await missing.generateAsync({type:'uint8array'})]))).warnings.length,2);
  const api=vm.runInContext('BookStorage',context);let raw='[]',fail=false,events=[];
  const store=api.create({getItem:()=>raw,setItem:(_,v)=>{events.push('books');if(fail)throw Error('quota');raw=v;}},{request:(_,fn)=>fn()});store.read();
  const attachments={prepare:()=>events.push('images'),cleanup:()=>events.push('cleanup')};
  fail=true;await assert.rejects(store.save(books,raw,false,attachments));assert.equal(raw,'[]');assert.deepEqual(events,['images','books']);
  fail=false;events=[];await store.save(books,raw,false,attachments);assert.deepEqual(events,['images','books','cleanup']);
  events=[];await assert.rejects(store.save([], 'stale',false,attachments));assert.deepEqual(events,[]);
  await store.save([],raw,false,{cleanup:()=>{throw Error('DB unavailable');}});assert.equal(raw,'[]');
  console.log('PASS: orientation-only Exif in JPEG/PNG/WebP, damaged input, ZIP round trip and legacy import, missing covers, staged image save and cleanup ordering');
};
