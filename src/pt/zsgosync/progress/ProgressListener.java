package pt.zsgosync.progress;

import java.math.BigDecimal;

public interface ProgressListener {
   ProgressListener NOOP = new ProgressListener() {
      @Override
      public void aoIniciar(int var1) {
      }

      @Override
      public void aoProgredir(int var1, int var2) {
      }

      @Override
      public void aoItemFalhar(String var1, String var2) {
      }

      @Override
      public void aoConcluir(int var1, int var2, int var3, BigDecimal var4) {
      }
   };

   void aoIniciar(int var1);

   void aoProgredir(int var1, int var2);

   void aoItemFalhar(String var1, String var2);

   void aoConcluir(int var1, int var2, int var3, BigDecimal var4);
}
