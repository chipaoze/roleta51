WITH updates(id,status,comment) AS (VALUES
 ('87759996-f4c1-4ae6-aef1-d14287d2170f','done','Publicado: comentários exibem data e hora, indicação de edição e ações para editar/excluir. Somente o autor pode editar; autor ou administrador podem excluir. Permissões e limites testados, sem alterar recompensas.'),
 ('5ecf782a-100b-4a17-a1ed-c8d5d75bb4fd','done','Publicado: seção Quem reagiu em cada publicação, com os nomes e emojis das reações. As reações existentes foram preservadas.'),
 ('3d77c0c1-65ea-4b00-b06f-ac36ecd3e624','done','Publicado: login direciona ao feed; logotipo e página inicial do aplicativo também apontam para o feed. Links diretos de outras páginas continuam disponíveis.'),
 ('47385206-76de-4d49-9974-9eeaaea65b66','pending','Planejado para uma próxima etapa: marcação de usuários com notificação. Não foi iniciado para preservar margem de testes e evitar publicação incompleta.')
)
UPDATE app_state SET data=json_set(data,'$.feedbackMessages',json((
 SELECT json_group_array(json(CASE WHEN u.id IS NULL THEN f.value ELSE json_patch(f.value,json_object('status',u.status,'adminComment',u.comment,'updatedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'completedAt',CASE WHEN u.status='done' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END)) END))
 FROM json_each(app_state.data,'$.feedbackMessages') f LEFT JOIN updates u ON u.id=json_extract(f.value,'$.id')
))),revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1;
