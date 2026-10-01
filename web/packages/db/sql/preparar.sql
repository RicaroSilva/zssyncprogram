-- Prepara a base de dados (a MESMA do Cyclos) para a aplicação de faturação.
-- Idempotente: pode correr-se as vezes que se quiser (pnpm db:preparar ou
-- o serviço "migrate" do docker compose). Nunca apaga nem altera dados;
-- só cria o que falta, tal como o programa em Java (ensureTableExists).
-- NÃO usar prisma migrate / db push nesta base de dados (ver schema.prisma).

-- ── Tabelas partilhadas com o programa em Java (mesma definição) ─────────

CREATE TABLE IF NOT EXISTS zsgo_client_sync (
    user_id         BIGINT       PRIMARY KEY,
    zsgo_code       BIGINT,
    zsgo_dados      JSONB,
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDENTE',
    tentativas      INTEGER      NOT NULL DEFAULT 0,
    ultimo_erro     TEXT,
    criado_em       TIMESTAMP    NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMP    NOT NULL DEFAULT now()
);
ALTER TABLE zsgo_client_sync ADD COLUMN IF NOT EXISTS zsgo_dados JSONB;
ALTER TABLE zsgo_client_sync ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

CREATE TABLE IF NOT EXISTS zsgo_invoice_sync (
    user_id         BIGINT       NOT NULL,
    origem_id       BIGINT       NOT NULL,
    ano             INTEGER      NOT NULL,
    mes             INTEGER      NOT NULL,
    zsgo_sale_id    VARCHAR(64),
    pdf_url         TEXT,
    valor_total     NUMERIC,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDENTE',
    tentativas      INTEGER      NOT NULL DEFAULT 0,
    ultimo_erro     TEXT,
    criado_em       TIMESTAMP    NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMP    NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, origem_id, ano, mes)
);
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS valor_total NUMERIC;
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_numero VARCHAR(64);
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_total NUMERIC;
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_liquido NUMERIC;
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_iva NUMERIC;
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_estado VARCHAR(40);
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_anulado BOOLEAN;
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_conferido_em TIMESTAMP;
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_erro_conferencia TEXT;
ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_incerto BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS zsgo_invoice_line_detail (
    id                  SERIAL PRIMARY KEY,
    cliente_id          BIGINT NOT NULL,
    ano                 INTEGER NOT NULL,
    mes                 INTEGER NOT NULL,
    rubrica             VARCHAR(200),
    product_reference   VARCHAR(200),
    nr_transacoes       BIGINT,
    valor               NUMERIC,
    descricao           TEXT,
    criado_em           TIMESTAMP NOT NULL DEFAULT now()
);
ALTER TABLE zsgo_invoice_line_detail ADD COLUMN IF NOT EXISTS origem_id BIGINT;

