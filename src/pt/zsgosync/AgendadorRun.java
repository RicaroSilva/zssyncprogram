package pt.zsgosync;

import java.net.InetAddress;
import java.sql.Connection;
import java.sql.DriverManager;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.TarefaDao;
import pt.zsgosync.service.TarefasService;
import pt.zsgosync.util.Erros;

/**
 * Agendador: fica a correr numa janela (agendador.bat) e, de 30 em 30
 * segundos, vê que tarefas agendadas estão na hora e corre-as. As tarefas
 * (ligar/desligar, hora) configuram-se no painel, separador "Tarefas
 * agendadas". Para parar, basta fechar a janela.
 */
public class AgendadorRun {
   private static final DateTimeFormatter HORA = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");

   public static void main(String[] args) {
      String ficheiro = args.length > 0 ? args[0] : "config.properties";
      String maquina;
      try {
         maquina = InetAddress.getLocalHost().getHostName();
      } catch (Exception e) {
         maquina = "desconhecida";
      }

      escrever("=====================================================");
      escrever(" Agendador ZSGO — deixa esta janela aberta.");
      escrever(" As tarefas configuram-se no painel (Tarefas agendadas).");
      escrever(" Para parar o agendador, fecha esta janela.");
      escrever("=====================================================");

      // Sinal de vida à parte, para o painel continuar a ver o agendador
      // "ligado" mesmo enquanto uma tarefa demorada está a correr.
      final String nomeMaquina = maquina;
      Thread sinal = new Thread(() -> {
         while (true) {
            try {
               Thread.sleep(20000L);
               AppConfig cfg = new AppConfig(ficheiro);
               try (Connection c = DriverManager.getConnection(cfg.get("db.url"), cfg.get("db.user"), cfg.get("db.password"))) {
                  new TarefaDao().batimento(c, nomeMaquina, false);
               }
            } catch (InterruptedException e) {
               return;
            } catch (Exception e) {
               // sem ligação à BD: tenta no próximo ciclo
            }
         }
      }, "agendador-sinal");
      sinal.setDaemon(true);
      sinal.start();

      boolean primeiro = true;
      TarefaDao dao = new TarefaDao();
      while (true) {
         try {
            AppConfig cfg = new AppConfig(ficheiro);
            List<TarefaDao.Tarefa> tarefas;
            try (Connection c = DriverManager.getConnection(cfg.get("db.url"), cfg.get("db.user"), cfg.get("db.password"))) {
               dao.ensureTableExists(c);
               dao.batimento(c, maquina, primeiro);
               tarefas = dao.listar(c);
            }
            if (primeiro) {
               for (TarefaDao.Tarefa t : tarefas) {
                  LocalDateTime p = TarefasService.proximaExecucao(t, LocalDateTime.now());
                  escrever("  " + TarefasService.nome(t.codigo) + ": " + (t.ativa ? "ligada, próxima em " + (p != null ? p.format(HORA) : "—") : "desligada"));
               }
               escrever("À espera da próxima tarefa...");
               primeiro = false;
            }
            for (TarefaDao.Tarefa t : tarefas) {
               if (TarefasService.estaNaHora(t, LocalDateTime.now())) {
                  escrever(">> A iniciar: " + TarefasService.nome(t.codigo));
                  try {
                     String r = TarefasService.executar(cfg, t.codigo, "agendador", (texto, atual, total) -> {});
                     escrever("   Concluída: " + r);
                  } catch (Exception e) {
                     escrever("   FALHOU: " + Erros.descrever(e));
                  }
               }
            }
         } catch (Exception e) {
            escrever("Erro no agendador (tenta outra vez daqui a 30 s): " + Erros.descrever(e));
         }
         try {
            Thread.sleep(30000L);
         } catch (InterruptedException e) {
            return;
         }
      }
   }

   private static void escrever(String texto) {
      System.out.println("[" + LocalDateTime.now().format(HORA) + "] " + texto);
   }
}
