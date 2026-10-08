-- Lista das faturas do Cegid que faltam guardar no S3, para o programa
-- cegid-download-lista.bat (PC sem acesso à base de dados).
-- No pgAdmin: abrir a Query Tool na base de dados do Cyclos, colar isto,
-- mudar a PARTE e o TOTAL na última linha, executar (F5) e guardar o
-- resultado em CSV (botão "Save results to file") com o nome
-- faturas-parte2.csv. Levar esse ficheiro para o outro PC.
-- O nome é o mesmo da aplicação web: nº da fatura com "/" → "-"
-- ("FR 2024/3342" → "FR 2024-3342"); repetidos levam "-<nº interno>".
SELECT mpinv_id, nome, url
FROM (
  SELECT b.mpinv_id, b.document_cw_url AS url, d.estado,
         CASE WHEN b.base = '' THEN 'sem-numero-' || b.mpinv_id
              WHEN row_number() OVER (PARTITION BY lower(b.base) ORDER BY b.mpinv_id) > 1 THEN b.base || '-' || b.mpinv_id
              ELSE b.base END AS nome
  FROM (
    SELECT i.mpinv_id, i.document_cw_url,
           btrim(regexp_replace(regexp_replace(regexp_replace(btrim(coalesce(i.document_cw_number, '')),
             '[/\\]+', '-', 'g'), '[:*?"<>|[:cntrl:]]+', '', 'g'), '\s+', ' ', 'g')) AS base
    FROM lp_cloudware_monthly_processing_invoices i
  ) b
  LEFT JOIN zsgo_web_cegid_documento d ON d.mpinv_id = b.mpinv_id
) x
WHERE url IS NOT NULL AND url <> '' AND (estado IS NULL OR estado = 'ERRO')
  AND mpinv_id % 2 = 2 - 1   -- PARTE 2 de TOTAL 2:  mpinv_id % TOTAL = PARTE - 1
ORDER BY mpinv_id;
