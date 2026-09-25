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
      String var3 = """
         SELECT
             s.user_id, s.zsgo_code, s.status, s.tentativas, s.ultimo_erro, s.atualizado_em, s.content_hash,
             COALESCE(s.zsgo_dados->'data'->'identity'->>'name', u.name) AS nome,
             s.zsgo_dados->'data'->'identity'->>'tax_id' AS nif,
             s.zsgo_dados->'data'->'settings'->>'email' AS email,
             s.zsgo_dados->'data'->'billing'->>'exemption_code' AS exemption_code,
             s.zsgo_dados->'data'->'address'->>'region_code' AS region_code,
             s.zsgo_dados->'data'->'address'->>'address' AS morada,
             s.zsgo_dados->'data'->'address'->>'postal_code' AS codigo_postal,
             s.zsgo_dados->'data'->'address'->>'city' AS cidade,
             s.zsgo_dados->'data'->'address'->>'country_code' AS pais
         FROM zsgo_client_sync s
         -- nome do Cyclos para os clientes que ainda não foram criados no ZSGO
         LEFT JOIN public.users u ON u.id = s.user_id
         ORDER BY s.atualizado_em DESC
         """;

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
