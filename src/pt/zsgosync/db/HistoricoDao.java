package pt.zsgosync.db;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

public class HistoricoDao {
   public void ensureTableExists(Connection var1) throws SQLException {
      String var2 = "CREATE TABLE IF NOT EXISTS zsgo_historico (\n    id           SERIAL PRIMARY KEY,\n    utilizador   VARCHAR(64),\n    acao         VARCHAR(60) NOT NULL,\n    detalhe      TEXT,\n    criado_em    TIMESTAMP   NOT NULL DEFAULT now()\n)\n";

      try (Statement var3 = var1.createStatement()) {
         var3.execute(var2);
         var3.execute("CREATE INDEX IF NOT EXISTS idx_historico_criado_em ON zsgo_historico (criado_em DESC)");
      }
   }

   public void registar(Connection var1, String var2, String var3, String var4) throws SQLException {
      String var5 = "INSERT INTO zsgo_historico (utilizador, acao, detalhe) VALUES (?, ?, ?)";

      try (PreparedStatement var6 = var1.prepareStatement(var5)) {
         var6.setString(1, var2);
         var6.setString(2, var3);
         var6.setString(3, var4);
         var6.executeUpdate();
      }
   }

   public List<HistoricoDao.Entrada> listar(Connection var1, int var2) throws SQLException {
      ArrayList var3 = new ArrayList();
      String var4 = "SELECT id, utilizador, acao, detalhe, criado_em FROM zsgo_historico ORDER BY criado_em DESC LIMIT ?";

      try (PreparedStatement var5 = var1.prepareStatement(var4)) {
         var5.setInt(1, var2);

         try (ResultSet var6 = var5.executeQuery()) {
            while (var6.next()) {
               var3.add(lerLinha(var6));
            }
         }
      }

      return var3;
   }

   private static HistoricoDao.Entrada lerLinha(ResultSet var0) throws SQLException {
      HistoricoDao.Entrada var1 = new HistoricoDao.Entrada();
      var1.id = var0.getLong("id");
      var1.utilizador = var0.getString("utilizador");
      var1.acao = var0.getString("acao");
      var1.detalhe = var0.getString("detalhe");
      var1.criadoEm = var0.getTimestamp("criado_em");
      return var1;
   }

   public static class Entrada {
      public long id;
      public String utilizador;
      public String acao;
      public String detalhe;
      public Timestamp criadoEm;
   }
}
