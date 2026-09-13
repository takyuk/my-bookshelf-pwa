const $ = id => document.getElementById(id);
const grid = $('bookGrid');
const empty = $('emptyState');
const dialog = $('bookDialog');
const form = $('bookForm');
// Access can itself throw when browser storage is disabled.
const store = BookStorage.create({getItem:key=>localStorage.getItem(key), setItem:(key,value)=>localStorage.setItem(key,value)}, navigator.locks);
let books = [];
let storageReadFailed = false;
let editSnapshot;
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

function renderStats(){
  $('statTotal').textContent = books.length;
  $('statUnread').textContent = books.filter(b=>b.status==='unread').length;
  $('statReading').textContent = books.filter(b=>b.status==='reading').length;
  $('statFinished').textContent = books.filter(b=>b.status==='finished').length;
}
function filteredBooks(){
  const q = $('searchInput').value.trim().toLowerCase();
  const status = $('statusFilter').value;
  let list = books.filter(b => {
    const hay = [b.title,b.volume,b.author,b.isbn,b.publisher,b.location,(b.tags||[]).join(' ')].join(' ').toLowerCase();
    return (!q || hay.includes(q)) && (status==='all' || b.status===status);
  });
  switch($('sortSelect').value){
    case 'title_asc': list.sort((a,b)=>a.title.localeCompare(b.title,'ja')); break;
    case 'author_asc': list.sort((a,b)=>(a.author||'').localeCompare(b.author||'','ja')); break;
    case 'finished_desc': list.sort((a,b)=>(b.finishedDate||'').localeCompare(a.finishedDate||'')); break;
    default: list.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  }
  return list;
}
function render(){
  BookCovers.clearCards();
  $('recoveryNotice').hidden = !storageReadFailed;
  $('exportBtn').disabled = storageReadFailed;
  $('addBookBtn').disabled = storageReadFailed || busy;
  $('rescueBtn').disabled = store.raw() == null;
  renderStats(); grid.innerHTML='';
  const list = filteredBooks();
  empty.hidden = list.length > 0;
  empty.textContent = books.length ? '条件に一致する本がありません。' : '本がまだありません。「本を追加」から登録してください。';
  if(storageReadFailed){
    empty.textContent = '保存データを表示できません。上の案内から復旧してください。';
    ['statTotal','statUnread','statReading','statFinished'].forEach(id=>$(id).textContent='—');
  }
  for(const b of list){
    const node = $('bookCardTemplate').content.firstElementChild.cloneNode(true);
    node.querySelector('.status-badge').textContent = statusLabels[b.status] || '';
    node.querySelector('.rating').textContent = Number(b.rating) ? '★'.repeat(Number(b.rating)) : '';
    node.querySelector('.book-title').textContent = [b.title,b.volume].filter(Boolean).join(' ');
    node.querySelector('.book-author').textContent = b.author || '著者未登録';
    const tags = node.querySelector('.tag-list');
    (b.tags||[]).slice(0,4).forEach(t=>{ const s=document.createElement('span'); s.className='tag'; s.textContent=t; tags.appendChild(s); });
    const meta = [b.format,b.location,b.finishedDate ? `読了 ${b.finishedDate}` : ''].filter(Boolean).join(' ・ ');
    node.querySelector('.book-meta').textContent = meta;
    node.querySelector('.card-hit').addEventListener('click',()=>openDialog(b.id));
    node.querySelector('.card-hit').setAttribute('aria-label', `${[b.title,b.volume].filter(Boolean).join(' ')}を編集`);
    grid.appendChild(node);
    BookCovers.renderCard(node,b);
  }
}

