package pt.zsgosync.db;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import pt.zsgosync.model.BillingLine;

public class InvoiceLineDetailDao {
   public void ensureTableExists(Connection var1) throws SQLException {
      String var2 = "CREATE TABLE IF NOT EXISTS zsgo_invoice_line_detail (\n    id                  SERIAL PRIMARY KEY,\n    cliente_id          BIGINT NOT NULL,\n    ano                 INTEGER NOT NULL,\n    mes                 INTEGER NOT NULL,\n    rubrica             VARCHAR(200),\n    product_reference   VARCHAR(200),\n    nr_transacoes       BIGINT,\n    valor               NUMERIC,\n    descricao           TEXT,\n    criado_em           TIMESTAMP NOT NULL DEFAULT now()\n)\n";

      try (Statement var3 = var1.createStatement()) {
         var3.execute(var2);
         // origem_id: conta de origem da fatura (clientes com comissões redirecionadas
         // têm uma fatura por origem). Linhas antigas ficam com NULL.
         var3.execute("ALTER TABLE zsgo_invoice_line_detail ADD COLUMN IF NOT EXISTS origem_id BIGINT");
         var3.execute("CREATE INDEX IF NOT EXISTS idx_invoice_line_detail_cliente_mes ON zsgo_invoice_line_detail (cliente_id, ano, mes)");
      }
   }

   public void inserirLinhas(Connection var1, String var2, String origem, int var3, int var4, List<BillingLine> var5) throws SQLException {
      String var6 = "INSERT INTO zsgo_invoice_line_detail\n    (cliente_id, ano, mes, rubrica, product_reference, nr_transacoes, valor, descricao, origem_id)\nVALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\n";

      try (PreparedStatement var7 = var1.prepareStatement(var6)) {
         long var8 = paraLong(var2);

         for (BillingLine var11 : var5) {
            var7.setLong(1, var8);
            var7.setInt(2, var3);
            var7.setInt(3, var4);
            var7.setString(4, var11.rubrica);
            var7.setString(5, var11.productReference);
            var7.setLong(6, var11.nrTransacoes);
            if (var11.valorTotal != null) {
               var7.setBigDecimal(7, var11.valorTotal);
            } else {
               var7.setNull(7, 2);
            }

            var7.setString(8, var11.descricaoLinha);
            var7.setLong(9, origem != null ? paraLong(origem) : var8);
            var7.addBatch();
         }

         var7.executeBatch();
      }
   }

   public List<InvoiceLineDetailDao.LinhaDetalhe> obterPorMes(Connection var1, int var2, int var3) throws SQLException {
      ArrayList var4 = new ArrayList();
      String var5 = "SELECT d.cliente_id, d.rubrica, d.product_reference, d.nr_transacoes, d.valor, d.descricao,\n       s.zsgo_dados->'data'->'identity'->>'name' AS nome,\n       s.zsgo_dados->'data'->'identity'->>'tax_id' AS nif,\n       s.zsgo_dados->'data'->'billing'->>'exemption_code' AS exemption_code\nFROM zsgo_invoice_line_detail d\nLEFT JOIN zsgo_client_sync s ON s.user_id = d.cliente_id\nWHERE d.ano = ? AND d.mes = ?\nORDER BY d.cliente_id ASC, d.rubrica ASC\n";

      try (PreparedStatement var6 = var1.prepareStatement(var5)) {
         var6.setInt(1, var2);
         var6.setInt(2, var3);

         try (ResultSet var7 = var6.executeQuery()) {
            while (var7.next()) {
               var4.add(lerLinha(var7));
            }
         }
      }

      return var4;
   }

   public List<InvoiceLineDetailDao.LinhaDetalhe> obterPorClienteEMes(Connection var1, String var2, int var3, int var4) throws SQLException {
      ArrayList var5 = new ArrayList();
      String var6 = "SELECT d.cliente_id, d.rubrica, d.product_reference, d.nr_transacoes, d.valor, d.descricao,\n       s.zsgo_dados->'data'->'identity'->>'name' AS nome,\n       s.zsgo_dados->'data'->'identity'->>'tax_id' AS nif,\n       s.zsgo_dados->'data'->'billing'->>'exemption_code' AS exemption_code\nFROM zsgo_invoice_line_detail d\nLEFT JOIN zsgo_client_sync s ON s.user_id = d.cliente_id\nWHERE d.cliente_id = ? AND d.ano = ? AND d.mes = ?\nORDER BY d.rubrica ASC\n";

      try (PreparedStatement var7 = var1.prepareStatement(var6)) {
         var7.setLong(1, paraLong(var2));
         var7.setInt(2, var3);
         var7.setInt(3, var4);

         try (ResultSet var8 = var7.executeQuery()) {
            while (var8.next()) {
               var5.add(lerLinha(var8));
            }
         }
      }

      return var5;
   }

   private static InvoiceLineDetailDao.LinhaDetalhe lerLinha(ResultSet var0) throws SQLException {
      InvoiceLineDetailDao.LinhaDetalhe var1 = new InvoiceLineDetailDao.LinhaDetalhe();
      var1.clienteId = String.valueOf(var0.getLong("cliente_id"));
      var1.rubrica = var0.getString("rubrica");
      var1.productReference = var0.getString("product_reference");
      var1.nrTransacoes = var0.getLong("nr_transacoes");
      var1.valor = var0.getBigDecimal("valor");
      var1.descricao = var0.getString("descricao");
      var1.nome = var0.getString("nome");
      var1.nif = var0.getString("nif");
      var1.exemptionCode = var0.getString("exemption_code");
      return var1;
   }

   private static long paraLong(String var0) {
      try {
         return Long.parseLong(var0.trim());
      } catch (NullPointerException | NumberFormatException var2) {
         throw new IllegalArgumentException("ID de cliente inválido (esperava um número): '" + var0 + "'", var2);
      }
   }

   public static class LinhaDetalhe {
      public String clienteId;
      public String rubrica;
      public String productReference;
      public long nrTransacoes;
      public BigDecimal valor;
      public String descricao;
      public String nome;
      public String nif;
      public String exemptionCode;

      public boolean isIsentoIva() {
         return this.exemptionCode != null && !this.exemptionCode.isBlank();
      }
   }
}
