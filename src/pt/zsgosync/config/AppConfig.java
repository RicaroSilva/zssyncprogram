package pt.zsgosync.config;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

public class AppConfig {
   private final Properties props = new Properties();

   public AppConfig(String var1) throws IOException {
      Path var2 = Path.of(var1);
      if (!Files.exists(var2)) {
         throw new IOException("Ficheiro de configuração não encontrado: " + var2.toAbsolutePath());
      } else {
         try (InputStream var3 = Files.newInputStream(var2)) {
            this.props.load(var3);
         }
      }
   }

   public String get(String var1) {
      String var2 = this.props.getProperty(var1);
      if (var2 == null) {
         throw new IllegalStateException("Propriedade em falta no config.properties: " + var1);
      } else {
         return var2;
      }
   }

   public String getOrDefault(String var1, String var2) {
      String var3 = this.props.getProperty(var1);
      return var3 != null && !var3.isBlank() ? var3 : var2;
   }

   public int getInt(String var1, int var2) {
      String var3 = this.props.getProperty(var1);
      return var3 != null && !var3.isBlank() ? Integer.parseInt(var3.trim()) : var2;
   }
}
