package pt.zsgosync.db;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public class InvoiceSyncDao {
   public void ensureTableExists(Connection var1) throws SQLException {
      String var2 = "CREATE TABLE IF NOT EXISTS zsgo_invoice_sync (\n    user_id         BIGINT       NOT NULL,\n    origem_id       BIGINT       NOT NULL,\n    ano             INTEGER      NOT NULL,\n    mes             INTEGER      NOT NULL,\n    zsgo_sale_id    VARCHAR(64),\n    pdf_url         TEXT,\n    valor_total     NUMERIC,\n    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDENTE',\n    tentativas      INTEGER      NOT NULL DEFAULT 0,\n    ultimo_erro     TEXT,\n    criado_em       TIMESTAMP    NOT NULL DEFAULT now(),\n    atualizado_em   TIMESTAMP    NOT NULL DEFAULT now(),\n    PRIMARY KEY (user_id, origem_id, ano, mes)\n)\n";

      try (Statement var3 = var1.createStatement()) {
         var3.execute(var2);
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS valor_total NUMERIC");
         // Conferência com o ZSGO: o que o ZSGO tem mesmo para esta fatura.
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_numero VARCHAR(64)");
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_total NUMERIC");
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_liquido NUMERIC");
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_iva NUMERIC");
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_estado VARCHAR(40)");
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_anulado BOOLEAN");
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_conferido_em TIMESTAMP");
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_erro_conferencia TEXT");
         // Pedido de criação sem resposta: a fatura pode existir no ZSGO. Enquanto
         // estiver marcada, a faturação NÃO volta a criá-la (evita duplicados).
         var3.execute("ALTER TABLE zsgo_invoice_sync ADD COLUMN IF NOT EXISTS zsgo_incerto BOOLEAN NOT NULL DEFAULT FALSE");
      }
   }

   public InvoiceSyncDao.Estado getEstado(Connection var1, String var2, String var3, int var4, int var5) throws SQLException {
      String var6 = "SELECT status, zsgo_sale_id, pdf_url, tentativas, zsgo_incerto FROM zsgo_invoice_sync WHERE user_id = ? AND origem_id = ? AND ano = ? AND mes = ?";

      InvoiceSyncDao.Estado var10;
      try (PreparedStatement var7 = var1.prepareStatement(var6)) {
         var7.setLong(1, paraLong(var2));
         var7.setLong(2, paraLong(var3));
         var7.setInt(3, var4);
         var7.setInt(4, var5);

         try (ResultSet var8 = var7.executeQuery()) {
            if (!var8.next()) {
               return null;
            }

            InvoiceSyncDao.Estado var15 = new InvoiceSyncDao.Estado();
            var15.status = var8.getString("status");
            var15.zsgoSaleId = var8.getString("zsgo_sale_id");
            var15.pdfUrl = var8.getString("pdf_url");
            var15.tentativas = var8.getInt("tentativas");
            var15.incerto = var8.getBoolean("zsgo_incerto");
            var10 = var15;
         }
      }

      return var10;
   }

   private void upsert(
      Connection var1, String var2, String var3, int var4, int var5, String var6, String var7, String var8, BigDecimal var9, String var10, boolean var11
   ) throws SQLException {
      String var12 = "INSERT INTO zsgo_invoice_sync (user_id, origem_id, ano, mes, zsgo_sale_id, pdf_url, valor_total, status, tentativas, ultimo_erro, atualizado_em)\nVALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())\nON CONFLICT (user_id, origem_id, ano, mes) DO UPDATE SET\n    zsgo_sale_id = COALESCE(EXCLUDED.zsgo_sale_id, zsgo_invoice_sync.zsgo_sale_id),\n    pdf_url = COALESCE(EXCLUDED.pdf_url, zsgo_invoice_sync.pdf_url),\n    valor_total = COALESCE(EXCLUDED.valor_total, zsgo_invoice_sync.valor_total),\n    status = EXCLUDED.status,\n    tentativas = zsgo_invoice_sync.tentativas + ?,\n    ultimo_erro = EXCLUDED.ultimo_erro,\n    atualizado_em = now()\n";

      try (PreparedStatement var13 = var1.prepareStatement(var12)) {
         var13.setLong(1, paraLong(var2));
         var13.setLong(2, paraLong(var3));
         var13.setInt(3, var4);
         var13.setInt(4, var5);
         var13.setString(5, var7);
         var13.setString(6, var8);
         if (var9 != null) {
            var13.setBigDecimal(7, var9);
         } else {
            var13.setNull(7, 2);
         }

         var13.setString(8, var6);
         var13.setInt(9, var11 ? 1 : 0);
         var13.setString(10, var10);
         var13.setInt(11, var11 ? 1 : 0);
         var13.executeUpdate();
      }
   }

   public void marcarFaturaCriada(Connection var1, String var2, String var3, int var4, int var5, String var6, BigDecimal var7) throws SQLException {
      this.upsert(var1, var2, var3, var4, var5, "FATURA_CRIADA", var6, null, var7, null, false);
   }

   public void marcarPdfGerado(Connection var1, String var2, String var3, int var4, int var5, String var6) throws SQLException {
      this.upsert(var1, var2, var3, var4, var5, "PDF_GERADO", null, var6, null, null, false);
   }

   public void marcarSincronizado(Connection var1, String var2, String var3, int var4, int var5) throws SQLException {
      this.upsert(var1, var2, var3, var4, var5, "SINCRONIZADO", null, null, null, null, false);
   }

   public void marcarErro(Connection var1, String var2, String var3, int var4, int var5, String var6) throws SQLException {
      this.upsert(var1, var2, var3, var4, var5, "ERRO", null, null, null, var6, true);
   }

   public InvoiceSyncDao.Resumo obterResumo(Connection var1, int var2, int var3) throws SQLException {
      InvoiceSyncDao.Resumo var4 = new InvoiceSyncDao.Resumo();
      String var5 = "SELECT status, COUNT(*) AS n, COALESCE(SUM(valor_total), 0) AS soma\nFROM zsgo_invoice_sync\nWHERE ano = ? AND mes = ?\nGROUP BY status\n";

      try (PreparedStatement var6 = var1.prepareStatement(var5)) {
         var6.setInt(1, var2);
         var6.setInt(2, var3);

         try (ResultSet var7 = var6.executeQuery()) {
            while (var7.next()) {
               String var8 = var7.getString("status");
               int var9 = var7.getInt("n");
               BigDecimal var10 = var7.getBigDecimal("soma");
               if ("SINCRONIZADO".equals(var8)) {
                  var4.sincronizados += var9;
                  var4.valorTotal = var4.valorTotal.add(var10);
               } else if ("ERRO".equals(var8)) {
                  var4.comErro += var9;
               } else {
                  var4.pendentesOuOutros += var9;
               }
            }
         }
      }

      return var4;
   }

   public List<InvoiceSyncDao.LinhaErro> listarErros(Connection var1, int var2, int var3) throws SQLException {
      ArrayList var4 = new ArrayList();
      String var5 = "SELECT user_id, origem_id, ultimo_erro\nFROM zsgo_invoice_sync\nWHERE ano = ? AND mes = ? AND status = 'ERRO'\nORDER BY user_id ASC, origem_id ASC\n";

      try (PreparedStatement var6 = var1.prepareStatement(var5)) {
         var6.setInt(1, var2);
         var6.setInt(2, var3);

         try (ResultSet var7 = var6.executeQuery()) {
            while (var7.next()) {
               InvoiceSyncDao.LinhaErro var8 = new InvoiceSyncDao.LinhaErro();
               long var9 = var7.getLong("user_id");
               long var11 = var7.getLong("origem_id");
               var8.clienteId = var9 == var11 ? String.valueOf(var9) : var9 + " (via " + var11 + ")";
               var8.erro = var7.getString("ultimo_erro");
               var4.add(var8);
            }
         }
      }

      return var4;
   }

   /**
    * Todas as faturas do mês (seja qual for o estado), com o id no ZSGO, o
    * valor enviado e o resumo das rubricas gravadas em zsgo_invoice_line_detail
    * — para comparar fatura a fatura com o que aparece no ZSGO.
    */
   public List<InvoiceSyncDao.FaturaDetalhe> listarFaturas(Connection var1, int var2, int var3) throws SQLException {
      List<InvoiceSyncDao.FaturaDetalhe> var4 = new ArrayList<>();
      String var5 = """
         SELECT f.user_id, f.origem_id, f.status, f.zsgo_sale_id, f.valor_total, f.pdf_url,
                f.tentativas, f.ultimo_erro, f.atualizado_em,
                f.zsgo_numero, f.zsgo_total, f.zsgo_liquido, f.zsgo_iva, f.zsgo_estado, f.zsgo_anulado,
                f.zsgo_conferido_em, f.zsgo_erro_conferencia, f.zsgo_incerto,
                s.zsgo_code,
                s.zsgo_dados->'data'->'identity'->>'name' AS nome,
                s.zsgo_dados->'data'->'identity'->>'tax_id' AS nif,
                uo.name AS nome_origem,
                l.n_linhas, l.n_transacoes, l.soma_linhas, l.rubricas
         FROM zsgo_invoice_sync f
         LEFT JOIN zsgo_client_sync s ON s.user_id = f.user_id
         LEFT JOIN public.users uo ON uo.id = f.origem_id AND f.origem_id <> f.user_id
         LEFT JOIN LATERAL (
             SELECT COUNT(*) AS n_linhas,
                    SUM(d.nr_transacoes) AS n_transacoes,
                    SUM(d.valor) AS soma_linhas,
                    string_agg(COALESCE(d.rubrica, '?') || ' | ' || COALESCE(d.nr_transacoes::text, '?')
                               || ' transações | ' || COALESCE(d.valor::text, '?') || ' €'
                               || COALESCE(' | ' || d.descricao, ''), E'\n' ORDER BY d.rubrica) AS rubricas
             FROM zsgo_invoice_line_detail d
             WHERE d.cliente_id = f.user_id AND d.ano = f.ano AND d.mes = f.mes
               AND (d.origem_id = f.origem_id
                    OR (d.origem_id IS NULL AND NOT EXISTS (
                          SELECT 1 FROM zsgo_invoice_sync f2
                          WHERE f2.user_id = f.user_id AND f2.ano = f.ano AND f2.mes = f.mes
                            AND f2.origem_id <> f.origem_id)))
         ) l ON true
         WHERE f.ano = ? AND f.mes = ?
         ORDER BY f.user_id ASC, f.origem_id ASC
         """;

      try (PreparedStatement var6 = var1.prepareStatement(var5)) {
         var6.setInt(1, var2);
         var6.setInt(2, var3);

         try (ResultSet var7 = var6.executeQuery()) {
            while (var7.next()) {
               InvoiceSyncDao.FaturaDetalhe var8 = new InvoiceSyncDao.FaturaDetalhe();
               var8.clienteId = String.valueOf(var7.getLong("user_id"));
               var8.origemId = String.valueOf(var7.getLong("origem_id"));
               var8.nomeOrigem = var7.getString("nome_origem");
               var8.status = var7.getString("status");
               var8.zsgoSaleId = var7.getString("zsgo_sale_id");
               var8.valorTotal = var7.getBigDecimal("valor_total");
               var8.pdfUrl = var7.getString("pdf_url");
               var8.tentativas = var7.getInt("tentativas");
               var8.ultimoErro = var7.getString("ultimo_erro");
               var8.atualizadoEm = var7.getTimestamp("atualizado_em");
               var8.zsgoCode = var7.getString("zsgo_code");
               var8.nome = var7.getString("nome");
               var8.nif = var7.getString("nif");
               var8.nLinhas = var7.getInt("n_linhas");
               var8.nTransacoes = var7.getLong("n_transacoes");
               var8.somaLinhas = var7.getBigDecimal("soma_linhas");
               var8.rubricas = var7.getString("rubricas");
               var8.zsgoNumero = var7.getString("zsgo_numero");
               var8.zsgoTotal = var7.getBigDecimal("zsgo_total");
               var8.zsgoLiquido = var7.getBigDecimal("zsgo_liquido");
               var8.zsgoIva = var7.getBigDecimal("zsgo_iva");
               var8.zsgoEstado = var7.getString("zsgo_estado");
               var8.zsgoAnulado = var7.getBoolean("zsgo_anulado");
               var8.zsgoConferidoEm = var7.getTimestamp("zsgo_conferido_em");
               var8.zsgoErroConferencia = var7.getString("zsgo_erro_conferencia");
               var8.incerto = var7.getBoolean("zsgo_incerto");
               var4.add(var8);
            }
         }
      }

      return var4;
   }

   public void marcarIncerto(Connection c, String cliente, String origem, int ano, int mes, boolean incerto) throws SQLException {
      try (PreparedStatement ps = c.prepareStatement("UPDATE zsgo_invoice_sync SET zsgo_incerto = ?, atualizado_em = now() WHERE user_id = ? AND origem_id = ? AND ano = ? AND mes = ?")) {
         ps.setBoolean(1, incerto);
         ps.setLong(2, paraLong(cliente));
         ps.setLong(3, paraLong(origem));
         ps.setInt(4, ano);
         ps.setInt(5, mes);
         ps.executeUpdate();
      }
   }

   /**
    * A fatura existe no ZSGO (confirmado pelo utilizador): associa o id e o
    * PDF e tira a marca de incerteza. A próxima faturação só envia o PDF ao Cyclos.
    */
   public void associarDocumento(Connection c, String cliente, String origem, int ano, int mes, String zsgoSaleId, String pdfUrl, java.math.BigDecimal total)
      throws SQLException {
      String sql = """
         UPDATE zsgo_invoice_sync SET zsgo_sale_id = ?, pdf_url = COALESCE(?, pdf_url), valor_total = COALESCE(valor_total, ?),
             status = CASE WHEN ?::text IS NULL THEN 'FATURA_CRIADA' ELSE 'PDF_GERADO' END,
             zsgo_incerto = FALSE,
             ultimo_erro = 'Associada à fatura que já existia no ZSGO (' || ?::text || '). Falta enviar o PDF ao Cyclos: gere a faturação outra vez.',
             atualizado_em = now()
         WHERE user_id = ? AND origem_id = ? AND ano = ? AND mes = ?
         """;
      try (PreparedStatement ps = c.prepareStatement(sql)) {
         ps.setString(1, zsgoSaleId);
         ps.setString(2, pdfUrl);
         ps.setBigDecimal(3, total);
         ps.setString(4, pdfUrl);
         ps.setString(5, zsgoSaleId);
         ps.setLong(6, paraLong(cliente));
         ps.setLong(7, paraLong(origem));
         ps.setInt(8, ano);
         ps.setInt(9, mes);
         ps.executeUpdate();
      }
   }

   /** Grava o que o ZSGO devolveu para esta fatura (ou o erro, se não foi possível ler). */
   public void gravarConferencia(Connection c, String cliente, String origem, int ano, int mes, pt.zsgosync.zsgo.ZsgoDocumento d, String erro)
      throws SQLException {
      String sql = """
         UPDATE zsgo_invoice_sync SET
             zsgo_numero = COALESCE(?, zsgo_numero), zsgo_total = ?, zsgo_liquido = ?, zsgo_iva = ?,
             zsgo_estado = ?, zsgo_anulado = ?, zsgo_conferido_em = now(), zsgo_erro_conferencia = ?
         WHERE user_id = ? AND origem_id = ? AND ano = ? AND mes = ?
         """;
      try (PreparedStatement ps = c.prepareStatement(sql)) {
         ps.setString(1, d != null ? d.numero : null);
         ps.setBigDecimal(2, d != null ? d.total : null);
         ps.setBigDecimal(3, d != null ? d.liquido : null);
         ps.setBigDecimal(4, d != null ? d.iva : null);
         ps.setString(5, d != null ? d.estado : null);
         if (d != null) {
            ps.setBoolean(6, d.anulado);
         } else {
            ps.setNull(6, java.sql.Types.BOOLEAN);
         }
         ps.setString(7, erro);
         ps.setLong(8, paraLong(cliente));
         ps.setLong(9, paraLong(origem));
         ps.setInt(10, ano);
         ps.setInt(11, mes);
         ps.executeUpdate();
      }
   }

   private static long paraLong(String var0) {
      try {
         return Long.parseLong(var0.trim());
      } catch (NullPointerException | NumberFormatException var2) {
         throw new IllegalArgumentException("ID de cliente inválido (esperava um número): '" + var0 + "'", var2);
      }
   }

   public static class Estado {
      public String status;
      public String zsgoSaleId;
      public String pdfUrl;
      public int tentativas;
      public boolean incerto;
   }

   public static class FaturaDetalhe {
      public String clienteId;
      public String origemId;
      public String nomeOrigem;
      public String status;
      public String zsgoSaleId;
      public BigDecimal valorTotal;
      public String pdfUrl;
      public int tentativas;
      public String ultimoErro;
      public java.sql.Timestamp atualizadoEm;
      public String zsgoCode;
      public String nome;
      public String nif;
      public int nLinhas;
      public long nTransacoes;
      public BigDecimal somaLinhas;
      public String rubricas;

      public String zsgoNumero;
      public BigDecimal zsgoTotal;
      public BigDecimal zsgoLiquido;
      public BigDecimal zsgoIva;
      public String zsgoEstado;
      public boolean zsgoAnulado;
      public java.sql.Timestamp zsgoConferidoEm;
      public String zsgoErroConferencia;
      public boolean incerto;

      /** Diferença entre o que o ZSGO tem e o que o programa enviou (null se não conferida). */
      public BigDecimal diferenca() {
         return this.zsgoTotal != null && this.valorTotal != null ? this.zsgoTotal.subtract(this.valorTotal) : null;
      }

      public boolean temDiferenca() {
         BigDecimal d = this.diferenca();
         return this.zsgoAnulado || d != null && d.abs().compareTo(new BigDecimal("0.01")) >= 0;
      }

      public boolean isRedirecionada() {
         return this.origemId != null && !this.origemId.equals(this.clienteId);
      }
   }

   public static class LinhaErro {
      public String clienteId;
      public String erro;
   }

   public static class Resumo {
      public int sincronizados;
      public BigDecimal valorTotal = BigDecimal.ZERO;
      public int comErro;
      public int pendentesOuOutros;
   }
}