CREATE TABLE IF NOT EXISTS zsgo_credit_note_sync (
    chargeback_id           BIGINT       PRIMARY KEY,
    transacao_original_id   BIGINT,
    cliente_id              BIGINT,
    ano                     INTEGER,
    mes                     INTEGER,
    valor_estorno           NUMERIC,
    zsgo_nc_id              VARCHAR(64),
    status                  VARCHAR(20)  NOT NULL DEFAULT 'PENDENTE',
    tentativas              INTEGER      NOT NULL DEFAULT 0,
    ultimo_erro             TEXT,
    criado_em               TIMESTAMP    NOT NULL DEFAULT now(),
    atualizado_em           TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zsgo_historico (
    id           SERIAL PRIMARY KEY,
    utilizador   VARCHAR(64),
    acao         VARCHAR(60) NOT NULL,
    detalhe      TEXT,
    criado_em    TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zsgo_tarefas (
    codigo            VARCHAR(40) PRIMARY KEY,
    ativa             BOOLEAN     NOT NULL DEFAULT FALSE,
    hora              VARCHAR(5)  NOT NULL DEFAULT '07:00',
    dia_mes           INTEGER,
    ultima_execucao   TIMESTAMP,
    ultimo_estado     VARCHAR(20),
    ultimo_resultado  TEXT,
    a_correr_desde    TIMESTAMP,
    atualizado_em     TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS zsgo_agendador (
    id            INTEGER PRIMARY KEY DEFAULT 1,
    maquina       VARCHAR(120),
    ultimo_sinal  TIMESTAMP,
    iniciado_em   TIMESTAMP
);
INSERT INTO zsgo_tarefas (codigo, hora) VALUES ('SINCRONIZAR_CLIENTES', '07:00') ON CONFLICT DO NOTHING;
INSERT INTO zsgo_tarefas (codigo, hora) VALUES ('ATUALIZAR_CLIENTES', '07:30') ON CONFLICT DO NOTHING;
INSERT INTO zsgo_tarefas (codigo, hora, dia_mes) VALUES ('FATURACAO_MENSAL', '08:00', 1) ON CONFLICT DO NOTHING;

-- ── Identidade & acessos da aplicação web (zsgo_web_*) ───────────────────

CREATE TABLE IF NOT EXISTS zsgo_web_utilizador (
    id               TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email            TEXT         NOT NULL UNIQUE,
    nome_exibicao    TEXT         NOT NULL,
    estado           TEXT         NOT NULL DEFAULT 'ATIVO',
    criado_em        TIMESTAMP(3) NOT NULL DEFAULT now(),
    atualizado_em    TIMESTAMP(3) NOT NULL DEFAULT now(),
    ultimo_login_em  TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS zsgo_web_perfil (
    id                   TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nome                 TEXT         NOT NULL UNIQUE,
    descricao            TEXT,
    criado_pelo_sistema  BOOLEAN      NOT NULL DEFAULT FALSE,
    super_admin          BOOLEAN      NOT NULL DEFAULT FALSE,
    criado_em            TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zsgo_web_permissao_recurso (
    id         TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    perfil_id  TEXT    NOT NULL REFERENCES zsgo_web_perfil(id) ON DELETE CASCADE,
    recurso    TEXT    NOT NULL,
    consultar  BOOLEAN NOT NULL DEFAULT FALSE,
    criar      BOOLEAN NOT NULL DEFAULT FALSE,
    editar     BOOLEAN NOT NULL DEFAULT FALSE,
    eliminar   BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (perfil_id, recurso)
);

CREATE TABLE IF NOT EXISTS zsgo_web_utilizador_perfil (
    utilizador_id  TEXT         NOT NULL REFERENCES zsgo_web_utilizador(id) ON DELETE CASCADE,
    perfil_id      TEXT         NOT NULL REFERENCES zsgo_web_perfil(id) ON DELETE CASCADE,
    atribuido_em   TIMESTAMP(3) NOT NULL DEFAULT now(),
    PRIMARY KEY (utilizador_id, perfil_id)
);

CREATE TABLE IF NOT EXISTS zsgo_web_identidade_externa (
    id               TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
    utilizador_id    TEXT         NOT NULL REFERENCES zsgo_web_utilizador(id) ON DELETE CASCADE,
    provedor         TEXT         NOT NULL,
    sujeito_externo  TEXT         NOT NULL,
    dados_brutos     JSONB,
    criado_em        TIMESTAMP(3) NOT NULL DEFAULT now(),
    UNIQUE (provedor, sujeito_externo)
);
CREATE INDEX IF NOT EXISTS zsgo_web_identidade_externa_utilizador_idx ON zsgo_web_identidade_externa (utilizador_id);

CREATE TABLE IF NOT EXISTS zsgo_web_sessao (
    id             TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
    utilizador_id  TEXT         NOT NULL REFERENCES zsgo_web_utilizador(id) ON DELETE CASCADE,
    criado_em      TIMESTAMP(3) NOT NULL DEFAULT now(),
    expira_em      TIMESTAMP(3) NOT NULL,
    ip             TEXT,
    user_agent     TEXT,
    revogada_em    TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS zsgo_web_sessao_utilizador_idx ON zsgo_web_sessao (utilizador_id);

CREATE TABLE IF NOT EXISTS zsgo_web_tentativa_autenticacao (
    id            TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email         TEXT         NOT NULL,
    sucesso       BOOLEAN      NOT NULL,
    motivo_falha  TEXT,
    ip            TEXT,
    criado_em     TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zsgo_web_tentativa_email_idx ON zsgo_web_tentativa_autenticacao (email, criado_em);

CREATE TABLE IF NOT EXISTS zsgo_web_auditoria (
    id             TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
    utilizador_id  TEXT         REFERENCES zsgo_web_utilizador(id) ON DELETE SET NULL,
    acao           TEXT         NOT NULL,
    entidade       TEXT         NOT NULL,
    entidade_id    TEXT,
    antes          JSONB,
    depois         JSONB,
    ip             TEXT,
    criado_em      TIMESTAMP(3) NOT NULL DEFAULT now(),
    hash_anterior  TEXT,
    hash_atual     TEXT         NOT NULL
);
CREATE INDEX IF NOT EXISTS zsgo_web_auditoria_entidade_idx ON zsgo_web_auditoria (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS zsgo_web_auditoria_utilizador_idx ON zsgo_web_auditoria (utilizador_id, criado_em);

-- Execuções da faturação lançadas pela página (passos, resumo e resultado),
-- para a janela de passos sobreviver a um refresh e impedir duas ao mesmo tempo.
CREATE TABLE IF NOT EXISTS zsgo_web_execucao (
    id             TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tipo           TEXT         NOT NULL,
    ano            INTEGER      NOT NULL,
    mes            INTEGER      NOT NULL,
    estado         TEXT         NOT NULL,
    passos         JSONB        NOT NULL DEFAULT '[]'::jsonb,
    resumo         JSONB,
    resultado      TEXT,
    iniciado_por   TEXT,
    iniciado_em    TIMESTAMP(3) NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMP(3) NOT NULL DEFAULT now(),
    terminado_em   TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS zsgo_web_execucao_iniciado_idx ON zsgo_web_execucao (iniciado_em DESC);
