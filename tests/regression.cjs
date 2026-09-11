const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root,"sw.js"),"utf8");
for(const file of fs.readdirSync(path.join(root,"js"))) new vm.Script(fs.readFileSync(path.join(root,"js",file),"utf8"));
new vm.Script(sw);
(async()=>{
  await require("./storage.cjs")();
  await require('./recovery-ui.cjs')();
  require("./pwa.cjs")();
  const handlers = {};
  const deleted = [];
  const entries = new Map();
  const cache = {match:async key=>entries.get(typeof key === 'string' ? key : key.url)?.clone(), put:async(key,value)=>entries.set(key.url,value)};
  let networkResponse = new Response('new page');
  const scope = 'https://example.test/books/';
  vm.runInNewContext(sw, {
    self:{location:{origin:'https://example.test'},registration:{scope},clients:{claim:async()=>{}},addEventListener:(name, fn)=>handlers[name]=fn},
    caches:{open:async()=>cache,keys:async()=>['my-bookshelf-pwa-v3','my-bookshelf-pwa-v4','other-app'],delete:async key=>deleted.push(key)},
    fetch:async()=>{if(networkResponse instanceof Error) throw networkResponse; return networkResponse;},
    URL, Request, Response, setTimeout, clearTimeout,
  });
  let activation;
  handlers.activate({waitUntil:p=>activation=p});
  await activation;
  assert.deepEqual(deleted,['my-bookshelf-pwa-v3']);
  async function get(file, mode='navigate'){
    let result;
    const pending=[];
    handlers.fetch({request:{url:scope+file,method:'GET',mode},waitUntil:p=>pending.push(p),respondWith:p=>result=p});
    const response=await result;
    await Promise.all(pending);
    return response;
  }
  assert.equal(await (await get('index.html')).text(),'new page');
  networkResponse = Error('offline');
  assert.equal(await (await get('index.html')).text(),'new page');
  entries.set('./index.html',new Response('offline shell'));
  assert.equal(await (await get('other-page')).text(),'offline shell');
  assert.equal((await get('icons/icon-192.png','cors')).type,'error');
  networkResponse = new Response('server error',{status:500});
  assert.equal(await (await get('index.html')).text(),'new page');
  console.log('PASS: syntax, data validation, failed-save protection, recovery, cache isolation, network refresh and offline fallbacks');
})().catch(error=>{console.error(error);process.exitCode=1;});
