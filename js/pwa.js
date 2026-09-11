let deferredInstallPrompt = null;
const installBtn = $('installBtn');
const installNote = $('installNote');

function updateInstallUI(){
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if(standalone){
    installBtn.classList.add('hidden');
    installNote.classList.add('hidden');
    return;
  }
  if(location.protocol === 'file:'){
    installNote.innerHTML = '<strong>PWAインストール:</strong> この画面はローカルファイルとして動作中です。ホーム画面へアプリとして追加するには、HTTPSで公開した版をChromeで開いてください。';
    installNote.classList.remove('hidden');
  }
}

window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtn.classList.remove('hidden');
  installNote.classList.add('hidden');
});

installBtn.addEventListener('click', async ()=>{
  if(!deferredInstallPrompt) return;
  try {
    await deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
  } catch { alert('インストールを開始できませんでした。ブラウザのメニューからお試しください。'); }
  deferredInstallPrompt = null;
  installBtn.classList.add('hidden');
});

window.addEventListener('appinstalled', ()=>{
  deferredInstallPrompt = null;
  installBtn.classList.add('hidden');
  installNote.classList.add('hidden');
});

if('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  let refreshing = false;
  let pendingReload = false;
  let hadController = !!navigator.serviceWorker.controller;
  function reloadForUpdate(){
    if(refreshing) return;
    if(dialog.open || busy){ pendingReload = true; return; }
    refreshing = true;
    location.reload();
  }
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(hadController) reloadForUpdate();
    hadController = true;
  });
  dialog.addEventListener('close', ()=>{ if(pendingReload) reloadForUpdate(); });
  document.addEventListener('bookshelf-idle', ()=>{ if(pendingReload) reloadForUpdate(); });
  window.addEventListener('load', async ()=>{
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'});
      const checkUpdate = ()=>registration.update().catch(error=>console.warn('PWAの更新確認に失敗しました。', error));
      checkUpdate();
      document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible') checkUpdate(); });
      window.addEventListener('online', checkUpdate);
      setInterval(()=>{ if(document.visibilityState === 'visible') checkUpdate(); }, 60 * 60 * 1000);
    } catch(error){ console.warn('オフライン機能を開始できませんでした。', error); }
  });
}
updateInstallUI();
