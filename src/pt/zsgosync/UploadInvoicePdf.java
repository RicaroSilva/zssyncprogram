package pt.zsgosync;

import java.util.UUID;
import java.util.logging.Logger;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.storage.S3Uploader;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class UploadInvoicePdf {
   private static final Logger LOG = Logger.getLogger(UploadInvoicePdf.class.getName());

   public static void main(String[] var0) {
      if (var0.length < 2) {
         System.err.println("Uso: UploadInvoicePdf <config.properties> <sale-id>");
         System.exit(1);
      }

      String var1 = var0[0];
      String var2 = var0[1];

      try {
         AppConfig var3 = new AppConfig(var1);
         ZsgoApiClient var4 = new ZsgoApiClient(
            var3.get("zsgo.baseUrl"),
            var3.get("zsgo.token"),
            var3.getOrDefault("zsgo.default.priceLine", "1"),
            var3.getOrDefault("zsgo.default.paymentOptionId", null),
            var3.getOrDefault("zsgo.default.paymentMethodId", null),
            var3.getOrDefault("zsgo.default.familyId", "1"),
            var3.getOrDefault("zsgo.default.itemTypeCode", "S"),
            var3.getOrDefault("zsgo.default.unitCode", "UNI"),
            var3.getOrDefault("zsgo.default.saleTax", "23"),
            var3.getOrDefault("zsgo.default.exemptionCode", "M01")
         );
         LOG.info("A descarregar PDF da fatura " + var2 + "...");
         byte[] var5 = var4.downloadSalePdf(var2);
         LOG.info("PDF descarregado (" + var5.length + " bytes).");
         S3Uploader var6 = new S3Uploader(
            var3.get("s3.endpoint"), var3.getOrDefault("s3.region", "us-east-1"), var3.get("s3.accessKey"), var3.get("s3.secretKey")
         );
         String var7 = UUID.randomUUID() + ".pdf";
         String var8 = var6.upload(var3.get("s3.bucket"), var7, var5, "application/pdf");
         LOG.info("Upload concluído. Link público:");
         System.out.println(var8);
      } catch (Exception var9) {
         LOG.severe("Falhou: " + var9.getMessage());
         var9.printStackTrace();
         System.exit(1);
      }
   }
}
