const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
module.exports=async()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../js/book-editor.js'),'utf8');
 for(const [submitter,success] of [['saveNextBtn',true],['saveNextBtn',false],['saveBookBtn',true]]){
  const fields=new Map();let saved,closed=0,resets=0;
  const $=id=>{if(!fields.has(id))fields.set(id,{value:'',listeners:{},classList:{toggle(){}},addEventListener(n,fn){this.listeners[n]=fn;},focus(){}});return fields.get(id);};
  $('bookDialog').open=true;$('bookDialog').close=()=>{closed++;};
  $('bookForm').reset=()=>{resets++;for(const field of fields.values())field.value='';};
  $('bookForm').querySelector=()=>({scrollTop:200});
  $('title').value='新しい本';
  const options={$,getBooks:()=>[],isBusy:()=>false,hasStorageError:()=>false,store:{snapshot:()=> 'snapshot'},covers:{remoteData:()=>({}),loading:()=>false,id:()=>null,records:()=>[],reset(){}},refreshBooks(){},saveBooks:async books=>{saved=books;return success;},render(){},uid:()=> 'new-id',terms:{allowed:()=>true}};
  vm.runInNewContext(source+'\nBookEditor.create(options);',{options,document:{dispatchEvent(){}},Event,alert(){}});
  await $('bookForm').listeners.submit({preventDefault(){},submitter:{id:submitter}});
  assert.equal(saved[0].title,'新しい本');assert.equal(resets,success&&submitter==='saveNextBtn'?1:0);assert.equal(closed,success&&submitter==='saveBookBtn'?1:0);
  if(resets){assert.equal($('status').value,'finished');assert.equal($('bookId').value,'');assert.equal($('title').value,'');}else assert.equal($('title').value,'新しい本');
 }
 console.log('PASS: editor public API, continuous entry reset and failed-save preservation');
};
