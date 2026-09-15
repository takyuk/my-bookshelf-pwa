const $ = id => document.getElementById(id);
const dialog = $('bookDialog');
const form = $('bookForm');
// Access can itself throw when browser storage is disabled.
const store = BookStorage.create({getItem:key=>localStorage.getItem(key), setItem:(key,value)=>localStorage.setItem(key,value)}, navigator.locks);
let books = [];
let storageReadFailed = false;
let busy = false;
function uid(){ return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function refreshBooks(){
  if(!Terms.allowed() || dialog.open || busy) return;
  const state = store.read();
  books = state.books;
  storageReadFailed = state.failed;
  render();
}
function setBusy(value){
  busy = value;
  form.querySelectorAll('button, input, select, textarea').forEach(control=>control.disabled=value);
  $('importInput').disabled=value;
  $('exportBtn').disabled=value || storageReadFailed;
  $('addBookBtn').disabled=value || storageReadFailed;
  document.dispatchEvent(new Event(value ? 'bookshelf-save-start' : 'bookshelf-idle'));
}
async function saveBooks(nextBooks, expected, restoring = false, records = []){
  setBusy(true);
  try {
    books = await store.save(nextBooks, expected, restoring, {
      prepare:()=>records.length ? BookImages.putAll(records) : undefined,
      cleanup:next=>BookImages.collect(next)
    });
    storageReadFailed = false;
    return true;
  } catch(error){
    const message = error.name === 'QuotaExceededError' ? '保存容量が不足しています。書き出しでバックアップし、ブラウザの空き容量を確認してください。' : error.message;
    alert(`保存できませんでした。今回の変更は保存されていません。\n${message}`);
    return false;
  } finally { setBusy(false); }
}
function download(text, name, type='application/json'){
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = document.createElement('a');
  link.href=url; link.download=name;
  document.body.appendChild(link);
  link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

const covers=BookCoverUI.create({isBusy:()=>busy});
const list=BookList.create({$,getBooks:()=>books,isBusy:()=>busy,hasStorageError:()=>storageReadFailed,store,covers,openEditor:id=>editor.open(id),statusLabels});
const editor=BookEditor.create({$,getBooks:()=>books,isBusy:()=>busy,hasStorageError:()=>storageReadFailed,store,covers,refreshBooks,saveBooks,render,uid,terms:Terms});
BackupActions.init({$,getBooks:()=>books,isBusy:()=>busy,hasStorageError:()=>storageReadFailed,store,storeKey:BookStorage.key,backup:BookBackup,refreshBooks,setBusy,saveBooks,render,download});
BookPwa.init({$,dialog,isBusy:()=>busy});
function render(){list.render();}

['searchInput','statusFilter','sortSelect'].forEach(id=>$(id).addEventListener('input',render));

$('retryBtn').addEventListener('click', refreshBooks);
$('rescueBtn').addEventListener('click', ()=>{
  try {
    const raw = store.raw();
    if(raw == null) throw new Error();
    download(raw, `my-bookshelf-recovery-${Date.now()}.txt`, 'text/plain');
  } catch { alert('元データを救出できませんでした。ブラウザの保存設定を確認してください。'); }
});
window.addEventListener('storage', event=>{ if(event.key === BookStorage.key || event.key === null) refreshBooks(); });
window.addEventListener('focus', refreshBooks);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible') refreshBooks(); });
$('commitVersion').textContent = globalThis.BOOKSHELF_VERSION?.label || '開発版（コミット情報なし）';
document.addEventListener('bookshelf-consent',refreshBooks);
refreshBooks();


$('showPhotoHelp').addEventListener('click',()=>$('photoHelpDialog').showModal());
$('closePhotoHelp').addEventListener('click',()=>$('photoHelpDialog').close());

$('showIsbnHelp').addEventListener('click',()=>$('isbnHelpDialog').showModal());
$('closeIsbnHelp').addEventListener('click',()=>$('isbnHelpDialog').close());
