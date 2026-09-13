importScripts('./cover-geometry.js');
let pixels=null,width=0,height=0;
self.onmessage=async({data:job})=>{
  try{
    if(job.type==='init'){
      if(!Number.isFinite(job.width)||!Number.isFinite(job.height)||job.width<1||job.height<1||job.width*job.height>60000000)throw new Error('画像の大きさを確認できません。');
      const scale=Math.min(1,2048/Math.max(job.width,job.height));
      width=Math.max(1,Math.round(job.width*scale));height=Math.max(1,Math.round(job.height*scale));
      const bitmap=await createImageBitmap(job.blob,{imageOrientation:'from-image',resizeWidth:width,resizeHeight:height,resizeQuality:'high'});
      const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{willReadFrequently:true});
      try{ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);}finally{bitmap.close();}
      pixels=ctx.getImageData(0,0,width,height).data;
      const factor=Math.min(1,800/Math.max(width,height));
      const sample=new OffscreenCanvas(Math.max(1,Math.round(width*factor)),Math.max(1,Math.round(height*factor))),sctx=sample.getContext('2d');
      sctx.drawImage(canvas,0,0,sample.width,sample.height);
      const detected=CoverGeometry.detect(sctx.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height);
      const source=await sample.convertToBlob({type:'image/png'});
      self.postMessage({id:job.id,type:'ready',points:detected.points,width,height,source});
    }else if(job.type==='warp'){
      if(!pixels)throw new Error('画像を読み込み直してください。');
      const result=CoverGeometry.warp(pixels,width,height,job.points,job.ratio);
      const canvas=new OffscreenCanvas(result.width,result.height);
      canvas.getContext('2d').putImageData(new ImageData(result.data,result.width,result.height),0,0);
      const blob=await canvas.convertToBlob({type:'image/jpeg',quality:.92});
      self.postMessage({id:job.id,type:'result',blob,width:result.width,height:result.height});
    }
  }catch(error){self.postMessage({id:job.id,type:'error',message:error.message||'画像を補正できませんでした。'});}
};
