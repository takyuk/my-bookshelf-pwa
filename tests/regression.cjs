const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
new vm.Script(sw);
const valid = {id:'one', title:'本', status:'unread', tags:['小説'], rating:3};
let stored = JSON.stringify([valid]);
let failWrite = false;
const notices = [];
const context = vm.createContext({
  localStorage:{getItem:()=>stored, setItem:(_, value)=>{if(failWrite) throw Error('quota'); stored=value;}},
  alert:message=>notices.push(message), document:{getElementById:()=>({})}, crypto:{},
});
vm.runInContext(script.slice(0, script.indexOf('function currentYearFinished')), context);
assert.equal(vm.runInContext('books.length', context), 1);
for(const bad of [{}, [null], [{...valid, tags:'bad'}], [{...valid, rating:6}], [valid, valid], [{...valid, title:''}]]){
  context.input = bad;
  assert.throws(()=>vm.runInContext('validateBooks(input)', context));
}
failWrite = true;
assert.equal(vm.runInContext('saveBooks([])', context), false);
assert.equal(vm.runInContext('books.length', context), 1);
assert.equal(JSON.parse(stored).length, 1);
failWrite = false;
stored = '{broken';
assert.equal(vm.runInContext('loadBooks().length', context), 0);
assert.equal(vm.runInContext('saveBooks([])', context), false);
assert.equal(stored, '{broken');
assert.equal(vm.runInContext('saveBooks([], true)', context), true);
assert.equal(stored, '[]');

(async()=>{
  const handlers = {};
  const deleted = [];
  const entries = new Map();
  const cache = {match:async key=>entries.get(typeof key === 'string' ? key : key.url)?.clone(), put:async(key,value)=>entries.set(key.url,value)};
  let networkResponse = new Response('new page');
  const scope = 'https://example.test/books/';
  vm.runInNewContext(sw, {
    self:{location:{origin:'https://example.test'},registration:{scope},clients:{claim:async()=>{}},addEventListener:(name, fn)=>handlers[name]=fn},
    caches:{open:async()=>cache,keys:async()=>['my-bookshelf-pwa-v2','my-bookshelf-pwa-v3','other-app'],delete:async key=>deleted.push(key)},
    fetch:async()=>{if(networkResponse instanceof Error) throw networkResponse; return networkResponse;},
    URL, Request, Response, setTimeout, clearTimeout,
  });
  let activation;
  handlers.activate({waitUntil:p=>activation=p});
  await activation;
  assert.deepEqual(deleted,['my-bookshelf-pwa-v2']);
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
