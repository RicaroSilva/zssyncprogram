package pt.zsgosync.service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.progress.StatusListener;
import pt.zsgosync.util.Erros;
import pt.zsgosync.util.RateLimiter;
import pt.zsgosync.zsgo.ZsgoApiClient;
import pt.zsgosync.zsgo.ZsgoDocumento;

/**
 * Conferência com o ZSGO: para cada fatura do mês que já tem id no ZSGO,
 * vai buscar o documento ao ZSGO (GET /sales/{id}) e grava o número, o
 * total, o IVA e o estado que o ZSGO tem — para comparar com o que o
 * programa enviou. Só lê do ZSGO; não altera nada lá.
 */
public class ConferenciaService {

   public static class Resultado {
      public int conferidas;
      public int iguais;
      public int diferentes;
      public int erros;
   }

   private static class Item {
      InvoiceSyncDao.FaturaDetalhe fatura;
      ZsgoDocumento documento;
      String erro;
   }

   public static Resultado conferir(AppConfig cfg, int ano, int mes, StatusListener estado) throws Exception {
      InvoiceSyncDao dao = new InvoiceSyncDao();
      List<InvoiceSyncDao.FaturaDetalhe> faturas;
      try (Connection c = ligar(cfg)) {
         dao.ensureTableExists(c);
         faturas = dao.listarFaturas(c, ano, mes);
      }

      List<InvoiceSyncDao.FaturaDetalhe> comId = new ArrayList<>();
      for (InvoiceSyncDao.FaturaDetalhe f : faturas) {
         if (f.zsgoSaleId != null && !f.zsgoSaleId.isBlank()) {
            comId.add(f);
         }
      }

      int total = comId.size();
      estado.aoAtualizarEstado("A ler " + total + " fatura(s) do ZSGO...", 0, Math.max(total, 1));
      ZsgoApiClient zsgo = criarCliente(cfg);
      int threads = Math.max(1, Math.min(8, cfg.getInt("invoice.threads", 5)));
      ExecutorService pool = Executors.newFixedThreadPool(threads);
      AtomicInteger feitas = new AtomicInteger();
      List<Future<Item>> futuros = new ArrayList<>();
      for (InvoiceSyncDao.FaturaDetalhe f : comId) {
         futuros.add(pool.submit(() -> {
            Item it = new Item();
            it.fatura = f;
            try {
               it.documento = zsgo.getSale(f.zsgoSaleId);
            } catch (Exception e) {
               it.erro = Erros.descrever(e);
            }
            int n = feitas.incrementAndGet();
            estado.aoAtualizarEstado("A ler faturas do ZSGO... " + n + " / " + total, n, total);
            return it;
         }));
      }
      pool.shutdown();

      Resultado r = new Resultado();
      try (Connection c = ligar(cfg)) {
         for (Future<Item> fu : futuros) {
            Item it = fu.get();
            InvoiceSyncDao.FaturaDetalhe f = it.fatura;
            dao.gravarConferencia(c, f.clienteId, f.origemId, ano, mes, it.documento, it.erro);
            r.conferidas++;
            if (it.erro != null) {
               r.erros++;
            } else {
               f.zsgoTotal = it.documento.total;
               f.zsgoAnulado = it.documento.anulado;
               if (f.temDiferenca()) {
                  r.diferentes++;
               } else {
                  r.iguais++;
               }
            }
         }
      }

      estado.aoAtualizarEstado(
         "Conferência concluída — " + r.iguais + " iguais, " + r.diferentes + " com diferença, " + r.erros + " não foi possível ler.", total, Math.max(total, 1)
      );
      return r;
   }

   /** Documento completo de uma fatura, para o detalhe (lê sempre fresco do ZSGO). */
   public static ZsgoDocumento lerDocumento(AppConfig cfg, String zsgoSaleId) throws Exception {
      return criarCliente(cfg).getSale(zsgoSaleId);
   }

   /**
    * Encontra no ZSGO o documento indicado pelo utilizador: aceita o id interno
    * ou o número do documento (ex.: "FR A/123"). Devolve null se não encontrar.
    */
   public static ZsgoDocumento encontrarDocumento(AppConfig cfg, String texto) throws Exception {
      String t = texto.trim();
      ZsgoApiClient zsgo = criarCliente(cfg);
      // Um id não tem espaços nem barras; um número de documento (FR A/123) tem.
      if (t.matches("[A-Za-z0-9-]+")) {
         try {
            ZsgoDocumento d = zsgo.getSale(t);
            if (d.id != null) {
               return d;
            }
         } catch (pt.zsgosync.zsgo.ZsgoApiException e) {
            if (e.getStatusCode() != 404 && e.getStatusCode() != 422 && e.getStatusCode() != 400) {
               throw e;
            }
         }
      }
      for (ZsgoDocumento d : zsgo.procurarSales(t)) {
         if (d.id != null && (t.equalsIgnoreCase(d.numero) || t.equals(d.id))) {
            // A lista pode não trazer tudo (PDF, linhas): lê o documento completo.
            return zsgo.getSale(d.id);
         }
      }
      return null;
   }

   /** A fatura existe no ZSGO: associa-a (a próxima faturação só envia o PDF ao Cyclos). */
   public static void associar(AppConfig cfg, InvoiceSyncDao.FaturaDetalhe f, int ano, int mes, ZsgoDocumento d) throws Exception {
      try (Connection c = ligar(cfg)) {
         new InvoiceSyncDao().associarDocumento(c, f.clienteId, f.origemId, ano, mes, d.id, d.pdfUrl, d.total);
      }
   }

   /** Confirmado que a fatura NÃO existe no ZSGO: a próxima faturação pode criá-la. */
   public static void autorizarRecriar(AppConfig cfg, InvoiceSyncDao.FaturaDetalhe f, int ano, int mes) throws Exception {
      try (Connection c = ligar(cfg)) {
         new InvoiceSyncDao().marcarIncerto(c, f.clienteId, f.origemId, ano, mes, false);
      }
   }

   private static Connection ligar(AppConfig cfg) throws Exception {
      return DriverManager.getConnection(cfg.get("db.url"), cfg.get("db.user"), cfg.get("db.password"));
   }

   private static ZsgoApiClient criarCliente(AppConfig cfg) {
      RateLimiter limite = new RateLimiter(cfg.getInt("invoice.rateLimit.requestsPerWindow", 25), cfg.getInt("invoice.rateLimit.windowMillis", 60000));
      return new ZsgoApiClient(
            cfg.get("zsgo.baseUrl"),
            cfg.get("zsgo.token"),
            cfg.getOrDefault("zsgo.default.priceLine", "1"),
            cfg.getOrDefault("zsgo.default.paymentOptionId", null),
            cfg.getOrDefault("zsgo.default.paymentMethodId", null),
            cfg.getOrDefault("zsgo.default.familyId", "1"),
            cfg.getOrDefault("zsgo.default.itemTypeCode", "S"),
            cfg.getOrDefault("zsgo.default.unitCode", "UNI"),
            cfg.getOrDefault("zsgo.default.saleTax", "23"),
            cfg.getOrDefault("zsgo.default.exemptionCode", "M01")
         )
         .comRateLimiter(limite);
   }
}
