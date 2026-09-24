package pt.zsgosync.db;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import pt.zsgosync.model.SourceClient;

public class ClientSourceDao {
   private final String query;

   public ClientSourceDao(String var1) {
      this.query = var1;
   }

   public List<SourceClient> fetchPending(Connection var1) throws SQLException {
      ArrayList var2 = new ArrayList();

      try (
         Statement var3 = var1.createStatement();
         ResultSet var4 = var3.executeQuery(this.query);
      ) {
         while (var4.next()) {
            SourceClient var5 = new SourceClient();
            var5.id = var4.getString("id");
            var5.nome = var4.getString("nome");
            var5.nif = getOrNull(var4, "nif");
            var5.morada = getOrNull(var4, "morada");
            var5.codigoPostal = getOrNull(var4, "codigo_postal");
            var5.cidade = getOrNull(var4, "cidade");
            var5.pais = getOrNull(var4, "pais");
            var5.email = getOrNull(var4, "email");
            var5.telefone = getOrNull(var4, "telefone");
            var5.prazoDias = getIntOrNull(var4, "prazo_dias");
            var5.isentoSelo = getBooleanOrNull(var4, "isento_selo");
            var5.taxaIvaPercentagem = getOrNull(var4, "taxa_iva_percentagem");
            var5.motivoIsencao = getOrNull(var4, "motivo_isencao");
            var5.motivoIsencaoZsgoCode = getOrNull(var4, "motivo_isencao_zsgo_code");
            var5.contentHash = getOrNull(var4, "content_hash");
            var2.add(var5);
         }
      }

      return var2;
   }

   private static String getOrNull(ResultSet var0, String var1) throws SQLException {
      try {
         return var0.getString(var1);
      } catch (SQLException var3) {
         return null;
      }
   }

   private static Integer getIntOrNull(ResultSet var0, String var1) throws SQLException {
      try {
         int var2 = var0.getInt(var1);
         return var0.wasNull() ? null : var2;
      } catch (SQLException var3) {
         return null;
      }
   }

   private static Boolean getBooleanOrNull(ResultSet var0, String var1) throws SQLException {
      try {
         boolean var2 = var0.getBoolean(var1);
         return var0.wasNull() ? null : var2;
      } catch (SQLException var3) {
         return null;
      }
   }
}
