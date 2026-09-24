package pt.zsgosync;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.logging.Logger;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.ClientSourceDao;
import pt.zsgosync.db.SyncControlDao;
import pt.zsgosync.progress.ProgressListener;
import pt.zsgosync.service.ClientSyncService;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class Main {
   private static final Logger LOG = Logger.getLogger(Main.class.getName());

   public static void main(String[] var0) {
      String var1 = var0.length > 0 ? var0[0] : "config.properties";

      try {
         AppConfig var2 = new AppConfig(var1);
         runClientSync(var2);
      } catch (Exception var3) {
         LOG.severe("Execução falhou: " + var3.getMessage());
         var3.printStackTrace();
         System.exit(1);
      }
   }

   public static void runClientSync(AppConfig var0) throws Exception {
      runClientSync(var0, ProgressListener.NOOP);
   }

   public static void runClientSync(AppConfig var0, ProgressListener var1) throws Exception {
      ZsgoApiClient var2 = new ZsgoApiClient(
         var0.get("zsgo.baseUrl"),
         var0.get("zsgo.token"),
         var0.getOrDefault("zsgo.default.priceLine", "1"),
         var0.getOrDefault("zsgo.default.paymentOptionId", null),
         var0.getOrDefault("zsgo.default.paymentMethodId", null),
         var0.getOrDefault("zsgo.default.familyId", "1"),
         var0.getOrDefault("zsgo.default.itemTypeCode", "S"),
         var0.getOrDefault("zsgo.default.unitCode", "UNI"),
         var0.getOrDefault("zsgo.default.saleTax", "23"),
         var0.getOrDefault("zsgo.default.exemptionCode", "M01")
      );

      try (Connection var3 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         boolean var4 = Boolean.parseBoolean(var0.getOrDefault("sync.clients.enabled", "true"));
         if (var4) {
            LOG.info("=== Sincronização de clientes ===");
            ClientSourceDao var5 = new ClientSourceDao(var0.get("source.clients.query"));
            SyncControlDao var6 = new SyncControlDao("zsgo_client_sync");
            new ClientSyncService(var5, var6, var2).runOnce(var3, var1);
         } else {
            LOG.info("Sincronização de clientes está desligada (sync.clients.enabled=false).");
         }
      }
   }
}
