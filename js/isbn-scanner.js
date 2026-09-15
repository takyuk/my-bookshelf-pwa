const IsbnScanner = {create({scanButton,panel,video,formDialog,message,beforeStart,onISBN}){
  let stream,controls,timer,scanSession=0;
  function stopCamera(){
    ++scanSession;
    clearTimeout(timer);
    controls?.stop(); controls=null;
    stream?.getTracks().forEach(track=>track.stop());stream=null;
    video.srcObject=null;panel.hidden=true;scanButton.disabled=false;
  }
  async function startCamera(){
    beforeStart();stopCamera();
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
        stopCamera();onISBN(isbn);
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

  return {start:startCamera,stop:stopCamera};
}};
