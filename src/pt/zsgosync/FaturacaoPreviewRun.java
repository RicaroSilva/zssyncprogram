package pt.zsgosync;

import java.sql.Connection;
import java.sql.DriverManager;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.BillingSourceDao;
import pt.zsgosync.db.CreditNoteSourceDao;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.service.FaturacaoPreviewService;

public class FaturacaoPreviewRun {
   public static FaturacaoPreviewService.Preview obter(AppConfig var0, int var1, int var2) throws Exception {
      BillingSourceDao var3 = new BillingSourceDao(var0.get("billing.query"));
      InvoiceSyncDao var4 = new InvoiceSyncDao();
      CreditNoteSourceDao var5 = new CreditNoteSourceDao(var0.get("creditnote.query"));
      CreditNoteSyncDao var6 = new CreditNoteSyncDao();
      int var7 = var0.getInt("invoice.maxAttempts", 5);

      FaturacaoPreviewService.Preview var9;
      try (Connection var8 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         var9 = FaturacaoPreviewService.calcular(var8, var3, var4, var5, var6, var1, var2, var7);
      }

      return var9;
   }
}
