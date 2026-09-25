package pt.zsgosync.service;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import pt.zsgosync.db.BillingSourceDao;
import pt.zsgosync.db.CreditNoteSourceDao;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.model.BillingLine;
import pt.zsgosync.model.ChargebackLine;

public class FaturacaoPreviewService {
   private static String chave(String var0, String var1) {
      return var0 + "|" + var1;
   }

   public static FaturacaoPreviewService.Preview calcular(
      Connection var0, BillingSourceDao var1, InvoiceSyncDao var2, CreditNoteSourceDao var3, CreditNoteSyncDao var4, int var5, int var6, int var7
   ) throws SQLException {
      FaturacaoPreviewService.Preview var8 = new FaturacaoPreviewService.Preview();
      var2.ensureTableExists(var0);
      List<BillingLine> var9 = var1.fetchLines(var0, var5, var6);
      LinkedHashMap<String, List<BillingLine>> var10 = new LinkedHashMap<>();

      for (BillingLine var12 : var9) {
         String var13 = var12.contaOrigemId != null ? var12.contaOrigemId : var12.clienteId;
         var10.computeIfAbsent(chave(var12.clienteId, var13), var0x -> new ArrayList<>()).add(var12);
      }

      var8.totalClientesElegiveis = var10.size();
      LinkedHashSet<String> var20 = new LinkedHashSet<>();

      for (List<BillingLine> var23 : var10.values()) {
         BillingLine var14 = (BillingLine)var23.get(0);
         String var15 = var14.clienteId;
         String var16 = var14.contaOrigemId != null ? var14.contaOrigemId : var15;
         BigDecimal var17 = BigDecimal.ZERO;

         for (BillingLine var19 : var23) {
            if (var19.valorTotal != null) {
               var17 = var17.add(var19.valorTotal);
            }
         }

         var8.valorTotalGeral = var8.valorTotalGeral.add(var17);
         InvoiceSyncDao.Estado var27 = var2.getEstado(var0, var15, var16, var5, var6);
         if (var27 != null && "SINCRONIZADO".equals(var27.status)) {
            var8.clientesJaFaturados++;
         } else if (var27 != null && var7 > 0 && var27.tentativas >= var7) {
            var8.clientesEsgotados++;
         } else {
            String var28 = var14.zsgoCode;
            if (var28 != null && !var28.isBlank()) {
               var8.clientesAFaturar++;
               var8.valorAFaturar = var8.valorAFaturar.add(var17);
            } else {
               var8.clientesSemZsgoCode++;
               if (var20.add(var15)) {
                  var8.idsSemZsgoCode.add(var15);
                  if (var8.exemplosSemZsgoCode.size() < 10) {
                     var8.exemplosSemZsgoCode.add(var15);
                  }
               }
            }
         }
      }

      if (var3 != null && var4 != null) {
         var4.ensureTableExists(var0);
         List<ChargebackLine> var22 = var3.fetchLines(var0, var5, var6);
         var8.totalNotasCreditoElegiveis = var22.size();

         for (ChargebackLine var25 : var22) {
            CreditNoteSyncDao.Estado var26 = var4.getEstado(var0, var25.chargebackId);
            if (var26 != null && "SINCRONIZADO".equals(var26.status)) {
               var8.notasCreditoJaEmitidas++;
            } else {
               var8.notasCreditoAEmitir++;
               if (var25.valorEstorno != null) {
                  var8.valorNotasCreditoAEmitir = var8.valorNotasCreditoAEmitir.add(var25.valorEstorno);
               }

               // Clientes que só aparecem nas notas de crédito também precisam
               // de zsgo_code — entram na mesma lista, para o painel oferecer
               // criá-los antes de faturar.
               if (var25.zsgoCode == null || var25.zsgoCode.isBlank()) {
                  var8.notasCreditoSemZsgoCode++;
                  if (var25.clienteId != null && var20.add(var25.clienteId)) {
                     var8.idsSemZsgoCode.add(var25.clienteId);
                     if (var8.exemplosSemZsgoCode.size() < 10) {
                        var8.exemplosSemZsgoCode.add(var25.clienteId);
                     }
                  }
               }
            }
         }
      }

      return var8;
   }

   public static class Preview {
      public int totalClientesElegiveis;
      public int clientesJaFaturados;
      public int clientesSemZsgoCode;
      public int clientesEsgotados;
      public int clientesAFaturar;
      public BigDecimal valorAFaturar = BigDecimal.ZERO;
      public BigDecimal valorTotalGeral = BigDecimal.ZERO;
      public List<String> exemplosSemZsgoCode = new ArrayList<>();
      public List<String> idsSemZsgoCode = new ArrayList<>();
      public int totalNotasCreditoElegiveis;
      public int notasCreditoJaEmitidas;
      public int notasCreditoAEmitir;
      public int notasCreditoSemZsgoCode;
      public BigDecimal valorNotasCreditoAEmitir = BigDecimal.ZERO;
   }
}
