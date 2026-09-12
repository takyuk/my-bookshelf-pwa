const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const isbn=require('../js/isbn.js');
const {createRelay}=require('../proxy/ndl.cjs');
module.exports=async()=>{
  const nameContext=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ndl.js'),'utf8'),nameContext);
  const cleanAuthor=vm.runInContext('NdlBooks.cleanAuthor',nameContext);
  for(const [input,expected] of [
    ['夏目, 漱石, 1867-1916','夏目漱石'],
    ['村上, 春樹, 1949-','村上春樹'],
    ['夏目漱石（１８６７～１９１６） 著','夏目漱石'],
    ['山田, 太郎, 1970- (小説家)','山田太郎'],
    ['山田太郎 [訳]','山田太郎'],
    ['山田太郎, -1900','山田太郎'],
    ['山田太郎 1970年生','山田太郎'],
    ['Doyle, Arthur Conan, 1859-1930','Doyle, Arthur Conan'],
    ['Smith, John, Jr., 1950-','Smith, John, Jr.'],
    ['J. K. Rowling','J. K. Rowling'],
    ['Jean-Paul Sartre','Jean-Paul Sartre'],
    ['山田著','山田著'],
    ['国立国会図書館','国立国会図書館'],
    ['', ''],
  ]) assert.equal(cleanAuthor(input),expected,input);
  assert.equal(isbn.normalize('4-10-101001-3'),'9784101010014');
  assert.equal(isbn.normalize('９７８４１０１０１００１４'),'9784101010014');
  for(const value of ['9784101010015','1920093005905','410101001X','https://example.test','']) assert.equal(isbn.normalize(value),null);
  let requests=0;
  const relay=createRelay(async url=>{requests++;assert.equal(url.origin,'https://ndlsearch.ndl.go.jp');assert.equal(url.searchParams.get('dpid'),'iss-ndl-opac');return new Response('<rss><channel/></rss>');});
  const origin='https://takyuk.github.io';
  const request=(query='isbn=9784101010014',from=origin)=>new Request('https://relay.test/api/ndl?'+query,{headers:{Origin:from}});
  assert.equal((await relay(request('', 'https://other.test'),origin)).status,403);
  assert.equal((await relay(request('isbn=123'),origin)).status,400);
  assert.equal((await relay(request('isbn=9784101010014&url=https://evil.test'),origin)).status,400);
  const response=await relay(request(),origin);
  assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  await relay(request(),origin);assert.equal(requests,1);
  const failed=createRelay(async()=>new Response('bad',{status:503}));
  assert.equal((await failed(request(),origin)).status,502);
  const huge=createRelay(async()=>new Response('x'.repeat(1024*1024+1)));
  assert.equal((await huge(request(),origin)).status,502);
  // Exercise the actual camera controller with deferred permission and decoder callbacks.
  const elements=new Map(), events={};
  const el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,open:true,hidden:false,listeners:{},addEventListener(n,fn){this.listeners[n]=fn;},replaceChildren(){},appendChild(){}});return elements.get(id);};
  let grant, stopped=0, controlsStopped=0, callback;
  const context=vm.createContext({
    document:{getElementById:el,addEventListener:(n,fn)=>events[n]=fn,createElement:()=>({addEventListener(){}})},
    window:{addEventListener(){}},location:{hostname:'127.0.0.1',href:'http://127.0.0.1:8002/'},isSecureContext:true,
    navigator:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>grant=resolve)}},
    ZXingBrowser:{BrowserMultiFormatOneDReader:class{async decodeFromStream(s,v,cb){callback=cb;return {stop(){controlsStopped++;}};}}},
    BookISBN:isbn,NdlBooks:{parse:()=>[]},AbortController,URL,fetch:async()=>new Response('<rss/>'),setTimeout,clearTimeout,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/catalog.js'),'utf8'),context);
  const starting=el('scanIsbnBtn').listeners.click();
  el('stopScanBtn').listeners.click();
  grant({getTracks:()=>[{stop:()=>stopped++}]});await starting;
  assert.equal(stopped,1);assert.equal(el('scannerPanel').hidden,true);
  const scanning=el('scanIsbnBtn').listeners.click();
  grant({getTracks:()=>[{stop:()=>stopped++}]});await scanning;
  callback({getText:()=>'1920093005905'});assert.equal(el('isbn').value,'');
  callback({getText:()=>'9784101010014'});assert.equal(el('isbn').value,'');
  callback({getText:()=>'9784101010014'});
  assert.equal(el('isbn').value,'9784101010014');assert.equal(stopped,2);assert.equal(controlsStopped,1);
  el('bookDialog').listeners.close();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(el('catalogStatus').textContent,'');
  console.log('PASS: ISBN checksums, relay validation/cache/errors, camera cancellation, two-read confirmation and cleanup');
};
