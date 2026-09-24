package pt.zsgosync;

import java.sql.Connection;
import java.sql.DriverManager;
import java.time.YearMonth;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.ClientListingDao;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.db.HistoricoDao;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.service.DashboardService;

public class DashboardRun {
   public static DashboardService.Resumo obter(AppConfig var0, YearMonth var1) throws Exception {
      ClientListingDao var2 = new ClientListingDao();
      InvoiceSyncDao var3 = new InvoiceSyncDao();
      CreditNoteSyncDao var4 = new CreditNoteSyncDao();
      HistoricoDao var5 = new HistoricoDao();

      DashboardService.Resumo var7;
      try (Connection var6 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         var7 = DashboardService.calcular(var6, var2, var3, var4, var5, var1, 6);
      }

      return var7;
   }
}
