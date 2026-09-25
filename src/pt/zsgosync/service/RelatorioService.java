package pt.zsgosync.service;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.db.InvoiceLineDetailDao;
import pt.zsgosync.db.InvoiceSyncDao;

public class RelatorioService {
   private final InvoiceSyncDao invoiceDao;
   private final CreditNoteSyncDao creditNoteDao;
   private final InvoiceLineDetailDao lineDetailDao;

   public RelatorioService(InvoiceSyncDao var1, CreditNoteSyncDao var2, InvoiceLineDetailDao var3) {
      this.invoiceDao = var1;
      this.creditNoteDao = var2;
      this.lineDetailDao = var3;
   }

   public RelatorioService.Relatorio obter(Connection var1, int var2, int var3) throws SQLException {
      this.invoiceDao.ensureTableExists(var1);
      this.creditNoteDao.ensureTableExists(var1);
      this.lineDetailDao.ensureTableExists(var1);
      RelatorioService.Relatorio var4 = new RelatorioService.Relatorio();
      var4.resumoFaturas = this.invoiceDao.obterResumo(var1, var2, var3);
      var4.errosFaturas = this.invoiceDao.listarErros(var1, var2, var3);
      var4.faturas = this.invoiceDao.listarFaturas(var1, var2, var3);
      var4.resumoNotasCredito = this.creditNoteDao.obterResumo(var1, var2, var3);
      var4.errosNotasCredito = this.creditNoteDao.listarErros(var1, var2, var3);
      var4.linhasPorRubrica = this.lineDetailDao.obterPorMes(var1, var2, var3);
      return var4;
   }

   public static class Relatorio {
      public InvoiceSyncDao.Resumo resumoFaturas;
      public List<InvoiceSyncDao.LinhaErro> errosFaturas;
      public List<InvoiceSyncDao.FaturaDetalhe> faturas;
      public CreditNoteSyncDao.Resumo resumoNotasCredito;
      public List<CreditNoteSyncDao.LinhaErro> errosNotasCredito;
      public List<InvoiceLineDetailDao.LinhaDetalhe> linhasPorRubrica;
   }
}
