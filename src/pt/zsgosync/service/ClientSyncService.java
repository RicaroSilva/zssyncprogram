package pt.zsgosync.service;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.logging.Logger;
import pt.zsgosync.db.ClientSourceDao;
import pt.zsgosync.db.SyncControlDao;
import pt.zsgosync.model.SourceClient;
import pt.zsgosync.progress.ProgressListener;
import pt.zsgosync.util.Erros;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class ClientSyncService {
   private static final Logger LOG = Logger.getLogger(ClientSyncService.class.getName());
   private final ClientSourceDao sourceDao;
   private final SyncControlDao controlDao;
   private final ZsgoApiClient zsgoApi;

   public ClientSyncService(ClientSourceDao var1, SyncControlDao var2, ZsgoApiClient var3) {
      this.sourceDao = var1;
      this.controlDao = var2;
      this.zsgoApi = var3;
   }

   public void runOnce(Connection var1, ProgressListener var2) throws SQLException {
      this.controlDao.ensureTableExists(var1);
      List<SourceClient> var3 = this.sourceDao.fetchPending(var1);
      LOG.info(() -> "Encontrados " + var3.size() + " clientes por sincronizar.");
      var2.aoIniciar(var3.size());
      int var4 = 0;
      int var5 = 0;
      int var6 = 0;

      for (SourceClient var8 : var3) {
         var6++;

         try {
            ZsgoApiClient.ClientResult var9 = this.zsgoApi.createClient(var8);
            this.controlDao.markSuccess(var1, var8.id, var9.code, var9.respostaJson, var8.contentHash);
            var4++;
            LOG.info(() -> "Cliente " + var8.id + " sincronizado (zsgo_code=" + var9.code + ").");
         } catch (Exception var13) {
            String var10 = Erros.descrever(var13) + " | Dados enviados: " + var8;

            try {
               this.controlDao.markError(var1, var8.id, var10);
            } catch (SQLException var12) {
               LOG.severe("Falha adicional ao gravar erro do cliente " + var8.id + ": " + var12.getMessage());
            }

            var5++;
            LOG.severe(() -> "Falha ao sincronizar cliente " + var8.id + ": " + var10);
            var2.aoItemFalhar(var8.id, var10);
         }

         var2.aoProgredir(var6, var3.size());
      }

      LOG.info("Ciclo concluído: " + var4 + " sincronizados, " + var5 + " com erro.");
      var2.aoConcluir(var4, 0, var5, BigDecimal.ZERO);
   }
}
