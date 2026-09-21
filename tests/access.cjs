const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
module.exports=async()=>{
 const {createVerifier}=await import('../invite/access.mjs');
 const {createApp}=await import('../invite/worker.mjs');
 const env={ACCESS_ISSUER:'https://old-steel.cloudflareaccess.com',ACCESS_AUD:'test-audience'};
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test',alg:'RS256',use:'sig'};
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 async function token(changes={}){
  const input=encode({alg:'RS256',kid:'test'})+'.'+encode({iss:env.ACCESS_ISSUER,aud:[env.ACCESS_AUD],email:'test@example.test',iat:now,exp:now+600,...changes});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(input));
  return input+'.'+Buffer.from(signature).toString('base64url');
 }
 const req=(jwt,p='/')=>new Request('https://bookshelf.test'+p,{headers:jwt?{'Cf-Access-Jwt-Assertion':jwt}:{}});
 let certCalls=0;
 const verify=createVerifier(async url=>{assert.equal(url,env.ACCESS_ISSUER+'/cdn-cgi/access/certs');certCalls++;return Response.json({keys:[jwk]});});
 const valid=await token();
 assert.equal(await verify(req(valid),env),true);assert.equal(await verify(req(valid),env),true);assert.equal(certCalls,1);
 for(const changes of [{aud:['other']},{iss:'https://evil.test'},{exp:now-1},{nbf:now+600},{email:null}])assert.equal(await verify(req(await token(changes)),env),false);
 assert.equal(await verify(req(valid.slice(0,-8)+'AAAAAAAA'),env),false);
 assert.equal(await verify(req(),env),false);assert.equal(await verify(req(valid),{}),false);
 const claims=valid.split('.');assert.equal(await verify(req(encode({alg:'none',kid:'test'})+'.'+claims[1]+'.'),env),false);
 let assetCalls=0,apiCalls=0;
 env.ASSETS={fetch:async()=>{assetCalls++;return new Response('app');}};
 const relay=async r=>{apiCalls++;assert.equal(r.headers.get('Origin'),'https://bookshelf.test');assert.equal(r.headers.get('Cf-Access-Jwt-Assertion'),null);return Response.json({ok:true});};
 const app=createApp(verify,relay,relay);
 for(const p of ['/','/js/app.js','/api/ndl','/api/google-cover','/auth/refresh'])assert.equal((await app.fetch(req(null,p),env)).status,401);
 assert.equal(assetCalls+apiCalls,0);assert.equal((await app.fetch(req(valid),{})).status,503);
 assert.equal((await app.fetch(req(valid),env)).headers.get('X-Bookshelf-App'),'1');
 assert.equal((await app.fetch(req(valid,'/api/ndl?isbn=9784087718010'),env)).status,200);
 const cross=req(valid,'/api/google-cover');cross.headers.set('Origin','https://evil.test');assert.equal((await app.fetch(cross,env)).status,403);
 assert.equal((await app.fetch(req(valid,'/auth/refresh'),env)).headers.get('Cache-Control'),'no-store');
 // Manual redirects expose auth expiry without following a cross-origin login page.
 const notices=[{hidden:true}],context=vm.createContext({BOOKSHELF_CATALOG:{access:true},document:{querySelectorAll:()=>notices},navigator:{},fetch:async(url,options)=>{assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'manual');return {type:'opaqueredirect',status:0};}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/access.js'),'utf8')+';globalThis.client=BookAccess;',context);
 await assert.rejects(context.client.request('/api/ndl'),/認証/);assert.equal(notices[0].hidden,false);
 context.fetch=async()=>{throw new TypeError('network');};await assert.rejects(context.client.request('/api/ndl'),/network/);
 // Auth responses must never replace the offline shell or enter install caches.
 const handlers={},entries=new Map([['./index.html',new Response('offline app')]]);let writes=0,notifications=0;
 let response=new Response('login',{status:401});
 const cache={put:async()=>{writes++;},match:async key=>entries.get(key)?.clone()};
 const scope='https://bookshelf.test/';
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8').replace('const ACCESS_PROTECTED = false;','const ACCESS_PROTECTED = true;'),{
  self:{location:{origin:'https://bookshelf.test'},registration:{scope},clients:{matchAll:async()=>[{postMessage:()=>notifications++}]},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{}},
  caches:{open:async()=>cache},fetch:async()=>{if(response instanceof Error)throw response;return response.clone();},URL,Request,Response,setTimeout,clearTimeout
 });
 async function navigate(p){let output;const pending=[];handlers.fetch({request:{url:scope+p,method:'GET',mode:'navigate'},respondWith:p=>output=p,waitUntil:p=>pending.push(p)});const result=await output;await Promise.all(pending);return result;}
 assert.equal(await (await navigate('index.html')).text(),'offline app');assert.equal(writes,0);assert.equal(notifications,1);
 assert.equal(await navigate('auth/refresh'),undefined);assert.equal(await navigate('api/ndl'),undefined);
 response=new Response('login html',{headers:{'Content-Type':'text/html'}});
 let install;handlers.install({waitUntil:p=>install=p});await assert.rejects(install,/App shell unavailable/);assert.equal(writes,0);
 response=new Error('offline');assert.equal(await (await navigate('index.html')).text(),'offline app');
 response=new Response('real app',{headers:{'X-Bookshelf-App':'1'}});assert.equal(await (await navigate('index.html')).text(),'real app');assert.equal(writes,1);
 console.log('PASS: signed Access JWTs, fail-closed assets/API, auth redirects and offline cache protection');
};
