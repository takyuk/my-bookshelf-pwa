const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.argv[2] || 8000);
const remoteTest=process.argv.includes('--remote-test');
const deployedGoogle=process.argv.includes('--deployed-google');
const publicOrigin=process.env.BOOKSHELF_PUBLIC_ORIGIN;
if(remoteTest && (!publicOrigin || new URL(publicOrigin).protocol!=='https:')) throw new Error('Remote testing requires BOOKSHELF_PUBLIC_ORIGIN (HTTPS).');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const relay=require('../proxy/ndl.cjs').createRelay();
const googleRelay=require('../proxy/google.cjs').createGoogleRelay();
http.createServer(async (req,res)=>{
  const localOrigin=`http://127.0.0.1:${port}`;
  const requestUrl=new URL(req.url,localOrigin);
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){res.writeHead(405);res.end();return;}
  if(['/api/ndl','/api/google-cover'].includes(requestUrl.pathname)){
    try {
      const origin=req.headers.origin || localOrigin;
      if(![localOrigin,`http://localhost:${port}`,publicOrigin].includes(origin)){res.writeHead(403);res.end();return;}
      if(deployedGoogle && requestUrl.pathname==='/api/google-cover'){
        const upstream=new URL('https://bookshelf-ndl.yuktak-bookshelf.workers.dev/api/google-cover');
        upstream.search=requestUrl.search;
        const response=await fetch(upstream,{method:req.method,headers:{Origin:'https://takyuk.github.io'},redirect:'manual',signal:AbortSignal.timeout(15000)});
        res.writeHead(response.status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET, OPTIONS'});
        res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      const handle=requestUrl.pathname==='/api/google-cover'?googleRelay:relay;
      const response=await handle(new Request(requestUrl,{method:req.method,headers:{Origin:origin}}),origin,process.env.GOOGLE_BOOKS_API_KEY);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } catch {res.writeHead(502);res.end('NDL unavailable');}
    return;
  }
  let file;
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(remoteTest){
      if(pathname==='/js/catalog-config.js'){
        res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
        res.end("globalThis.BOOKSHELF_CATALOG = {endpoint:'/api/ndl'};");return;
      }
      if(!['/','/index.html','/sw.js','/manifest.webmanifest'].includes(pathname) && !/^\/(css|js|icons|vendor)\/[^/]+\.(css|js|png|svg|txt)$/.test(pathname)){res.writeHead(404);res.end('Not found');return;}
    }
    file=path.resolve(root, '.'+(pathname==='/' ? '/index.html' : pathname));
    const relative=path.relative(root,file);
    if(relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part=>part.startsWith('.'))) throw Error();
  } catch {res.writeHead(400);res.end('Bad request');return;}
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method==='HEAD' ? undefined : data);
  });
}).listen(port,'127.0.0.1',()=>console.log(`Bookshelf: http://127.0.0.1:${port}/`));
