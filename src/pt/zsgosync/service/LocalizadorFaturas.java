package pt.zsgosync.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import pt.zsgosync.util.Erros;
import pt.zsgosync.zsgo.ZsgoApiClient;
import pt.zsgosync.zsgo.ZsgoDocumento;

/**
 * Descobre sozinho se uma fatura "Verificar no ZSGO" (pedido sem resposta)
 * chegou a ser criada no ZSGO.
 *
 * 1. Procura pela referência que o programa põe em cada fatura
 *    (document.reference = LP-cliente-origem-AAAAMM).
 * 2. Para faturas antigas, sem referência, percorre a lista de documentos do
 *    ZSGO e procura uma fatura do mesmo cliente, com o mesmo valor, emitida
 *    depois do fim do mês faturado.
 *
 * Regra de segurança: só responde NAO_EXISTE quando leu a lista toda do ZSGO,
 * percebeu os campos e não há NENHUMA fatura desse cliente nesse período
 * (nem com outro valor). Qualquer dúvida → INCONCLUSIVO, e a fatura fica para
 * confirmar à mão. Mais vale perguntar do que duplicar.
 *
 * A lista do ZSGO é lida uma só vez por execução e partilhada entre threads.
 */
public class LocalizadorFaturas {
   public enum Tipo {
      ENCONTRADA,
      NAO_EXISTE,
      INCONCLUSIVO
   }

   public static class Resultado {
      public final Tipo tipo;
      public final ZsgoDocumento documento;
      public final String motivo;

      Resultado(Tipo tipo, ZsgoDocumento documento, String motivo) {
         this.tipo = tipo;
         this.documento = documento;
         this.motivo = motivo;
      }
   }

   private static final int POR_PAGINA = 100;
   private static final int MAX_PAGINAS = 3000;
   private static final BigDecimal CENTIMO = new BigDecimal("0.01");

   private final ZsgoApiClient zsgo;
   private List<ZsgoDocumento> todos;
   private String falhaLeitura;

   public LocalizadorFaturas(ZsgoApiClient zsgo) {
      this.zsgo = zsgo;
   }

   public static String referencia(String cliente, String origem, int ano, int mes) {
      return String.format("LP-%s-%s-%04d%02d", cliente, origem, ano, mes);
   }

   public synchronized Resultado localizar(String referencia, String codigoCliente, BigDecimal total, int ano, int mes) {
      // 1. Pesquisa rápida pela referência.
      try {
         List<ZsgoDocumento> porRef = new ArrayList<>();
         for (ZsgoDocumento d : this.zsgo.procurarSales(referencia)) {
            if (referencia.equals(d.referencia) && !d.anulado) {
               porRef.add(d);
            }
         }
         if (porRef.size() == 1) {
            return new Resultado(Tipo.ENCONTRADA, this.completo(porRef.get(0)), "encontrada pela referência " + referencia);
         }
         if (porRef.size() > 1) {
            return new Resultado(Tipo.INCONCLUSIVO, null, "há " + porRef.size() + " documentos com a referência " + referencia + " (" + numeros(porRef) + ") — possível duplicado");
         }
      } catch (Exception e) {
         // a pesquisa pode não existir ou não procurar na referência: segue para a lista completa
      }

      // 2. Lista completa do ZSGO.
      this.carregar();
      if (this.falhaLeitura != null) {
         return new Resultado(Tipo.INCONCLUSIVO, null, "não foi possível ler a lista de documentos do ZSGO: " + this.falhaLeitura);
      }

      List<ZsgoDocumento> comRef = new ArrayList<>();
      for (ZsgoDocumento d : this.todos) {
         if (referencia.equals(d.referencia) && !d.anulado) {
            comRef.add(d);
         }
      }
      if (comRef.size() == 1) {
         return new Resultado(Tipo.ENCONTRADA, this.completo(comRef.get(0)), "encontrada pela referência " + referencia);
      }
      if (comRef.size() > 1) {
         return new Resultado(Tipo.INCONCLUSIVO, null, "há " + comRef.size() + " documentos com a referência " + referencia + " (" + numeros(comRef) + ") — possível duplicado");
      }

      if (codigoCliente == null || total == null) {
         return new Resultado(Tipo.INCONCLUSIVO, null, "sem código de cliente ou valor para comparar");
      }

      // A fatura do mês M só pode ter sido emitida depois do fim de M.
      LocalDate desde = LocalDate.of(ano, mes, 1).plusMonths(1L).minusDays(1L);
      // As faturas do programa dizem nas notas a que mês se referem: as de
      // outro mês ficam de fora (um cliente pode pagar sempre o mesmo valor).
      String mesEsperado = ("mês de " + java.time.Month.of(mes).getDisplayName(java.time.format.TextStyle.FULL, new java.util.Locale("pt", "PT")) + " de " + ano)
         .toLowerCase(java.util.Locale.ROOT);
      boolean camposLegiveis = this.todos.isEmpty();
      List<ZsgoDocumento> doCliente = new ArrayList<>();
      List<ZsgoDocumento> mesmoValor = new ArrayList<>();
      for (ZsgoDocumento d : this.todos) {
         if (d.clienteCodigo != null && d.total != null) {
            camposLegiveis = true;
         }
         if (d.anulado || !codigoCliente.equals(d.clienteCodigo)) {
            continue;
         }
         LocalDate data = data(d.data);
         if (data != null && data.isBefore(desde)) {
            continue;
         }
         String notas = d.notas == null ? "" : d.notas.toLowerCase(java.util.Locale.ROOT);
         if (notas.contains("referentes ao mês de") && !notas.contains(mesEsperado)) {
            continue;
         }
         doCliente.add(d);
         if (d.total != null && d.total.subtract(total).abs().compareTo(CENTIMO) < 0) {
            mesmoValor.add(d);
         }
      }
      if (!camposLegiveis) {
         return new Resultado(Tipo.INCONCLUSIVO, null, "a lista do ZSGO não traz o cliente e o valor de cada documento");
      }
      if (mesmoValor.size() == 1) {
         return new Resultado(Tipo.ENCONTRADA, this.completo(mesmoValor.get(0)), "encontrada pelo cliente e valor (" + mesmoValor.get(0).numero + ")");
      }
      if (mesmoValor.size() > 1) {
         return new Resultado(Tipo.INCONCLUSIVO, null, "há " + mesmoValor.size() + " faturas deste cliente com este valor (" + numeros(mesmoValor) + ") — possível duplicado");
      }
      if (!doCliente.isEmpty()) {
         return new Resultado(Tipo.INCONCLUSIVO, null, "há faturas deste cliente depois do fim do mês, mas com outro valor (" + numeros(doCliente) + ")");
      }
      return new Resultado(Tipo.NAO_EXISTE, null, "não há nenhuma fatura deste cliente no ZSGO depois de " + desde);
   }

