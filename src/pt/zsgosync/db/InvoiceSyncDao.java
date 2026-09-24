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
      }
   }

   public InvoiceSyncDao.Estado getEstado(Connection var1, String var2, String var3, int var4, int var5) throws SQLException {
      String var6 = "SELECT status, zsgo_sale_id, pdf_url, tentativas FROM zsgo_invoice_sync WHERE user_id = ? AND origem_id = ? AND ano = ? AND mes = ?";

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
