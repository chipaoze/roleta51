// Local synthetic UI only: no production data and no writes.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('public');
const app=await readFile(resolve(root,'app.js'),'utf8');
const navigation=app.slice(app.indexOf('async function openNotificationTarget'),app.indexOf('function renderOnlinePeople'));
const offer=app.slice(app.indexOf('let lenderLossStreak'),app.indexOf("$('#casinoForm').addEventListener"));
createServer(async(req,res)=>{
 try {
 if(req.url==='/'){
 res.setHeader('Content-Type','text/html;charset=utf-8');
 res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/cursor-and-boxes.css"><style>:root{--ink:#142137;--paper:#fff;--muted:#748398}body{font:16px system-ui;margin:16px}#communityFeed{max-width:620px}.theme-dark{--ink:#ecf1fa;--paper:#111b2b;--muted:#788da8;background:#080e19;color:#fff}</style><button id="theme">Alternar tema</button><button id="notify">Abrir notificação</button><button id="lender">Ver ET</button><p id="status"></p><section id="communityFeed"></section><script>
 const appState={me:{id:'me'},powerParticipants:[{id:'raul',displayName:'Raul Morais'},{id:'jose',displayName:'José Silva'}]};
 const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const formatDisplayName=s=>s,formatDate=s=>s;
 const showToast=s=>document.querySelector('#status').textContent=s;
 const $=s=>document.querySelector(s);
 const portalPages=['memes','perfil'];
 const showPortalPage=page=>document.querySelector('#status').textContent='Página: '+page;
 const wall={phrases:[{id:'p',userId:'raul',authorName:'Raul Morais',createdAt:'Hoje',phrase:'Publicação de teste',comments:[{id:'c',authorName:'Raul Morais',message:'Olá @José Silva!',mentions:[{userId:'jose',displayName:'José Silva'}]}]}]};
 ${navigation}
 ${offer}
 </script><script src="/community-feed.js"></script><script>renderCommunityFeed(wall);$('#theme').onclick=()=>document.body.classList.toggle('theme-dark');$('#notify').onclick=()=>openNotificationTarget('mention:c','memes');$('#lender').onclick=()=>{sessionStorage.removeItem('area51LoanOffer:me');offerStellarLoan({net:-1});offerStellarLoan({net:-1});};</script>`);return;
 }
 const path=resolve(root,'.'+decodeURIComponent(req.url));
 if(!path.startsWith(root+sep))throw Error();
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');
 res.end(await readFile(path));
 }catch{res.writeHead(404);res.end();}
}).listen(4188,'127.0.0.1',()=>console.log('QA local: http://127.0.0.1:4188'));
