// Validate Access tokens even when the Worker is reached through another hostname.
// No request tokens, email addresses or API keys are logged.
export function createVerifier(fetcher=fetch){
 let cached,expires=0,cachedIssuer;
 const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 return async(request,env)=>{
  if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER||'')||!env.ACCESS_AUD)return false;
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  if(!token||token.length>32768)return false;
  try{
   const parts=token.split('.');if(parts.length!==3)return false;
   const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
   const claims=JSON.parse(new TextDecoder().decode(decode(parts[1]))),now=Date.now()/1000;
   if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==env.ACCESS_ISSUER||!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUD)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||(claims.nbf!=null&&(!Number.isFinite(claims.nbf)||claims.nbf>now))||typeof claims.email!=='string'||!claims.email)return false;
   if(!cached||expires<=Date.now()||cachedIssuer!==env.ACCESS_ISSUER){
    const response=await fetcher(env.ACCESS_ISSUER+'/cdn-cgi/access/certs',{redirect:'manual',signal:AbortSignal.timeout(5000)});
    if(!response.ok)return false;
    const data=await response.json();if(!Array.isArray(data.keys))return false;
    cached=data.keys;cachedIssuer=env.ACCESS_ISSUER;expires=Date.now()+300000;
   }
   const jwk=cached.find(key=>key.kid===header.kid&&key.kty==='RSA'&&(!key.alg||key.alg==='RS256')&&(!key.use||key.use==='sig'));
   if(!jwk){expires=0;return false;}
   const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
   return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  }catch{return false;}
 };
}
