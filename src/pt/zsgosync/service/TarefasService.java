package pt.zsgosync.service;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import pt.zsgosync.ClientListingRun;
import pt.zsgosync.FaturacaoPreviewRun;
import pt.zsgosync.HistoricoRun;
import pt.zsgosync.Main;
import pt.zsgosync.MonthlyInvoiceRun;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.TarefaDao;
import pt.zsgosync.progress.ProgressListener;
import pt.zsgosync.progress.StatusListener;
import pt.zsgosync.util.Erros;

/**
 * O que cada tarefa agendada faz e quando deve correr. Usado pelo
 * agendador (AgendadorRun) e pelo botão "Executar agora" do painel.
 */
public class TarefasService {

   public static String nome(String codigo) {
      return switch (codigo) {
         case TarefaDao.SINCRONIZAR_CLIENTES -> "Sincronizar clientes novos";
         case TarefaDao.ATUALIZAR_CLIENTES -> "Atualizar dados dos clientes";
         case TarefaDao.FATURACAO_MENSAL -> "Faturação mensal";
         default -> codigo;
      };
   }

   public static String descricao(String codigo) {
      return switch (codigo) {
         case TarefaDao.SINCRONIZAR_CLIENTES -> "Cria no ZSGO os clientes novos (ou que ficaram com erro) do Cyclos.";
         case TarefaDao.ATUALIZAR_CLIENTES -> "Procura clientes cujos dados mudaram no Cyclos e reenvia-os ao ZSGO.";
         case TarefaDao.FATURACAO_MENSAL -> "Gera as faturas e notas de crédito do mês anterior que ainda faltam "
            + "(antes cria no ZSGO os clientes que ainda não existem lá).";
         default -> "";
      };
   }

   /** A tarefa deve correr agora? (ativa, já passou a hora de hoje e ainda não correu desde essa hora). */
   public static boolean estaNaHora(TarefaDao.Tarefa t, LocalDateTime agora) {
      if (!t.ativa) {
         return false;
      }
      LocalDateTime marcada = marcadaPara(t, agora.toLocalDate());
      if (marcada == null || agora.isBefore(marcada)) {
         return false;
      }
      return t.ultimaExecucao == null || t.ultimaExecucao.toLocalDateTime().isBefore(marcada);
   }

   /** Próxima vez que a tarefa vai correr (null se estiver desligada). */
   public static LocalDateTime proximaExecucao(TarefaDao.Tarefa t, LocalDateTime agora) {
      if (!t.ativa) {
         return null;
      }
      if (estaNaHora(t, agora)) {
         return agora;
      }
      for (int i = 0; i < 62; i++) {
         LocalDateTime m = marcadaPara(t, agora.toLocalDate().plusDays(i));
         if (m != null && m.isAfter(agora) && (t.ultimaExecucao == null || t.ultimaExecucao.toLocalDateTime().isBefore(m))) {
            return m;
         }
      }
      return null;
   }

   private static LocalDateTime marcadaPara(TarefaDao.Tarefa t, LocalDate dia) {
      if (t.diaMes != null) {
         // Dia 31 num mês de 30 dias corre no último dia do mês.
         int alvo = Math.min(t.diaMes, dia.lengthOfMonth());
         if (dia.getDayOfMonth() != alvo) {
            return null;
         }
      }
      return dia.atTime(hora(t.hora));
   }

   public static LocalTime hora(String hhmm) {
      try {
         return LocalTime.parse(hhmm.length() == 4 ? "0" + hhmm : hhmm);
      } catch (Exception e) {
         return LocalTime.of(7, 0);
      }
   }

   /**
    * Corre a tarefa (se não estiver já a correr noutro lado), grava o
    * resultado na tarefa e no Histórico e devolve o resumo.
    */
   public static String executar(AppConfig cfg, String codigo, String quem, StatusListener estado) throws Exception {
      TarefaDao dao = new TarefaDao();
      try (Connection c = ligar(cfg)) {
         dao.ensureTableExists(c);
         if (!dao.reservar(c, codigo)) {
            return "Já está a correr noutro lado — ignorado.";
         }
      }

      String resultado;
      String situacao = "OK";
      try {
         resultado = correr(cfg, codigo, estado);
      } catch (Exception e) {
         situacao = "ERRO";
         resultado = Erros.descrever(e);
      }

      try (Connection c = ligar(cfg)) {
         dao.concluir(c, codigo, situacao, resultado);
      }
      HistoricoRun.registar(cfg, quem, "TAREFA_" + codigo, nome(codigo) + ": " + ("OK".equals(situacao) ? resultado : "FALHOU — " + resultado));
      if ("ERRO".equals(situacao)) {
         throw new Exception(resultado);
      }
      return resultado;
   }

