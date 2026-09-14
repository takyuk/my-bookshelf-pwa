const {normalize}=require('../js/isbn.js');
// Fixed upstream: this is deliberately not a general URL proxy.
function createRelay(fetcher=fetch, logger=console){
  const cache=new Map();
  let queue=Promise.resolve(), waiting=0;
  function logFailure(error, diagnostic){
    // Never log requests, URLs, ISBNs, response bodies, raw messages or stacks.
    // Runtime messages are classified locally into fixed, non-sensitive labels.
    try {
      const names=['Error','TypeError','RangeError','AbortError','TimeoutError'];
      const errorName=names.includes(error?.name) ? error.name : 'OtherError';
      const message=String(error?.message || '');
      let hint='unknown';
      if(/different request|request context|I\/O on behalf/i.test(message)) hint='request_context';
      else if(/illegal invocation|incorrect.*this|this.*(binding|fetch)/i.test(message)) hint='fetch_binding';
      else if(/redirect/i.test(message)) hint='redirect';
      else if(/fetch failed|network|connection|dns|tls|certificate/i.test(message)) hint='network';
      if(diagnostic.timedOut || errorName==='TimeoutError') hint='timeout';
      else if(errorName==='AbortError') hint='aborted';
      logger.error(JSON.stringify({event:'ndl_relay_failure',stage:diagnostic.stage,
        upstreamStatus:diagnostic.upstreamStatus,receivedBytes:diagnostic.receivedBytes,
        elapsedMs:Math.max(0,Date.now()-diagnostic.startedAt),errorName,hint}));
    } catch { /* Diagnostic failures must not change the API response. */ }
  }
  async function search(isbn, diagnostic){
    diagnostic.stage='cache';
    const cached=cache.get(isbn);
    if(cached && cached.expires>Date.now()) return cached.xml;
    diagnostic.stage='request_setup';
    const url=new URL('https://ndlsearch.ndl.go.jp/api/opensearch');
    url.searchParams.set('isbn',isbn);
    url.searchParams.set('dpid','iss-ndl-opac');
    url.searchParams.set('cnt','10');
    const controller=new AbortController();
    const timeout=setTimeout(()=>{diagnostic.timedOut=true;controller.abort();},12000);
    try {
      diagnostic.stage='upstream_fetch';
      const response=await fetcher(url,{signal:controller.signal,redirect:'manual',headers:{Accept:'application/xml, text/xml'}});
      diagnostic.upstreamStatus=response.status;
      diagnostic.stage='upstream_status';
      if(!response.ok) throw new Error('upstream');
      diagnostic.stage='response_read';
      const reader=response.body.getReader();let size=0;const chunks=[];
      while(true){
        const {done,value}=await reader.read();if(done) break;
        size+=value.byteLength;
        diagnostic.receivedBytes=size;
        if(size>1024*1024){diagnostic.stage='response_size';await reader.cancel();throw new Error('size');}
        chunks.push(value);
      }
      diagnostic.stage='response_decode';
      const bytes=new Uint8Array(size);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const xml=new TextDecoder().decode(bytes);
      diagnostic.stage='response_format';
      if(!/<rss[\s>]/.test(xml)) throw new Error('format');
      diagnostic.stage='cache_write';
      if(cache.size>=100) cache.delete(cache.keys().next().value);
      cache.set(isbn,{xml,expires:Date.now()+24*60*60*1000});
      return xml;
    } finally {clearTimeout(timeout);}
  }
  return async function handle(request,allowedOrigin){
    const url=new URL(request.url);
    const origin=request.headers.get('Origin');
    const headers={'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    const failure=(status,code)=>new Response(JSON.stringify({error:{code}}),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
    if(!allowedOrigin || origin!==allowedOrigin) return failure(403,'RELAY-403');
    headers['Access-Control-Allow-Origin']=allowedOrigin;
    if(url.pathname!=='/api/ndl') return failure(404,'RELAY-404');
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
    if(request.method!=='GET') return failure(405,'RELAY-405');
    const isbn=normalize(url.searchParams.get('isbn'));
    if(!isbn || [...url.searchParams.keys()].some(key=>key!=='isbn')) return failure(400,'RELAY-400');
    if(waiting>=4){headers['Retry-After']='5';return failure(429,'RELAY-429');}
    waiting++;
    const diagnostic={stage:'queue',upstreamStatus:null,receivedBytes:0,startedAt:Date.now(),timedOut:false};
    try {
      const result=queue.then(()=>search(isbn,diagnostic));
      queue=result.catch(()=>{});
      const xml=await result;
      diagnostic.stage='response_create';
      return new Response(xml,{headers});
    } catch(error){
      logFailure(error,diagnostic);
      let code='RELAY-INTERNAL';
      if(diagnostic.stage==='upstream_status') code=diagnostic.upstreamStatus>=300 && diagnostic.upstreamStatus<400 ? 'NDL-REDIRECT' : 'NDL-'+diagnostic.upstreamStatus;
      else if(diagnostic.timedOut || error?.name==='TimeoutError') code='NDL-TIMEOUT';
      else if(diagnostic.stage==='response_size') code='NDL-TOO-LARGE';
      else if(diagnostic.stage==='response_format') code='NDL-INVALID-RESPONSE';
      else if(['upstream_fetch','response_read'].includes(diagnostic.stage)){
        const internal=/different request|request context|I\/O on behalf|illegal invocation|incorrect.*this|this.*(binding|fetch)/i.test(String(error?.message || ''));
        code=internal ? 'RELAY-INTERNAL' : 'NDL-NETWORK';
      }
      return failure(502,code);
    }
    finally {waiting--;}
  };
}
module.exports={createRelay};
