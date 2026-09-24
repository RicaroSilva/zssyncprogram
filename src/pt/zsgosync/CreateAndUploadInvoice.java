package pt.zsgosync;

import java.util.logging.Logger;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class CreateAndUploadInvoice {
   private static final Logger LOG = Logger.getLogger(CreateAndUploadInvoice.class.getName());

   public static void main(String[] var0) {
      if (var0.length < 2) {
         System.err.println("Uso: CreateAndUploadInvoice <config.properties> <customer-code>");
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
         String var5 = "{\n  \"customer\": {\"code\": \"%s\"},\n  \"document\": {\n    \"type\": \"FR\",\n    \"series\": \"A\",\n    \"payment_method_id\": \"8be012b4-6564-4ca3-ae16-d5fb6dd66827\",\n    \"tax_included\": true,\n    \"auto_confirm\": true,\n    \"notes\": \"Fatura de teste\"\n  },\n  \"items\": [\n    {\"product_reference\": \"mbway\", \"quantity\": 1, \"unit_price_net\": 2, \"notes\": \"Linha de teste\"}\n  ]\n}\n"
            .formatted(var2);
         LOG.info("A criar fatura de teste para o cliente " + var2 + "...");
         ZsgoApiClient.SaleResult var6 = var4.createSale(var5);
         LOG.info("Fatura criada:");
         System.out.println("id: " + var6.id);
         System.out.println("pdf_url: " + var6.pdfUrl);
      } catch (Exception var7) {
         LOG.severe("Falhou: " + var7.getMessage());
         var7.printStackTrace();
         System.exit(1);
      }
   }
}
