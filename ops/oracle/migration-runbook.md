# Migração segura para o backend Oracle

Este procedimento move somente a execução da API. A origem Cloudflare continua
ativa até a troca final do proxy; não há alteração de DNS, Worker ou dados de
produção durante a preparação.

## Pré-requisitos da VM

- Oracle Linux 9, acesso SSH e Node.js 22 ou superior.
- Diretórios persistentes: `/opt/area51`, `/var/lib/area51/data` e
  `/var/lib/area51/media`.
- O processo escuta apenas em `127.0.0.1:8787`. A exposição pública será feita
  posteriormente por um túnel/proxy autenticado, nunca abrindo a porta 8787.
- O arquivo `/etc/area51/backend.env` contém valores reais de `PORT`,
  `AREA51_DATA_FILE`, `AREA51_MEDIA_DIR` e um `AREA51_GATEWAY_SECRET` longo.
  Esse arquivo não entra no Git.

## Sequência de implantação

1. Registrar data e revisão atual da produção. Não interromper o Worker.
2. Fazer export consistente do estado e das mídias, guardar cópia imutável fora
   da VM e calcular checksum dos arquivos.
   O backup SQL entra em um SQLite novo com:
   `node tools/import-d1-backup.mjs <backup.sql> <destino.sqlite>`. O comando
   recusa destino existente, executa `integrity_check` e exige `app_state.id=1`.
   Para as mídias, primeiro listar as chaves e então usar
   `node tools/export-kv-media.mjs <manifest.json> <diretorio>`. O exportador
   preserva bytes, metadados de content type e um checksum por arquivo.
3. Copiar o código versionado e a cópia de dados para a VM. Criar o usuário de
   serviço `area51`, instalar a unidade `area51-backend.service` e iniciar o
   serviço.
4. Verificar localmente na VM: `curl -fsS http://127.0.0.1:8787/healthz` deve
   retornar `{\"ok\":true}`. Em seguida, testar uma leitura autenticada por meio
   do proxy de homologação, sem escrita.
5. Comparar contagens críticas da cópia (usuários, cartas, pacotes, trocas,
   notificações e saldo agregado) com o export de origem.
6. Executar um roteiro de ações numa cópia: login, atualização de estado,
   roleta, pacote, troca, missão e reinício do serviço. Cada ação deve manter a
   contagem e a revisão esperadas.
7. Somente depois disso, trocar o upstream do proxy para a VM e acompanhar
   logs/latência. Manter o Worker anterior disponível para rollback imediato.

## Critérios de abortar e rollback

Abortar a troca se o health check falhar, houver divergência de dados, resposta
500/409 inesperada, lentidão de sessão ou qualquer ação escrever estado
inconsistente. Para reverter, apontar o proxy de volta ao Worker anterior e
preservar a cópia da VM para análise; não restaurar dados sobre a produção.

## O que ainda depende da Oracle

A VM atual precisa concluir o encerramento para então criar uma nova instância
limpa. Quando ela estiver disponível, a instalação deve ser feita em uma única
sessão sequencial: não executar atualizações de `dnf` em paralelo.
