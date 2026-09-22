const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
module.exports = () => {
  const fields = new Map();
  const element = () => ({value:'',open:false,listeners:{},showModal(){this.open=true;},close(){this.open=false;},addEventListener(n,f){this.listeners[n]=f;},replaceChildren(){},append(){},focus(){},scrollIntoView(){}});
  const $ = id => {if(!fields.has(id))fields.set(id,element());return fields.get(id);};
  let returns = 0;
  let books = [{id:'a',isbn:'4101010013',title:'既存の本'}];
  const context = vm.createContext({BookISBN:require('../js/isbn.js'),document:{createElement:element},alert(){},options:{$,getBooks:()=>books,isBusy:()=>false,onReturn:()=>{returns++;}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/duplicates.js'),'utf8'),context);
  const ui = vm.runInContext('BookDuplicates.create(options)',context);
  $('isbn').value='９７８-４１０１０１００１４';
  $('bookDialog').open=true;
  $('isbn').listeners.input();assert.equal($('duplicateDialog').open,true);
  $('closeDuplicate').listeners.click();assert.equal($('duplicateDialog').open,false);
  assert.equal(returns,1);
  $('isbn').listeners.input();assert.equal($('duplicateDialog').open,false);
  assert.equal(ui.check(),false); // ISBN-10/13, width and separators are equivalent.
  assert.equal($('duplicateDialog').open,true);
  $('duplicateDialog').listeners.cancel({preventDefault(){}});
  assert.equal(returns,1); // Escape does not clear the form.
  assert.equal(ui.check(),false);
  $('allowDuplicate').listeners.click();assert.equal(ui.check(),true);
  ui.reset();assert.equal(ui.check(),false);
  $('allowDuplicate').listeners.click();
  books.push({id:'b',isbn:'9784101010014',title:'追加された本'});
  assert.equal(ui.check(),false); // A newly found duplicate needs a fresh decision.
  books=books.slice(0,1);$('bookId').value='a';assert.equal(ui.check(),true);
  $('bookId').value='';$('isbn').value='invalid';assert.equal(ui.check(),true);
  $('isbn').value='';assert.equal(ui.check(),true);
  console.log('PASS: duplicate ISBN normalization, self exclusion, explicit consent and consent reset');
};
