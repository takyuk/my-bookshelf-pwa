import relay from '../proxy/ndl.cjs';
import google from '../proxy/google.cjs';
import {createVerifier} from './access.mjs';
export function createApp(verify=createVerifier(),ndl=relay.createRelay(),covers=google.createGoogleRelay()){
 return {async fetch(request,env){
  const url=new URL(request.url);
  const error=(status,code)=>Response.json({error:code},{status,headers:{'Cache-Control':'no-store'}});
  if(!env.ACCESS_AUD||!env.ACCESS_ISSUER)return error(503,'ACCESS-CONFIG');
  if(!await verify(request,env))return error(401,'ACCESS-REQUIRED');
  if(!['GET','HEAD'].includes(request.method))return error(405,'METHOD-NOT-ALLOWED');
  if(url.pathname==='/auth/refresh')return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>認証完了</title><h1>認証が完了しました</h1><p>このタブを閉じ、元の本棚画面で検索をやり直してください。編集中の入力は元の画面に残っています。</p></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  if(url.pathname.startsWith('/api/')){
   if(request.method!=='GET')return error(405,'METHOD-NOT-ALLOWED');
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return error(403,'ACCESS-ORIGIN');
   if(!['/api/ndl','/api/google-cover'].includes(url.pathname))return error(404,'API-NOT-FOUND');
   // Access authenticates the caller; the existing relay retains its origin checks.
   const headers=new Headers({Origin:url.origin});
   const safeRequest=new Request(url,{headers});
   return url.pathname==='/api/ndl'?ndl(safeRequest,url.origin):covers(safeRequest,url.origin,env.GOOGLE_BOOKS_API_KEY);
  }
  const response=await env.ASSETS.fetch(request);
  const headers=new Headers(response.headers);
  headers.set('X-Bookshelf-App','1');headers.set('Cache-Control','private, no-cache');
  return new Response(response.body,{status:response.status,headers});
 }};
}
export default createApp();