   /** Documentos cujo número é o indicado ("11385", "FR API-FR/11385", …). */
   public synchronized List<ZsgoDocumento> porNumero(String texto) throws Exception {
      this.carregar();
      if (this.falhaLeitura != null) {
         throw new Exception("não foi possível ler a lista do ZSGO: " + this.falhaLeitura);
      }
      String t = texto.trim();
      List<ZsgoDocumento> r = new ArrayList<>();
      for (ZsgoDocumento d : this.todos) {
         boolean igual = t.equals(d.id) || t.equalsIgnoreCase(d.numero) || t.equals(d.numeroSimples)
            || (d.numeroSimples != null && (t.endsWith("/" + d.numeroSimples) || t.endsWith(" " + d.numeroSimples)) && (d.tipo == null || t.toUpperCase().startsWith(d.tipo.toUpperCase())));
         if (igual) {
            r.add(d);
         }
      }
      return r;
   }

   private void carregar() {
      if (this.todos != null || this.falhaLeitura != null) {
         return;
      }
      List<ZsgoDocumento> lista = new ArrayList<>();
      try {
         for (int p = 1; p <= MAX_PAGINAS; p++) {
            ZsgoDocumento.Pagina pg = this.zsgo.listarSales(p, POR_PAGINA, null);
            lista.addAll(pg.documentos);
            boolean ultima = pg.documentos.isEmpty() || (pg.totalPaginas != null ? p >= pg.totalPaginas : pg.documentos.size() < POR_PAGINA);
            if (ultima) {
               this.todos = lista;
               return;
            }
         }
         this.falhaLeitura = "a lista tem mais de " + MAX_PAGINAS + " páginas";
      } catch (Exception e) {
         this.falhaLeitura = Erros.descrever(e);
      }
   }

   /** A lista pode não trazer o PDF: lê o documento completo. */
   private ZsgoDocumento completo(ZsgoDocumento d) {
      if (d.pdfUrl != null || d.id == null) {
         return d;
      }
      try {
         return this.zsgo.getSale(d.id);
      } catch (Exception e) {
         return d;
      }
   }

   private static LocalDate data(String s) {
      if (s == null || s.length() < 10) {
         return null;
      }
      try {
         return LocalDate.parse(s.substring(0, 10));
      } catch (Exception e) {
         return null;
      }
   }

   private static String numeros(List<ZsgoDocumento> ds) {
      StringBuilder b = new StringBuilder();
      for (ZsgoDocumento d : ds) {
         if (b.length() > 0) {
            b.append(", ");
         }
         b.append(d.numero != null ? d.numero : "id " + d.id);
         if (d.data != null) {
            b.append(" de ").append(d.data.length() >= 10 ? d.data.substring(0, 10) : d.data);
         }
      }
      return b.toString();
   }
}
