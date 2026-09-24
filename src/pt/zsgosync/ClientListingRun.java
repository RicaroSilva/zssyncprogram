package pt.zsgosync;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.ClientListingDao;
import pt.zsgosync.db.ClientSourceDao;
import pt.zsgosync.db.SyncControlDao;
import pt.zsgosync.model.SourceClient;
import pt.zsgosync.progress.StatusListener;
import pt.zsgosync.service.ClientVerifyService;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class ClientListingRun {
   public static List<ClientListingDao.ClienteResumo> listar(AppConfig var0) throws Exception {
      ClientListingDao var1 = new ClientListingDao();

      List var4;
      try (Connection var2 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         new SyncControlDao("zsgo_client_sync").ensureTableExists(var2);
         List var3 = var1.listarTodos(var2);
         var4 = var3;
      }

      return var4;
   }

   public static List<ClientVerifyService.ClienteDesatualizado> verificar(AppConfig var0, StatusListener var1) throws Exception {
      String var2 = var0.getOrDefault("source.clients.verify.query", null);
      if (var2 != null && !var2.isBlank()) {
         ClientSourceDao var3 = new ClientSourceDao(var2);
         ClientListingDao var4 = new ClientListingDao();
         var1.aoAtualizarEstado("A ligar à base de dados...", -1, -1);

         List var8;
         try (Connection var5 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
            new SyncControlDao("zsgo_client_sync").ensureTableExists(var5);
            var1.aoAtualizarEstado("A ler clientes já sincronizados...", -1, -1);
            ClientVerifyService var6 = new ClientVerifyService(var3, var4);
            var1.aoAtualizarEstado("A ler dados atuais da origem (pode demorar um pouco, consoante o número de clientes)...", -1, -1);
            List var7 = var6.verificar(var5);
            var1.aoAtualizarEstado(
               var7.isEmpty() ? "Concluído — nenhuma alteração encontrada." : "Concluído — " + var7.size() + " cliente(s) desatualizado(s) encontrado(s).",
               1,
               1
            );
            var8 = var7;
         }

         return var8;
      } else {
         throw new IllegalStateException(
            "Falta configurar 'source.clients.verify.query' no config.properties para poder verificar alterações (deve trazer os mesmos campos de 'source.clients.query', incluindo 'content_hash', mas para TODOS os clientes já sincronizados, sem o filtro de pendentes/watermark)."
         );
      }
   }

   public static int[] aplicarAtualizacoes(AppConfig var0, List<ClientVerifyService.ClienteDesatualizado> var1, StatusListener var2) throws Exception {
      ZsgoApiClient var3 = new ZsgoApiClient(
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
      SyncControlDao var4 = new SyncControlDao("zsgo_client_sync");
      int var5 = 0;
      int var6 = 0;
      int var7 = var1.size();
      var2.aoAtualizarEstado("A preparar a atualização de " + var7 + " cliente(s)...", 0, var7);

      try (Connection var8 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
         var4.ensureTableExists(var8);
         int var9 = 0;

         for (ClientVerifyService.ClienteDesatualizado var11 : var1) {
            String var12 = var11.dadosAtuais.nome != null ? var11.dadosAtuais.nome : var11.sourceId;
            var2.aoAtualizarEstado("A atualizar " + var12 + " (zsgo " + var11.zsgoCode + ")...", var9, var7);

            try {
               ZsgoApiClient.ClientResult var13 = var3.updateClient(var11.dadosAtuais, var11.zsgoCode);
               var4.markSuccess(var8, var11.sourceId, var13.code, var13.respostaJson, var11.dadosAtuais.contentHash);
               var5++;
            } catch (Exception var15) {
               var4.markUpdateError(var8, var11.sourceId, "Falha ao ATUALIZAR no ZSGO: " + var15.getMessage());
               var6++;
            }

            var2.aoAtualizarEstado(++var9 + " / " + var7 + " processado(s)...", var9, var7);
         }
      }

      var2.aoAtualizarEstado("Concluído — " + var5 + " atualizado(s) com sucesso, " + var6 + " com erro.", var7, var7);
      return new int[]{var5, var6};
   }

   public static int[] sincronizarEspecificos(AppConfig var0, List<String> var1, StatusListener var2) throws Exception {
      String var3 = var0.getOrDefault("source.clients.verify.query", null);
      if (var3 != null && !var3.isBlank()) {
         HashSet var4 = new HashSet(var1);
         ClientSourceDao var5 = new ClientSourceDao(var3);
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
         SyncControlDao var7 = new SyncControlDao("zsgo_client_sync");
         int var8 = 0;
         int var9 = 0;
         var2.aoAtualizarEstado("A ler dados atuais da origem...", -1, -1);

         try (Connection var10 = DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"))) {
            var7.ensureTableExists(var10);
            List<SourceClient> var11 = var5.fetchPending(var10);
            ArrayList<SourceClient> var12 = new ArrayList<>();

            for (SourceClient var14 : var11) {
               if (var4.contains(var14.id)) {
                  var12.add(var14);
               }
            }

            int var22 = var12.size();
            int var23 = 0;

            for (SourceClient var16 : var12) {
               String var17 = var16.nome != null ? var16.nome : var16.id;
               var2.aoAtualizarEstado("A criar " + var17 + " no ZSGO...", var23, var22);

               try {
                  ZsgoApiClient.ClientResult var18 = var6.createClient(var16);
                  var7.markSuccess(var10, var16.id, var18.code, var18.respostaJson, var16.contentHash);
                  var8++;
               } catch (Exception var20) {
                  var7.markError(var10, var16.id, "Falha ao criar no ZSGO (a partir do resumo de faturação): " + var20.getMessage());
                  var9++;
               }

               var2.aoAtualizarEstado(++var23 + " / " + var22 + " processado(s)...", var23, var22);
            }

            var2.aoAtualizarEstado("Concluído — " + var8 + " criado(s) no ZSGO, " + var9 + " com erro.", var22, var22);
         }

         return new int[]{var8, var9};
      } else {
         throw new IllegalStateException(
            "Falta configurar 'source.clients.verify.query' no config.properties para poder sincronizar clientes específicos a partir da faturação."
         );
      }
   }
}
