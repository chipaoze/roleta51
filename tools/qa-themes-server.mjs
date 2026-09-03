// Local-only visual fixture. No production requests, accounts or stored data.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('public');
const themes = ['light','dark','galaxy','sunset','ocean','retro','matrix','eclipse','aurora','mars','nebula','rainbow','punishment'];
createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><title>Validação de todos os temas</title><h1>Teste local de layout</h1><p>HTML e estilos reais; sem dados pessoais.</p><button id="run">Verificar todos os temas</button><pre id="results"></pre><iframe id="frame" height="800" style="border:1px solid #aaa"></iframe><script>
      const themes=${JSON.stringify(themes)};
      document.querySelector('#run').onclick=async()=>{
        const out=document.querySelector('#results');out.textContent='';
        const frame=document.querySelector('#frame');
        for(const width of [390,1366]) for(const theme of themes) for(const page of ['jogos','loja','perfil','agua','memes','sorteio']){
          frame.width=width;
          await new Promise(resolve=>{frame.onload=resolve;frame.src='/fixture?theme='+theme+'&page='+page;});
          const d=frame.contentDocument,w=frame.contentWindow;
          const header=d.querySelector('.topbar'),menu=d.querySelector('#siteMenu');
          const p=e=>w.getComputedStyle(e).position;
          const overflow=d.documentElement.scrollWidth>width+2;
          out.textContent+=JSON.stringify({width,theme,page,header:p(header),menu:p(menu),overflow,pass:p(header)==='sticky'&&p(menu)==='fixed'&&!overflow})+'\\n';
        }
        out.dataset.done='true';
      };</script>`); return;
    }
    if (url.pathname === '/fixture') {
      const theme=themes.includes(url.searchParams.get('theme'))?url.searchParams.get('theme'):'light';
      let html=await readFile(resolve(root,'index.html'),'utf8');
      html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(html.replace('</body>',`<script>
        document.body.className=${JSON.stringify(theme==='light'?'':theme==='dark'?'theme-dark':theme==='rainbow'?'theme-rainbow':theme==='punishment'?'theme-punishment':'theme-dark profile-theme-'+theme)};
        document.querySelector('#appView').classList.remove('hidden');
        for(const child of document.body.children) if(child.id!=='appView'&&child.tagName!=='SCRIPT')child.style.display='none';
        const page=new URLSearchParams(location.search).get('page')||'jogos';
        for(const section of document.querySelectorAll('#appView > section')) section.classList.toggle('portal-page-hidden',page==='sorteio'?!['inicio','sorteio'].includes(section.id):section.id!==page);
        document.querySelector('#menuButton').onclick=()=>{document.querySelector('#siteMenu').classList.add('open');};
      </script></body>`));return;
    }
    const path=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const content=await readFile(path);
    res.setHeader('Content-Type',({'.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.js':'text/javascript'})[extname(path)]||'application/octet-stream');res.end(content);
  } catch {res.writeHead(404);res.end();}
}).listen(4187,'127.0.0.1',()=>console.log('Local theme QA: http://127.0.0.1:4187'));
