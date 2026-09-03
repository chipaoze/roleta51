import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {albumFor,CARD_COLLECTIONS} from '../lib/card-album.mjs';
const root=resolve('public'),index=await readFile(resolve(root,'index.html'),'utf8');
const section=index.slice(index.indexOf('<section id="album"'),index.indexOf('<section id="inicio"')).replace('portal-page-hidden','');
createServer(async(req,res)=>{try{
if(req.url.startsWith('/?')||req.url==='/'){
const db={economy:{cardAlbums:{u:{cards:{},crafted:{}}}}};
if(req.url.includes('ready'))for(const c of CARD_COLLECTIONS)for(const[id]of c.cards)db.economy.cardAlbums.u.cards[c.id+':'+id]=2;
res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/cursor-and-boxes.css"><body class="${req.url.includes('light')?'':'theme-dark profile-theme-aurora'}">${section}<script>const appState={me:{id:'u'}};const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');</script><script src="/card-album.js"></script><script>renderCardAlbum(${JSON.stringify(albumFor(db,'u'))});</script>`);return;}
const path=resolve(root,'.'+decodeURIComponent(req.url));if(!path.startsWith(root+sep))throw Error();res.setHeader('Content-Type',({'.css':'text/css','.js':'text/javascript'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}}).listen(4190,'127.0.0.1',()=>console.log('QA: http://127.0.0.1:4190'));
