const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
module.exports = async () => {
  const context = vm.createContext({});
  for(const name of ['isbn','google-cover-data','validation','storage']) vm.runInContext(fs.readFileSync(path.join(__dirname,`../js/${name}.js`),'utf8'),context);
  const api = vm.runInContext('BookStorage',context);
  const validate = vm.runInContext('validateBooks',context);
  const valid = {id:'one',title:'本',rating:3,tags:[],status:'unread'};
  for(const bad of [{},[null],[valid,valid],[{...valid,tags:'bad'}],[{...valid,rating:6}],[{...valid,rating:true}]]) assert.throws(()=>validate(bad));
  let raw=JSON.stringify([valid]);
  let failWrite=false, failRead=false;
  const storage={getItem:()=>{if(failRead) throw Error('blocked'); return raw;},setItem:(_,value)=>{if(failWrite) throw Error('quota');raw=value;}};
  let tail=Promise.resolve();
  const locks={request:(_,callback)=>{const result=tail.then(callback);tail=result.catch(()=>{});return result;}};
  const a=api.create(storage,locks), b=api.create(storage,locks);
  a.read();b.read();
  const first=a.snapshot(), second=b.snapshot();
  const results=await Promise.allSettled([
    a.save([valid,{...valid,id:'two'}],first),
    b.save([{...valid,title:'古い画面'}],second),
  ]);
  assert.equal(results[0].status,'fulfilled');
  assert.equal(results[1].status,'rejected');
  assert.equal(JSON.parse(raw).length,2);
  // Stale delete/import cannot wipe another tab's addition.
  await assert.rejects(b.save([],second));
  await assert.rejects(b.save([],second,true));
  b.read(); failWrite=true;
  const before=raw;
  await assert.rejects(b.save([],b.snapshot()));
  assert.equal(raw,before);assert.equal(b.snapshot(),before);
  failWrite=false;raw='{broken';
  assert.equal(a.read().failed,true);assert.equal(a.raw(),'{broken');
  await assert.rejects(a.save([],a.snapshot()));
  await a.save([valid],a.snapshot(),true);
  assert.equal(a.read().failed,false);
  failRead=true;
  assert.equal(a.read().failed,true);assert.equal(a.raw(),undefined);
  await assert.rejects(a.save([],a.snapshot(),true));
  failRead=false;
  const unsupported=api.create(storage,undefined);unsupported.read();
  await assert.rejects(unsupported.save([],unsupported.snapshot()));
  assert.equal(JSON.parse(raw).length,1);
  console.log('PASS: simultaneous edits, stale deletion/import, quota failure, corrupt-data rescue/recovery, unavailable storage');
};
