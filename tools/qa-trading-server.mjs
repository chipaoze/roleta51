import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('public'),index=await readFile(resolve(root,'index.html'),'utf8');
const card=index.slice(index.indexOf('<article id="visualTradingCard"'),index.indexOf('<div id="collectionCatalog"'));
createServer(async(req,res)=>{try{
if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/cursor-and-boxes.css"><body class="theme-dark profile-theme-aurora"><main style="max-width:850px;margin:16px auto;padding:12px">${card}<div id="lieRanking"></div></main><script>
const appState={me:{id:'a'},trading:{participants:[{id:'a',name:'Ana',items:[{id:'x',name:'Tema Aurora Boreal'}]},{id:'b',name:'Beto',items:[{id:'y',name:'Mouse Cristal Lunar'}]}],trades:[{id:'t',partnerName:'Beto',offeredName:'Mouse Cristal Lunar',wantedName:'Tema Aurora Boreal',status:'pending',incoming:true}]}};
const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');</script><script src="/visual-trading.js"></script><script>renderVisualTrading(appState.trading);</script>`);return;}
const path=resolve(root,'.'+decodeURIComponent(req.url));if(!path.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.css':'text/css','.js':'text/javascript'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}}).listen(4189,'127.0.0.1',()=>console.log('QA: http://127.0.0.1:4189'));
