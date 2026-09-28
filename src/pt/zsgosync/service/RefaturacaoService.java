package pt.zsgosync.service;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import pt.zsgosync.HistoricoRun;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.BillingSourceDao;
import pt.zsgosync.db.InvoiceLineDetailDao;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.model.BillingLine;
import pt.zsgosync.util.RateLimiter;
import pt.zsgosync.zsgo.ZsgoApiClient;

/**
 * Refaturação: encontra as faturas já emitidas cujo valor já não bate certo
 * com o que a faturação daria agora (ex.: uma rubrica que estava mal
 * mapeada e ficou de fora), e refaz as que o utilizador escolher:
 * anula no ZSGO, deixa a linha "por faturar" e a próxima "Gerar faturas em
 * falta" cria a nova. Ao enviar a nova ao Cyclos vai "substitui_zsgo_id",
 * para o script do Cyclos trocar a antiga pela nova.
 */
public class RefaturacaoService {
   private static final BigDecimal CENTIMO = new BigDecimal("0.01");

   public static class Divergencia {
      public InvoiceSyncDao.FaturaDetalhe fatura;
      public BigDecimal valorFaturado;
      public BigDecimal valorAgora;
      public int transacoesAgora;
      /** Rubricas que a faturação daria agora e que não estão na fatura emitida. */
      public final List<String> rubricasEmFalta = new ArrayList<>();

      public BigDecimal diferenca() {
         return this.valorAgora.subtract(this.valorFaturado == null ? BigDecimal.ZERO : this.valorFaturado);
      }
   }

   /** Faturas emitidas no mês cujo valor é diferente do que a billing.query dá agora. */
   public static List<Divergencia> procurar(AppConfig cfg, int ano, int mes) throws Exception {
      Map<String, List<BillingLine>> agora = new LinkedHashMap<>();
      List<InvoiceSyncDao.FaturaDetalhe> faturas;
      try (Connection c = ligar(cfg)) {
         InvoiceSyncDao dao = new InvoiceSyncDao();
         dao.ensureTableExists(c);
         for (BillingLine l : new BillingSourceDao(cfg.get("billing.query")).fetchLines(c, ano, mes)) {
            String origem = l.contaOrigemId != null ? l.contaOrigemId : l.clienteId;
            agora.computeIfAbsent(l.clienteId + "|" + origem, k -> new ArrayList<>()).add(l);
         }
         faturas = dao.listarFaturas(c, ano, mes);
      }

      List<Divergencia> r = new ArrayList<>();
      for (InvoiceSyncDao.FaturaDetalhe f : faturas) {
         if (!"SINCRONIZADO".equals(f.status) || f.zsgoSaleId == null) {
            continue;
         }
         List<BillingLine> linhas = agora.get(f.clienteId + "|" + f.origemId);
         if (linhas == null) {
            continue;
         }
         BigDecimal soma = BigDecimal.ZERO;
         int nr = 0;
         Set<String> rubricas = new LinkedHashSet<>();
         for (BillingLine l : linhas) {
            if (l.valorTotal != null) {
               soma = soma.add(l.valorTotal);
            }
            nr += (int) l.nrTransacoes;
            if (l.rubrica != null) {
               rubricas.add(l.rubrica);
            }
         }
         BigDecimal faturado = f.valorTotal != null ? f.valorTotal : f.somaLinhas;
         if (faturado != null && soma.subtract(faturado).abs().compareTo(CENTIMO) < 0) {
            continue;
         }
         Divergencia d = new Divergencia();
         d.fatura = f;
         d.valorFaturado = faturado;
         d.valorAgora = soma;
         d.transacoesAgora = nr;
         String jaFaturadas = f.rubricas == null ? "" : f.rubricas.toLowerCase(java.util.Locale.ROOT);
         for (String rub : rubricas) {
            if (!jaFaturadas.contains(rub.toLowerCase(java.util.Locale.ROOT) + " |")) {
               d.rubricasEmFalta.add(rub);
            }
         }
         r.add(d);
      }
      return r;
   }

   /**
    * Anula a fatura no ZSGO e deixa a linha pronta para ser faturada outra vez.
    * Devolve o texto do que foi feito.
    */
   public static String refaturar(AppConfig cfg, InvoiceSyncDao.FaturaDetalhe f, int ano, int mes, String motivo, String quem) throws Exception {
      if (f.zsgoSaleId == null) {
         throw new IllegalStateException("A fatura do cliente " + f.clienteId + " não tem id no ZSGO.");
      }
      String numero = f.zsgoNumero;
      criarCliente(cfg).annulSale(f.zsgoSaleId, motivo);
      try (Connection c = ligar(cfg)) {
         new InvoiceSyncDao().prepararRefaturacao(c, f.clienteId, f.origemId, ano, mes, f.zsgoSaleId, numero, motivo);
         new InvoiceLineDetailDao().apagarLinhas(c, f.clienteId, f.origemId, ano, mes);
      }
      String txt = "Cliente " + f.clienteId + (f.isRedirecionada() ? " (via " + f.origemId + ")" : "") + " " + mes + "/" + ano + ": fatura "
         + (numero != null ? numero : f.zsgoSaleId) + " anulada no ZSGO (" + motivo + "); fica por faturar.";
      HistoricoRun.registar(cfg, quem, "FATURA_ANULADA_REFATURAR", txt);
      return txt;
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
