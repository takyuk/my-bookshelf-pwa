const assert=require('node:assert/strict');
const {createRelay}=require('../proxy/ndl.cjs');
module.exports=async()=>{
  const origin='https://takyuk.github.io';
  const request=()=>new Request('https://relay.test/api/ndl?isbn=9784101010014',{headers:{Origin:origin}});
  async function failure(fetcher,stage,status,hint='unknown'){
    const logs=[];
    const relay=createRelay(fetcher,{error:line=>logs.push(line)});
    const response=await relay(request(),origin);
    assert.equal(response.status,502);
    const body=await response.json();const expected=stage==='upstream_status' ? (status>=300 && status<400 ? 'NDL-REDIRECT':'NDL-'+status) : stage==='response_size' ? 'NDL-TOO-LARGE' : stage==='response_format' ? 'NDL-INVALID-RESPONSE' : ['request_context','fetch_binding'].includes(hint) ? 'RELAY-INTERNAL':'NDL-NETWORK';assert.equal(body.error.code,expected);assert.ok(!JSON.stringify(body).includes('PRIVATE'));
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
    assert.equal(logs.length,1);
    const entry=JSON.parse(logs[0]);
    assert.equal(entry.stage,stage);assert.equal(entry.upstreamStatus,status);assert.equal(entry.hint,hint);
    assert.ok(entry.elapsedMs>=0);assert.ok(entry.receivedBytes>=0);
    assert.deepEqual(Object.keys(entry).sort(),['event','stage','upstreamStatus','receivedBytes','elapsedMs','errorName','hint'].sort());
    for(const secret of ['9784101010014','PRIVATE','relay.test','ndlsearch.ndl.go.jp'])assert.ok(!logs[0].includes(secret));
    return entry;
  }
  for(const status of [301,400,401,404,429,500,503,504]) await failure(async()=>new Response('PRIVATE',{status}),'upstream_status',status);
  await failure(async()=>new Response('PRIVATE',{status:403}),'upstream_status',403);
  await failure(async()=>new Response('<html>PRIVATE</html>'),'response_format',200);
  await failure(async()=>new Response('PRIVATE'.repeat(160000)),'response_size',200);
  await failure(async()=>{throw new TypeError('fetch failed PRIVATE https://ndlsearch.ndl.go.jp/?isbn=9784101010014');},'upstream_fetch',null,'network');
  await failure(async()=>{throw new Error('Cannot perform I/O on behalf of a different request PRIVATE');},'upstream_fetch',null,'request_context');
  await failure(async()=>{throw new TypeError('Illegal invocation PRIVATE');},'upstream_fetch',null,'fetch_binding');
  await failure(async()=>{throw new DOMException('PRIVATE','AbortError');},'upstream_fetch',null,'aborted');
  await failure(async()=>new Response(new ReadableStream({start(controller){controller.error(new Error('PRIVATE'));}})),'response_read',200);
  const logs=[],success=createRelay(async()=>new Response('<rss><channel/></rss>'),{error:line=>logs.push(line)});
  assert.equal((await success(request(),origin)).status,200);assert.equal((await success(request(),origin)).status,200);assert.equal(logs.length,0);
  const brokenLogger=createRelay(async()=>{throw Error('PRIVATE');},{error(){throw Error('logger failed');}});
  assert.equal((await brokenLogger(request(),origin)).status,502);
  console.log('PASS: relay diagnostic stages, status codes, exception classification, private-data exclusion and structured error responses');
};
