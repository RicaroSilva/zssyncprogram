package pt.zsgosync.db;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public class CreditNoteSyncDao {
   public void ensureTableExists(Connection var1) throws SQLException {
      String var2 = "CREATE TABLE IF NOT EXISTS zsgo_credit_note_sync (\n    chargeback_id           BIGINT       PRIMARY KEY,\n    transacao_original_id   BIGINT,\n    cliente_id              BIGINT,\n    ano                     INTEGER,\n    mes                     INTEGER,\n    valor_estorno           NUMERIC,\n    zsgo_nc_id              VARCHAR(64),\n    status                  VARCHAR(20)  NOT NULL DEFAULT 'PENDENTE',\n    tentativas              INTEGER      NOT NULL DEFAULT 0,\n    ultimo_erro             TEXT,\n    criado_em               TIMESTAMP    NOT NULL DEFAULT now(),\n    atualizado_em           TIMESTAMP    NOT NULL DEFAULT now()\n)\n";

      try (Statement var3 = var1.createStatement()) {
         var3.execute(var2);
         var3.execute("ALTER TABLE zsgo_credit_note_sync ADD COLUMN IF NOT EXISTS ano INTEGER");
         var3.execute("ALTER TABLE zsgo_credit_note_sync ADD COLUMN IF NOT EXISTS mes INTEGER");
         var3.execute("ALTER TABLE zsgo_credit_note_sync ADD COLUMN IF NOT EXISTS valor_estorno NUMERIC");
      }
   }

   public CreditNoteSyncDao.Estado getEstado(Connection var1, String var2) throws SQLException {
      String var3 = "SELECT status, tentativas FROM zsgo_credit_note_sync WHERE chargeback_id = ?";

      CreditNoteSyncDao.Estado var7;
      try (PreparedStatement var4 = var1.prepareStatement(var3)) {
         var4.setLong(1, paraLong(var2));

         try (ResultSet var5 = var4.executeQuery()) {
            if (!var5.next()) {
               return null;
            }

            CreditNoteSyncDao.Estado var12 = new CreditNoteSyncDao.Estado();
            var12.status = var5.getString("status");
            var12.tentativas = var5.getInt("tentativas");
            var7 = var12;
         }
      }

      return var7;
   }

   public void marcarSucesso(Connection var1, String var2, String var3, String var4, int var5, int var6, BigDecimal var7, String var8) throws SQLException {
      String var9 = "INSERT INTO zsgo_credit_note_sync\n    (chargeback_id, transacao_original_id, cliente_id, ano, mes, valor_estorno, zsgo_nc_id, status, tentativas, ultimo_erro, atualizado_em)\nVALUES (?, ?, ?, ?, ?, ?, ?, 'SINCRONIZADO', 1, NULL, now())\nON CONFLICT (chargeback_id) DO UPDATE SET\n    transacao_original_id = EXCLUDED.transacao_original_id,\n    cliente_id = EXCLUDED.cliente_id,\n    ano = EXCLUDED.ano,\n    mes = EXCLUDED.mes,\n    valor_estorno = EXCLUDED.valor_estorno,\n    zsgo_nc_id = EXCLUDED.zsgo_nc_id,\n    status = 'SINCRONIZADO',\n    tentativas = zsgo_credit_note_sync.tentativas + 1,\n    ultimo_erro = NULL,\n    atualizado_em = now()\n";

      try (PreparedStatement var10 = var1.prepareStatement(var9)) {
         var10.setLong(1, paraLong(var2));
         var10.setLong(2, paraLong(var3));
         var10.setLong(3, paraLong(var4));
         var10.setInt(4, var5);
         var10.setInt(5, var6);
         var10.setBigDecimal(6, var7);
         var10.setString(7, var8);
         var10.executeUpdate();
      }
   }

   public void marcarErro(Connection var1, String var2, String var3, String var4, int var5, int var6, String var7) throws SQLException {
      String var8 = "INSERT INTO zsgo_credit_note_sync\n    (chargeback_id, transacao_original_id, cliente_id, ano, mes, status, tentativas, ultimo_erro, atualizado_em)\nVALUES (?, ?, ?, ?, ?, 'ERRO', 1, ?, now())\nON CONFLICT (chargeback_id) DO UPDATE SET\n    cliente_id = EXCLUDED.cliente_id,\n    ano = EXCLUDED.ano,\n    mes = EXCLUDED.mes,\n    status = 'ERRO',\n    tentativas = zsgo_credit_note_sync.tentativas + 1,\n    ultimo_erro = EXCLUDED.ultimo_erro,\n    atualizado_em = now()\n";

      try (PreparedStatement var9 = var1.prepareStatement(var8)) {
         var9.setLong(1, paraLong(var2));
         var9.setLong(2, paraLong(var3));
         var9.setLong(3, paraLong(var4));
         var9.setInt(4, var5);
         var9.setInt(5, var6);
         var9.setString(6, var7);
         var9.executeUpdate();
      }
   }

   public CreditNoteSyncDao.Resumo obterResumo(Connection var1, int var2, int var3) throws SQLException {
      CreditNoteSyncDao.Resumo var4 = new CreditNoteSyncDao.Resumo();
      String var5 = "SELECT status, COUNT(*) AS n, COALESCE(SUM(valor_estorno), 0) AS soma\nFROM zsgo_credit_note_sync\nWHERE ano = ? AND mes = ?\nGROUP BY status\n";

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
               }
            }
         }
      }

      return var4;
   }

   public List<CreditNoteSyncDao.LinhaErro> listarErros(Connection var1, int var2, int var3) throws SQLException {
      ArrayList var4 = new ArrayList();
      String var5 = "SELECT cliente_id, ultimo_erro\nFROM zsgo_credit_note_sync\nWHERE ano = ? AND mes = ? AND status = 'ERRO'\nORDER BY cliente_id ASC\n";

      try (PreparedStatement var6 = var1.prepareStatement(var5)) {
         var6.setInt(1, var2);
         var6.setInt(2, var3);

         try (ResultSet var7 = var6.executeQuery()) {
            while (var7.next()) {
               CreditNoteSyncDao.LinhaErro var8 = new CreditNoteSyncDao.LinhaErro();
               var8.clienteId = String.valueOf(var7.getLong("cliente_id"));
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
         throw new IllegalArgumentException("ID inválido (esperava um número): '" + var0 + "'", var2);
      }
   }

   public static class Estado {
      public String status;
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
   }
}
