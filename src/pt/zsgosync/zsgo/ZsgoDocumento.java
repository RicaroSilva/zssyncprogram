package pt.zsgosync.zsgo;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import pt.zsgosync.util.Json;

/**
 * Um documento de venda tal como está no ZSGO (resposta de GET /sales/{id}).
 *
 * A documentação da API não descreve os campos da resposta, por isso a
 * leitura é tolerante: procura os nomes mais prováveis de cada campo e, se
 * não houver total no cabeçalho, soma as linhas. A resposta completa fica
 * sempre em {@link #json} para se poder ver à mão.
 */
public class ZsgoDocumento {
   public String id;
   public String numero;
   public String tipo;
   public String estado;
   public String data;
   public BigDecimal total;
   public BigDecimal liquido;
   public BigDecimal iva;
   public boolean anulado;
   public final List<Linha> linhas = new ArrayList<>();
   public String json;

   public static class Linha {
      public String id;
      public String produto;
      public BigDecimal quantidade;
      public BigDecimal precoUnitario;
      public BigDecimal taxaIva;
      public BigDecimal total;
      public String notas;
   }

   @SuppressWarnings("unchecked")
   public static ZsgoDocumento ler(String json) {
      ZsgoDocumento d = new ZsgoDocumento();
      d.json = json;
      Object raiz = Json.ler(json);
      Object dados = raiz instanceof Map ? ((Map<String, Object>) raiz).get("data") : raiz;
      if (dados instanceof List && !((List<Object>) dados).isEmpty()) {
         dados = ((List<Object>) dados).get(0);
      }
      if (!(dados instanceof Map)) {
         return d;
      }
      Map<String, Object> m = (Map<String, Object>) dados;
      Map<String, Object> doc = m.get("document") instanceof Map ? (Map<String, Object>) m.get("document") : m;
      Map<String, Object> totais = m.get("totals") instanceof Map ? (Map<String, Object>) m.get("totals") : m;

      d.id = texto(m, "id");
      d.numero = texto(doc, "number", "document_number", "full_number", "reference", "name");
      d.tipo = texto(doc, "type", "document_type");
      d.estado = texto(doc, "status", "state");
      d.data = texto(doc, "date", "document_date", "issued_at", "created_at");
      d.total = numero(totais, "total", "gross_total", "total_gross", "grand_total", "total_amount", "document_total", "total_with_tax");
      d.liquido = numero(totais, "net_total", "total_net", "subtotal", "total_without_tax", "net", "total_liquid");
      d.iva = numero(totais, "tax_total", "total_tax", "vat_total", "total_vat", "tax", "taxes", "vat");
      Object anulado = primeiro(doc, "annulled", "is_annulled", "canceled", "cancelled");
      d.anulado = Boolean.TRUE.equals(anulado) || (d.estado != null && d.estado.toLowerCase().matches(".*(anul|annul|cancel).*"));

      Object itens = primeiro(m, "items", "lines", "document_lines");
      if (itens instanceof List) {
         for (Object o : (List<Object>) itens) {
            if (o instanceof Map) {
               Map<String, Object> it = (Map<String, Object>) o;
               Linha l = new Linha();
               l.id = texto(it, "id");
               l.produto = texto(it, "product_reference", "reference", "product");
               l.quantidade = numero(it, "quantity", "qty");
               l.precoUnitario = numero(it, "unit_price_net", "unit_price", "price");
               l.taxaIva = numero(it, "tax_rate", "vat_rate", "tax");
               l.total = numero(it, "total", "gross_total", "total_with_tax", "line_total", "amount");
               l.notas = texto(it, "notes", "description");
               d.linhas.add(l);
            }
         }
      }

      if (d.total == null && !d.linhas.isEmpty()) {
         BigDecimal soma = BigDecimal.ZERO;
         for (Linha l : d.linhas) {
            if (l.total == null) {
               soma = null;
               break;
            }
            soma = soma.add(l.total);
         }
         d.total = soma;
      }
      if (d.total == null && d.liquido != null && d.iva != null) {
         d.total = d.liquido.add(d.iva);
      }
      return d;
   }

   private static Object primeiro(Map<String, Object> m, String... chaves) {
      for (String c : chaves) {
         if (m.get(c) != null) {
            return m.get(c);
         }
      }
      return null;
   }

   private static String texto(Map<String, Object> m, String... chaves) {
      Object v = primeiro(m, chaves);
      if (v == null || v instanceof Map || v instanceof List) {
         return null;
      }
      return v instanceof Double && ((Double) v) % 1 == 0 ? String.valueOf(((Double) v).longValue()) : v.toString();
   }

   private static BigDecimal numero(Map<String, Object> m, String... chaves) {
      Object v = primeiro(m, chaves);
      try {
         if (v instanceof Number) {
            return new BigDecimal(v.toString()).setScale(2, RoundingMode.HALF_UP);
         }
         if (v instanceof String && !((String) v).isBlank()) {
            return new BigDecimal(((String) v).trim().replace(",", ".")).setScale(2, RoundingMode.HALF_UP);
         }
      } catch (NumberFormatException e) {
         return null;
      }
      return null;
   }
}
