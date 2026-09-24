package pt.zsgosync.util;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

public class RateLimiter {
   private final Semaphore semaphore;
   private final int maxPermits;

   public RateLimiter(int var1, long var2) {
      this.maxPermits = var1;
      this.semaphore = new Semaphore(var1);
      long var4 = Math.max(1L, var2 / var1);
      ScheduledExecutorService var6 = Executors.newSingleThreadScheduledExecutor(var0 -> {
         Thread var1x = new Thread(var0, "rate-limiter-refill");
         var1x.setDaemon(true);
         return var1x;
      });
      var6.scheduleAtFixedRate(() -> {
         if (this.semaphore.availablePermits() < this.maxPermits) {
            this.semaphore.release();
         }
      }, var4, var4, TimeUnit.MILLISECONDS);
   }

   public void acquire() throws InterruptedException {
      this.semaphore.acquire();
   }
}
