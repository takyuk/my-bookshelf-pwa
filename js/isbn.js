// Shared checksum validation for browser and relay. ISBN-10 is normalized to ISBN-13.
const BookISBN = (() => {
  function normalize(value){
    let isbn=String(value ?? '').normalize('NFKC').replace(/[\s-]/g,'').toUpperCase();
    if(/^\d{9}[\dX]$/.test(isbn)){
      const sum=[...isbn].reduce((total,char,index)=>total+(char==='X' ? 10 : Number(char))*(10-index),0);
      if(sum%11) return null;
      isbn='978'+isbn.slice(0,9);
      const check=(10-[...isbn].reduce((sum,char,index)=>sum+Number(char)*(index%2 ? 3 : 1),0)%10)%10;
      return isbn+check;
    }
    if(!/^97[89]\d{10}$/.test(isbn)) return null;
    return [...isbn].reduce((sum,char,index)=>sum+Number(char)*(index%2 ? 3 : 1),0)%10===0 ? isbn : null;
  }
  return {normalize};
})();
if(typeof module !== 'undefined') module.exports=BookISBN;
