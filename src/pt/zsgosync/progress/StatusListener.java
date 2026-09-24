package pt.zsgosync.progress;

public interface StatusListener {
   StatusListener NOOP = (var0, var1, var2) -> {};

   void aoAtualizarEstado(String var1, int var2, int var3);
}
