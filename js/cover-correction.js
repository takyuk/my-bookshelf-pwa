const BookCorrection = (() => {
  const el=id=>document.getElementById(id),dialog=el('coverCorrectionDialog');
  const workerURL=new URL('./cover-worker.js',document.currentScript.src);
  const svg=el('correctionCorners'),circles=Array.from(svg.querySelectorAll('[data-corner]'));
  // Keep long presses and native image drags from interrupting corner adjustment.
  for(const type of ['contextmenu','dragstart'])svg.addEventListener(type,event=>event.preventDefault());
  let session=null,serial=0;
  function releaseURL(name){if(session?.[name]){URL.revokeObjectURL(session[name]);session[name]=null;}}
  function finish(value){
    if(!session)return;
    const old=session;session=null;clearTimeout(old.timer);old.worker?.terminate();
    dragged=null;
    for(const name of ['sourceURL','resultURL'])if(old[name])URL.revokeObjectURL(old[name]);
    el('correctionSource').removeAttribute('href');el('correctionPreview').removeAttribute('src');
    old.original=null;old.result=null;old.worker=null;
    if(dialog.open)dialog.close();old.resolve(value);
  }
  function editMode(){el('correctionEdit').hidden=false;el('correctionPreview').hidden=true;el('correctionAdjust').hidden=true;draw();}
  function draw(){
    if(!session?.points)return;
    const xy=session.points.map(([x,y])=>[x*session.width,y*session.height]);
    const unit=session.width/(svg.getBoundingClientRect().width||Math.max(100,dialog.clientWidth-40));
    el('correctionOutline').setAttribute('points',xy.map(p=>p.join(',')).join(' '));
    circles.forEach((circle,i)=>{circle.setAttribute('cx',xy[i][0]);circle.setAttribute('cy',xy[i][1]);circle.setAttribute('r',unit*22);circle.setAttribute('aria-label',`${['左上','右上','右下','左下'][i]}の角。左右${Math.round(session.points[i][0]*100)}%、上下${Math.round(session.points[i][1]*100)}%。矢印キーで調整`);});
    svg.querySelectorAll('[data-marker]').forEach((circle,i)=>{circle.setAttribute('cx',xy[i][0]);circle.setAttribute('cy',xy[i][1]);circle.setAttribute('r',unit*6);});
  }
  function dirty(){
    if(!session)return;
    session.result=null;releaseURL('resultURL');el('correctionUse').disabled=true;
    el('correctionStatus').textContent='四隅と縦横比を確認し、「補正プレビューを更新」を押してください。';
  }
  function failed(message){
    if(!session)return;clearTimeout(session.timer);session.working=false;
    el('correctionRender').disabled=!session.ready;el('correctionUse').disabled=true;
    el('correctionRatio').disabled=false;
    el('correctionStatus').textContent=`補正できませんでした。${message} 補正せず使うか、キャンセル・撮り直しができます。`;
  }
  function send(job){
    const current=session;current.working=true;
    el('correctionRender').disabled=true;el('correctionUse').disabled=true;
    el('correctionRatio').disabled=true;
    job.id=++serial;current.job=job.id;
    clearTimeout(current.timer);current.timer=setTimeout(()=>{
      if(session!==current)return;current.worker.terminate();current.ready=false;
      failed('処理時間が長いため中止しました。');
    },30000);
    current.worker.postMessage(job);
  }
  function render(){
    if(!session?.ready||session.working)return;
    const raw=el('correctionRatio').value,ratio=raw===''?null:Number(raw);
    if(ratio!==null&&(!Number.isFinite(ratio)||ratio<.2||ratio>5)){el('correctionStatus').textContent='横÷縦の比率を0.2〜5で指定するか、空欄にしてください。';return;}
    dirty();el('correctionStatus').textContent='表紙の傾きと範囲を補正しています…';
    try{send({type:'warp',points:session.points.map(p=>p.slice()),ratio});}catch(error){failed(error.message);}
  }
  function open(image,{source='file',retake}={}){
    finish(null);
    return new Promise(resolve=>{
      session={resolve,original:image.blob,result:null,points:null,ready:false,working:false,retake};
      const current=session;
      el('correctionRetake').hidden=source!=='camera';el('correctionRatio').value='';
      el('correctionEdit').hidden=true;el('correctionAdjust').hidden=true;el('correctionUse').disabled=true;el('correctionRender').disabled=true;
      current.resultURL=URL.createObjectURL(image.blob);el('correctionPreview').src=current.resultURL;el('correctionPreview').hidden=false;
      el('correctionStatus').textContent='表紙の四隅を探しています…';dialog.showModal();
      try{
        current.worker=new Worker(workerURL);
        current.worker.onerror=event=>{event.preventDefault();if(session===current){current.worker.terminate();current.ready=false;failed('補正機能を起動できません。');}};
        current.worker.onmessage=({data})=>{
          if(session!==current||data.id!==current.job)return;
          clearTimeout(current.timer);current.working=false;
          el('correctionRatio').disabled=false;
          if(data.type==='error'){failed(data.message);return;}
          if(data.type==='ready'){
            current.ready=true;current.width=data.width;current.height=data.height;
            current.points=data.points||[[.05,.05],[.95,.05],[.95,.95],[.05,.95]];
            current.sourceURL=URL.createObjectURL(data.source);el('correctionSource').setAttribute('href',current.sourceURL);
            svg.setAttribute('viewBox',`0 0 ${data.width} ${data.height}`);
            svg.style.aspectRatio=`${data.width} / ${data.height}`;
            el('correctionSource').setAttribute('width',data.width);el('correctionSource').setAttribute('height',data.height);
            draw();el('correctionRender').disabled=false;
            if(data.points)render();
            else{editMode();el('correctionStatus').textContent='表紙を確実に検出できませんでした。四隅を表紙に合わせるか、補正せず使ってください。';}
          }else if(data.type==='result'){
            releaseURL('resultURL');current.result=data.blob;current.resultURL=URL.createObjectURL(data.blob);
            el('correctionPreview').src=current.resultURL;el('correctionPreview').hidden=false;el('correctionEdit').hidden=true;
            el('correctionAdjust').hidden=false;el('correctionUse').disabled=false;el('correctionRender').disabled=false;
            el('correctionStatus').textContent=`補正候補です（${data.width}×${data.height}）。文字の欠けや縦横の伸びを確認してください。`;
          }
        };
        send({type:'init',blob:image.blob,width:image.width,height:image.height});
      }catch(error){failed('この環境では補正機能を利用できません。');}
    });
  }
  let dragged=null;
  function move(event){
    if(!session?.ready||session.working||dragged===null)return;
    const rect=svg.getBoundingClientRect();
    session.points[dragged]=[Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))];dirty();draw();
  }
  circles.forEach((circle,index)=>{
    circle.addEventListener('pointerdown',event=>{if(!session?.ready||session.working)return;event.preventDefault();dragged=index;circle.setPointerCapture(event.pointerId);});
    circle.addEventListener('pointermove',move);
    for(const event of ['pointerup','pointercancel','lostpointercapture'])circle.addEventListener(event,()=>{dragged=null;});
    circle.addEventListener('keydown',event=>{
      if(!session?.ready||session.working)return;
      const steps={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]},step=steps[event.key];if(!step)return;
      event.preventDefault();session.points[index]=session.points[index].map((n,i)=>Math.max(0,Math.min(1,n+step[i]*(event.shiftKey?5:1))));dirty();draw();
    });
  });
  el('correctionRatio').addEventListener('input',dirty);
  el('correctionRender').addEventListener('click',render);
  el('correctionAdjust').addEventListener('click',()=>{dirty();editMode();});
  el('correctionUse').addEventListener('click',()=>{if(session?.result&&!session.working)finish({blob:session.result,corrected:true});});
  el('correctionOriginal').addEventListener('click',()=>{if(session)finish({blob:session.original,corrected:false});});
  el('correctionCancel').addEventListener('click',()=>finish(null));
  el('correctionRetake').addEventListener('click',()=>{const callback=session?.retake;finish(null);callback?.();});
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
  dialog.addEventListener('close',()=>{if(!dialog.open)finish(null);});
  window.addEventListener('pagehide',()=>finish(null));
  window.addEventListener('resize',draw);
  return {open,cancel:()=>finish(null)};
})();
