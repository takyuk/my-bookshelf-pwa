const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createGoogleRelay}=require('../proxy/google.cjs'),{clean,inspect}=require('../js/google-cover-data.js');
module.exports=async()=>{
 const isbn='9784101010014',cover={isbn,id:'test123',url:'https://books.google.com/books?id=test123&img=1',link:'https://books.google.com/books?id=test123'};
 assert.ok(clean(cover,isbn));assert.equal(clean(cover,'9784088725093'),null);
 for(const url of ['javascript:alert(1)','https://evil.test/books?id=test123&img=1','https://books.google.com.evil.test/books?id=test123&img=1','http://books.google.com/books?id=test123&img=1'])assert.equal(clean({...cover,url},isbn),null);
 const origin='https://takyuk.github.io',request=()=>new Request('https://relay.test/api/google-cover?isbn='+isbn,{headers:{Origin:origin}});
 const body={items:[{id:'wrong',volumeInfo:{industryIdentifiers:[{type:'ISBN_13',identifier:'9784088725093'}],imageLinks:{thumbnail:cover.url}}},{id:cover.id,volumeInfo:{industryIdentifiers:[{type:'ISBN_10',identifier:'4101010013'}],imageLinks:{thumbnail:cover.url.replace('https:','http:')}}}]};
 let calls=0;const relay=createGoogleRelay(async url=>{calls++;assert.equal(url.hostname,'www.googleapis.com');assert.equal(url.searchParams.get('q'),'isbn:'+isbn);return new Response(JSON.stringify(body));});
 assert.equal((await relay(request(),origin,'')).status,503);assert.equal(calls,0);
 assert.deepEqual((await (await relay(request(),origin,'secret-test')).json()).cover,cover);
 for(const status of [403,429,503]){const r=await createGoogleRelay(async()=>new Response('',{status}))(request(),origin,'secret-test');const data=await r.json();assert.equal(data.upstreamStatus,status);assert.ok(!JSON.stringify(data).includes('secret-test'));}
 const missing=await createGoogleRelay(async()=>new Response('{}'))(request(),origin,'key');assert.equal((await missing.json()).cover,null);
 // Diagnose failures without exposing keys, ISBNs, URLs, response bodies or raw errors.
 const privateText='secret-test '+isbn+' https://private.test/?key=secret-test';
 const cases=[
  {fetcher:async()=>{throw new TypeError('redirect '+privateText);},stage:'upstream_fetch',hint:'redirect',status:null,code:'GOOGLE-CONNECTION'},
  {fetcher:async()=>new Response(privateText,{status:302,headers:{Location:'https://private.test/'}}),stage:'upstream_status',hint:'redirect',status:302,code:'GOOGLE-UPSTREAM'},
  {fetcher:async()=>new Response(privateText,{status:403}),stage:'upstream_status',hint:'http_status',status:403,code:'GOOGLE-UPSTREAM'},
  {fetcher:async()=>new Response(privateText),stage:'response_decode',hint:'invalid_response',status:200,code:'GOOGLE-CONNECTION'},
  {fetcher:async()=>new Response('{"items":{}}'),stage:'response_format',hint:'invalid_response',status:200,code:'GOOGLE-RESPONSE'},
  {fetcher:async()=>new Response(new ReadableStream({start(c){c.error(new Error('network '+privateText));}})),stage:'response_read',hint:'network',status:200,code:'GOOGLE-CONNECTION'},
  {fetcher:async()=>new Response('x'.repeat(1024*1024+1)),stage:'response_size',hint:'response_size',status:200,code:'GOOGLE-RESPONSE'},
 ];
 for(const test of cases){
  const logs=[];
  const result=await createGoogleRelay(async(url,options)=>{assert.equal(options.redirect,'manual');return test.fetcher();},{error:line=>logs.push(line)})(request(),origin,'secret-test');
  assert.equal((await result.json()).error,test.code);assert.equal(logs.length,1);
  const entry=JSON.parse(logs[0]);assert.equal(entry.event,'google_cover_relay_failure');assert.equal(entry.stage,test.stage);assert.equal(entry.hint,test.hint);assert.equal(entry.upstreamStatus,test.status);
  assert.ok(entry.elapsedMs>=0);assert.ok(entry.receivedBytes>=0);
  assert.deepEqual(Object.keys(entry).sort(),['event','stage','upstreamStatus','receivedBytes','elapsedMs','errorName','hint'].sort());
  for(const sensitive of ['secret-test',isbn,'private.test'])assert.ok(!logs[0].includes(sensitive));
 }
 const loggerFailure=await createGoogleRelay(async()=>{throw new Error(privateText);},{error(){throw new Error('logger failed');}})(request(),origin,'secret-test');
 assert.equal((await loggerFailure.json()).error,'GOOGLE-CONNECTION');
 // Count every exclusion without logging any returned metadata.
 const matching=raw=>({id:cover.id,volumeInfo:{industryIdentifiers:[{type:'ISBN_13',identifier:isbn}],imageLinks:raw===undefined?{}:{thumbnail:raw}}});
 for(const items of [[],[body.items[0],matching(),matching(privateText),matching('https://private.test/?key=secret-test')]]){
  const logs=[];
  const result=await createGoogleRelay(async()=>new Response(JSON.stringify({items})),{info:line=>logs.push(line)})(request(),origin,'secret-test');
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{cover:null});assert.equal(logs.length,1);
  const entry=JSON.parse(logs[0]);assert.equal(entry.event,'google_cover_not_found');assert.equal(entry.reason,items.length?'no_usable_cover':'no_items');
  assert.equal(entry.items,items.length);
  for(const name of ['isbnMismatch','imageMissing','urlInvalid','urlRejected'])assert.equal(entry[name],items.length?1:0);
  assert.equal(entry.upstreamStatus,200);assert.ok(entry.receivedBytes>0);assert.ok(entry.elapsedMs>=0);
  assert.deepEqual(Object.keys(entry).sort(),['event','reason','items','isbnMismatch','imageMissing','urlInvalid','urlRejected','rejectionReasons','rejectedPaths','upstreamStatus','receivedBytes','elapsedMs'].sort());
  assert.deepEqual(entry.rejectedPaths,items.length?['/']:[]);
  assert.deepEqual(entry.rejectionReasons,items.length?{image_host:1,image_path:1,image_id_mismatch:1,image_parameter:1}:{});
  for(const sensitive of ['secret-test',isbn,'private.test'])assert.ok(!logs[0].includes(sensitive));
 }
 const successLogs=[];
 const successful=await createGoogleRelay(async()=>new Response(JSON.stringify(body)),{info:line=>successLogs.push(line)})(request(),origin,'secret-test');
 assert.deepEqual((await successful.json()).cover,cover);assert.equal(successLogs.length,0);
 const brokenInfo=await createGoogleRelay(async()=>new Response('{}'),{info(){throw new Error('logger failed');}})(request(),origin,'secret-test');
 assert.deepEqual(await brokenInfo.json(),{cover:null});
 const invalidCovers=[
  [{...cover,id:'bad.id'},'invalid_volume_id'],
  [{...cover,url:cover.url.replace('https:','http:')},'image_protocol'],
  [{...cover,url:cover.url.replace('books.google.com','private.test')},'image_host'],
  [{...cover,url:cover.url.replace('/books?','/other?')},'image_path'],
  [{...cover,url:cover.url.replace('https://','https://secret-test@')},'image_credentials'],
  [{...cover,url:cover.url.replace('.com/','.com:444/')},'image_port'],
  [{...cover,url:cover.url.replace('id=test123','id=other')},'image_id_mismatch'],
  [{...cover,url:cover.url.replace('img=1','img=2')},'image_parameter'],
  [{...cover,link:'https://private.test/'},'book_link'],
 ];
 for(const [value,reason] of invalidCovers){assert.equal(clean(value,isbn),null);assert.ok(inspect(value,isbn).reasons.includes(reason));}
 assert.deepEqual(inspect(cover,isbn),{cover,reasons:[]});
 const contentCover={...cover,url:cover.url.replace('/books?','/books/content?')};
 assert.deepEqual(clean(contentCover,isbn),contentCover);
 const contentResult=await createGoogleRelay(async()=>new Response(JSON.stringify({items:[matching(contentCover.url.replace('https:','http:'))]})))(request(),origin,'secret-test');
 assert.deepEqual(await contentResult.json(),{cover:contentCover});
 for(const [value,reason] of invalidCovers){
  const candidate={...value,url:value.url.replace('/books?','/books/content?')};
  assert.equal(clean(candidate,isbn),null);assert.ok(inspect(candidate,isbn).reasons.includes(reason));
 }
 for(const path of ['/books/content/','/books/content/other','/books/content-other'])assert.equal(clean({...cover,url:cover.url.replace('/books?',path+'?')},isbn),null);
 const detailedLogs=[];
 const rejectedItems=[matching(cover.url.replace('img=1','img=2')),matching(cover.url.replace('img=1','img=2'))];
 const rejected=await createGoogleRelay(async()=>new Response(JSON.stringify({items:rejectedItems})),{info:line=>detailedLogs.push(line)})(request(),origin,'secret-test');
 assert.deepEqual(await rejected.json(),{cover:null});
 assert.deepEqual(JSON.parse(detailedLogs[0]).rejectionReasons,{image_parameter:2});
 assert.deepEqual(JSON.parse(detailedLogs[0]).rejectedPaths,[]);
 const pathLogs=[];
 const pathUrl=cover.url.replace('/books?','/books/unsupported?')+'&key=secret-test&isbn='+isbn+'#private-fragment';
 const pathResult=await createGoogleRelay(async()=>new Response(JSON.stringify({items:[matching(pathUrl),matching(pathUrl)]})),{info:line=>pathLogs.push(line)})(request(),origin,'secret-test');
 assert.deepEqual(await pathResult.json(),{cover:null});assert.equal(pathLogs.length,1);
 assert.deepEqual(JSON.parse(pathLogs[0]).rejectedPaths,['/books/unsupported']);
 assert.deepEqual(JSON.parse(pathLogs[0]).rejectionReasons,{image_path:2});
 for(const sensitive of ['secret-test',isbn,'private-fragment','books.google.com','?key='])assert.ok(!pathLogs[0].includes(sensitive));
 // Exercise the real editor-side controller with deterministic network responses.
 class Element{constructor(){this.children=[];this.listeners={};this.value='';this.open=true;}addEventListener(n,f){this.listeners[n]=f;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(){}contains(node){return this.children.includes(node)||this.children.some(c=>c.contains?.(node));}}
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};el('isbn').value=isbn;
 let local=false,localLoading=false,resolve;
 const context={GoogleCoverData:{clean},BookISBN:require('../js/isbn.js'),navigator:{onLine:true},location:{hostname:'localhost',href:'http://localhost:8000/'},document:{getElementById:el,createElement:()=>new Element(),addEventListener(){}},window:{addEventListener(){}},URL,AbortController,setTimeout,clearTimeout,fetch:async()=>new Response(JSON.stringify({cover}))};
 vm.createContext(context);for(const file of ['async-task','cover-view','google-cover-client','google-covers'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+file+'.js'),'utf8'),context);
 context.options={isBusy:()=>false,hasLocal:()=>local,isLocalLoading:()=>localLoading};const ui=vm.runInContext('GoogleCovers.create(options)',context);
 ui.reset(null);await el('searchGoogleCover').listeners.click();assert.equal(ui.data().googleCover.id,cover.id);
 local=true;await el('searchGoogleCover').listeners.click();assert.match(el('googleCoverStatus').textContent,/優先/);ui.show();assert.equal(el('googleCoverPreview').hidden,true);
 local=false;context.fetch=()=>new Promise(r=>resolve=r);const pending=el('searchGoogleCover').listeners.click();local=true;ui.cancel();resolve(new Response(JSON.stringify({cover})));await pending;assert.equal(ui.data().googleCover,null);
 local=false;ui.reset({isbn,googleCover:cover});el('isbn').value='9784088725093';el('isbn').listeners.input();assert.equal(ui.data().googleCover,null);
 context.navigator.onLine=false;await el('searchGoogleCover').listeners.click();assert.match(el('googleCoverStatus').textContent,/オフライン/);
 // Late responses and finally blocks must not overwrite a newer search.
 context.navigator.onLine=true;el('isbn').value=isbn;ui.reset(null);
 const requests=[];
 context.fetch=(url,options)=>new Promise(resolve=>requests.push({resolve,signal:options.signal}));
 const firstSearch=el('searchGoogleCover').listeners.click();
 const secondSearch=el('searchGoogleCover').listeners.click();
 assert.equal(requests[0].signal.aborted,true);
 requests[0].resolve(new Response(JSON.stringify({cover})));
 await firstSearch;
 assert.equal(ui.data().googleCover,null);
 assert.equal(el('searchGoogleCover').disabled,true);
 requests[1].resolve(new Response(JSON.stringify({cover})));
 await secondSearch;
 assert.equal(ui.data().googleCover.id,cover.id);
 assert.equal(el('searchGoogleCover').disabled,false);
 // Exercise the actual UI timeout without waiting 15 seconds.
 let timeoutCallback;
 context.setTimeout=(callback,ms)=>{assert.equal(ms,15000);timeoutCallback=callback;return 1;};
 context.clearTimeout=()=>{};
 context.fetch=(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error(),{name:'AbortError'}))));
 const timedSearch=el('searchGoogleCover').listeners.click();
 assert.equal(typeof timeoutCallback,'function');timeoutCallback();await timedSearch;
 assert.match(el('googleCoverStatus').textContent,/時間切れ/);
 assert.equal(el('searchGoogleCover').disabled,false);
 console.log('PASS: Google ISBN matching, safe URLs, relay errors, local image priority, stale requests, timeout and offline fallback');
};
