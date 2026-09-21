const Terms = (() => {
  const key='my-bookshelf-terms', version=3;
  let accepted=false;
  const modal=document.getElementById('termsDialog'),check=document.getElementById('termsCheck'),accept=document.getElementById('acceptTerms'),shell=document.getElementById('appShell');
  function saved(){try{const data=JSON.parse(localStorage.getItem(key));return data?.version===version&&typeof data.acceptedAt==='string'&&Number.isFinite(Date.parse(data.acceptedAt));}catch{return false;}}
  function show(){check.checked=false;accept.disabled=true;document.getElementById('termsConsent').hidden=accepted;document.getElementById('closeTerms').hidden=!accepted;if(!modal.open)modal.showModal();}
  check.addEventListener('change',()=>{accept.disabled=!check.checked;});
  accept.addEventListener('click',()=>{
    if(!check.checked)return;
    try{localStorage.setItem(key,JSON.stringify({version,acceptedAt:new Date().toISOString()}));}
    catch{document.getElementById('termsError').textContent='同意を保存できません。ブラウザの保存設定を確認してください。';return;}
    accepted=true;shell.hidden=false;shell.inert=false;modal.close();document.dispatchEvent(new Event('bookshelf-consent'));
  });
  modal.addEventListener('cancel',event=>{if(!accepted)event.preventDefault();});
  document.getElementById('closeTerms').addEventListener('click',()=>modal.close());
  document.getElementById('showTerms').addEventListener('click',show);
  accepted=saved();shell.hidden=!accepted;shell.inert=!accepted;if(!accepted)show();
  // Reload if another tab clears consent, so editing and camera sessions stop too.
  window.addEventListener('storage',event=>{if((event.key===key||event.key===null)&&!saved())location.reload();});
  return {allowed:()=>accepted};
})();
