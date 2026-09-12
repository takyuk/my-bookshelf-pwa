// Strip Exif without decoding/re-encoding pixels. Only IFD0 Orientation survives.
const ImageCodec = (() => {
  const MAX_BYTES = 30 * 1024 * 1024;
  const fail = () => { throw new Error('画像の形式またはExifが壊れています。別のJPEG・PNG・WebP画像を選択してください。'); };
  const ascii = (b, start, count) => String.fromCharCode(...b.subarray(start, start + count));
  function orientation(tiff){
    if(tiff.length < 8) return fail();
    const order = ascii(tiff, 0, 2), le = order === 'II';
    if(!le && order !== 'MM') return fail();
    const v = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    if(v.getUint16(2, le) !== 42) return fail();
    const offset = v.getUint32(4, le);
    if(offset < 8 || offset + 2 > tiff.length) return fail();
    const count = v.getUint16(offset, le);
    if(offset + 2 + count * 12 + 4 > tiff.length) return fail();
    let result = null;
    for(let i=0;i<count;i++){
      const p = offset + 2 + i*12;
      if(v.getUint16(p, le) === 0x112){
        if(v.getUint16(p+2, le) !== 3 || v.getUint32(p+4, le) !== 1) return fail();
        const value = v.getUint16(p+8, le);
        if(value < 1 || value > 8 || (result !== null && result !== value)) return fail();
        result = value;
      }
    }
    return result;
  }
  function minimal(value){
    return new Uint8Array([73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,value,0,0,0,0,0,0,0]);
  }
  function join(parts){
    const out = new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
    let offset=0; for(const part of parts){ out.set(part,offset); offset+=part.length; } return out;
  }
  function crc32(bytes){
    let crc=0xffffffff;
    for(const byte of bytes){ crc^=byte; for(let j=0;j<8;j++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
    return (crc^0xffffffff)>>>0;
  }
  function sanitize(input){
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    if(b.length > MAX_BYTES) throw new Error('画像は1枚30MB以下にしてください。自動縮小は行いません。');
    let found = null;
    const clean = payload => {
      const value = orientation(payload);
      if(value !== null && found !== null && value !== found) return fail();
      if(value !== null) found=value;
      return value === null ? null : minimal(value);
    };
    if(b[0]===255 && b[1]===216){
      const parts=[b.subarray(0,2)]; let p=2, scanned=false, ended=false;
      while(p < b.length){
        if(b[p]!==255) return fail();
        const start=p; while(b[p]===255) p++;
        const marker=b[p++];
        if(marker===217){parts.push(b.subarray(start,p)); ended=true; break;}
        if(marker===0 || marker===216 || marker===undefined) return fail();
        if(marker===1 || (marker>=208 && marker<=215)){parts.push(b.subarray(start,p));continue;}
        if(p+2>b.length) return fail();
        const len=(b[p]<<8)|b[p+1], end=p+len;
        if(len<2 || end>b.length) return fail();
        if(marker===225 && ascii(b,p+2,6)==='Exif\0\0'){
          const data=clean(b.subarray(p+8,end));
          if(data){const size=data.length+8;parts.push(new Uint8Array([255,225,size>>8,size&255,69,120,105,102,0,0]),data);}
        } else parts.push(b.subarray(start,end));
        p=end;
        if(marker===218){
          scanned=true;const scanStart=p;
          // Byte stuffing and restart markers belong to the encoded scan.
          while(p<b.length){
            if(b[p]!==255){p++;continue;}
            let q=p+1;while(b[q]===255)q++;
            if(b[q]===0 || (b[q]>=208 && b[q]<=215)){p=q+1;continue;}
            break;
          }
          parts.push(b.subarray(scanStart,p));
        }
      }
      if(!ended || !scanned || p!==b.length) return fail();
      return {bytes:join(parts),type:'image/jpeg',extension:'jpg',orientation:found};
    }
    if(ascii(b,0,8)==='\x89PNG\r\n\x1a\n'){
      const parts=[b.subarray(0,8)], view=new DataView(b.buffer,b.byteOffset,b.byteLength);let p=8,ended=false,hasData=false;
      while(p<b.length){
        if(p+12>b.length) return fail();
        const len=view.getUint32(p),end=p+12+len,type=ascii(b,p+4,4);
        if(end>b.length || (p===8 && (type!=='IHDR'||len!==13)))return fail();
        if(crc32(b.subarray(p+4,end-4))!==view.getUint32(end-4))return fail();
        if(type==='eXIf'){
          const data=clean(b.subarray(p+8,end-4));
          if(data){const chunk=new Uint8Array(data.length+12),v=new DataView(chunk.buffer);v.setUint32(0,data.length);chunk.set([101,88,73,102],4);chunk.set(data,8);v.setUint32(chunk.length-4,crc32(chunk.subarray(4,chunk.length-4)));parts.push(chunk);}
        } else parts.push(b.subarray(p,end));
        if(type==='IDAT')hasData=true;
        p=end;if(type==='IEND'){if(len!==0)return fail();ended=true;break;}
      }
      if(!ended||!hasData||p!==b.length)return fail();
      return {bytes:join(parts),type:'image/png',extension:'png',orientation:found};
    }
    if(ascii(b,0,4)==='RIFF' && ascii(b,8,4)==='WEBP'){
      const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
      if(view.getUint32(4,true)+8!==b.length)return fail();
      const parts=[b.slice(0,12)];let p=12,extended=null,hasData=false,hasExif=false;
      while(p<b.length){
        if(p+8>b.length)return fail();
        const len=view.getUint32(p+4,true),end=p+8+len+(len%2),type=ascii(b,p,4);
        if(end>b.length)return fail();
        if(type==='EXIF'){
          let data=b.subarray(p+8,p+8+len);
          if(ascii(data,0,6)==='Exif\0\0')data=data.subarray(6);
          data=clean(data);
          if(data){const chunk=new Uint8Array(data.length+8);chunk.set([69,88,73,70]);new DataView(chunk.buffer).setUint32(4,data.length,true);chunk.set(data,8);parts.push(chunk);hasExif=true;}
        }else{const chunk=b.slice(p,end);parts.push(chunk);if(type==='VP8X'){if(len!==10||extended)return fail();extended=chunk;}if(type==='VP8 '||type==='VP8L'||type==='ANMF')hasData=true;}
        p=end;
      }
      if(!hasData || (hasExif&&!extended))return fail();
      if(extended)extended[8]=hasExif ? extended[8]|8 : extended[8]&~8;
      const bytes=join(parts);new DataView(bytes.buffer).setUint32(4,bytes.length-8,true);
      return {bytes,type:'image/webp',extension:'webp',orientation:found};
    }
    throw new Error('JPEG・PNG・WebP画像を選択してください。HEIC・GIF・SVGには対応していません。');
  }
  async function fromFile(file){
    if(file.size>MAX_BYTES)throw new Error('画像は1枚30MB以下にしてください。');
    const result=sanitize(await file.arrayBuffer());
    const blob=new Blob([result.bytes],{type:result.type});
    const url=URL.createObjectURL(blob);
    try {
      const img=new Image();img.src=url;await img.decode();
      if(!img.naturalWidth || img.naturalWidth*img.naturalHeight>60000000)throw new Error('画像は6,000万画素以下にしてください。');
    }finally{URL.revokeObjectURL(url);}
    return {...result,blob};
  }
  return {sanitize,fromFile,MAX_BYTES,crc32};
})();
