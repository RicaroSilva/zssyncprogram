package pt.zsgosync.model;

public class SourceClient {
   public String id;
   public String nome;
   public String nif;
   public String morada;
   public String codigoPostal;
   public String cidade;
   public String pais;
   public String email;
   public String telefone;
   public Integer prazoDias;
   public Boolean isentoSelo;
   public String taxaIvaPercentagem;
   public String motivoIsencao;
   public String motivoIsencaoZsgoCode;
   public String contentHash;

   @Override
   public String toString() {
      return "SourceClient{id='"
         + this.id
         + "', nome='"
         + this.nome
         + "', nif='"
         + this.nif
         + "', morada='"
         + this.morada
         + "', codigoPostal='"
         + this.codigoPostal
         + "', cidade='"
         + this.cidade
         + "', pais='"
         + this.pais
         + "', email='"
         + this.email
         + "', telefone='"
         + this.telefone
         + "', prazoDias="
         + this.prazoDias
         + ", isentoSelo="
         + this.isentoSelo
         + ", taxaIvaPercentagem='"
         + this.taxaIvaPercentagem
         + "', motivoIsencao='"
         + this.motivoIsencao
         + "', motivoIsencaoZsgoCode='"
         + this.motivoIsencaoZsgoCode
         + "'}";
   }
}
