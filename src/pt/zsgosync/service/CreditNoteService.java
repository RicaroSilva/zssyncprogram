package pt.zsgosync.service;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map.Entry;
import java.util.logging.Logger;
import pt.zsgosync.db.CreditNoteSourceDao;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.model.ChargebackLine;
import pt.zsgosync.progress.ProgressListener;
import pt.zsgosync.util.Erros;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class CreditNoteService {
   private static final Logger LOG = Logger.getLogger(CreditNoteService.class.getName());
   private final CreditNoteSourceDao sourceDao;
   private final CreditNoteSyncDao syncDao;
   private final ZsgoApiClient zsgoApi;
   private final String documentSeries;
   private final String paymentMethodId;
   private final String defaultProductReference;
   private final int maxAttempts;

   public CreditNoteService(CreditNoteSourceDao var1, CreditNoteSyncDao var2, ZsgoApiClient var3, String var4, String var5, String var6, int var7) {
      this.sourceDao = var1;
      this.syncDao = var2;
      this.zsgoApi = var3;
      this.documentSeries = var4;
      this.paymentMethodId = var5;
      this.defaultProductReference = var6;
      this.maxAttempts = var7;
   }

   public void runOnce(Connection var1, int var2, int var3, ProgressListener var4) throws SQLException {
      this.syncDao.ensureTableExists(var1);
      List<ChargebackLine> var5 = this.sourceDao.fetchLines(var1, var2, var3);
      LOG.info("Encontrados " + var5.size() + " chargebacks candidatos a Nota de Crédito para " + var3 + "/" + var2 + ".");
      LinkedHashMap<String, List<ChargebackLine>> var6 = new LinkedHashMap<>();

      for (ChargebackLine var8 : var5) {
         var6.computeIfAbsent(var8.clienteId, var0 -> new ArrayList<>()).add(var8);
      }

      int var24 = var6.size();
      var4.aoIniciar(var24);
      int var25 = 0;
      int var9 = 0;
      int var10 = 0;
      int var11 = 0;
      BigDecimal var12 = BigDecimal.ZERO;

      for (Entry<String, List<ChargebackLine>> var14 : var6.entrySet()) {
         String var15 = (String)var14.getKey();
         List<ChargebackLine> var16 = var14.getValue();
         ArrayList<ChargebackLine> var17 = new ArrayList<>();

         for (ChargebackLine var19 : var16) {
            CreditNoteSyncDao.Estado var20 = this.syncDao.getEstado(var1, var19.chargebackId);
            if ((var20 == null || !"SINCRONIZADO".equals(var20.status)) && (var20 == null || this.maxAttempts <= 0 || var20.tentativas < this.maxAttempts)) {
               var17.add(var19);
            }
         }

         var11++;
         if (var17.isEmpty()) {
            var9++;
            var4.aoProgredir(var11, var24);
         } else {
            String var26 = ((ChargebackLine)var17.get(0)).zsgoCode;
            if (var26 != null && !var26.isBlank()) {
               try {
                  String var29 = this.buildCreditNotePayload(var26, var17);
                  ZsgoApiClient.SaleResult var32 = this.zsgoApi.createSale(var29);

                  for (ChargebackLine var22 : var17) {
                     this.syncDao.marcarSucesso(var1, var22.chargebackId, var22.transacaoOriginalId, var15, var2, var3, var22.valorEstorno, var32.id);
                     var12 = var12.add(var22.valorEstorno);
                  }

                  var25++;
               } catch (Exception var23) {
                  String var28 = "[ZSGO: criar nota de crédito] " + Erros.descrever(var23);

                  for (ChargebackLine var33 : var17) {
                     this.syncDao.marcarErro(var1, var33.chargebackId, var33.transacaoOriginalId, var15, var2, var3, var28);
                  }

                  var10++;
                  var4.aoItemFalhar(var15, var28);
                  LOG.severe("Falha ao emitir NC para cliente " + var15 + ": " + var28);
               }

               var4.aoProgredir(var11, var24);
            } else {
               String var27 = "Cliente ainda não tem zsgo_code (não sincronizado no ZSGO).";

               for (ChargebackLine var21 : var17) {
                  this.syncDao.marcarErro(var1, var21.chargebackId, var21.transacaoOriginalId, var15, var2, var3, var27);
               }

               var10++;
               var4.aoItemFalhar(var15, var27);
               var4.aoProgredir(var11, var24);
            }
         }
      }

      var4.aoConcluir(var25, var9, var10, var12);
      LOG.info("Ciclo de Notas de Crédito concluído: " + var25 + " concluídos, " + var9 + " ignorados, " + var10 + " com erro.");
   }

   private String buildCreditNotePayload(String var1, List<ChargebackLine> var2) {
      StringBuilder var3 = new StringBuilder("[");

      for (int var4 = 0; var4 < var2.size(); var4++) {
         ChargebackLine var5 = (ChargebackLine)var2.get(var4);
         if (var4 > 0) {
            var3.append(",");
         }

         var3.append("{\"product_reference\":")
            .append(jsonString(this.defaultProductReference))
            .append(",\"quantity\":1")
            .append(",\"unit_price_net\":")
            .append(var5.valorEstorno.toPlainString())
            .append(",\"notes\":")
            .append(jsonString("Estorno: " + var5.descricao))
            .append("}");
      }

      var3.append("]");
      StringBuilder var6 = new StringBuilder("{");
      var6.append("\"type\":\"NC\"");
      if (this.documentSeries != null && !this.documentSeries.isBlank()) {
         var6.append(",\"series\":").append(jsonString(this.documentSeries));
      }

      if (this.paymentMethodId != null && !this.paymentMethodId.isBlank()) {
         var6.append(",\"payment_method_id\":").append(jsonString(this.paymentMethodId));
      }

      var6.append(",\"tax_included\":true");
      var6.append(",\"auto_confirm\":true");
      var6.append("}");
      return "{\"customer\":{\"code\":" + jsonString(var1) + "},\"document\":" + var6 + ",\"items\":" + var3 + "}";
   }

   private static String jsonString(String var0) {
      if (var0 == null) {
         return "null";
      } else {
         StringBuilder var1 = new StringBuilder("\"");

         for (char var5 : var0.toCharArray()) {
            switch (var5) {
               case '\t':
                  var1.append("\\t");
                  break;
               case '\n':
                  var1.append("\\n");
                  break;
               case '\r':
                  var1.append("\\r");
                  break;
               case '"':
                  var1.append("\\\"");
                  break;
               case '\\':
                  var1.append("\\\\");
                  break;
               default:
                  var1.append(var5);
            }
         }

         var1.append("\"");
         return var1.toString();
      }
   }
}
