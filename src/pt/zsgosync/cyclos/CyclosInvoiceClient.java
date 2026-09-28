package pt.zsgosync.cyclos;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;

public class CyclosInvoiceClient {
   private final String url;
   private final String authHeader;
   private final HttpClient http;

   public CyclosInvoiceClient(String var1, String var2, String var3) {
      this.url = var1;
      String var4 = var2 + ":" + var3;
      this.authHeader = "Basic " + Base64.getEncoder().encodeToString(var4.getBytes(StandardCharsets.UTF_8));
      this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10L)).build();
   }

   public void notificarFatura(String var1, String var2) throws IOException, InterruptedException {
      this.notificarFatura(var1, var2, 0, 0, null, null, null);
   }

   /**
    * Envia a fatura ao Cyclos. Além do PDF e do utilizador, vai o mês/ano, o id
    * da fatura no ZSGO e, numa refaturação, "substitui_zsgo_id" = id da fatura
    * anulada que o script do Cyclos deve trocar por esta.
    */
   public void notificarFatura(String var1, String var2, int ano, int mes, String zsgoId, String substituiZsgoId, String numero)
      throws IOException, InterruptedException {
      String var3 = var2.replace("\\", "\\\\").replace("\"", "\\\"");
      StringBuilder extra = new StringBuilder();
      if (ano > 0) {
         extra.append(",\"ano\":").append(ano).append(",\"mes\":").append(mes);
      }
      if (zsgoId != null) {
         extra.append(",\"zsgo_id\":\"").append(zsgoId.replace("\"", "")).append("\"");
      }
      if (numero != null) {
         extra.append(",\"numero\":\"").append(numero.replace("\\", "").replace("\"", "")).append("\"");
      }
      if (substituiZsgoId != null) {
         extra.append(",\"substitui_zsgo_id\":\"").append(substituiZsgoId.replace("\"", "")).append("\"");
      }
      String var4 = "{\"url_pdf\":\"" + var3 + "\",\"userid\":" + Long.parseLong(var1) + extra + "}";
      HttpRequest var5 = HttpRequest.newBuilder()
         .uri(URI.create(this.url))
         .timeout(Duration.ofSeconds(20L))
         .header("Authorization", this.authHeader)
         .header("Content-Type", "application/json")
         .POST(BodyPublishers.ofString(var4))
         .build();
      HttpResponse var6 = this.http.send(var5, BodyHandlers.ofString());
      int var7 = var6.statusCode();
      if (var7 < 200 || var7 >= 300) {
         throw new IOException("Cyclos /web/run/invoice devolveu " + var7 + ": " + (String)var6.body());
      }
   }
}
