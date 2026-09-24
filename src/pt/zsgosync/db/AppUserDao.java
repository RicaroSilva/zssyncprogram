package pt.zsgosync.db;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import pt.zsgosync.util.PasswordUtil;

public class AppUserDao {
   public static final String PAPEL_ADMIN = "ADMIN";
   public static final String PAPEL_UTILIZADOR = "UTILIZADOR";

   public void ensureTableExists(Connection var1) throws SQLException {
      String var2 = "CREATE TABLE IF NOT EXISTS zsgo_app_users (\n    id             SERIAL PRIMARY KEY,\n    username       VARCHAR(64) NOT NULL UNIQUE,\n    password_hash  TEXT        NOT NULL,\n    role           VARCHAR(20) NOT NULL DEFAULT 'UTILIZADOR',\n    ativo          BOOLEAN     NOT NULL DEFAULT TRUE,\n    criado_em      TIMESTAMP   NOT NULL DEFAULT now(),\n    criado_por     VARCHAR(64)\n)\n";

      try (Statement var3 = var1.createStatement()) {
         var3.execute(var2);
      }
   }

   public int contar(Connection var1) throws SQLException {
      int var4;
      try (
         Statement var2 = var1.createStatement();
         ResultSet var3 = var2.executeQuery("SELECT COUNT(*) FROM zsgo_app_users");
      ) {
         var3.next();
         var4 = var3.getInt(1);
      }

      return var4;
   }

   public boolean existe(Connection var1, String var2) throws SQLException {
      boolean var5;
      try (PreparedStatement var3 = var1.prepareStatement("SELECT 1 FROM zsgo_app_users WHERE lower(username) = lower(?)")) {
         var3.setString(1, var2);

         try (ResultSet var4 = var3.executeQuery()) {
            var5 = var4.next();
         }
      }

      return var5;
   }

   public AppUserDao.Usuario autenticar(Connection var1, String var2, String var3) throws SQLException {
      String var4 = "SELECT username, password_hash, role, ativo FROM zsgo_app_users WHERE lower(username) = lower(?)";

      AppUserDao.Usuario var10;
      try (PreparedStatement var5 = var1.prepareStatement(var4)) {
         var5.setString(1, var2);

         try (ResultSet var6 = var5.executeQuery()) {
            if (!var6.next()) {
               return null;
            }

            boolean var7 = var6.getBoolean("ativo");
            if (!var7) {
               return null;
            }

            String var8 = var6.getString("password_hash");
            if (!PasswordUtil.verificar(var3, var8)) {
               return null;
            }

            AppUserDao.Usuario var17 = new AppUserDao.Usuario();
            var17.username = var6.getString("username");
            var17.role = var6.getString("role");
            var17.ativo = true;
            var10 = var17;
         }
      }

      return var10;
   }

   public void criar(Connection var1, String var2, String var3, String var4, String var5) throws SQLException {
      String var6 = "INSERT INTO zsgo_app_users (username, password_hash, role, criado_por) VALUES (?, ?, ?, ?)";

      try (PreparedStatement var7 = var1.prepareStatement(var6)) {
         var7.setString(1, var2);
         var7.setString(2, PasswordUtil.gerarHash(var3));
         var7.setString(3, var4);
         var7.setString(4, var5);
         var7.executeUpdate();
      }
   }

   public List<AppUserDao.Usuario> listar(Connection var1) throws SQLException {
      ArrayList var2 = new ArrayList();
      String var3 = "SELECT username, role, ativo, criado_por, criado_em FROM zsgo_app_users ORDER BY username ASC";

      try (
         Statement var4 = var1.createStatement();
         ResultSet var5 = var4.executeQuery(var3);
      ) {
         while (var5.next()) {
            AppUserDao.Usuario var6 = new AppUserDao.Usuario();
            var6.username = var5.getString("username");
            var6.role = var5.getString("role");
            var6.ativo = var5.getBoolean("ativo");
            var6.criadoPor = var5.getString("criado_por");
            var6.criadoEm = var5.getTimestamp("criado_em");
            var2.add(var6);
         }
      }

      return var2;
   }

   public void definirAtivo(Connection var1, String var2, boolean var3) throws SQLException {
      try (PreparedStatement var4 = var1.prepareStatement("UPDATE zsgo_app_users SET ativo = ? WHERE username = ?")) {
         var4.setBoolean(1, var3);
         var4.setString(2, var2);
         var4.executeUpdate();
      }
   }

   public void redefinirPassword(Connection var1, String var2, String var3) throws SQLException {
      try (PreparedStatement var4 = var1.prepareStatement("UPDATE zsgo_app_users SET password_hash = ? WHERE username = ?")) {
         var4.setString(1, PasswordUtil.gerarHash(var3));
         var4.setString(2, var2);
         var4.executeUpdate();
      }
   }

   public static class Usuario {
      public String username;
      public String role;
      public boolean ativo;
      public String criadoPor;
      public Timestamp criadoEm;

      public boolean isAdmin() {
         return "ADMIN".equals(this.role);
      }
   }
}
