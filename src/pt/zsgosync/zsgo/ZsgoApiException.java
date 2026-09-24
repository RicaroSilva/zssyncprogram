package pt.zsgosync.zsgo;

public class ZsgoApiException extends Exception {
   private final int statusCode;

   public ZsgoApiException(String var1, int var2) {
      super(var1);
      this.statusCode = var2;
   }

   public ZsgoApiException(String var1, Throwable var2) {
      super(var1, var2);
      this.statusCode = -1;
   }

   public int getStatusCode() {
      return this.statusCode;
   }

   public boolean isConflict() {
      return this.statusCode == 409;
   }
}
