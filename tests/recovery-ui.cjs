const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
module.exports=async()=>{
  const elements=new Map();let downloaded;
  const element=id=>{
    if(!elements.has(id)) elements.set(id,{value:'',open:false,classList:{toggle(){}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});
    return elements.get(id);
  };
  const context=vm.createContext({
    Terms:{allowed:()=>true},BookCoverUI:{create:()=>({clearCards(){}})},BookBackup:{},BookPwa:{init(){}},
    document:{getElementById:element,addEventListener(){},body:{appendChild(){}},createElement:()=>({click(){},remove(){}})},
    window:{addEventListener(){}},navigator:{},localStorage:{getItem:()=>'{broken'},
    Blob,URL:{createObjectURL:blob=>{downloaded=blob;return 'blob:test';},revokeObjectURL(){}},setTimeout:fn=>fn(),
    alert:message=>{throw Error(message);},
  });
  for(const name of ['validation','storage','book-list','book-editor','backup-actions','app']) vm.runInContext(fs.readFileSync(path.join(__dirname,`../js/${name}.js`),'utf8'),context);
  assert.equal(element('recoveryNotice').hidden,false);
  assert.equal(element('exportBtn').disabled,true);
  assert.equal(element('addBookBtn').disabled,true);
  assert.equal(element('statTotal').textContent,'—');
  assert.match(element('emptyState').textContent,/復旧/);
  element('rescueBtn').listeners.click();
  assert.equal(await downloaded.text(),'{broken');
  console.log('PASS: recovery notice, disabled empty export, unknown counts and exact raw-data download');
};
