const {normalize}=require('../js/isbn.js');
// Fixed upstream: this is deliberately not a general URL proxy.
function createRelay(fetcher=fetch){
  const cache=new Map();
  let queue=Promise.resolve(), waiting=0;
  async function search(isbn){
    const cached=cache.get(isbn);
    if(cached && cached.expires>Date.now()) return cached.xml;
    const url=new URL('https://ndlsearch.ndl.go.jp/api/opensearch');
    url.searchParams.set('isbn',isbn);
    url.searchParams.set('dpid','iss-ndl-opac');
    url.searchParams.set('cnt','10');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetcher(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/xml, text/xml'}});
      if(!response.ok) throw new Error('upstream');
      const reader=response.body.getReader();let size=0;const chunks=[];
      while(true){
        const {done,value}=await reader.read();if(done) break;
        size+=value.byteLength;
        if(size>1024*1024){await reader.cancel();throw new Error('size');}
        chunks.push(value);
      }
      const bytes=new Uint8Array(size);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const xml=new TextDecoder().decode(bytes);
      if(!/<rss[\s>]/.test(xml)) throw new Error('format');
      if(cache.size>=100) cache.delete(cache.keys().next().value);
      cache.set(isbn,{xml,expires:Date.now()+24*60*60*1000});
      return xml;
    } finally {clearTimeout(timeout);}
  }
  return async function handle(request,allowedOrigin){
    const url=new URL(request.url);
    const origin=request.headers.get('Origin');
    const headers={'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(!allowedOrigin || origin!==allowedOrigin) return new Response('Forbidden',{status:403});
    headers['Access-Control-Allow-Origin']=allowedOrigin;
    if(url.pathname!=='/api/ndl') return new Response('Not found',{status:404,headers});
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
    if(request.method!=='GET') return new Response('Method not allowed',{status:405,headers});
    const isbn=normalize(url.searchParams.get('isbn'));
    if(!isbn || [...url.searchParams.keys()].some(key=>key!=='isbn')) return new Response('Invalid ISBN',{status:400,headers});
    if(waiting>=4) return new Response('Busy',{status:429,headers:{...headers,'Retry-After':'5'}});
    waiting++;
    try {
      const result=queue.then(()=>search(isbn));
      queue=result.catch(()=>{});
      return new Response(await result,{headers});
    } catch {return new Response('NDL unavailable',{status:502,headers});}
    finally {waiting--;}
  };
}
module.exports={createRelay};
