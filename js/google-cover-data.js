// Shared validation for API responses and restored backups. No network access here.
const GoogleCoverData=(()=>{
 function inspect(value,isbn){
  const reasons=[];
  const reject=reason=>({cover:null,reasons:[reason]});
  if(!value||typeof value!=='object')return reject('invalid_value');
  const normalize=typeof BookISBN!=='undefined'?BookISBN.normalize:require('./isbn.js').normalize;
  const normalized=normalize(isbn);
  if(!normalized||value.isbn!==normalized)reasons.push('isbn_mismatch');
  if(typeof value.id!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(value.id))reasons.push('invalid_volume_id');
  try{
   const url=new URL(value.url),link=new URL(value.link);
   if(url.protocol!=='https:')reasons.push('image_protocol');
   if(url.hostname!=='books.google.com')reasons.push('image_host');
   if(!['/books','/books/content'].includes(url.pathname))reasons.push('image_path');
   if(url.username||url.password)reasons.push('image_credentials');
   if(url.port)reasons.push('image_port');
   if(url.searchParams.get('id')!==value.id)reasons.push('image_id_mismatch');
   if(url.searchParams.get('img')!=='1')reasons.push('image_parameter');
   if(link.href!=='https://books.google.com/books?id='+encodeURIComponent(value.id))reasons.push('book_link');
   return {cover:reasons.length?null:{isbn:normalized,id:value.id,url:url.href,link:link.href},reasons};
  }catch{return {cover:null,reasons:[...reasons,'invalid_url']};}
 }
 function clean(value,isbn){return inspect(value,isbn).cover;}
 return {clean,inspect};
})();
if(typeof module!=='undefined')module.exports=GoogleCoverData;
