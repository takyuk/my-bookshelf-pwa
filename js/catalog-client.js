const CatalogClient = (()=>{
  const errorText=CatalogErrors.text, responseError=CatalogErrors.response;
  function endpoint(){
    const configured=globalThis.BOOKSHELF_CATALOG?.endpoint;
    if(configured){
      let url;try{url=new URL(configured,location.href);}catch{throw new Error(errorText('APP-CONFIG'));}
      if(url.protocol!=='https:' && !(['localhost','127.0.0.1','[::1]'].includes(url.hostname) && url.protocol==='http:')) throw new Error(errorText('APP-CONFIG'));
      return url;
    }
    if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)) return new URL('/api/ndl',location.href);
    throw new Error(errorText('APP-CONFIG'));
  }

  async function fetchXml(url,signal){
    const response=await (typeof BookAccess!=='undefined'?BookAccess.request:fetch)(url,{signal,credentials:'omit',cache:'no-store'});
    if(!response.ok) throw new Error(await responseError(response));
    return response.text();
  }
  function parse(xml,isbn){
    try{return NdlBooks.parse(xml,isbn);}catch{throw new Error(errorText('NDL-INVALID-RESPONSE'));}
  }
  return {endpoint,fetchXml,parse};
})();
