-- Tabela de controlo/migração: guarda o estado de sincronização
-- de cada cliente da tua tabela de origem para o ZSGO.
-- O programa cria esta tabela automaticamente se ela não existir,
-- mas deixo aqui o script para a criares à mão / rever à vontade.

CREATE TABLE IF NOT EXISTS zsgo_product_sync (
    source_id       VARCHAR(64)  PRIMARY KEY,   -- id do cliente na tua tabela de origem
    zsgo_code       VARCHAR(64),                -- code devolvido/usado no ZSGO
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | SINCRONIZADO | ERRO
    tentativas      INTEGER      NOT NULL DEFAULT 0,
    ultimo_erro     TEXT,
    criado_em       TIMESTAMP    NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zsgo_product_sync_status ON zsgo_product_sync(status);
