package pt.zsgosync;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.AppUserDao;

public class AppUserRun {
   private static Connection ligar(AppConfig var0) throws Exception {
      return DriverManager.getConnection(var0.get("db.url"), var0.get("db.user"), var0.get("db.password"));
   }

   public static int contarUtilizadores(AppConfig var0) throws Exception {
      AppUserDao var1 = new AppUserDao();

      int var3;
      try (Connection var2 = ligar(var0)) {
         var1.ensureTableExists(var2);
         var3 = var1.contar(var2);
      }

      return var3;
   }

   public static AppUserDao.Usuario autenticar(AppConfig var0, String var1, String var2) throws Exception {
      AppUserDao var3 = new AppUserDao();

      AppUserDao.Usuario var5;
      try (Connection var4 = ligar(var0)) {
         var3.ensureTableExists(var4);
         var5 = var3.autenticar(var4, var1, var2);
      }

      return var5;
   }

   public static void criarPrimeiroAdmin(AppConfig var0, String var1, String var2) throws Exception {
      AppUserDao var3 = new AppUserDao();

      try (Connection var4 = ligar(var0)) {
         var3.ensureTableExists(var4);
         var3.criar(var4, var1, var2, "ADMIN", null);
      }
   }

   public static boolean existe(AppConfig var0, String var1) throws Exception {
      AppUserDao var2 = new AppUserDao();

      boolean var4;
      try (Connection var3 = ligar(var0)) {
         var2.ensureTableExists(var3);
         var4 = var2.existe(var3, var1);
      }

      return var4;
   }

   public static void criar(AppConfig var0, String var1, String var2, String var3, String var4) throws Exception {
      AppUserDao var5 = new AppUserDao();

      try (Connection var6 = ligar(var0)) {
         var5.ensureTableExists(var6);
         var5.criar(var6, var1, var2, var3, var4);
      }
   }

   public static List<AppUserDao.Usuario> listar(AppConfig var0) throws Exception {
      AppUserDao var1 = new AppUserDao();

      List var3;
      try (Connection var2 = ligar(var0)) {
         var1.ensureTableExists(var2);
         var3 = var1.listar(var2);
      }

      return var3;
   }

   public static void definirAtivo(AppConfig var0, String var1, boolean var2) throws Exception {
      AppUserDao var3 = new AppUserDao();

      try (Connection var4 = ligar(var0)) {
         var3.ensureTableExists(var4);
         var3.definirAtivo(var4, var1, var2);
      }
   }

   public static void redefinirPassword(AppConfig var0, String var1, String var2) throws Exception {
      AppUserDao var3 = new AppUserDao();

      try (Connection var4 = ligar(var0)) {
         var3.ensureTableExists(var4);
         var3.redefinirPassword(var4, var1, var2);
      }
   }
}
