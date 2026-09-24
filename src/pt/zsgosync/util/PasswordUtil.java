package pt.zsgosync.util;

import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public final class PasswordUtil {
   private static final int ITERACOES = 120000;
   private static final int TAMANHO_CHAVE_BITS = 256;
   private static final SecureRandom RANDOM = new SecureRandom();

   private PasswordUtil() {
   }

   public static String gerarHash(String var0) {
      byte[] var1 = new byte[16];
      RANDOM.nextBytes(var1);
      byte[] var2 = pbkdf2(var0.toCharArray(), var1, 120000, 256);
      return "120000:" + Base64.getEncoder().encodeToString(var1) + ":" + Base64.getEncoder().encodeToString(var2);
   }

   public static boolean verificar(String var0, String var1) {
      if (var1 == null) {
         return false;
      } else {
         try {
            String[] var2 = var1.split(":");
            int var3 = Integer.parseInt(var2[0]);
            byte[] var4 = Base64.getDecoder().decode(var2[1]);
            byte[] var5 = Base64.getDecoder().decode(var2[2]);
            byte[] var6 = pbkdf2(var0.toCharArray(), var4, var3, var5.length * 8);
            return emTempoConstante(var6, var5);
         } catch (Exception var7) {
            return false;
         }
      }
   }

   private static byte[] pbkdf2(char[] var0, byte[] var1, int var2, int var3) {
      try {
         PBEKeySpec var4 = new PBEKeySpec(var0, var1, var2, var3);
         SecretKeyFactory var5 = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
         return var5.generateSecret(var4).getEncoded();
      } catch (InvalidKeySpecException | NoSuchAlgorithmException var6) {
         throw new RuntimeException(var6);
      }
   }

   private static boolean emTempoConstante(byte[] var0, byte[] var1) {
      if (var0.length != var1.length) {
         return false;
      } else {
         int var2 = 0;

         for (int var3 = 0; var3 < var0.length; var3++) {
            var2 |= var0[var3] ^ var1[var3];
         }

         return var2 == 0;
      }
   }
}
