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
      String var3 = var2.replace("\\", "\\\\").replace("\"", "\\\"");
      String var4 = "{\"url_pdf\":\"" + var3 + "\",\"userid\":" + Long.parseLong(var1) + "}";
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
