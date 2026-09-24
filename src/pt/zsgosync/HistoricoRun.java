package pt.zsgosync;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;
import java.util.logging.Logger;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.HistoricoDao;

public class HistoricoRun {
   private static final Logger LOG = Logger.getLogger(HistoricoRun.class.getName());

   public static void registar(AppConfig var0, String var1, String var2, String var3) {
      HistoricoDao var4 = new HistoricoDao();

      try (Connection var5 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         var4.ensureTableExists(var5);
         var4.registar(var5, var1, var2, var3);
      } catch (Exception var10) {
         LOG.warning("Falha ao registar no histórico (ação='" + var2 + "'): " + var10.getMessage());
      }
   }

   public static List<HistoricoDao.Entrada> listar(AppConfig var0, int var1) throws Exception {
      HistoricoDao var2 = new HistoricoDao();

      List var4;
      try (Connection var3 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         var2.ensureTableExists(var3);
         var4 = var2.listar(var3, var1);
      }

      return var4;
   }
}
