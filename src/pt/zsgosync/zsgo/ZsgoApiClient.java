package pt.zsgosync.zsgo;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpClient.Version;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse.BodyHandlers;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Map.Entry;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import pt.zsgosync.model.SourceClient;
import pt.zsgosync.util.RateLimiter;

public class ZsgoApiClient {
   private final String baseUrl;
   private final String token;
   private final String defaultPriceLine;
   private final String defaultPaymentOptionId;
   private final String defaultPaymentMethodId;
   private final String defaultFamilyId;
   private final String defaultItemTypeCode;
   private final String defaultUnitCode;
   private final String defaultSaleTax;
   private final String defaultExemptionCode;
   private final HttpClient http;
   private RateLimiter rateLimiter;
   private static final int MAX_RETRIES_429 = 6;
   private static final long DEFAULT_RETRY_MILLIS = 3000L;
   private static final Pattern CODE_PATTERN = Pattern.compile("\"code\"\\s*:\\s*\"?([^\",}\\]]+)\"?");
   private static final Pattern REFERENCE_PATTERN = Pattern.compile("\"reference\"\\s*:\\s*\"([^\"]*)\"");
   private static final Pattern MESSAGE_PATTERN = Pattern.compile("\"message\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
   private static final Pattern ID_PATTERN = Pattern.compile("\"id\"\\s*:\\s*\"([^\"]+)\"");
   private static final Pattern PDF_URL_PATTERN = Pattern.compile("\"pdf_url\"\\s*:\\s*\"([^\"]+)\"");

   public ZsgoApiClient comRateLimiter(RateLimiter var1) {
      this.rateLimiter = var1;
      return this;
   }

   public ZsgoApiClient(String var1, String var2, String var3, String var4, String var5, String var6, String var7, String var8, String var9, String var10) {
      this.baseUrl = var1.endsWith("/") ? var1.substring(0, var1.length() - 1) : var1;
      this.token = var2;
      this.defaultPriceLine = var3;
      this.defaultPaymentOptionId = var4;
      this.defaultPaymentMethodId = var5;
      this.defaultFamilyId = var6;
      this.defaultItemTypeCode = var7;
      this.defaultUnitCode = var8;
      this.defaultSaleTax = var9;
      this.defaultExemptionCode = var10;
      this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10L)).version(Version.HTTP_1_1).build();
   }

   public ZsgoApiClient.ClientResult createClient(SourceClient var1) throws ZsgoApiException {
      String var3 = this.buildPayload(var1);
      HttpRequest var4 = HttpRequest.newBuilder()
         .uri(URI.create(this.baseUrl + "/clients"))
         .timeout(Duration.ofSeconds(20L))
         .header("Authorization", "Bearer " + this.token)
         .header("Content-Type", "application/json")
         .header("Accept", "application/json")
         .POST(BodyPublishers.ofString(var3))
         .build();

      HttpResponse var2;
      try {
         var2 = this.http.send(var4, BodyHandlers.ofString());
      } catch (InterruptedException | IOException var8) {
         Thread.currentThread().interrupt();
         throw new ZsgoApiException("Falha de rede ao chamar POST /clients: " + var8.getMessage(), var8);
      }

      int var5 = var2.statusCode();
      if (var5 != 200 && var5 != 201) {
         String var9 = unescapeJson(firstMatch(MESSAGE_PATTERN, (String)var2.body()));
         String var7 = var9 != null ? var9 : (String)var2.body();
         throw new ZsgoApiException("POST /clients devolveu " + var5 + ": " + var7 + " | Payload enviado: " + var3, var5);
      } else {
         String var6 = firstMatch(CODE_PATTERN, (String)var2.body());
         if (var6 == null) {
            throw new ZsgoApiException("Cliente criado (HTTP " + var5 + ") mas não consegui ler o 'code' da resposta: " + (String)var2.body(), var5);
         } else {
            return new ZsgoApiClient.ClientResult(var6, (String)var2.body());
         }
      }
   }

   public ZsgoApiClient.ClientResult updateClient(SourceClient var1, String var2) throws ZsgoApiException {
      String var3 = this.buildPayload(var1);
      HttpRequest var4 = HttpRequest.newBuilder()
         .uri(URI.create(this.baseUrl + "/clients/" + var2))
         .timeout(Duration.ofSeconds(20L))
         .header("Authorization", "Bearer " + this.token)
         .header("Content-Type", "application/json")
         .header("Accept", "application/json")
         .method("PATCH", BodyPublishers.ofString(var3))
         .build();
      HttpResponse var5 = this.sendComRetry429(var4);
      int var6 = var5.statusCode();
      if (var6 == 200) {
         String var9 = firstMatch(CODE_PATTERN, (String)var5.body());
         return new ZsgoApiClient.ClientResult(var9 != null ? var9 : var2, (String)var5.body());
      } else {
         String var7 = unescapeJson(firstMatch(MESSAGE_PATTERN, (String)var5.body()));
         String var8 = var7 != null ? var7 : (String)var5.body();
         throw new ZsgoApiException("PATCH /clients/" + var2 + " devolveu " + var6 + ": " + var8 + " | Payload enviado: " + var3, var6);
      }
   }

   public ZsgoApiClient.ResultadoTesteLigacao testarLigacao() throws ZsgoApiException {
      HttpRequest var2 = HttpRequest.newBuilder()
         .uri(URI.create(this.baseUrl + "/countries"))
         .timeout(Duration.ofSeconds(10L))
         .header("Authorization", "Bearer " + this.token)
         .header("Accept", "application/json")
         .GET()
         .build();

      HttpResponse var1;
      try {
         var1 = this.http.send(var2, BodyHandlers.ofString());
      } catch (InterruptedException | IOException var6) {
         Thread.currentThread().interrupt();
         throw new ZsgoApiException("Falha de rede ao chamar GET /countries: " + var6.getMessage(), var6);
      }

      int var3 = var1.statusCode();
      if (var3 == 200) {
         Matcher var7 = Pattern.compile("\"code\"\\s*:\\s*\"").matcher((CharSequence)var1.body());
         int var8 = 0;

         while (var7.find()) {
            var8++;
         }

         return new ZsgoApiClient.ResultadoTesteLigacao(var8, var1.headers().map());
      } else {
         String var4 = unescapeJson(firstMatch(MESSAGE_PATTERN, (String)var1.body()));
         String var5 = var3 != 401 && var3 != 403 ? "" : " (token inválido, expirado ou sem permissões?)";
         throw new ZsgoApiException("GET /countries devolveu " + var3 + (var4 != null ? ": " + var4 : "") + var5, var3);
      }
   }

   public ZsgoApiClient.SaleResult createSale(String var1) throws ZsgoApiException {
      HttpRequest var2 = HttpRequest.newBuilder()
         .uri(URI.create(this.baseUrl + "/sales"))
         .timeout(Duration.ofSeconds(20L))
         .header("Authorization", "Bearer " + this.token)
         .header("Content-Type", "application/json")
         .header("Accept", "application/json")
         .POST(BodyPublishers.ofString(var1))
         .build();
      HttpResponse var3 = this.sendComRetry429(var2);
      int var4 = var3.statusCode();
      if (var4 != 200 && var4 != 201) {
         String var8 = unescapeJson(firstMatch(MESSAGE_PATTERN, (String)var3.body()));
         String var9 = var8 != null ? var8 : (String)var3.body();
         throw new ZsgoApiException("POST /sales devolveu " + var4 + ": " + var9, var4);
      } else {
         String var5 = firstMatch(ID_PATTERN, (String)var3.body());
         if (var5 == null) {
            throw new ZsgoApiException("Fatura criada (HTTP " + var4 + ") mas não consegui ler o 'id' da resposta: " + (String)var3.body(), var4);
         } else {
            String var6 = firstMatch(PDF_URL_PATTERN, (String)var3.body());
            String var7 = var6 != null ? var6.replace("\\/", "/") : null;
            return new ZsgoApiClient.SaleResult(var5, var7);
         }
      }
   }

   /** Lê uma fatura/nota de crédito tal como está no ZSGO (GET /sales/{id}). */
   public ZsgoDocumento getSale(String id) throws ZsgoApiException {
      HttpRequest pedido = HttpRequest.newBuilder()
         .uri(URI.create(this.baseUrl + "/sales/" + id))
         .timeout(Duration.ofSeconds(20L))
         .header("Authorization", "Bearer " + this.token)
         .header("Accept", "application/json")
         .GET()
         .build();
      HttpResponse<String> resposta = this.sendComRetry429(pedido);
      int codigo = resposta.statusCode();
      if (codigo != 200) {
         String msg = unescapeJson(firstMatch(MESSAGE_PATTERN, resposta.body()));
         throw new ZsgoApiException("GET /sales/" + id + " devolveu " + codigo + ": " + (msg != null ? msg : resposta.body()), codigo);
      }
      try {
         return ZsgoDocumento.ler(resposta.body());
      } catch (IllegalArgumentException e) {
         throw new ZsgoApiException("Resposta do ZSGO em formato inesperado (" + e.getMessage() + "): " + resposta.body(), codigo);
      }
   }

   private HttpResponse<String> sendComRetry429(HttpRequest var1) throws ZsgoApiException {
      int var2 = 0;
      int var3 = 1;

      while (true) {
         HttpResponse<String> var4;
         while (true) {
            if (var3 > 6) {
               throw new ZsgoApiException("Excedidas 6 tentativas após 429 (rate limit).", 429);
            }

            try {
               if (this.rateLimiter != null) {
                  this.rateLimiter.acquire();
               }
            } catch (InterruptedException var10) {
               Thread.currentThread().interrupt();
               throw new ZsgoApiException("Interrompido à espera do rate limiter.", var10);
            }

            try {
               var4 = this.http.send(var1, BodyHandlers.ofString());
               break;
            } catch (IOException var11) {
               if (++var2 > 3) {
                  throw new ZsgoApiException("Falha de rede após " + var2 + " tentativas: " + var11.getMessage(), var11);
               }

               System.out
                  .println(
                     "[rede] Falha transitória ("
                        + var11.getClass().getSimpleName()
                        + ": "
                        + var11.getMessage()
                        + ") — a tentar outra vez (tentativa "
                        + var2
                        + "/3)"
                  );

               try {
                  Thread.sleep(1000L * var2);
               } catch (InterruptedException var9) {
                  Thread.currentThread().interrupt();
                  throw new ZsgoApiException("Interrompido à espera para tentar de novo após falha de rede.", var9);
               }
            } catch (InterruptedException var12) {
               Thread.currentThread().interrupt();
               throw new ZsgoApiException("Falha de rede: " + var12.getMessage(), var12);
            }
         }

         if (var4.statusCode() != 429) {
            return var4;
         }

         long var5 = lerRetryAfter(var4).orElse(3000L);
         System.out.println("[429] Rate limit atingido — a esperar " + var5 + "ms e a tentar outra vez (tentativa " + var3 + "/6)");

         try {
            Thread.sleep(var5);
         } catch (InterruptedException var8) {
            Thread.currentThread().interrupt();
            throw new ZsgoApiException("Interrompido à espera do rate limit (429).", var8);
         }

         var3++;
      }
   }

   private static Optional<Long> lerRetryAfter(HttpResponse<String> var0) {
      return var0.headers().firstValue("Retry-After").map(var0x -> {
         try {
            return Long.parseLong(var0x.trim()) * 1000L;
         } catch (NumberFormatException var2) {
            return null;
         }
      });
   }

   public byte[] downloadSalePdf(String var1) throws ZsgoApiException {
      HttpRequest var3 = HttpRequest.newBuilder()
         .uri(URI.create(this.baseUrl + "/sales/" + var1 + "/pdf"))
         .timeout(Duration.ofSeconds(30L))
         .header("Authorization", "Bearer " + this.token)
         .header("Accept", "application/pdf")
         .GET()
         .build();

      HttpResponse var2;
      try {
         var2 = this.http.send(var3, BodyHandlers.ofByteArray());
      } catch (InterruptedException | IOException var5) {
         Thread.currentThread().interrupt();
         throw new ZsgoApiException("Falha de rede ao obter o PDF: " + var5.getMessage(), var5);
      }

      if (var2.statusCode() != 200) {
         throw new ZsgoApiException("GET /sales/" + var1 + "/pdf devolveu " + var2.statusCode(), var2.statusCode());
      } else {
         return (byte[])var2.body();
      }
   }

   private static double parseOrZero(String var0) {
      if (var0 != null && !var0.isBlank()) {
         try {
            return Double.parseDouble(var0.trim().replace(",", "."));
         } catch (NumberFormatException var2) {
            return 0.0;
         }
      } else {
         return 0.0;
      }
   }

   private String buildPayload(SourceClient var1) {
      StringBuilder var2 = new StringBuilder("{");
      var2.append("\"name\":").append(jsonString(var1.nome));
      if (notBlank(var1.nif)) {
         var2.append(",\"tax_id\":").append(jsonString(var1.nif));
      }

      if (var1.sujeitoPassivo != null) {
         var2.append(",\"tax_subject\":").append(var1.sujeitoPassivo);
      }

      var2.append("}");
      StringBuilder var3 = new StringBuilder("{");
      var3.append("\"country_code\":").append(jsonString(notBlank(var1.pais) ? var1.pais : "PT"));
      if (notBlank(var1.morada)) {
         var3.append(",\"address\":").append(jsonString(var1.morada));
      }

      if (notBlank(var1.codigoPostal)) {
         var3.append(",\"postal_code\":").append(jsonString(var1.codigoPostal));
      }

      if (notBlank(var1.cidade)) {
         var3.append(",\"city\":").append(jsonString(var1.cidade));
      }

      var3.append("}");
      StringBuilder var4 = new StringBuilder("{");
      var4.append("\"price_line\":").append(Integer.parseInt(this.defaultPriceLine));
      if (notBlank(this.defaultPaymentOptionId)) {
         var4.append(",\"payment_option_id\":").append(jsonString(this.defaultPaymentOptionId));
      }

      if (notBlank(this.defaultPaymentMethodId)) {
         var4.append(",\"payment_method_id\":").append(jsonString(this.defaultPaymentMethodId));
      }

      if (notBlank(var1.motivoIsencaoZsgoCode)) {
         var4.append(",\"exemption_code\":").append(jsonString(var1.motivoIsencaoZsgoCode));
      }

      var4.append("}");
      StringBuilder var5 = new StringBuilder("{\"inactive\":false");
      if (notBlank(var1.email)) {
         var5.append(",\"email\":").append(jsonString(var1.email));
      }

      if (notBlank(var1.telefone)) {
         var5.append(",\"phone\":").append(jsonString(var1.telefone));
      }

      var5.append("}");
      return "{\"identity\":" + var2 + ",\"address\":" + var3 + ",\"billing\":" + var4 + ",\"settings\":" + var5 + "}";
   }

   private static boolean notBlank(String var0) {
      return var0 != null && !var0.isBlank();
   }

   private static String firstMatch(Pattern var0, String var1) {
      if (var1 == null) {
         return null;
      } else {
         Matcher var2 = var0.matcher(var1);
         return var2.find() ? var2.group(1) : null;
      }
   }

   private static String unescapeJson(String var0) {
      if (var0 == null) {
         return null;
      } else {
         StringBuilder var1 = new StringBuilder();

         for (int var2 = 0; var2 < var0.length(); var2++) {
            char var3 = var0.charAt(var2);
            if (var3 == '\\' && var2 + 1 < var0.length()) {
               char var4 = var0.charAt(var2 + 1);
               switch (var4) {
                  case '"':
                     var1.append('"');
                     var2++;
                     break;
                  case '/':
                     var1.append('/');
                     var2++;
                     break;
                  case '\\':
                     var1.append('\\');
                     var2++;
                     break;
                  case 'n':
                     var1.append('\n');
                     var2++;
                     break;
                  case 'r':
                     var1.append('\r');
                     var2++;
                     break;
                  case 't':
                     var1.append('\t');
                     var2++;
                     break;
                  default:
                     var1.append(var3);
               }
            } else {
               var1.append(var3);
            }
         }

         return var1.toString();
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
                  if (var5 < ' ') {
                     var1.append(String.format("\\u%04x", var5));
                  } else {
                     var1.append(var5);
                  }
            }
         }

         var1.append("\"");
         return var1.toString();
      }
   }

   public static class ClientResult {
      public final String code;
      public final String respostaJson;

      public ClientResult(String var1, String var2) {
         this.code = var1;
         this.respostaJson = var2;
      }
   }

   public static class ResultadoTesteLigacao {
      public final int numeroPaises;
      public final Map<String, List<String>> cabecalhos;

      public ResultadoTesteLigacao(int var1, Map<String, List<String>> var2) {
         this.numeroPaises = var1;
         this.cabecalhos = var2;
      }

      public List<String> cabecalhosDeLimiteDeTaxa() {
         ArrayList var1 = new ArrayList();

         for (Entry var3 : this.cabecalhos.entrySet()) {
            String var4 = (String)var3.getKey();
            if (var4 != null) {
               String var5 = var4.toLowerCase(Locale.ROOT);
               if (var5.contains("rate") || var5.contains("limit") || var5.equals("retry-after")) {
                  var1.add(var4 + ": " + String.join(", ", (Iterable<? extends CharSequence>)var3.getValue()));
               }
            }
         }

         return var1;
      }

      public Integer valorRemaining() {
         return this.valorNumericoDoCabecalho(var0 -> var0.contains("remaining"));
      }

      public Integer valorLimite() {
         return this.valorNumericoDoCabecalho(var0 -> var0.contains("limit") && !var0.contains("remaining"));
      }

      private Integer valorNumericoDoCabecalho(Predicate<String> var1) {
         for (Entry var3 : this.cabecalhos.entrySet()) {
            String var4 = (String)var3.getKey();
            if (var4 != null && var1.test(var4.toLowerCase(Locale.ROOT)) && !((List)var3.getValue()).isEmpty()) {
               try {
                  return Integer.parseInt(((String)((List)var3.getValue()).get(0)).trim());
               } catch (NumberFormatException var6) {
               }
            }
         }

         return null;
      }
   }

   public static class SaleResult {
      public final String id;
      public final String pdfUrl;

      public SaleResult(String var1, String var2) {
         this.id = var1;
         this.pdfUrl = var2;
      }
   }
}