function resetForm(){ form.reset(); document.dispatchEvent(new Event('bookshelf-form-reset')); $('bookId').value=''; $('status').value='unread'; $('format').value='紙'; $('rating').value='0'; }
function openDialog(id=null){
  refreshBooks();
  if(!Terms.allowed() || storageReadFailed || busy) return;
  if(id && !books.some(book=>book.id===id)){ alert('この本は別の画面で削除されています。'); return; }
  editSnapshot = store.snapshot();
  resetForm();
  const editing = id ? books.find(b=>b.id===id) : null;
  BookCovers.reset(editing);
  $('dialogTitle').textContent = editing ? '本を編集' : '本を追加';
  $('deleteBtn').classList.toggle('hidden', !editing);
  if(editing){
    $('bookId').value=editing.id;
    ['title','volume','author','isbn','publisher','publishedDate','purchaseDate','price','format','location','status','startedDate','finishedDate','rating','notes'].forEach(k=>$(k).value=editing[k] ?? '');
    $('tags').value=(editing.tags||[]).join(', ');
  }
  dialog.showModal();
  // Reset both the remembered focus and scroll position whenever the form opens.
  $('closeDialogBtn').focus({preventScroll:true});
  form.querySelector('.book-form-scroll').scrollTop = 0;
}
function closeDialog(){ if(!busy) dialog.close(); }
dialog.addEventListener('cancel', event=>{ if(busy) event.preventDefault(); });
dialog.addEventListener('close', refreshBooks);

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(busy) return;
  if(BookCovers.loading()){alert('画像の確認が終わるまでお待ちください。');return;}
  const id=$('bookId').value || uid();
  const old=books.find(b=>b.id===id);
  const book={
    id,
    coverId:BookCovers.id(),
    title:$('title').value.trim(), volume:$('volume').value.trim(), author:$('author').value.trim(), isbn:$('isbn').value.trim(), publisher:$('publisher').value.trim(),
    publishedDate:$('publishedDate').value, purchaseDate:$('purchaseDate').value, price:$('price').value ? Number($('price').value) : null,
    format:$('format').value, location:$('location').value.trim(), status:$('status').value, startedDate:$('startedDate').value,
    finishedDate:$('finishedDate').value, rating:Number($('rating').value),
    tags:$('tags').value.split(',').map(s=>s.trim()).filter(Boolean), notes:$('notes').value.trim(),
    createdAt: old?.createdAt || new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  if(!book.title){ alert('タイトルを入力してください。'); return; }
  const idx=books.findIndex(b=>b.id===id);
  const nextBooks = [...books];
  if(idx>=0) nextBooks[idx]=book; else nextBooks.unshift(book);
  if(await saveBooks(nextBooks, editSnapshot, false, BookCovers.records())){ closeDialog(); render(); }
});

$('deleteBtn').addEventListener('click',async ()=>{
  if(busy) return;
  const id=$('bookId').value; const b=books.find(x=>x.id===id);
  if(b && confirm(`「${b.title}」を削除しますか？`) && await saveBooks(books.filter(x=>x.id!==id), editSnapshot)) { closeDialog(); render(); }
});
$('addBookBtn').addEventListener('click',()=>openDialog());
$('closeDialogBtn').addEventListener('click',closeDialog);
$('cancelBtn').addEventListener('click',closeDialog);
['searchInput','statusFilter','sortSelect'].forEach(id=>$(id).addEventListener('input',render));

$('exportBtn').addEventListener('click',async ()=>{
  if(busy) return;
  refreshBooks();
  if(storageReadFailed) return;
  setBusy(true);
  try {
    const expected=store.snapshot();
    const result=await navigator.locks.request(BookStorage.key,async()=>{
      if(localStorage.getItem(BookStorage.key)!==expected)throw new Error('別の画面で変更されました。再度書き出してください。');
      return BookBackup.exportZip(books);
    });
    if(result.warnings.length&&!confirm(`${result.warnings.length}冊の書影を読み込めませんでした。書籍情報を優先し、該当の書影なしで書き出しますか？`))return;
    download(result.blob, `my-bookshelf-${new Date().toISOString().slice(0,10)}.zip`,'application/zip');
  }
  catch(error) { alert(`書き出しを開始できませんでした。${error.message}`); }
  finally{setBusy(false);refreshBooks();}
});
$('importInput').addEventListener('change', async (e)=>{
  const file=e.target.files?.[0]; if(!file) return;
  if(busy) return;
  refreshBooks();
  const expected = store.snapshot();
  setBusy(true);
  try{
    const result=await BookBackup.importFile(file),incoming=result.books;
    const warning = storageReadFailed ? '読み込めなかった元の保存データを置き換えます。先に「元データを救出」で保管してください。' : `現在の${books.length}冊を置き換えます。`;
    const imageWarning=result.warnings.length ? `\n${result.warnings.length}冊は書影を復元できないため、書籍情報のみ復元します。` : '';
    if(confirm(`${warning}\n${incoming.length}冊を読み込みますか？${imageWarning}`) && await saveBooks(incoming, expected, true,result.records)){ render(); }
  }catch(error){ alert(`読み込みに失敗しました。\n${error.message || '書き出したZIPまたはJSONファイルを選択してください。'}`); }
  finally{setBusy(false);e.target.value='';refreshBooks();}
});

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
