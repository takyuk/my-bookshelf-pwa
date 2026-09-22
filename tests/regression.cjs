const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root,"sw.js"),"utf8");
for(const file of fs.readdirSync(path.join(root,"js"))) new vm.Script(fs.readFileSync(path.join(root,"js",file),"utf8"));
new vm.Script(sw);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const [,file] of html.matchAll(/<script defer src="\.\/([^"]+)"/g)){
  assert.ok(fs.existsSync(path.join(root,file)),file+' exists');
  assert.ok(sw.includes("'./"+file+"'"),file+' is precached');
}
(async()=>{
  require('./identifiers.cjs')();
  require('./duplicates.cjs')();
  require('./async-task.cjs')();
  await require('./access.cjs')();
  await require('./publication-month.cjs')();
  await require("./storage.cjs")();
  await require("./google-covers.cjs")();
  await require("./continuous-entry.cjs")();
  await require('./recovery-ui.cjs')();
  await require('./catalog.cjs')();
  await require('./relay-diagnostics.cjs')();
  await require('./images.cjs')();
  require('./cover-geometry.cjs')();
  require("./pwa.cjs")();
  const handlers = {};
  const deleted = [];
  const entries = new Map();
  const cache = {match:async key=>entries.get(typeof key === 'string' ? key : key.url)?.clone(), put:async(key,value)=>entries.set(key.url,value)};
  let networkResponse = new Response('new page');
  const scope = 'https://example.test/books/';
  vm.runInNewContext(sw, {
    self:{location:{origin:'https://example.test'},registration:{scope},clients:{claim:async()=>{}},addEventListener:(name, fn)=>handlers[name]=fn},
    caches:{open:async()=>cache,keys:async()=>['my-bookshelf-pwa-v3','my-bookshelf-pwa-v4','my-bookshelf-pwa-v5','my-bookshelf-pwa-v6','my-bookshelf-pwa-v7','other-app'],delete:async key=>deleted.push(key)},
    fetch:async()=>{if(networkResponse instanceof Error) throw networkResponse; return networkResponse.clone();},
    URL, Request, Response, setTimeout, clearTimeout,
  });
  let activation;
  handlers.activate({waitUntil:p=>activation=p});
  await activation;
  assert.deepEqual(deleted,['my-bookshelf-pwa-v3','my-bookshelf-pwa-v4','my-bookshelf-pwa-v5','my-bookshelf-pwa-v6']);
  async function get(file, mode='navigate'){
    let result;
    const pending=[];
    handlers.fetch({request:{url:scope+file,method:'GET',mode},waitUntil:p=>pending.push(p),respondWith:p=>result=p});
    const response=await result;
    await Promise.all(pending);
    return response;
  }
  assert.equal(await (await get('index.html')).text(),'new page');
  for(const file of ["js/cover-correction.js","js/cover-worker.js","js/cover-geometry.js","js/book-list.js","js/book-editor.js","js/backup-actions.js","js/catalog-errors.js","js/catalog-client.js","js/isbn-scanner.js"])assert.equal(await (await get(file,'cors')).text(),'new page');
  networkResponse = Error('offline');
  for(const file of ["js/cover-correction.js","js/cover-worker.js","js/cover-geometry.js","js/book-list.js","js/book-editor.js","js/backup-actions.js","js/catalog-errors.js","js/catalog-client.js","js/isbn-scanner.js"])assert.equal(await (await get(file,'cors')).text(),'new page');
  assert.equal(await (await get('index.html')).text(),'new page');
  entries.set('./index.html',new Response('offline shell'));
  assert.equal(await (await get('other-page')).text(),'offline shell');
  assert.equal((await get('icons/icon-192.png','cors')).type,'error');
  networkResponse = new Response('server error',{status:500});
  assert.equal(await (await get('index.html')).text(),'new page');
  console.log('PASS: syntax, data validation, failed-save protection, recovery, cache isolation, network refresh and offline fallbacks');
})().catch(error=>{console.error(error);process.exitCode=1;});
