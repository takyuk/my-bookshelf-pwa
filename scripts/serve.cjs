const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.argv[2] || 8000);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
http.createServer((req,res)=>{
  let file;
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
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
