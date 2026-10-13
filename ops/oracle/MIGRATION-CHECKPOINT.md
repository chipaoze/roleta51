# Ponto de retomada — migração Área 51

Data: 30/09/2026

## Preparado

- A VM Oracle `area51-backend` está ativa e o serviço `area51-backend` responde
  localmente em `127.0.0.1:8787/healthz`.
- A cópia de produção foi importada para SQLite na VM e as mídias foram copiadas.
- O serviço Caddy está instalado, encaminha HTTPS para o backend local e o
  certificado público foi emitido com sucesso.
- O endpoint externo `https://137.131.184.50.sslip.io/healthz` respondeu
  `200 {"ok":true}` em 30/09/2026. O host é gratuito e resolve para o IP da
  VM; ele não substitui o endereço público atual do site.
- O Worker recebeu a camada de proxy em 30/09/2026. Ela só encaminha rotas
  quando o segredo `AREA51_BACKEND_PROXY_ENABLED` tiver exatamente o valor
  `true`; como esse segredo ainda não existe, a API segue executando na
  Cloudflare e nada mudou para os usuários.
- `AREA51_BACKEND_URL` e `AREA51_GATEWAY_SECRET` já foram gravados como
  segredos do Worker. Seus valores não ficam neste repositório.
- `npm run build` e a suíte completa (`166` testes) passaram antes da publicação.

## Rede confirmada

Na Oracle Cloud, a Security List associada à subnet da VM recebeu duas regras
de entrada stateful:

| Protocolo | Origem | Porta de destino |
| --- | --- | --- |
| TCP | `0.0.0.0/0` | `80` |
| TCP | `0.0.0.0/0` | `443` |

O host temporário gratuito do backend é `137.131.184.50.sslip.io`. Ele só
deve ser usado após o certificado HTTPS responder publicamente. A API requer
uma credencial interna enviada exclusivamente pelo Worker; o processo Node
segue limitado a `127.0.0.1`.

## Virada concluída — 30/09/2026

- A manutenção breve bloqueou ações durante o export final.
- O D1 final foi exportado, importado duas vezes de forma independente e ambos
  SQLite resultaram no checksum `ebf6a0018ff50919592188952fd93cab772984cf7f7efa4459c7ed307fb255fa`.
- A cópia final contém revisão `11918`, `2.354.495` bytes de estado e passou
  `PRAGMA integrity_check` na VM.
- As `119` mídias (39.672.830 bytes) foram copiadas para a VM. A cópia antiga
  continua preservada em `/var/lib/area51/cutover-20260930-1411/`.
- O segredo `AREA51_BACKEND_PROXY_ENABLED=true` foi ativado e a manutenção foi
  removida. O Worker encaminhou uma leitura `/api/state` à VM, comprovada nos
  logs da origem; em seguida uma sessão autenticada concluiu `/api/sync` com
  status `200`.
- Serviços `area51-backend` e `caddy` estão ativos; health externo retorna 200.

## Operação e reversão

- O endereço público não mudou: `roleta51.roleta-area51.workers.dev`.
- O Worker ainda serve os assets, mas encaminha `/api/*`, uploads, memes e
  anexos privados para a VM por HTTPS com a credencial interna.
- Para rollback imediato, apagar somente o segredo
  `AREA51_BACKEND_PROXY_ENABLED`. O Worker volta a usar D1/KV; não apagar
  backups nem substituir dados da origem.
- Durante a observação inicial, acompanhar `sudo journalctl -u area51-backend -f`
  na VM e o painel de erros do Worker. O Worker não deve mais executar as
  rotas pesadas e, portanto, não deve emitir novos 1102 por elas.

Não registrar o valor de `AREA51_GATEWAY_SECRET` neste arquivo ou no Git.
