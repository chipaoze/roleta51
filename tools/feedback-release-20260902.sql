-- Only the two explicitly identified feedback records; accounts/economy untouched.
WITH target AS (
 SELECT f.key AS idx FROM app_state, json_each(data, '$.feedbackMessages') f
 WHERE app_state.id = 1 AND json_extract(f.value, '$.id') = '25599574-ce0d-464d-8ef7-15baf3991ee8'
 AND json_extract(f.value, '$.status') = 'pending'
)
UPDATE app_state SET data = json_set(data,
 '$.feedbackMessages[' || (SELECT idx FROM target) || '].status', 'done',
 '$.feedbackMessages[' || (SELECT idx FROM target) || '].adminComment', 'Relato duplicado: correção do apostômetro publicada com largura ajustada e textos centralizados.',
 '$.feedbackMessages[' || (SELECT idx FROM target) || '].updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now'),
 '$.feedbackMessages[' || (SELECT idx FROM target) || '].completedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 1 AND EXISTS (SELECT 1 FROM target);

WITH target AS (
 SELECT f.key AS idx FROM app_state, json_each(data, '$.feedbackMessages') f
 WHERE app_state.id = 1 AND json_extract(f.value, '$.id') = 'd16e84f9-b354-49ec-95be-1b35501148cb'
 AND json_extract(f.value, '$.status') = 'pending'
)
UPDATE app_state SET data = json_set(data,
 '$.feedbackMessages[' || (SELECT idx FROM target) || '].adminComment', 'Publicado em 02/09: corrigido acúmulo de conexões encerradas e atualizações redundantes no servidor online. Teste de 100 reconexões passou preservando o sorteio ao vivo. Também melhorado o tratamento de falhas nas consultas, sem repetir compras/apostas. O salvamento pelo painel apresentou demora intermitente; relato permanece em análise até confirmar a estabilidade. Informe horário e mensagem caso volte a ocorrer.',
 '$.feedbackMessages[' || (SELECT idx FROM target) || '].updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id = 1 AND EXISTS (SELECT 1 FROM target);
