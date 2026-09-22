const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
module.exports=async()=>{
 const context=vm.createContext({GoogleCoverData:{clean:()=>null}});
 for(const file of ['isbn.js','validation.js','storage.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),context);
 const normalize=vm.runInContext('normalizePublicationMonth',context);
 for(const [input,expected] of [['2026-09-20','2026-09'],['2026-09','2026-09'],['2003.6','2003-06'],['2026/9','2026-09'],['2026年9月','2026-09'],['2024年2月29日','2024-02'],['2023-02-29',''],['2026',''],['2026-13',''],['2026-00',''],['0000-01',''],['2026.9-2026.10',''],['[2026.9]',''],['','']])assert.equal(normalize(input),expected,input);
 const old={id:'a',title:'本',publishedDate:'2026-09-20',purchaseDate:'2026-09-21',finishedDate:'2026-09-22'};
 let raw=JSON.stringify([old]),writes=0;
 const storage={getItem:()=>raw,setItem:(key,value)=>{raw=value;writes++;}};
 const locks={request:async(key,fn)=>fn()};
 const store=vm.runInContext('BookStorage.create',context)(storage,locks);
 const result=store.read();assert.equal(result.failed,false);assert.equal(result.books[0].publishedDate,'2026-09');assert.equal(writes,0);assert.equal(JSON.parse(raw)[0].publishedDate,'2026-09-20');
 await store.save(result.books,store.snapshot());
 const saved=JSON.parse(raw)[0];assert.equal(saved.publishedDate,'2026-09');assert.equal(saved.purchaseDate,old.purchaseDate);assert.equal(saved.finishedDate,old.finishedDate);
 // Both legacy JSON and ZIP imports use this validator.
 const restored=context.validateBooks(JSON.parse(JSON.stringify([old])));assert.equal(restored[0].publishedDate,'2026-09');
 assert.equal(context.validateBooks([{...old,publishedDate:'2026'}])[0].publishedDate,'');
 console.log('PASS: publication month normalization, legacy migration, deferred persistence and other dates preserved');
};
