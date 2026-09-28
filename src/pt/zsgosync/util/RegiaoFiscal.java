package pt.zsgosync.util;

/**
 * Região fiscal portuguesa a partir do código postal (address.region_code no
 * ZSGO), que determina as taxas de IVA:
 *   9000–9499 → MA (Madeira e Porto Santo)
 *   9500–9999 → AC (Açores)
 *   restante  → CON (Continente)
 * Só se aplica a clientes de Portugal; para outros países devolve null.
 */
public final class RegiaoFiscal {
   public static final String CONTINENTE = "CON";
   public static final String MADEIRA = "MA";
   public static final String ACORES = "AC";

   private RegiaoFiscal() {
   }

   public static String deCodigoPostal(String pais, String codigoPostal) {
      if (pais != null && !pais.isBlank() && !"PT".equalsIgnoreCase(pais.trim())) {
         return null;
      }
      if (codigoPostal == null) {
         return null;
      }
      String digitos = codigoPostal.replaceAll("[^0-9]", "");
      if (digitos.length() < 4) {
         return null;
      }
      int cp4 = Integer.parseInt(digitos.substring(0, 4));
      if (cp4 >= 9000 && cp4 <= 9499) {
         return MADEIRA;
      }
      if (cp4 >= 9500 && cp4 <= 9999) {
         return ACORES;
      }
      return CONTINENTE;
   }

   public static String nome(String codigo) {
      if (codigo == null) {
         return "—";
      }
      return switch (codigo) {
         case MADEIRA -> "Madeira";
         case ACORES -> "Açores";
         case CONTINENTE -> "Continente";
         default -> codigo;
      };
   }
}
