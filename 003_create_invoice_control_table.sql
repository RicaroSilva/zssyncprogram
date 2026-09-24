-- Controlo da faturação mensal: uma linha por (cliente, ano, mes).
-- O "status" avança em etapas, para que uma falha a meio saiba
-- exatamente o que já foi feito e o que falta retomar:
--   PENDENTE -> FATURA_CRIADA -> PDF_GERADO -> SINCRONIZADO (fim)
-- Se falhar nalguma etapa, fica ERRO mas guarda o que já tinha (zsgo_sale_id,
-- pdf_url), para a próxima execução não recriar o que já existe.

CREATE TABLE IF NOT EXISTS zsgo_invoice_sync (
    cliente_id      VARCHAR(64)  NOT NULL,
    ano             INTEGER      NOT NULL,
    mes             INTEGER      NOT NULL,
    zsgo_sale_id    VARCHAR(64),
    pdf_url         TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDENTE',
    tentativas      INTEGER      NOT NULL DEFAULT 0,
    ultimo_erro     TEXT,
    criado_em       TIMESTAMP    NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMP    NOT NULL DEFAULT now(),
    PRIMARY KEY (cliente_id, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_zsgo_invoice_sync_status ON zsgo_invoice_sync(status);
