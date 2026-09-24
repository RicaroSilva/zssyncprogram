package pt.zsgosync.storage;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public class S3Uploader {
   private final String endpoint;
   private final String region;
   private final String accessKey;
   private final String secretKey;
   private final HttpClient http;

   public S3Uploader(String var1, String var2, String var3, String var4) {
      this.endpoint = var1.endsWith("/") ? var1.substring(0, var1.length() - 1) : var1;
      this.region = var2;
      this.accessKey = var3;
      this.secretKey = var4;
      this.http = HttpClient.newHttpClient();
   }

   public String upload(String var1, String var2, byte[] var3, String var4) throws Exception {
      URI var5 = URI.create(this.endpoint);
      String var6 = var5.getAuthority();
      String var7 = "/" + var1 + "/" + var2;
      String var8 = sha256Hex(var3);
      Instant var9 = Instant.now();
      String var10 = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(var9);
      String var11 = DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneOffset.UTC).format(var9);
      String var12 = "content-type:" + var4 + "\nhost:" + var6 + "\nx-amz-content-sha256:" + var8 + "\nx-amz-date:" + var10 + "\n";
      String var13 = "content-type;host;x-amz-content-sha256;x-amz-date";
      String var14 = "PUT\n" + var7 + "\n\n" + var12 + "\n" + var13 + "\n" + var8;
      String var15 = var11 + "/" + this.region + "/s3/aws4_request";
      String var16 = "AWS4-HMAC-SHA256\n" + var10 + "\n" + var15 + "\n" + sha256Hex(var14.getBytes(StandardCharsets.UTF_8));
      byte[] var17 = getSignatureKey(this.secretKey, var11, this.region, "s3");
      String var18 = hmacHex(var17, var16);
      String var19 = "AWS4-HMAC-SHA256 Credential=" + this.accessKey + "/" + var15 + ", SignedHeaders=" + var13 + ", Signature=" + var18;
      HttpRequest var20 = HttpRequest.newBuilder()
         .uri(URI.create(this.endpoint + var7))
         .header("content-type", var4)
         .header("x-amz-content-sha256", var8)
         .header("x-amz-date", var10)
         .header("Authorization", var19)
         .PUT(BodyPublishers.ofByteArray(var3))
         .build();
      HttpResponse var21 = this.http.send(var20, BodyHandlers.ofString());
      if (var21.statusCode() != 200 && var21.statusCode() != 201) {
         throw new RuntimeException("Upload para o storage S3 falhou: HTTP " + var21.statusCode() + " - " + (String)var21.body());
      } else {
         return this.endpoint + var7;
      }
   }

   private static String sha256Hex(byte[] var0) throws Exception {
      MessageDigest var1 = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(var1.digest(var0));
   }

   private static String sha256Hex(String var0) throws Exception {
      return sha256Hex(var0.getBytes(StandardCharsets.UTF_8));
   }

   private static byte[] hmacSha256(byte[] var0, String var1) throws Exception {
      Mac var2 = Mac.getInstance("HmacSHA256");
      var2.init(new SecretKeySpec(var0, "HmacSHA256"));
      return var2.doFinal(var1.getBytes(StandardCharsets.UTF_8));
   }

   private static String hmacHex(byte[] var0, String var1) throws Exception {
      return HexFormat.of().formatHex(hmacSha256(var0, var1));
   }

   private static byte[] getSignatureKey(String var0, String var1, String var2, String var3) throws Exception {
      byte[] var4 = ("AWS4" + var0).getBytes(StandardCharsets.UTF_8);
      byte[] var5 = hmacSha256(var4, var1);
      byte[] var6 = hmacSha256(var5, var2);
      byte[] var7 = hmacSha256(var6, var3);
      return hmacSha256(var7, "aws4_request");
   }
}
