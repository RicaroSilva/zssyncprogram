package pt.zsgosync.util;

/**
 * Transforma uma exceção num texto de erro legível e NUNCA vazio.
 *
 * Várias exceções do Java chegam sem mensagem (getMessage() == null) — por
 * exemplo uma ligação recusada/timeout do HttpClient. Antes isso ficava
 * gravado como erro vazio e o painel só mostrava o ID do cliente. Aqui
 * juntamos o tipo da exceção e a cadeia de causas.
 */
public final class Erros {
   private Erros() {
   }

   public static String descrever(Throwable var0) {
      if (var0 == null) {
         return "Erro desconhecido (sem detalhes).";
      }

      StringBuilder var1 = new StringBuilder(parte(var0));
      Throwable var2 = var0.getCause();

      for (int var3 = 0; var2 != null && var2 != var0 && var3 < 5; var3++) {
         String var4 = parte(var2);
         // Causas sem mensagem própria não acrescentam nada de útil.
         if (var2.getMessage() != null && !var2.getMessage().isBlank() && var1.indexOf(var4) < 0) {
            var1.append(" | causa: ").append(var4);
         }

         var0 = var2;
         var2 = var2.getCause();
      }

      return var1.toString();
   }

   private static String parte(Throwable var0) {
      String var1 = var0.getMessage();
      String var2 = var0.getClass().getSimpleName();
      if (var1 == null || var1.isBlank()) {
         return var2 + " (sem mensagem)" + dica(var0);
      }

      // Exceções "nossas" já trazem uma mensagem pensada para o utilizador.
      return var0 instanceof pt.zsgosync.zsgo.ZsgoApiException || var0 instanceof IllegalStateException ? var1 : var2 + ": " + var1;
   }

   private static String dica(Throwable var0) {
      if (var0 instanceof java.net.ConnectException) {
         return " — ligação recusada: o servidor está desligado ou o endereço/porta estão errados";
      } else if (var0 instanceof java.net.http.HttpTimeoutException || var0 instanceof java.net.SocketTimeoutException) {
         return " — o servidor demorou demasiado a responder";
      } else if (var0 instanceof java.net.UnknownHostException) {
         return " — endereço do servidor desconhecido";
      } else {
         return "";
      }
   }
}
