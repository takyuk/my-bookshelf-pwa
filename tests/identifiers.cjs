const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
module.exports = () => {
  const context = vm.createContext({URL});
  for (const name of ['isbn','google-cover-data','validation','kindle-share','duplicates']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${name}.js`), 'utf8'), context);
  }
  const ids = vm.runInContext('BookISBN', context);
  const parse = vm.runInContext('KindleShare.parse', context);
  const matches = vm.runInContext('BookDuplicates.matches', context);
  const sample = 'あなたもこの本が気に入るかもしれません。"帝国の参謀"（アンドリュー・クレピネヴィッチ; バリー・ワッツ 著）\nこちらから無料で読み始められます: https://read.amazon.co.jp/kp/kshare?asin=B01MS1EB6P&ref_=kar_di';
  const shared = parse({text:sample});
  // Exercise the actual page entry point, not just the text parser: Android
  // replaces ?share=kindle with the GET payload when launching the installed PWA.
  const source = fs.readFileSync(path.join(__dirname, '../js/kindle-share.js'), 'utf8');
  for (const query of ['?text='+encodeURIComponent(sample), '?url='+encodeURIComponent('https://read.amazon.co.jp/kp/kshare?asin=B01MS1EB6P'), '?share=kindle&text='+encodeURIComponent(sample), '']) {
    let imported, cleaned;
    const nodes = new Map();
    vm.runInNewContext(source, {
      URL, BookISBN:ids,
      location:{href:'https://example.test/index.html'+query,pathname:'/index.html'},
      document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{addEventListener(){}});return nodes.get(id);},addEventListener(){}},
      Terms:{allowed:()=>true},editor:{importKindle(book){imported=book;return true;}},
      history:{replaceState(a,b,value){cleaned=value;}}
    });
    assert.equal(imported?.asin,query ? 'B01MS1EB6P' : undefined);
    assert.equal(cleaned,query ? '/index.html' : undefined);
  }
  assert.equal(shared.asin,'B01MS1EB6P');
  assert.equal(shared.title,'帝国の参謀');
  assert.equal(shared.author,'アンドリュー・クレピネヴィッチ、バリー・ワッツ');
  for (const text of ['https://read.amazon.co.jp.evil.test/kp/kshare?asin=B01MS1EB6P', 'https://evil@read.amazon.co.jp/kp/kshare?asin=B01MS1EB6P', 'x'.repeat(16001), sample+' https://www.amazon.co.jp/dp/B000000001']) assert.throws(()=>parse({text}));
  assert.equal(ids.identify('b01ms1eb6p', ids.kindle).type, 'ASIN');
  assert.equal(ids.identify('B01MS1EB6P','紙').type, '');
  assert.equal(ids.identify('4101010013','電子書籍(その他)').value,'9784101010014');
  assert.equal(ids.identify('  4101010013  ','その他').value,'4101010013');
  assert.equal(ids.identify('unknown','その他').type,'');
  assert.equal(ids.identify('',ids.kindle).value,'');
  const legacy = {id:'old',title:'旧電子書籍',format:'電子書籍',isbn:'4101010013',location:'以前の場所'};
  const migrated = context.validateBooks([legacy])[0];
  assert.equal(migrated.format,'電子書籍(その他)');
  assert.equal(migrated.identifier.value,'4101010013');
  assert.equal(migrated.isbn,'4101010013');
  assert.equal(migrated.location,legacy.location);
  assert.equal(legacy.format,'電子書籍');
  const book = {id:'kindle',title:'Kindle',format:ids.kindle,identifier:ids.identify(shared.asin,ids.kindle),asinConfirmed:shared.asin};
  const restored = context.validateBooks(JSON.parse(JSON.stringify([book])))[0];
  assert.equal(restored.isbn,'');
  assert.equal(restored.identifier.value,shared.asin);
  assert.equal(restored.asinConfirmed,shared.asin);
  assert.equal(matches([restored],shared.asin,'',ids.kindle).length,1);
  assert.equal(matches([restored],shared.asin,'kindle',ids.kindle).length,0);
  const numeric = {...book,identifier:ids.identify('4101010013',ids.kindle)};
  assert.equal(matches([numeric],'4101010013','','紙').length,0);
  assert.equal(matches([migrated],'9784101010014','','紙').length,1);
  assert.throws(()=>context.validateBooks([{...book,identifier:{type:'ASIN',value:123}}]));
  console.log('PASS: identifier migration, typed duplicates, Kindle share parsing and hostile links');
};