   private static String correr(AppConfig cfg, String codigo, StatusListener estado) throws Exception {
      switch (codigo) {
         case TarefaDao.SINCRONIZAR_CLIENTES: {
            Contador k = new Contador(estado, "A sincronizar clientes");
            Main.runClientSync(cfg, k);
            return k.ok + " cliente(s) criado(s) no ZSGO, " + k.falhados + " com erro.";
         }
         case TarefaDao.ATUALIZAR_CLIENTES: {
            List<ClientVerifyService.ClienteDesatualizado> mudaram = ClientListingRun.verificar(cfg, estado);
            if (mudaram.isEmpty()) {
               return "Nenhum cliente com dados alterados.";
            }
            int[] r = ClientListingRun.aplicarAtualizacoes(cfg, mudaram, estado);
            return mudaram.size() + " cliente(s) com dados alterados: " + r[0] + " atualizado(s) no ZSGO, " + r[1] + " com erro.";
         }
         case TarefaDao.FATURACAO_MENSAL: {
            YearMonth mes = YearMonth.now().minusMonths(1L);
            estado.aoAtualizarEstado("A preparar a faturação de " + mes.getMonthValue() + "/" + mes.getYear() + "...", -1, -1);
            FaturacaoPreviewService.Preview p = FaturacaoPreviewRun.obter(cfg, mes.getYear(), mes.getMonthValue());
            String clientes = "";
            if (!p.idsSemZsgoCode.isEmpty()) {
               int[] s = ClientListingRun.sincronizarEspecificos(cfg, p.idsSemZsgoCode, estado);
               clientes = s[0] + " cliente(s) criado(s) antes de faturar (" + s[1] + " com erro). ";
            }
            Contador f = new Contador(estado, "Faturas");
            Contador n = new Contador(estado, "Notas de crédito");
            MonthlyInvoiceRun.run(cfg, mes.getYear(), mes.getMonthValue(), f, n);
            return clientes + "Faturação de " + mes.getMonthValue() + "/" + mes.getYear() + ": " + f.ok + " fatura(s) criada(s)"
               + (f.valor.signum() != 0 ? " (" + f.valor + " €)" : "") + ", " + f.ignorados + " já feita(s), " + f.falhados + " com erro; "
               + n.ok + " nota(s) de crédito, " + n.falhados + " com erro.";
         }
         default:
            throw new IllegalArgumentException("Tarefa desconhecida: " + codigo);
      }
   }

   private static Connection ligar(AppConfig cfg) throws Exception {
      return DriverManager.getConnection(cfg.get("db.url"), cfg.get("db.user"), cfg.get("db.password"));
   }

   /** Conta os resultados de um serviço e passa o progresso para o StatusListener. */
   private static class Contador implements ProgressListener {
      final StatusListener estado;
      final String fase;
      int ok;
      int ignorados;
      int falhados;
      BigDecimal valor = BigDecimal.ZERO;

      Contador(StatusListener estado, String fase) {
         this.estado = estado;
         this.fase = fase;
      }

      @Override
      public void aoIniciar(int total) {
         this.estado.aoAtualizarEstado(this.fase + ": 0 / " + total, 0, Math.max(total, 1));
      }

      @Override
      public void aoProgredir(int feitos, int total) {
         this.estado.aoAtualizarEstado(this.fase + ": " + feitos + " / " + total, feitos, Math.max(total, 1));
      }

      @Override
      public void aoItemFalhar(String id, String erro) {
      }

      @Override
      public void aoConcluir(int ok, int ignorados, int falhados, BigDecimal valor) {
         this.ok = ok;
         this.ignorados = ignorados;
         this.falhados = falhados;
         this.valor = valor != null ? valor : BigDecimal.ZERO;
      }
   }
}
