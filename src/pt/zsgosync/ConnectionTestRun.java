package pt.zsgosync;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class ConnectionTestRun {
   public static ConnectionTestRun.Resultado testar(AppConfig var0) {
      ConnectionTestRun.Resultado var1 = new ConnectionTestRun.Resultado();
      long var2 = System.currentTimeMillis();

      try (
         Connection var4 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"));
         Statement var5 = var4.createStatement();
      ) {
         var5.execute("SELECT 1");
         var1.dbOk = true;
         var1.dbMensagem = "Ligação à base de dados OK.";
      } catch (Exception var15) {
         var1.dbOk = false;
         var1.dbMensagem = "Falhou: " + var15.getMessage();
      }

      var1.dbMillis = System.currentTimeMillis() - var2;
      long var16 = System.currentTimeMillis();

      try {
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
         );
         ZsgoApiClient.ResultadoTesteLigacao var7 = var6.testarLigacao();
         var1.zsgoOk = true;
         List var8 = var7.cabecalhosDeLimiteDeTaxa();
         String var9 = var8.isEmpty()
            ? "\n(O ZSGO não enviou nenhum cabeçalho de limite de taxa nesta resposta — não há como ler o limite automaticamente; pergunta ao suporte do ZSGO, ou descobre aos poucos subindo a carga com cuidado.)"
            : "\nCabeçalhos de limite de taxa encontrados:\n  " + String.join("\n  ", var8);
         var1.zsgoMensagem = "Ligação ao ZSGO OK — token válido (" + var7.numeroPaises + " países devolvidos por GET /countries)." + var9;
      } catch (Exception var10) {
         var1.zsgoOk = false;
         var1.zsgoMensagem = "Falhou: " + var10.getMessage();
      }

      var1.zsgoMillis = System.currentTimeMillis() - var16;
      return var1;
   }

   public static class Resultado {
      public boolean dbOk;
      public String dbMensagem;
      public long dbMillis;
      public boolean zsgoOk;
      public String zsgoMensagem;
      public long zsgoMillis;
   }
}
