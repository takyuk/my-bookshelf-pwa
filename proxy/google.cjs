const {normalize}=require('../js/isbn.js');
const {inspect}=require('../js/google-cover-data.js');
function createGoogleRelay(fetcher=fetch,logger=console){
 // Log only fixed classifications and numeric diagnostics, never raw errors or URLs.
 function logFailure(error,diagnostic){
  try{
   const errorName=['Error','TypeError','RangeError','SyntaxError','AbortError','TimeoutError'].includes(error?.name)?error.name:'OtherError';
   const message=String(error?.message||'');
   let hint='unknown';
   if(/different request|request context|I\/O on behalf/i.test(message))hint='request_context';
   else if(/illegal invocation|incorrect.*this|this.*(binding|fetch)/i.test(message))hint='fetch_binding';
   else if(/redirect/i.test(message))hint='redirect';
   else if(/fetch failed|network|connection|dns|tls|certificate/i.test(message))hint='network';
   if(diagnostic.stage==='upstream_status')hint=diagnostic.upstreamStatus>=300&&diagnostic.upstreamStatus<400?'redirect':'http_status';
   else if(diagnostic.stage==='response_size')hint='response_size';
   else if(['response_decode','response_format'].includes(diagnostic.stage))hint='invalid_response';
   if(diagnostic.timedOut)hint='timeout';
   logger.error(JSON.stringify({event:'google_cover_relay_failure',stage:diagnostic.stage,
    upstreamStatus:diagnostic.upstreamStatus,receivedBytes:diagnostic.receivedBytes,
    elapsedMs:Math.max(0,Date.now()-diagnostic.startedAt),errorName,hint}));
  }catch{ /* Diagnostics must never change the API response. */ }
 }
 return async(request,allowedOrigin,key)=>{
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  const send=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(!allowedOrigin||origin!==allowedOrigin)return send(403,{error:'GOOGLE-ORIGIN'});
  headers['Access-Control-Allow-Origin']=origin;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS'}});
  if(request.method!=='GET')return send(405,{error:'GOOGLE-METHOD'});
  if(url.pathname!=='/api/google-cover')return send(404,{error:'GOOGLE-PATH'});
  const isbn=normalize(url.searchParams.get('isbn'));
  if(!isbn||[...url.searchParams.keys()].some(k=>k!=='isbn'))return send(400,{error:'GOOGLE-ISBN'});
  if(!key)return send(503,{error:'GOOGLE-CONFIG'});
  const diagnostic={stage:'request_setup',upstreamStatus:null,receivedBytes:0,startedAt:Date.now(),timedOut:false};
  const controller=new AbortController(),timer=setTimeout(()=>{diagnostic.timedOut=true;controller.abort();},12000);
  const failure=(status,body)=>{logFailure(new Error(),diagnostic);return send(status,body);};
  try{
   const upstream=new URL('https://www.googleapis.com/books/v1/volumes');
   upstream.searchParams.set('q','isbn:'+isbn);upstream.searchParams.set('key',key);upstream.searchParams.set('maxResults','10');
   upstream.searchParams.set('fields','items(id,volumeInfo(industryIdentifiers,imageLinks))');
   diagnostic.stage='upstream_fetch';
   const response=await fetcher(upstream,{signal:controller.signal,redirect:'manual'});
   diagnostic.upstreamStatus=response.status;
   diagnostic.stage='upstream_status';
   if(!response.ok)return failure(response.status===429?429:502,{error:'GOOGLE-UPSTREAM',upstreamStatus:response.status});
   diagnostic.stage='response_read';
   const reader=response.body.getReader(),chunks=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;diagnostic.receivedBytes=size;if(size>1024*1024){diagnostic.stage='response_size';await reader.cancel();return failure(502,{error:'GOOGLE-RESPONSE'});}chunks.push(value);}
   diagnostic.stage='response_decode';
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
   const data=JSON.parse(new TextDecoder().decode(bytes));
   diagnostic.stage='response_format';
   if(!data||typeof data!=='object'||(data.items!=null&&!Array.isArray(data.items)))return failure(502,{error:'GOOGLE-RESPONSE'});
   diagnostic.stage='cover_extract';
   const counts={items: (data.items||[]).length,isbnMismatch:0,imageMissing:0,urlInvalid:0,urlRejected:0};
   const rejectionReasons={};
   const rejectedPaths=new Set();
   for(const item of data.items||[]){
    const info=item.volumeInfo;
    if(!Array.isArray(info?.industryIdentifiers)||!info.industryIdentifiers.some(x=>['ISBN_10','ISBN_13'].includes(x.type)&&normalize(x.identifier)===isbn)){counts.isbnMismatch++;continue;}
    const raw=info.imageLinks?.thumbnail||info.imageLinks?.smallThumbnail;if(typeof raw!=='string'){counts.imageMissing++;continue;}
    let image;try{image=new URL(raw);if(image.protocol==='http:')image.protocol='https:';}catch{counts.urlInvalid++;continue;}
    const {cover,reasons}=inspect({isbn,id:item.id,url:image.href,link:'https://books.google.com/books?id='+encodeURIComponent(item.id)},isbn);
    if(cover)return send(200,{cover});
    counts.urlRejected++;
    for(const reason of reasons)rejectionReasons[reason]=(rejectionReasons[reason]||0)+1;
    // Record only the path; exclude origin, credentials, query and fragment.
    if(reasons.includes('image_path'))rejectedPaths.add(image.pathname);
   }
   try{
    logger.info(JSON.stringify({event:'google_cover_not_found',reason:counts.items===0?'no_items':'no_usable_cover',...counts,rejectionReasons,rejectedPaths:[...rejectedPaths],
     upstreamStatus:diagnostic.upstreamStatus,receivedBytes:diagnostic.receivedBytes,elapsedMs:Math.max(0,Date.now()-diagnostic.startedAt)}));
   }catch{ /* Diagnostics must never change the API response. */ }
   return send(200,{cover:null});
  }catch(error){logFailure(error,diagnostic);return send(502,{error:controller.signal.aborted?'GOOGLE-TIMEOUT':'GOOGLE-CONNECTION'});}
  finally{clearTimeout(timer);}
 };
}
module.exports={createGoogleRelay};
