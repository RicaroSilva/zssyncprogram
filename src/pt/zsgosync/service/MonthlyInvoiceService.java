package pt.zsgosync.service;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Month;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map.Entry;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Logger;
import pt.zsgosync.cyclos.CyclosInvoiceClient;
import pt.zsgosync.db.BillingSourceDao;
import pt.zsgosync.db.InvoiceLineDetailDao;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.model.BillingLine;
import pt.zsgosync.progress.ProgressListener;
import pt.zsgosync.util.Erros;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class MonthlyInvoiceService {
   private static final Logger LOG = Logger.getLogger(MonthlyInvoiceService.class.getName());
   private final BillingSourceDao billingDao;
   private final InvoiceSyncDao invoiceDao;
   private final InvoiceLineDetailDao lineDetailDao = new InvoiceLineDetailDao();
   private final ZsgoApiClient zsgoApi;
   private final CyclosInvoiceClient cyclosClient;
   private final String documentType;
   private final String documentSeries;
   private final String paymentMethodId;
   private final String defaultProductReference;
   private final int maxAttempts;
   private final String dbUrl;
   private final String dbUser;
   private final String dbPassword;
   private final int threads;
   private final Object lockValorTotal = new Object();
   private BigDecimal valorTotalFaturado = BigDecimal.ZERO;

   public MonthlyInvoiceService(
      BillingSourceDao var1,
      InvoiceSyncDao var2,
      ZsgoApiClient var3,
      CyclosInvoiceClient var4,
      String var5,
      String var6,
      String var7,
      String var8,
      int var9,
      String var10,
      String var11,
      String var12,
      int var13
   ) {
      this.billingDao = var1;
      this.invoiceDao = var2;
      this.zsgoApi = var3;
      this.cyclosClient = var4;
      this.documentType = var5;
      this.documentSeries = var6;
      this.paymentMethodId = var7;
      this.defaultProductReference = var8;
      this.maxAttempts = var9;
      this.dbUrl = var10;
      this.dbUser = var11;
      this.dbPassword = var12;
      this.threads = Math.max(1, var13);
   }

   private static String chaveFatura(String var0, String var1) {
      return var0 + "|" + var1;
   }

   public void runOnce(Connection var1, int var2, int var3, ProgressListener var4) throws SQLException {
      this.invoiceDao.ensureTableExists(var1);
      this.lineDetailDao.ensureTableExists(var1);
      List<BillingLine> var7 = this.billingDao.fetchLines(var1, var2, var3);
      LOG.info("Encontradas " + var7.size() + " linhas de faturação para " + var3 + "/" + var2 + ".");
      LinkedHashMap<String, List<BillingLine>> var8 = new LinkedHashMap<>();

      for (BillingLine var10 : var7) {
         String var11 = var10.contaOrigemId != null ? var10.contaOrigemId : var10.clienteId;
         var8.computeIfAbsent(chaveFatura(var10.clienteId, var11), var0 -> new ArrayList<>()).add(var10);
      }

      int var29 = var8.size();
      LOG.info(var29 + " fatura(s) distinta(s) a criar (cliente + origem). A processar com " + this.threads + " threads em paralelo.");
      var4.aoIniciar(var29);
      AtomicInteger var30 = new AtomicInteger();
      AtomicInteger var31 = new AtomicInteger();
      AtomicInteger var12 = new AtomicInteger();
      AtomicInteger var13 = new AtomicInteger();
      AtomicLong var14 = new AtomicLong();
      AtomicLong var15 = new AtomicLong();
      AtomicLong var16 = new AtomicLong();
      AtomicInteger var17 = new AtomicInteger();
      ExecutorService var18 = Executors.newFixedThreadPool(this.threads);
      ArrayList<Future<?>> var19 = new ArrayList<>();

      for (Entry<String, List<BillingLine>> var21 : var8.entrySet()) {
         List<BillingLine> var22 = var21.getValue();
         BillingLine var23 = (BillingLine)var22.get(0);
         String var24 = var23.clienteId;
         String var25 = var23.contaOrigemId != null ? var23.contaOrigemId : var24;
         var19.add(
            var18.submit(() -> this.processarCliente(var24, var25, var22, var2, var3, var30, var31, var12, var14, var15, var16, var17, var13, var29, var4))
         );
      }

      var18.shutdown();

      for (Future<?> var34 : var19) {
         try {
            var34.get();
         } catch (Exception var28) {
            LOG.severe("Erro inesperado numa tarefa: " + var28.getMessage());
         }
      }

      int var33 = Math.max(1, var17.get());
      LOG.info(
         "Ciclo de faturação concluído: " + var30.get() + " concluídos, " + var31.get() + " ignorados (já feitos/esgotados), " + var12.get() + " com erro."
      );
      LOG.info(
         String.format(
            "Tempos (total / média por fatura criada, sobre %d faturas): ZSGO=%dms/%.0fms, Cyclos=%dms/%.0fms, BD=%dms/%.0fms",
            var33,
            var14.get(),
            (double)var14.get() / var33,
            var15.get(),
            (double)var15.get() / var33,
            var16.get(),
            (double)var16.get() / var33
         )
      );
      Object var6 = this.lockValorTotal;
      BigDecimal var5;
      synchronized (var6) {
         var5 = this.valorTotalFaturado;
      }

      var4.aoConcluir(var30.get(), var31.get(), var12.get(), var5);
   }

   private void processarCliente(
      String var1,
      String var2,
      List<BillingLine> var3,
      int var4,
      int var5,
      AtomicInteger var6,
      AtomicInteger var7,
      AtomicInteger var8,
      AtomicLong var9,
      AtomicLong var10,
      AtomicLong var11,
      AtomicInteger var12,
      AtomicInteger var13,
      int var14,
      ProgressListener var15
   ) {
      String var16 = var1.equals(var2) ? var1 : var1 + " (via " + var2 + ")";
      long var17 = System.nanoTime();
      long var19 = 0L;
      long var21 = 0L;
      long var23 = 0L;
      String var25 = "ok";
      // Passo em curso — vai no início da mensagem de erro para se saber
      // exatamente onde falhou (ZSGO, Cyclos ou base de dados).
      String etapa = "BD: ler estado da fatura";
      String notaErro = "";

      try (Connection var64 = DriverManager.getConnection(this.dbUrl, this.dbUser, this.dbPassword)) {
         long var30 = System.nanoTime();
         InvoiceSyncDao.Estado var32 = this.invoiceDao.getEstado(var64, var1, var2, var4, var5);
         var23 += (System.nanoTime() - var30) / 1000000L;
         if (var32 != null && "SINCRONIZADO".equals(var32.status)) {
            var7.incrementAndGet();
            var25 = "skip(ja-feito)";
            return;
         }

         if (this.maxAttempts > 0 && var32 != null && var32.tentativas >= this.maxAttempts) {
            LOG.warning("Fatura " + var16 + " excedeu " + this.maxAttempts + " tentativas — a ignorar.");
            var7.incrementAndGet();
            var25 = "skip(esgotado)";
            return;
         }

         String var33 = ((BillingLine)var3.get(0)).zsgoCode;
         if (var33 != null && !var33.isBlank()) {
            String var67 = var32 != null ? var32.zsgoSaleId : null;
            String var29 = var32 != null ? var32.pdfUrl : null;
            if (var67 == null) {
               String var36 = this.buildSalePayload(var33, var3, var4, var5);
               BigDecimal var37 = somaLinhas(var3);
               etapa = "ZSGO: criar fatura";
               long var65 = System.nanoTime();
               ZsgoApiClient.SaleResult var38 = this.zsgoApi.createSale(var36);
               var19 = (System.nanoTime() - var65) / 1000000L;
               var9.addAndGet(var19);
               var67 = var38.id;
               var29 = var38.pdfUrl;
               etapa = "BD: gravar fatura criada";
               notaErro = " (A fatura já foi criada no ZSGO, id=" + var67 + ".)";
               long var39 = System.nanoTime();
               this.invoiceDao.marcarFaturaCriada(var64, var1, var2, var4, var5, var67, var37);
               if (var29 != null) {
                  this.invoiceDao.marcarPdfGerado(var64, var1, var2, var4, var5, var29);
               }

               this.lineDetailDao.inserirLinhas(var64, var1, var2, var4, var5, var3);
               var23 += (System.nanoTime() - var39) / 1000000L;
               var12.incrementAndGet();
               Object var41 = this.lockValorTotal;
               synchronized (var41) {
                  this.valorTotalFaturado = this.valorTotalFaturado.add(var37);
               }
            }

            if (var29 == null) {
               etapa = "ZSGO: obter PDF";
               throw new IllegalStateException("Fatura criada (id=" + var67 + ") mas o ZSGO não devolveu pdf_url.");
            }

            etapa = "Cyclos: enviar PDF";
            notaErro = " (A fatura já existe no ZSGO, id=" + var67 + " — na próxima execução só se repete o envio ao Cyclos.)";
            long var68 = System.nanoTime();
            this.cyclosClient.notificarFatura(var1, var29);
            var21 = (System.nanoTime() - var68) / 1000000L;
            var10.addAndGet(var21);
            etapa = "BD: marcar como sincronizada";
            long var66 = System.nanoTime();
            this.invoiceDao.marcarSincronizado(var64, var1, var2, var4, var5);
            var11.addAndGet(var23 += (System.nanoTime() - var66) / 1000000L);
            var6.incrementAndGet();
            return;
         }

         String var34 = "Cliente ainda não tem zsgo_code (não sincronizado no ZSGO).";
         this.invoiceDao.marcarErro(var64, var1, var2, var4, var5, var34);
         var8.incrementAndGet();
         var25 = "erro(sem-zsgo-code)";
         var15.aoItemFalhar(var16, var34);
      } catch (Exception var62) {
         String var26 = "[" + etapa + "] " + Erros.descrever(var62) + notaErro;

         try (Connection var27 = DriverManager.getConnection(this.dbUrl, this.dbUser, this.dbPassword)) {
            this.invoiceDao.marcarErro(var27, var1, var2, var4, var5, var26);
         } catch (SQLException var60) {
            LOG.severe("Falha adicional ao gravar erro da fatura " + var16 + ": " + Erros.descrever(var60));
         }

         var8.incrementAndGet();
         var25 = "erro: " + var26;
         var15.aoItemFalhar(var16, var26);
         LOG.severe("Falha ao faturar " + var16 + ": " + var26);
         return;
      } finally {
         long var45 = (System.nanoTime() - var17) / 1000000L;
         int var47 = var13.incrementAndGet();
         System.out
            .println(
               var47
                  + "/"
                  + var14
                  + " fatura="
                  + var16
                  + " zsgo="
                  + var19
                  + "ms cyclos="
                  + var21
                  + "ms bd="
                  + var23
                  + "ms total="
                  + var45
                  + "ms ["
                  + var25
                  + "]"
            );
         var15.aoProgredir(var47, var14);
      }
   }

   private static BigDecimal somaLinhas(List<BillingLine> var0) {
      BigDecimal var1 = BigDecimal.ZERO;

      for (BillingLine var3 : var0) {
         if (var3.valorTotal != null) {
            var1 = var1.add(var3.valorTotal);
         }
      }

      return var1;
   }

   private String buildSalePayload(String var1, List<BillingLine> var2, int var3, int var4) {
      StringBuilder var5 = new StringBuilder("[");

      for (int var6 = 0; var6 < var2.size(); var6++) {
         BillingLine var7 = (BillingLine)var2.get(var6);
         if (var6 > 0) {
            var5.append(",");
         }

         BigDecimal var8 = var7.valorTotal == null ? BigDecimal.ZERO : var7.valorTotal;
         var5.append("{\"product_reference\":")
            .append(jsonString(this.defaultProductReference))
            .append(",\"quantity\":1")
            .append(",\"unit_price_net\":")
            .append(var8.toPlainString())
            .append(",\"notes\":")
            .append(jsonString(var7.descricaoLinha))
            .append("}");
      }

      var5.append("]");
      StringBuilder var10 = new StringBuilder("{");
      var10.append("\"type\":").append(jsonString(this.documentType));
      if (this.documentSeries != null && !this.documentSeries.isBlank()) {
         var10.append(",\"series\":").append(jsonString(this.documentSeries));
      }

      if (this.paymentMethodId != null && !this.paymentMethodId.isBlank()) {
         var10.append(",\"payment_method_id\":").append(jsonString(this.paymentMethodId));
      }

      var10.append(",\"tax_included\":true");
      var10.append(",\"auto_confirm\":true");
      BillingLine var11 = (BillingLine)var2.get(0);
      boolean var12 = var11.contaOrigemId != null && !var11.contaOrigemId.equals(var11.clienteId);
      String var9 = var12 ? var11.contaOrigemNome : null;
      var10.append(",\"notes\":").append(jsonString(this.notaDoDocumento(var3, var4, var9)));
      var10.append("}");
      return "{\"customer\":{\"code\":" + jsonString(var1) + "},\"document\":" + var10 + ",\"items\":" + var5 + "}";
   }

   private String notaDoDocumento(int var1, int var2, String var3) {
      if (!"FR".equalsIgnoreCase(this.documentType)) {
         return null;
      } else {
         String var4 = Month.of(var2).getDisplayName(TextStyle.FULL, new Locale("pt", "PT"));
         var4 = Character.toUpperCase(var4.charAt(0)) + var4.substring(1);
         String var5 = "Comissões referentes ao mês de " + var4 + " de " + var1 + ".";
         return var3 != null && !var3.isBlank() ? var5 + " Referente a: " + var3 + "." : var5;
      }
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
