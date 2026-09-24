package pt.zsgosync.db;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;

public class SyncControlDao {
   private final String table;

   public SyncControlDao(String var1) {
      if (!var1.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
         throw new IllegalArgumentException("Nome de tabela inválido: " + var1);
      } else {
         this.table = var1;
      }
   }

   public void ensureTableExists(Connection var1) throws SQLException {
      String var2 = "CREATE TABLE IF NOT EXISTS %s (\n    user_id         BIGINT       PRIMARY KEY,\n    zsgo_code       BIGINT,\n    zsgo_dados      JSONB,\n    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDENTE',\n    tentativas      INTEGER      NOT NULL DEFAULT 0,\n    ultimo_erro     TEXT,\n    criado_em       TIMESTAMP    NOT NULL DEFAULT now(),\n    atualizado_em   TIMESTAMP    NOT NULL DEFAULT now()\n)\n"
         .formatted(this.table);

      try (Statement var3 = var1.createStatement()) {
         var3.execute(var2);
         var3.execute("ALTER TABLE %s ADD COLUMN IF NOT EXISTS zsgo_dados JSONB".formatted(this.table));
         var3.execute("ALTER TABLE %s ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64)".formatted(this.table));
      }
   }

   public void markSuccess(Connection var1, String var2, String var3, String var4, String var5) throws SQLException {
      String var6 = "INSERT INTO %1$s (user_id, zsgo_code, zsgo_dados, content_hash, status, tentativas, ultimo_erro, atualizado_em)\nVALUES (?, ?, ?::jsonb, ?, 'SINCRONIZADO', 1, NULL, now())\nON CONFLICT (user_id) DO UPDATE SET\n    zsgo_code = EXCLUDED.zsgo_code,\n    zsgo_dados = EXCLUDED.zsgo_dados,\n    content_hash = EXCLUDED.content_hash,\n    status = 'SINCRONIZADO',\n    tentativas = %1$s.tentativas + 1,\n    ultimo_erro = NULL,\n    atualizado_em = now()\n"
         .formatted(this.table);

      try (PreparedStatement var7 = var1.prepareStatement(var6)) {
         var7.setLong(1, paraLong(var2));
         if (var3 != null) {
            var7.setLong(2, paraLong(var3));
         } else {
            var7.setNull(2, -5);
         }

         if (var4 != null) {
            var7.setString(3, var4);
         } else {
            var7.setNull(3, 1111);
         }

         if (var5 != null) {
            var7.setString(4, var5);
         } else {
            var7.setNull(4, 12);
         }

         var7.executeUpdate();
      }
   }

   public void markError(Connection var1, String var2, String var3) throws SQLException {
      String var4 = "INSERT INTO %1$s (user_id, status, tentativas, ultimo_erro, atualizado_em)\nVALUES (?, 'ERRO', 1, ?, now())\nON CONFLICT (user_id) DO UPDATE SET\n    status = 'ERRO',\n    tentativas = %1$s.tentativas + 1,\n    ultimo_erro = EXCLUDED.ultimo_erro,\n    atualizado_em = now()\n"
         .formatted(this.table);

      try (PreparedStatement var5 = var1.prepareStatement(var4)) {
         var5.setLong(1, paraLong(var2));
         var5.setString(2, truncate(var3, 2000));
         var5.executeUpdate();
      }
   }

   public void markUpdateError(Connection var1, String var2, String var3) throws SQLException {
      String var4 = "UPDATE %1$s SET\n    ultimo_erro = ?,\n    tentativas = tentativas + 1,\n    atualizado_em = now()\nWHERE user_id = ?\n"
         .formatted(this.table);

      try (PreparedStatement var5 = var1.prepareStatement(var4)) {
         var5.setString(1, truncate(var3, 2000));
         var5.setLong(2, paraLong(var2));
         var5.executeUpdate();
      }
   }

   private static long paraLong(String var0) {
      try {
         return Long.parseLong(var0.trim());
      } catch (NullPointerException | NumberFormatException var2) {
         throw new IllegalArgumentException("ID de cliente inválido (esperava um número): '" + var0 + "'", var2);
      }
   }

   private static String truncate(String var0, int var1) {
      if (var0 == null) {
         return null;
      } else {
         return var0.length() <= var1 ? var0 : var0.substring(0, var1);
      }
   }
}
