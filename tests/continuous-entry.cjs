const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
module.exports=async()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
 const handler=source.slice(source.indexOf("form.addEventListener('submit'"),source.indexOf("$('deleteBtn').addEventListener"));
 for(const [submitter,success,expected] of [['saveNextBtn',true,'next'],['saveNextBtn',false,''],['saveBookBtn',true,'close']]){
  let submit,action='',saved;
  const fields=new Map();const $=id=>{if(!fields.has(id))fields.set(id,{value:id==='title'?'新しい本':''});return fields.get(id);};
  const context={$ ,form:{addEventListener:(name,fn)=>submit=fn},busy:false,books:[],uid:()=> 'new-id',editSnapshot:'snapshot',BookCovers:{loading:()=>false,id:()=>null,records:()=>[]},saveBooks:async books=>{saved=books;return success;},openDialog:()=>action='next',closeDialog:()=>action='close',render(){},alert(){}};
  vm.runInNewContext(handler,context);
  await submit({preventDefault(){},submitter:{id:submitter}});
  assert.equal(action,expected);assert.equal(saved[0].title,'新しい本');
 }
 console.log('PASS: continuous entry only opens after successful save; normal save closes');
};
