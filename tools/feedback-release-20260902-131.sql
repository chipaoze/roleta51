-- Update only the reviewed feedback records; preserve all other state.
WITH updates(id, status, comment) AS (VALUES
 ('4396c58a-f4f1-4fc3-8b6e-e4e15abb0175', 'done', 'Publicado: foto do autor no mural, botões Editar e Excluir no canto superior da publicação. Edição de frase/legenda pelo próprio autor; administrador pode excluir. Permissões e limites testados; editar não gera recompensa extra.'),
 ('49404cc2-6057-48a5-834c-133d3467fa13', 'done', 'Publicado: 12 emojis de reação no feed, com contagens e destaque das suas reações. Reações anteriores preservadas.'),
 ('d16e84f9-b354-49ec-95be-1b35501148cb', 'pending', 'Investigação oficial: os 44 erros foram classificados como exceededResources, não como esgotamento das 100 mil requisições. Publicadas correções: cache de imagens limitado a 16 MB, reutilização do formatador de datas e consultas que não carregam o banco inteiro quando nada mudou; também corrigido o acúmulo de conexões encerradas. Testes passaram. Mantido em análise: os dados agregados não distinguem CPU de memória em cada falha, e é preciso avaliar o comportamento após a publicação.')
)
UPDATE app_state SET data = json_set(data, '$.feedbackMessages', json((
 SELECT json_group_array(json(CASE WHEN u.id IS NULL THEN f.value ELSE json_patch(f.value,
 json_object('status',u.status,'adminComment',u.comment,'updatedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'completedAt',CASE WHEN u.status='done' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END)) END))
 FROM json_each(app_state.data,'$.feedbackMessages') f LEFT JOIN updates u ON u.id=json_extract(f.value,'$.id')
))), revision=revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1;
