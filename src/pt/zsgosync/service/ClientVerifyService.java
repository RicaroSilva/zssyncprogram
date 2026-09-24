package pt.zsgosync.service;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import pt.zsgosync.db.ClientListingDao;
import pt.zsgosync.db.ClientSourceDao;
import pt.zsgosync.model.SourceClient;

public class ClientVerifyService {
   private final ClientSourceDao verifyDao;
   private final ClientListingDao listingDao;

   public ClientVerifyService(ClientSourceDao var1, ClientListingDao var2) {
      this.verifyDao = var1;
      this.listingDao = var2;
   }

   public List<ClientVerifyService.ClienteDesatualizado> verificar(Connection var1) throws SQLException {
      List<ClientListingDao.ClienteResumo> var2 = this.listingDao.listarTodos(var1);
      List<SourceClient> var3 = this.verifyDao.fetchPending(var1);
      HashMap var4 = new HashMap();

      for (SourceClient var6 : var3) {
         var4.put(var6.id, var6);
      }

      ArrayList var9 = new ArrayList();

      for (ClientListingDao.ClienteResumo var7 : var2) {
         if ("SINCRONIZADO".equals(var7.status) && var7.zsgoCode != null) {
            SourceClient var8 = (SourceClient)var4.get(var7.sourceId);
            if (var8 != null && var8.contentHash != null && !var8.contentHash.equals(var7.contentHash)) {
               var9.add(new ClientVerifyService.ClienteDesatualizado(var7.sourceId, var7.zsgoCode, var8, var7.nome, var7.email, var7.morada));
            }
         }
      }

      return var9;
   }

   public static class ClienteDesatualizado {
      public final String sourceId;
      public final String zsgoCode;
      public final SourceClient dadosAtuais;
      public final String nomeAnterior;
      public final String emailAnterior;
      public final String moradaAnterior;

      public ClienteDesatualizado(String var1, String var2, SourceClient var3, String var4, String var5, String var6) {
         this.sourceId = var1;
         this.zsgoCode = var2;
         this.dadosAtuais = var3;
         this.nomeAnterior = var4;
         this.emailAnterior = var5;
         this.moradaAnterior = var6;
      }
   }
}
