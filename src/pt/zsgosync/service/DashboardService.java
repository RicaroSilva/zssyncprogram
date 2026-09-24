package pt.zsgosync.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import pt.zsgosync.db.ClientListingDao;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.db.HistoricoDao;
import pt.zsgosync.db.InvoiceSyncDao;

public class DashboardService {
   public static DashboardService.Resumo calcular(
      Connection var0, ClientListingDao var1, InvoiceSyncDao var2, CreditNoteSyncDao var3, HistoricoDao var4, YearMonth var5, int var6
   ) throws SQLException {
      DashboardService.Resumo var7 = new DashboardService.Resumo();
      var7.mesReferencia = var5;

      for (ClientListingDao.ClienteResumo var10 : var1.listarTodos(var0)) {
         if ("SINCRONIZADO".equals(var10.status)) {
            var7.clientesSincronizados++;
         } else if ("ERRO".equals(var10.status)) {
            var7.clientesComErro++;
         } else {
            var7.clientesPendentes++;
         }
      }

      int var20 = var7.clientesSincronizados + var7.clientesComErro + var7.clientesPendentes;
      var7.percentClientesSincronizados = var20 > 0 ? (int)Math.round(100.0 * var7.clientesSincronizados / var20) : 0;
      var2.ensureTableExists(var0);
      InvoiceSyncDao.Resumo var21 = var2.obterResumo(var0, var5.getYear(), var5.getMonthValue());
      var7.valorFaturadoMes = var21.valorTotal;
      int var11 = var21.sincronizados + var21.comErro + var21.pendentesOuOutros;
      var7.percentFaturasSucesso = var11 > 0 ? (int)Math.round(100.0 * var21.sincronizados / var11) : 0;
      YearMonth var12 = var5.minusMonths(1L);
      InvoiceSyncDao.Resumo var13 = var2.obterResumo(var0, var12.getYear(), var12.getMonthValue());
      var7.valorFaturadoMesAnterior = var13.valorTotal;
      var3.ensureTableExists(var0);
      CreditNoteSyncDao.Resumo var14 = var3.obterResumo(var0, var5.getYear(), var5.getMonthValue());
      var7.notasCreditoMes = var14.sincronizados;
      var7.valorNotasCreditoMes = var14.valorTotal;
      int var15 = var14.sincronizados + var14.comErro;
      var7.percentNotasCreditoSucesso = var15 > 0 ? (int)Math.round(100.0 * var14.sincronizados / var15) : 0;
      CreditNoteSyncDao.Resumo var16 = var3.obterResumo(var0, var12.getYear(), var12.getMonthValue());
      var7.notasCreditoMesAnterior = var16.sincronizados;

      for (int var17 = var6 - 1; var17 >= 0; var17--) {
         YearMonth var18 = var5.minusMonths(var17);
         InvoiceSyncDao.Resumo var19 = var2.obterResumo(var0, var18.getYear(), var18.getMonthValue());
         var7.historicoFaturacao.add(new DashboardService.PontoMensal(var18.getYear(), var18.getMonthValue(), var19.valorTotal));
      }

      var4.ensureTableExists(var0);
      var7.avisosRecentes = var4.listar(var0, 8);
      return var7;
   }

   public static class PontoMensal {
      public final int ano;
      public final int mes;
      public final BigDecimal valor;

      public PontoMensal(int var1, int var2, BigDecimal var3) {
         this.ano = var1;
         this.mes = var2;
         this.valor = var3;
      }
   }

   public static class Resumo {
      public YearMonth mesReferencia;
      public int clientesSincronizados;
      public int clientesComErro;
      public int clientesPendentes;
      public BigDecimal valorFaturadoMes = BigDecimal.ZERO;
      public BigDecimal valorFaturadoMesAnterior = BigDecimal.ZERO;
      public int notasCreditoMes;
      public BigDecimal valorNotasCreditoMes = BigDecimal.ZERO;
      public int notasCreditoMesAnterior;
      public List<DashboardService.PontoMensal> historicoFaturacao = new ArrayList<>();
      public List<HistoricoDao.Entrada> avisosRecentes = new ArrayList<>();
      public int percentClientesSincronizados;
      public int percentFaturasSucesso;
      public int percentNotasCreditoSucesso;

      public Double variacaoFaturadoPercentagem() {
         return this.valorFaturadoMesAnterior != null && this.valorFaturadoMesAnterior.compareTo(BigDecimal.ZERO) != 0
            ? this.valorFaturadoMes
               .subtract(this.valorFaturadoMesAnterior)
               .divide(this.valorFaturadoMesAnterior, 4, RoundingMode.HALF_UP)
               .multiply(new BigDecimal(100))
               .doubleValue()
            : null;
      }

      public Double variacaoNotasCreditoPercentagem() {
         return this.notasCreditoMesAnterior == 0 ? null : (double)(this.notasCreditoMes - this.notasCreditoMesAnterior) / this.notasCreditoMesAnterior * 100.0;
      }
   }
}
