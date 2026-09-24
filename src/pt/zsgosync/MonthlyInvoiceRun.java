package pt.zsgosync;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.logging.Logger;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.cyclos.CyclosInvoiceClient;
import pt.zsgosync.db.BillingSourceDao;
import pt.zsgosync.db.CreditNoteSourceDao;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.progress.ProgressListener;
import pt.zsgosync.service.CreditNoteService;
import pt.zsgosync.service.MonthlyInvoiceService;
import pt.zsgosync.util.RateLimiter;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class MonthlyInvoiceRun {
   private static final Logger LOG = Logger.getLogger(MonthlyInvoiceRun.class.getName());

   public static void main(String[] var0) {
      if (var0.length < 3) {
         System.err.println("Uso: MonthlyInvoiceRun <config.properties> <ano> <mes>");
         System.exit(1);
      }

      String var1 = var0[0];
      int var2 = Integer.parseInt(var0[1]);
      int var3 = Integer.parseInt(var0[2]);

      try {
         AppConfig var4 = new AppConfig(var1);
         run(var4, var2, var3);
      } catch (Exception var5) {
         LOG.severe("Execução falhou: " + var5.getMessage());
         var5.printStackTrace();
         System.exit(1);
      }
   }

   public static void run(AppConfig var0, int var1, int var2) throws Exception {
      run(var0, var1, var2, ProgressListener.NOOP, ProgressListener.NOOP);
   }

   public static void run(AppConfig var0, int var1, int var2, ProgressListener var3, ProgressListener var4) throws Exception {
      RateLimiter var5 = new RateLimiter(var0.getInt("invoice.rateLimit.requestsPerWindow", 25), var0.getInt("invoice.rateLimit.windowMillis", 60000));
      ZsgoApiClient var6 = new ZsgoApiClient(
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
         )
         .comRateLimiter(var5);
      CyclosInvoiceClient var7 = new CyclosInvoiceClient(var0.get("cyclos.invoice.url"), var0.get("cyclos.invoice.user"), var0.get("cyclos.invoice.password"));
      BillingSourceDao var8 = new BillingSourceDao(var0.get("billing.query"));
      InvoiceSyncDao var9 = new InvoiceSyncDao();
      MonthlyInvoiceService var10 = new MonthlyInvoiceService(
         var8,
         var9,
         var6,
         var7,
         var0.getOrDefault("invoice.document.type", "FR"),
         var0.getOrDefault("invoice.document.series", null),
         var0.getOrDefault("zsgo.default.paymentMethodId", null),
         var0.getOrDefault("invoice.default.productReference", "Envio de fundos"),
         var0.getInt("invoice.maxAttempts", 5),
         var0.get("db.url"),
         var0.get("db.user"),
         var0.get("db.password"),
         var0.getInt("invoice.threads", 5)
      );

      try (Connection var11 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         var10.runOnce(var11, var1, var2, var3);
      }

      CreditNoteSourceDao var21 = new CreditNoteSourceDao(var0.get("creditnote.query"));
      CreditNoteSyncDao var12 = new CreditNoteSyncDao();
      CreditNoteService var13 = new CreditNoteService(
         var21,
         var12,
         var6,
         var0.getOrDefault("invoice.document.series", null),
         var0.getOrDefault("zsgo.default.paymentMethodId", null),
         var0.getOrDefault("invoice.default.productReference", "Envio de fundos"),
         var0.getInt("invoice.maxAttempts", 5)
      );

      try (Connection var14 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         var13.runOnce(var14, var1, var2, var4);
      }
   }
}
