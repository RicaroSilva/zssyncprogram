package pt.zsgosync.db;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

public class ClientListingDao {
   public List<ClientListingDao.ClienteResumo> listarTodos(Connection var1) throws SQLException {
      ArrayList var2 = new ArrayList();
      String var3 = "SELECT\n    user_id,\n    zsgo_code,\n    status,\n    tentativas,\n    ultimo_erro,\n    atualizado_em,\n    content_hash,\n    zsgo_dados->'data'->'identity'->>'name' AS nome,\n    zsgo_dados->'data'->'identity'->>'tax_id' AS nif,\n    zsgo_dados->'data'->'settings'->>'email' AS email,\n    zsgo_dados->'data'->'billing'->>'exemption_code' AS exemption_code,\n    zsgo_dados->'data'->'address'->>'region_code' AS region_code,\n    zsgo_dados->'data'->'address'->>'address' AS morada,\n    zsgo_dados->'data'->'address'->>'postal_code' AS codigo_postal,\n    zsgo_dados->'data'->'address'->>'city' AS cidade,\n    zsgo_dados->'data'->'address'->>'country_code' AS pais\nFROM zsgo_client_sync\nORDER BY atualizado_em DESC\n";

      try (
         Statement var4 = var1.createStatement();
         ResultSet var5 = var4.executeQuery(var3);
      ) {
         while (var5.next()) {
            ClientListingDao.ClienteResumo var6 = new ClientListingDao.ClienteResumo();
            var6.sourceId = String.valueOf(var5.getLong("user_id"));
            long var7 = var5.getLong("zsgo_code");
            var6.zsgoCode = var5.wasNull() ? null : String.valueOf(var7);
            var6.status = var5.getString("status");
            var6.tentativas = var5.getInt("tentativas");
            var6.ultimoErro = var5.getString("ultimo_erro");
            var6.atualizadoEm = var5.getTimestamp("atualizado_em");
            var6.contentHash = var5.getString("content_hash");
            var6.nome = var5.getString("nome");
            var6.nif = var5.getString("nif");
            var6.email = var5.getString("email");
            var6.exemptionCode = var5.getString("exemption_code");
            var6.regionCode = var5.getString("region_code");
            var6.morada = var5.getString("morada");
            var6.codigoPostal = var5.getString("codigo_postal");
            var6.cidade = var5.getString("cidade");
            var6.pais = var5.getString("pais");
            var2.add(var6);
         }
      }

      return var2;
   }

   public static class ClienteResumo {
      public String sourceId;
      public String zsgoCode;
      public String status;
      public int tentativas;
      public String ultimoErro;
      public String nome;
      public String nif;
      public String email;
      public String exemptionCode;
      public String regionCode;
      public String morada;
      public String codigoPostal;
      public String cidade;
      public String pais;
      public String contentHash;
      public Timestamp atualizadoEm;
   }
}
