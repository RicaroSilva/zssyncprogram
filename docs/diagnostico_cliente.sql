-- =====================================================================
-- Diagnóstico da faturação de UM cliente num mês.
-- Mude só os 3 valores na linha "p" de cada consulta (cliente, ano, mês)
-- e corra cada consulta à parte. Só lê dados: não altera nada.
-- =====================================================================

-- 1) RESUMO: todas as transações do cliente no mês, agrupadas por tipo,
--    e se entram ou não na fatura (e porquê).
WITH p AS (SELECT 12345::bigint AS cliente, 2026 AS ano, 1 AS mes),
contas AS (SELECT a.id FROM public.accounts a WHERE a.user_id = (SELECT cliente FROM p)),
linhas AS (
  SELECT t.id, t.date, t.amount, tt.internal_name AS tipo, t.subclass,
         CASE WHEN t.from_id IN (SELECT id FROM contas) THEN 'sai da conta do cliente' ELSE 'entra na conta do cliente' END AS direcao,
         m.transaction_internal_name AS rubrica,
         CASE
           WHEN t.from_id NOT IN (SELECT id FROM contas) THEN 'FORA: o dinheiro ENTRA na conta do cliente (a faturação só conta o que SAI)'
           WHEN m.transaction_internal_name IS NULL THEN 'FORA: tipo sem rubrica em lp_cloudware_rubrics_mappings'
           WHEN t.subclass = 'CHARGEBACK' THEN 'FORA: é um estorno (vai para nota de crédito)'
           WHEN t.charged_back_by_id IS NOT NULL AND date_trunc('month', cb.date) = date_trunc('month', t.date) THEN 'FORA: estornada no mesmo mês'
           ELSE 'ENTRA na fatura'
         END AS resultado
  FROM public.transfers t
  JOIN public.transfer_types tt ON tt.id = t.type_id
  LEFT JOIN public.lp_cloudware_rubrics_mappings m ON lower(m.transaction_internal_name) = lower(tt.internal_name)
  LEFT JOIN public.transfers cb ON cb.id = t.charged_back_by_id
  WHERE (t.from_id IN (SELECT id FROM contas) OR t.to_id IN (SELECT id FROM contas))
    AND date_trunc('month', t.date) = make_date((SELECT ano FROM p), (SELECT mes FROM p), 1)
)
SELECT tipo, direcao, rubrica, resultado, COUNT(*) AS nr_transacoes, SUM(amount) AS valor
FROM linhas
GROUP BY tipo, direcao, rubrica, resultado
ORDER BY resultado, tipo;

-- 2) DETALHE: as mesmas transações, uma a uma (com o id de cada uma).
WITH p AS (SELECT 12345::bigint AS cliente, 2026 AS ano, 1 AS mes),
contas AS (SELECT a.id FROM public.accounts a WHERE a.user_id = (SELECT cliente FROM p))
SELECT t.id AS transacao_id, t.date, t.amount, tt.internal_name AS tipo, t.subclass,
       CASE WHEN t.from_id IN (SELECT id FROM contas) THEN 'sai' ELSE 'entra' END AS direcao,
       m.transaction_internal_name AS rubrica, t.charged_back_by_id, cb.date AS data_estorno
FROM public.transfers t
JOIN public.transfer_types tt ON tt.id = t.type_id
LEFT JOIN public.lp_cloudware_rubrics_mappings m ON lower(m.transaction_internal_name) = lower(tt.internal_name)
LEFT JOIN public.transfers cb ON cb.id = t.charged_back_by_id
WHERE (t.from_id IN (SELECT id FROM contas) OR t.to_id IN (SELECT id FROM contas))
  AND date_trunc('month', t.date) = make_date((SELECT ano FROM p), (SELECT mes FROM p), 1)
ORDER BY tt.internal_name, t.date;

-- 3) O QUE O PROGRAMA FATURA: a billing.query do config.properties, só
--    filtrada para este cliente (como destinatário ou como conta de origem).
WITH p AS (SELECT 12345::bigint AS cliente, 2026 AS ano, 1 AS mes)
SELECT * FROM (
  SELECT
      COALESCE(CASE WHEN redir.string_value ~ '^[0-9]+$' THEN redir.string_value::bigint END, a.user_id) AS cliente_id,
      a.user_id AS conta_origem,
      s.zsgo_code AS zsgo_code,
      m.transaction_internal_name AS rubrica,
      m.cw_service_code AS product_reference,
      COUNT(*) AS nr_transacoes,
      SUM(t.amount) AS valor_total,
      REPLACE(m.rubric_description, '{TRANSACTIONS}', COUNT(*)::text) AS descricao_linha
  FROM public.transfers t
  JOIN public.transfer_types tt ON tt.id = t.type_id
  JOIN public.lp_cloudware_rubrics_mappings m ON lower(m.transaction_internal_name) = lower(tt.internal_name)
  JOIN public.accounts a ON a.id = t.from_id
  JOIN public.users u ON u.id = a.user_id
  LEFT JOIN public.transfers cb ON cb.id = t.charged_back_by_id
  LEFT JOIN public.user_custom_fields cfredir ON cfredir.internal_name = 'PF_Invoice_Comissions_To_UserId'
  LEFT JOIN public.user_custom_field_values redir ON redir.owner_id = a.user_id AND redir.field_id = cfredir.id
  LEFT JOIN zsgo_client_sync s ON s.user_id = COALESCE(CASE WHEN redir.string_value ~ '^[0-9]+$' THEN redir.string_value::bigint END, a.user_id)
                               AND s.status = 'SINCRONIZADO'
  WHERE t.subclass <> 'CHARGEBACK'
    AND date_trunc('month', t.date) = make_date((SELECT ano FROM p), (SELECT mes FROM p), 1)
    AND (t.charged_back_by_id IS NULL OR date_trunc('month', cb.date) <> date_trunc('month', t.date))
  GROUP BY 1, 2, s.zsgo_code, m.transaction_internal_name, m.cw_service_code, m.rubric_description
) x
WHERE x.cliente_id = (SELECT cliente FROM p) OR x.conta_origem = (SELECT cliente FROM p)
ORDER BY rubrica;

-- 4) RUBRICAS REPETIDAS: se um tipo de transação tem mais de uma linha em
--    lp_cloudware_rubrics_mappings, as transações contam a dobrar.
SELECT lower(transaction_internal_name) AS tipo, COUNT(*) AS vezes
FROM public.lp_cloudware_rubrics_mappings
GROUP BY lower(transaction_internal_name)
HAVING COUNT(*) > 1;
