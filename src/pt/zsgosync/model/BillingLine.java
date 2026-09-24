package pt.zsgosync.model;

import java.math.BigDecimal;

public class BillingLine {
   public String clienteId;
   public String zsgoCode;
   public String rubrica;
   public String productReference;
   public long nrTransacoes;
   public BigDecimal valorTotal;
   public String descricaoLinha;
   public String contaOrigemId;
   public String contaOrigemNome;
}
