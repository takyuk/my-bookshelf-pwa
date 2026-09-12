// Snapshot checks reject stale writes; Web Locks serialize cooperating tabs.
const BookStorage = (() => {
  const key = 'my-bookshelf-v1';
  function create(storage, locks){
    let snapshot;
    let readable = false;
    let failed = false;
    function read(){
      readable = false;
      try {
        snapshot = storage.getItem(key);
        readable = true;
        const books = snapshot === null ? [] : validateBooks(JSON.parse(snapshot));
        failed = false;
        return {books, failed:false};
      } catch(error){
        failed = true;
        return {books:[], failed:true, error};
      }
    }
    async function save(next, expected, restoring = false, attachments){
      if(!locks?.request) throw new Error('この環境では安全な同時保存を利用できません。HTTPS版を対応ブラウザで開いてください。');
      return locks.request(key, async () => {
        if(!readable || (failed && !restoring)) throw new Error('保存データを保護しています。再読み込みするか、バックアップを読み込んでください。');
        if(storage.getItem(key) !== expected) throw new Error('別の画面で保存データが変更されました。今回の入力は残しています。必要な内容を控えてから編集を閉じ、最新の本棚でやり直してください。');
        const books = validateBooks(next);
        const raw = JSON.stringify(books);
        // Do not change in-memory state until persistence succeeds.
        // New immutable images must exist before books can refer to them.
        // Failed writes leave the previous books and their images intact.
        await attachments?.prepare?.();
        storage.setItem(key, raw);
        snapshot = raw;
        failed = false;
        // Cleanup failure must never turn a successful book commit into a failure.
        try { await attachments?.cleanup?.(books); } catch { /* Retry at the next save. */ }
        return books;
      });
    }
    return {read, save, snapshot:()=>snapshot, raw:()=>readable ? snapshot : undefined};
  }
  return {key, create};
})();
