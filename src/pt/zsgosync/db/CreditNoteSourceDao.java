package pt.zsgosync.db;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import pt.zsgosync.model.ChargebackLine;

public class CreditNoteSourceDao {
   private final String query;

   public CreditNoteSourceDao(String var1) {
      this.query = var1;
   }

   public List<ChargebackLine> fetchLines(Connection var1, int var2, int var3) throws SQLException {
      ArrayList var4 = new ArrayList();

      try (PreparedStatement var5 = var1.prepareStatement(this.query)) {
         var5.setInt(1, var2);
         var5.setInt(2, var3);

         try (ResultSet var6 = var5.executeQuery()) {
            while (var6.next()) {
               ChargebackLine var7 = new ChargebackLine();
               var7.chargebackId = var6.getString("chargeback_id");
               var7.transacaoOriginalId = var6.getString("transacao_original_id");
               var7.clienteId = var6.getString("cliente_id");
               var7.zsgoCode = var6.getString("zsgo_code");
               var7.valorEstorno = var6.getBigDecimal("valor_estorno");
               var7.productReference = var6.getString("product_reference");
               var7.descricao = var6.getString("descricao");
               var4.add(var7);
            }
         }
      }

      return var4;
   }
}
