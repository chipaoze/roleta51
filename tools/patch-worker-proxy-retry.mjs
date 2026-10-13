import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Informe o arquivo compilado do legacy-adapter.');

const source = fs.readFileSync(target, 'utf8');
const start = source.indexOf('async function No(t,n){');
const end = source.indexOf('function Po(t){', start);
if (start < 0 || end < 0) throw new Error('Bloco proxyToBackend compilado não encontrado.');

const replacement = 'async function No(t,n){let r=new URL(t.url);r.protocol=n.protocol,r.host=n.host,r.username=``,r.password=``;let i=new Headers(t.headers);i.delete(`host`),i.delete(`x-area51-gateway-secret`);let a=String(e.AREA51_GATEWAY_SECRET||``);if(!a)return Response.json({error:`Gateway da API indisponível.`},{status:503});i.set(`x-area51-gateway-secret`,a);let o=t.headers.get(`cf-connecting-ip`);o&&i.set(`x-forwarded-for`,o),i.set(`x-forwarded-proto`,`https`);let s=(t.method===`GET`||t.method===`HEAD`)&&r.pathname!==`/api/sync`,c=s?5:1,l=new Set([502,503,504]),d=null;for(let e=0;e<c;e+=1){let n=new AbortController,a=setTimeout(()=>n.abort(),8e3);try{let o={method:t.method,headers:i,signal:n.signal,redirect:`manual`};t.method!==`GET`&&t.method!==`HEAD`&&(o.body=t.body,o.duplex=`half`);let c=await fetch(r.toString(),o);if(s&&l.has(c.status)&&e+1<c){await c.body?.cancel(),let t=[250,750,2e3,3e3][e]||3e3;await new Promise(e=>setTimeout(e,t));continue}if(!s&&l.has(c.status))return await c.body?.cancel(),Response.json({error:`Servidor atualizando. A operação não foi repetida para proteger seu saldo. Tente novamente em alguns segundos.`,retryable:!0},{status:503,headers:{"Cache-Control":`no-store`,"Retry-After":`2`}});let d=new Headers(c.headers);return d.delete(`connection`),d.delete(`keep-alive`),d.delete(`transfer-encoding`),new Response(c.body,{status:c.status,headers:d})}catch(t){if(d=t,e+1<c){let t=[250,750,2e3,3e3][e]||3e3;await new Promise(e=>setTimeout(e,t));continue}}finally{clearTimeout(a)}}console.error(`[backend-proxy]`,{route:r.pathname,attempts:c,message:d instanceof Error?d.message:`upstream unavailable`});let u=s?`A API está temporariamente indisponível. Tente novamente.`:`Servidor atualizando. A operação não foi repetida para proteger seu saldo. Tente novamente em alguns segundos.`;return Response.json({error:u,retryable:!0},{status:503,headers:{"Cache-Control":`no-store`,"Retry-After":`2`}})}';

const updated = source.slice(0, start) + replacement + source.slice(end);
if (updated === source) throw new Error('Nenhuma alteração aplicada.');
fs.writeFileSync(target, updated);
console.log(`Proxy resiliente aplicado em ${target}`);
