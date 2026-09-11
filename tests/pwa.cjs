const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
module.exports=()=>{
  const handlers={};let reloads=0;
  const element={classList:{add(){},remove(){}},addEventListener(){}};
  const dialog={open:false,addEventListener:(name,fn)=>handlers[name]=fn};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/pwa.js'),'utf8'),{
    $:()=>element,dialog,busy:false,document:{addEventListener(){}},
    navigator:{serviceWorker:{controller:null,addEventListener:(name,fn)=>handlers[name]=fn}},
    window:{addEventListener(){},matchMedia:()=>({matches:false}),navigator:{}},
    location:{protocol:'http:',reload:()=>reloads++},
  });
  handlers.controllerchange();assert.equal(reloads,0);
  dialog.open=true;handlers.controllerchange();assert.equal(reloads,0);
  dialog.open=false;handlers.close();assert.equal(reloads,1);
  handlers.controllerchange();assert.equal(reloads,1);
  console.log('PASS: initial control, later update, edit deferral and single reload');
};
