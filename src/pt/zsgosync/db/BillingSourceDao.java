package pt.zsgosync.db;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import pt.zsgosync.model.BillingLine;

public class BillingSourceDao {
   private final String query;

   public BillingSourceDao(String var1) {
      this.query = var1;
   }

   public List<BillingLine> fetchLines(Connection var1, int var2, int var3) throws SQLException {
      ArrayList var4 = new ArrayList();

      try (PreparedStatement var5 = var1.prepareStatement(this.query)) {
         var5.setInt(1, var2);
         var5.setInt(2, var3);

         try (ResultSet var6 = var5.executeQuery()) {
            while (var6.next()) {
               BillingLine var7 = new BillingLine();
               var7.clienteId = var6.getString("cliente_id");
               var7.zsgoCode = var6.getString("zsgo_code");
               var7.rubrica = var6.getString("rubrica");
               var7.productReference = var6.getString("product_reference");
               var7.nrTransacoes = var6.getLong("nr_transacoes");
               var7.valorTotal = var6.getBigDecimal("valor_total");
               var7.descricaoLinha = var6.getString("descricao_linha");
               String var8 = getOrNull(var6, "conta_origem_id");
               var7.contaOrigemId = var8 != null ? var8 : var7.clienteId;
               var7.contaOrigemNome = getOrNull(var6, "conta_origem_nome");
               var4.add(var7);
            }
         }
      }

      return var4;
   }

   private static String getOrNull(ResultSet var0, String var1) throws SQLException {
      try {
         return var0.getString(var1);
      } catch (SQLException var3) {
         return null;
      }
   }
}
