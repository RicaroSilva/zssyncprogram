package pt.zsgosync;

import java.sql.Connection;
import java.sql.DriverManager;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.db.InvoiceLineDetailDao;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.service.RelatorioService;

public class RelatorioRun {
   public static RelatorioService.Relatorio obter(AppConfig var0, int var1, int var2) throws Exception {
      InvoiceSyncDao var3 = new InvoiceSyncDao();
      CreditNoteSyncDao var4 = new CreditNoteSyncDao();
      InvoiceLineDetailDao var5 = new InvoiceLineDetailDao();
      RelatorioService var6 = new RelatorioService(var3, var4, var5);

      RelatorioService.Relatorio var8;
      try (Connection var7 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         var8 = var6.obter(var7, var1, var2);
      }

      return var8;
   }
}
