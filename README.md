# Roleta 51

Portal privado da equipe Área 51 para sorteio e distribuição de wallpapers, votação, hidratação, missões, brincadeiras, loja de personalizações e interações ao vivo.

## Produção

- Site: https://roleta51.roleta-area51.workers.dev
- Hospedagem: Cloudflare Workers
- Banco: Cloudflare D1
- Imagens temporárias: Cloudflare KV

## Desenvolvimento local

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev
```

Para validar uma alteração:

```bash
node --check legacy-server.mjs
node --check public/app.js
npm run build
```

## Publicação

O projeto utiliza `wrangler.cloudflare.jsonc`.

```bash
npm run build
npx wrangler deploy --config wrangler.cloudflare.jsonc
```

Não publique arquivos `.env` nem credenciais. O estado de produção fica no D1; `seed-database.json` serve para inicialização e recuperação controlada, não para substituir automaticamente os dados atuais.

## Estrutura principal

- `legacy-server.mjs`: regras, API e persistência do sistema.
- `public/`: interface, estilos e recursos visuais.
- `lib/legacy-adapter.ts`: adaptação do servidor para o Worker.
- `seed-database.json`: base inicial preservada para implantação.
- `tools/`: utilitários de preparação e verificação da Cloudflare.

## Cuidados operacionais

- Faça backup antes de restaurações ou limpezas administrativas.
- Wallpapers e memes podem ser apagados após o uso para reduzir armazenamento.
- Compras, saldos, contas e históricos permanecem no banco online.
- Teste sorteio, distribuição e votação antes de mudanças maiores em produção.
