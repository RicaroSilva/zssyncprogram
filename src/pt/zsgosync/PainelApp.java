package pt.zsgosync;

import java.awt.BorderLayout;
import java.awt.CardLayout;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.GridLayout;
import java.awt.Image;
import java.awt.RenderingHints;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.math.BigDecimal;
import java.net.URL;
import java.text.NumberFormat;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.ImageIcon;
import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JMenuItem;
import javax.swing.JPanel;
import javax.swing.JPopupMenu;
import javax.swing.JProgressBar;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import javax.swing.border.Border;
import javax.swing.border.EmptyBorder;
import javax.swing.border.MatteBorder;
import javax.swing.border.TitledBorder;
import javax.swing.plaf.basic.BasicButtonUI;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.AppUserDao;
import pt.zsgosync.progress.ProgressListener;
import pt.zsgosync.progress.StatusListener;
import pt.zsgosync.service.ClientVerifyService;
import pt.zsgosync.service.DashboardService;
import pt.zsgosync.service.FaturacaoPreviewService;
import pt.zsgosync.service.RelatorioService;
import pt.zsgosync.ui.PainelClientes;
import pt.zsgosync.ui.PainelDescobrirLimite;
import pt.zsgosync.ui.PainelExecucao;
import pt.zsgosync.ui.PainelFaturacao;
import pt.zsgosync.ui.PainelHistorico;
import pt.zsgosync.ui.PainelLogin;
import pt.zsgosync.ui.PainelResumo;
import pt.zsgosync.ui.PainelSidebar;
import pt.zsgosync.ui.PainelUtilizadores;
import pt.zsgosync.ui.Tema;

public class PainelApp extends JFrame implements Tema.TemaOuvinte {
   private final JButton btnSincronizar = this.criarBotaoDourado("Sincronizar clientes agora");
   private final JButton btnFaturar = this.criarBotaoDourado("Gerar faturas em falta");
   private final JButton btnFerramentas = new JButton("Ferramentas ▾");
   private final JButton btnTema = new JButton();
   private final JButton btnTestarLigacao = new JButton("Testar ligação");
   private final JButton btnDescobrirLimite = new JButton("Descobrir limite");
   private final PainelExecucao painelClientes = new PainelExecucao();
   private final PainelClientes painelClientesLista = new PainelClientes();
   private final JButton btnAtualizarClientes = this.criarBotaoDourado("Atualizar lista");
   private final JButton btnVerificarAlteracoes = this.criarBotaoDourado("Verificar alterações (todos)");
   private final JLabel labelEstadoVerificacao = new JLabel(" ");
   private final JProgressBar progressoVerificacao = new JProgressBar();
   private final JLabel labelEstadoFaturacao = new JLabel(" ");
   private final JProgressBar progressoFaturacao = new JProgressBar();
   private final AppConfig appConfigInicial;
   private final AppUserDao.Usuario usuarioAtual;
   private final JLabel labelSessao = new JLabel(" ");
   private final JButton btnSair = new JButton("Terminar sessão");
   private final JButton btnGerirUtilizadores = new JButton("Gerir utilizadores");
   private final PainelHistorico painelHistorico = new PainelHistorico();
   private final JButton btnAtualizarHistorico = this.criarBotaoDourado("Atualizar");
   private final PainelResumo painelResumo = new PainelResumo();
   private static final String ID_RESUMO = "resumo";
   private static final String ID_SINCRONIZAR = "sincronizar";
   private static final String ID_FATURACAO = "faturacao";
   private static final String ID_RELATORIO = "relatorio";
   private static final String ID_CLIENTES = "clientes";
   private static final String ID_HISTORICO = "historico";
   private JPanel abaResumo;
   private JPanel abaHistorico;
   private JPanel header;
   private JPanel corpo;
   private final PainelSidebar sidebar = this.criarSidebar();
   private final CardLayout cardLayout = new CardLayout();
   private final JPanel conteudo = new JPanel(this.cardLayout);
   private JPanel abaClientes;
   private JPanel abaFaturacao;
   private PainelFaturacao painelFaturacao;
   private JPanel abaListaClientes;
   private JPanel wrapperClientes;
   private JLabel infoClientes;

   private static YearMonth mesAnteriorPadrao() {
      return YearMonth.now().minusMonths(1L);
   }

   public PainelApp(AppConfig var1, AppUserDao.Usuario var2) {
      super("Lusopay — Painel ZSGO");
      this.appConfigInicial = var1;
      this.usuarioAtual = var2;
      this.setDefaultCloseOperation(0);
      this.addWindowListener(new WindowAdapter() {
         @Override
         public void windowClosing(WindowEvent var1) {
            HistoricoRun.registar(PainelApp.this.appConfigInicial, PainelApp.this.usuarioAtual.username, "LOGOUT", "Sessão terminada (fechou a janela).");
            System.exit(0);
         }
      });
      this.setSize(1280, 800);
      this.setMinimumSize(new Dimension(1100, 700));
      this.setLocationRelativeTo(null);
      // As tabelas de faturação têm muitas colunas: abre a ocupar o ecrã todo.
      this.setExtendedState(JFrame.MAXIMIZED_BOTH);
      this.setLayout(new BorderLayout());
      this.header = this.montarCabecalho();
      this.add(this.header, "North");
      this.abaResumo = this.painelResumo;
      this.painelResumo.aoMudarMes(var1x -> this.carregarResumo());
      this.abaClientes = this.montarAbaClientes();
      this.abaFaturacao = this.montarAbaFaturacao();
      this.abaListaClientes = this.montarAbaListaClientes();
      this.abaHistorico = this.montarAbaHistorico();
      this.conteudo.setOpaque(false);
      this.conteudo.add(this.abaResumo, "resumo");
      this.conteudo.add(this.abaClientes, "sincronizar");
      this.conteudo.add(this.abaFaturacao, "faturacao");
      this.conteudo.add(this.abaListaClientes, "clientes");
      this.conteudo.add(this.abaHistorico, "historico");
      this.sidebar.aoSelecionar(var1x -> {
         this.cardLayout.show(this.conteudo, var1x);
         if ("resumo".equals(var1x)) {
            this.carregarResumo();
         } else if ("faturacao".equals(var1x)) {
            this.painelFaturacao.recarregar();
         }
      });
      this.corpo = new JPanel(new BorderLayout());
      this.corpo.add(this.sidebar, "West");
      JPanel var3 = new JPanel(new BorderLayout());
      var3.setBorder(new EmptyBorder(0, 18, 18, 18));
      var3.setOpaque(false);
      var3.add(this.conteudo, "Center");
      this.corpo.add(var3, "Center");
      this.add(this.corpo, "Center");
      Tema.registar(this);
      this.aoMudarTema();
      this.sidebar.selecionar("resumo");
      this.carregarHistorico();
      this.carregarResumo();
   }

   private PainelSidebar criarSidebar() {
      ArrayList var1 = new ArrayList();
      var1.add(new PainelSidebar.Item("resumo", "resumo", "Resumo"));
      var1.add(new PainelSidebar.Item("sincronizar", "sincronizar", "Sincronizar Clientes"));
      var1.add(new PainelSidebar.Item("faturacao", "faturacao", "Faturação"));
      var1.add(new PainelSidebar.Item("clientes", "clientes", "Clientes"));
      var1.add(new PainelSidebar.Item("historico", "historico", "Histórico"));
      return new PainelSidebar(var1);
   }

   private void carregarResumo() {
      new Thread(() -> {
         try {
            YearMonth var1 = this.painelResumo.getMes();
            DashboardService.Resumo var2 = DashboardRun.obter(this.appConfigInicial, var1);
            SwingUtilities.invokeLater(() -> this.painelResumo.mostrar(var2));
         } catch (Exception var3) {
            var3.printStackTrace();
         }
      }, "carregar-resumo").start();
   }

   private JPanel montarCabecalho() {
      JPanel var2 = new JPanel(new BorderLayout());
      var2.setPreferredSize(new Dimension(10, 72));
      JPanel var3 = new JPanel(new FlowLayout(0, 20, 10));
      var3.setOpaque(false);
      URL var4 = PainelApp.class.getResource("/logo-lusopay.png");
      if (var4 != null) {
         ImageIcon var1 = new ImageIcon(var4);
         Image var5 = var1.getImage().getScaledInstance(-1, 36, 4);
         var3.add(new JLabel(new ImageIcon(var5)));
      }

      var2.add(var3, "West");
      JPanel var6 = new JPanel(new FlowLayout(2, 20, 10));
      var6.setOpaque(false);
      this.labelSessao.setFont(Tema.FONT_BASE.deriveFont(12.0F));
      this.labelSessao.setText("Sessão: " + this.usuarioAtual.username + " (" + this.usuarioAtual.role + ")");
      var6.add(this.labelSessao);
      JPopupMenu var7 = new JPopupMenu();
      if (this.usuarioAtual.isAdmin()) {
         JMenuItem var8 = new JMenuItem("Gerir utilizadores");
         var8.addActionListener(var1x -> this.abrirGerirUtilizadores());
         var7.add(var8);
      }

      JMenuItem var9 = new JMenuItem("Testar ligação (base de dados e ZSGO)");
      var9.addActionListener(var1x -> this.testarLigacao());
      var7.add(var9);
      JMenuItem var10 = new JMenuItem("Descobrir limite de pedidos do ZSGO");
      var10.addActionListener(var1x -> this.abrirDescobrirLimite());
      var7.add(var10);
      this.btnFerramentas.setFocusPainted(false);
      this.btnFerramentas.setCursor(Cursor.getPredefinedCursor(12));
      this.btnFerramentas.addActionListener(var1x -> var7.show(this.btnFerramentas, 0, this.btnFerramentas.getHeight()));
      var6.add(this.btnFerramentas);
      this.btnTema.setFocusPainted(false);
      this.btnTema.setCursor(Cursor.getPredefinedCursor(12));
      this.btnTema.addActionListener(var0 -> Tema.alternar());
      var6.add(this.btnTema);
      this.btnSair.setFocusPainted(false);
      this.btnSair.setCursor(Cursor.getPredefinedCursor(12));
      this.btnSair.addActionListener(var1x -> this.terminarSessao());
      var6.add(this.btnSair);
      var2.add(var6, "East");
      return var2;
   }

   private void abrirGerirUtilizadores() {
      PainelUtilizadores var1 = new PainelUtilizadores(this, this.appConfigInicial, this.usuarioAtual.username);
      var1.setVisible(true);
      this.carregarHistorico();
   }

   private void terminarSessao() {
      int var1 = JOptionPane.showConfirmDialog(this, "Terminar a sessão atual?", "Terminar sessão", 0);
      if (var1 == 0) {
         HistoricoRun.registar(this.appConfigInicial, this.usuarioAtual.username, "LOGOUT", "Sessão terminada.");
         this.setDefaultCloseOperation(2);
         this.dispose();
         abrirComLogin(this.appConfigInicial);
      }
   }

   private void testarLigacao() {
      this.correrEmBackground(
         this.btnFerramentas,
         () -> {
            AppConfig var1 = new AppConfig("config.properties");
            ConnectionTestRun.Resultado var2 = ConnectionTestRun.testar(var1);
            SwingUtilities.invokeLater(
               () -> {
                  String var2x = var2.dbOk ? "✅" : "❌";
                  String var3 = var2.zsgoOk ? "✅" : "❌";
                  String var4 = String.format(
                     "%s Base de dados (%dms)\n%s\n\n%s ZSGO (%dms)\n%s", var2x, var2.dbMillis, var2.dbMensagem, var3, var2.zsgoMillis, var2.zsgoMensagem
                  );
                  int var5 = var2.dbOk && var2.zsgoOk ? 1 : 0;
                  JOptionPane.showMessageDialog(this, var4, "Teste de ligação", var5);
               }
            );
         }
      );
   }

   private void abrirDescobrirLimite() {
      AppConfig var1;
      try {
         var1 = new AppConfig("config.properties");
      } catch (Exception var3) {
         JOptionPane.showMessageDialog(this, "Falha ao ler config.properties: " + var3.getMessage(), "Erro", 0);
         return;
      }

      PainelDescobrirLimite var2 = new PainelDescobrirLimite(this, var1);
      var2.setVisible(true);
   }

   private JPanel montarAbaClientes() {
      JPanel var1 = new JPanel(new BorderLayout(10, 12));
      var1.setBorder(new EmptyBorder(18, 4, 4, 4));
      JPanel var2 = new JPanel();
      var2.setLayout(new BoxLayout(var2, 1));
      var2.setOpaque(false);
      this.infoClientes = new JLabel("Lê os clientes novos ou pendentes da base de dados e cria-os no ZSGO.");
      this.infoClientes.setFont(Tema.FONT_BASE);
      this.infoClientes.setAlignmentX(0.0F);
      JPanel var3 = new JPanel(new FlowLayout(0, 0, 10));
      var3.setOpaque(false);
      var3.setAlignmentX(0.0F);
      var3.add(this.btnSincronizar);
      var2.add(this.infoClientes);
      var2.add(var3);
      var1.add(var2, "North");
      this.wrapperClientes = new JPanel(new BorderLayout());
      this.wrapperClientes.setOpaque(false);
      this.wrapperClientes.add(this.painelClientes, "Center");
      var1.add(this.wrapperClientes, "Center");
      this.btnSincronizar.addActionListener(var1x -> this.correrEmBackground(this.btnSincronizar, () -> {
         final AppConfig var1xx = new AppConfig("config.properties");
         final ProgressListener var2x = this.painelClientes.criarListener("Sincronização de clientes");
         ProgressListener var3x = new ProgressListener() {
            @Override
            public void aoIniciar(int var1x) {
               var2x.aoIniciar(var1x);
            }

            @Override
            public void aoProgredir(int var1x, int var2xx) {
               var2x.aoProgredir(var1x, var2xx);
            }

            @Override
            public void aoItemFalhar(String var1x, String var2xx) {
               var2x.aoItemFalhar(var1x, var2xx);
            }

            @Override
            public void aoConcluir(int var1x, int var2xx, int var3xx, BigDecimal var4) {
               var2x.aoConcluir(var1x, var2xx, var3xx, var4);
               HistoricoRun.registar(var1xx, PainelApp.this.usuarioAtual.username, "SINCRONIZAR_CLIENTES", var1x + " sincronizado(s), " + var3xx + " com erro.");
               PainelApp.this.carregarResumo();
            }
         };
         this.painelClientes.limparErros();
         Main.runClientSync(var1xx, var3x);
      }));
      return var1;
   }

   private JPanel montarAbaFaturacao() {
      this.painelFaturacao = new PainelFaturacao(() -> {
         try {
            return new AppConfig("config.properties");
         } catch (java.io.IOException var1x) {
            throw new java.io.UncheckedIOException("Não foi possível ler o config.properties", var1x);
         }
      }, this.btnFaturar, this.labelEstadoFaturacao, this.progressoFaturacao);
      this.btnFaturar.setToolTipText("Cria no ZSGO as faturas e notas de crédito do mês que ainda não foram feitas (as já feitas são ignoradas).");
      this.btnFaturar.addActionListener(var1x -> {
         YearMonth var2x = this.painelFaturacao.getMesSelecionado();
         this.iniciarFaturacaoComResumo(var2x.getYear(), var2x.getMonthValue());
      });
      return this.painelFaturacao;
   }

   private void iniciarFaturacaoComResumo(int var1, int var2) {
      this.btnFaturar.setEnabled(false);
      String var3 = this.btnFaturar.getText();
      this.btnFaturar.setText("A calcular resumo...");
      StatusListener var4 = this.criarStatusListenerFaturacao();
      var4.aoAtualizarEstado("A ligar à base de dados...", -1, -1);
      new Thread(
            () -> {
               try {
                  AppConfig var5 = new AppConfig("config.properties");
                  var4.aoAtualizarEstado("A calcular quantos clientes/notas de crédito vão ser processados (pode demorar um pouco)...", -1, -1);
                  FaturacaoPreviewService.Preview var6 = FaturacaoPreviewRun.obter(var5, var1, var2);
                  var4.aoAtualizarEstado(
                     "Resumo pronto — " + var6.clientesAFaturar + " cliente(s) a faturar, " + var6.notasCreditoAEmitir + " nota(s) de crédito.", 1, 1
                  );
                  SwingUtilities.invokeLater(() -> {
                     this.btnFaturar.setText(var3);
                     if (!var6.idsSemZsgoCode.isEmpty()) {
                        this.oferecerSincronizarSemZsgoCode(var5, var1, var2, var6);
                     } else {
                        this.continuarComResumoOuFaturar(var5, var1, var2, var6);
                     }
                  });
               } catch (Exception var7) {
                  var4.aoAtualizarEstado("Falhou: " + var7.getMessage(), 0, 1);
                  SwingUtilities.invokeLater(() -> {
                     this.btnFaturar.setEnabled(true);
                     this.btnFaturar.setText(var3);
                     JOptionPane.showMessageDialog(this, "Falha ao calcular o resumo da faturação: " + var7.getMessage(), "Erro", 0);
                  });
               }
            },
            "preview-faturacao"
         )
         .start();
   }

   private StatusListener criarStatusListenerFaturacao() {
      return (var1, var2, var3) -> SwingUtilities.invokeLater(() -> this.painelFaturacao.mostrarEstado(var1, var2, var3));
   }

   private void oferecerSincronizarSemZsgoCode(AppConfig var1, int var2, int var3, FaturacaoPreviewService.Preview var4) {
      String[] var5 = new String[]{"Sincronizar agora", "Ignorar por agora", "Cancelar"};
      StringBuilder var6 = new StringBuilder();
      var6.append(var4.idsSemZsgoCode.size()).append(" cliente(s) não têm zsgo_code e vão falhar na faturação / notas de crédito");
      if (!var4.exemplosSemZsgoCode.isEmpty()) {
         var6.append(" (ex: ").append(String.join(", ", var4.exemplosSemZsgoCode));
         if (var4.idsSemZsgoCode.size() > var4.exemplosSemZsgoCode.size()) {
            var6.append(", ...");
         }

         var6.append(")");
      }

      var6.append(".\n\nQueres sincronizá-los com o ZSGO agora, antes de continuar?");
      int var7 = JOptionPane.showOptionDialog(this, var6.toString(), "Clientes sem zsgo_code", 1, 2, null, var5, var5[0]);
      if (var7 == 2 || var7 == -1) {
         this.btnFaturar.setEnabled(true);
      } else if (var7 != 0) {
         this.continuarComResumoOuFaturar(var1, var2, var3, var4);
      } else {
         this.correrEmBackground(
            this.btnFaturar,
            () -> {
               StatusListener var5x = this.criarStatusListenerFaturacao();
               int[] var6x = ClientListingRun.sincronizarEspecificos(var1, var4.idsSemZsgoCode, var5x);
               HistoricoRun.registar(
                  var1,
                  this.usuarioAtual.username,
                  "SINCRONIZAR_CLIENTES_SEM_ZSGO_CODE",
                  var6x[0] + " criado(s) no ZSGO, " + var6x[1] + " com erro (a partir do resumo de faturação)."
               );
               this.carregarResumo();
               FaturacaoPreviewService.Preview var7x = FaturacaoPreviewRun.obter(var1, var2, var3);
               SwingUtilities.invokeLater(() -> {
                  this.btnFaturar.setEnabled(true);
                  JOptionPane.showMessageDialog(this, var6x[0] + " cliente(s) criado(s) no ZSGO, " + var6x[1] + " com erro.", "Sincronização concluída", 1);
                  this.continuarComResumoOuFaturar(var1, var2, var3, var7x);
               });
            }
         );
      }
   }

   private void continuarComResumoOuFaturar(AppConfig var1, int var2, int var3, FaturacaoPreviewService.Preview var4) {
      boolean var5 = this.mostrarResumoFaturacao(var2, var3, var4);
      if (var5) {
         this.executarFaturacaoReal(var1, var2, var3, var4);
      } else {
         this.btnFaturar.setEnabled(true);
      }
   }

   private void executarFaturacaoReal(AppConfig var1, int var2, int var3, FaturacaoPreviewService.Preview var4) {
      this.correrEmBackground(
         this.btnFaturar,
         () -> {
            ProgressListener var5 = this.painelFaturacao.criarListener("Faturas");
            ProgressListener var6 = this.painelFaturacao.criarListener("Notas de crédito");
            this.painelFaturacao.iniciarAtualizacaoAoVivo();
            try {
               MonthlyInvoiceRun.run(var1, var2, var3, var5, var6);
            } finally {
               this.painelFaturacao.pararAtualizacaoAoVivo();
               SwingUtilities.invokeLater(() -> this.painelFaturacao.recarregarMantendoEstado());
            }
            HistoricoRun.registar(
               var1,
               this.usuarioAtual.username,
               "GERAR_FATURACAO_MENSAL",
               "Faturação de "
                  + var3
                  + "/"
                  + var2
                  + " executada ("
                  + var4.clientesAFaturar
                  + " cliente(s), "
                  + var4.notasCreditoAEmitir
                  + " nota(s) de crédito previstas)."
            );
            this.carregarResumo();
         }
      );
   }

   private boolean mostrarResumoFaturacao(int var1, int var2, FaturacaoPreviewService.Preview var3) {
      NumberFormat var4 = NumberFormat.getCurrencyInstance(new Locale("pt", "PT"));
      StringBuilder var5 = new StringBuilder();
      var5.append("Resumo da faturação de ").append(var2).append("/").append(var1).append(":\n\n");
      var5.append("FATURAS\n");
      var5.append("  • ")
         .append(var3.clientesAFaturar)
         .append(" cliente(s) vão ser faturados agora — valor estimado: ")
         .append(var4.format(var3.valorAFaturar))
         .append("\n");
      var5.append("  • ").append(var3.clientesJaFaturados).append(" já estavam faturados (vão ser ignorados)\n");
      if (var3.clientesSemZsgoCode > 0) {
         var5.append("  • ").append(var3.clientesSemZsgoCode).append(" NÃO têm zsgo_code e VÃO FALHAR");
         if (!var3.exemplosSemZsgoCode.isEmpty()) {
            var5.append(" (ex: ").append(String.join(", ", var3.exemplosSemZsgoCode));
            if (var3.clientesSemZsgoCode > var3.exemplosSemZsgoCode.size()) {
               var5.append(", ...");
            }

            var5.append(")");
         }

         var5.append("\n");
      }

      if (var3.clientesEsgotados > 0) {
         var5.append("  • ").append(var3.clientesEsgotados).append(" já esgotaram as tentativas (vão ser ignorados)\n");
      }

      var5.append("\nNOTAS DE CRÉDITO\n");
      var5.append("  • ")
         .append(var3.notasCreditoAEmitir)
         .append(" vão ser emitidas agora — valor estimado: ")
         .append(var4.format(var3.valorNotasCreditoAEmitir))
         .append("\n");
      var5.append("  • ").append(var3.notasCreditoJaEmitidas).append(" já estavam emitidas (vão ser ignoradas)\n");
      if (var3.notasCreditoSemZsgoCode > 0) {
         var5.append("  • ").append(var3.notasCreditoSemZsgoCode).append(" são de clientes SEM zsgo_code e VÃO FALHAR\n");
      }
      if (var3.clientesAFaturar == 0 && var3.notasCreditoAEmitir == 0) {
         var5.append("\nNão há nada por faturar/emitir este mês com os dados atuais.\n");
      }

      var5.append("\nDeseja continuar com a faturação mensal de ").append(var2).append("/").append(var1).append("?");
      int var6 = JOptionPane.showConfirmDialog(this, var5.toString(), "Confirmar faturação mensal", 0, 3);
      return var6 == 0;
   }

   private JPanel montarAbaListaClientes() {
      JPanel var1 = new JPanel(new BorderLayout(10, 12));
      var1.setBorder(new EmptyBorder(18, 4, 4, 4));
      JPanel var2 = new JPanel();
      var2.setLayout(new BoxLayout(var2, 1));
      var2.setOpaque(false);
      JPanel var3 = new JPanel(new FlowLayout(0, 0, 10));
      var3.setOpaque(false);
      var3.add(this.btnAtualizarClientes);
      var3.add(Box.createHorizontalStrut(10));
      var3.add(this.btnVerificarAlteracoes);
      var3.setAlignmentX(0.0F);
      var2.add(var3);
      var2.add(Box.createVerticalStrut(8));
      this.labelEstadoVerificacao.setFont(Tema.FONT_BASE.deriveFont(12.0F));
      this.labelEstadoVerificacao.setAlignmentX(0.0F);
      this.progressoVerificacao.setAlignmentX(0.0F);
      this.progressoVerificacao.setPreferredSize(new Dimension(360, 16));
      this.progressoVerificacao.setMaximumSize(new Dimension(360, 16));
      this.progressoVerificacao.setStringPainted(true);
      var2.add(this.labelEstadoVerificacao);
      var2.add(Box.createVerticalStrut(4));
      var2.add(this.progressoVerificacao);
      var1.add(var2, "North");
      var1.add(this.painelClientesLista, "Center");
      this.btnAtualizarClientes.addActionListener(var1x -> this.correrEmBackground(this.btnAtualizarClientes, () -> {
         AppConfig var1xx = new AppConfig("config.properties");
         List var2x = ClientListingRun.listar(var1xx);
         SwingUtilities.invokeLater(() -> this.painelClientesLista.mostrar(var2x));
      }));
      this.btnVerificarAlteracoes
         .addActionListener(
            var1x -> this.correrEmBackground(
               this.btnVerificarAlteracoes,
               () -> {
                  AppConfig var1xx = new AppConfig("config.properties");
                  StatusListener var2x = this.criarStatusListenerVerificacao();
                  List<ClientVerifyService.ClienteDesatualizado> var3x = ClientListingRun.verificar(var1xx, var2x);
                  List var4 = ClientListingRun.listar(var1xx);
                  HashSet var5 = new HashSet();

                  for (ClientVerifyService.ClienteDesatualizado var7 : var3x) {
                     var5.add(var7.sourceId);
                  }

                  SwingUtilities.invokeLater(
                     () -> {
                        this.painelClientesLista.mostrar(var4, var5);
                        HistoricoRun.registar(
                           var1xx, this.usuarioAtual.username, "VERIFICAR_ALTERACOES_CLIENTES", var3x.size() + " cliente(s) desatualizado(s) encontrado(s)."
                        );
                        if (var3x.isEmpty()) {
                           JOptionPane.showMessageDialog(
                              this, "Nenhuma alteração encontrada — todos os clientes sincronizados estão iguais ao ZSGO.", "Verificação concluída", 1
                           );
                        } else {
                           this.confirmarEAplicarAtualizacoes(var1xx, var3x);
                        }
                     }
                  );
               }
            )
         );
      return var1;
   }

   private StatusListener criarStatusListenerVerificacao() {
      return (var1, var2, var3) -> SwingUtilities.invokeLater(() -> {
         this.labelEstadoVerificacao.setText(var1);
         if (var3 < 0) {
            this.progressoVerificacao.setIndeterminate(true);
            this.progressoVerificacao.setStringPainted(false);
         } else {
            this.progressoVerificacao.setIndeterminate(false);
            this.progressoVerificacao.setStringPainted(true);
            this.progressoVerificacao.setMaximum(Math.max(var3, 1));
            this.progressoVerificacao.setValue(var2);
         }
      });
   }

   private void confirmarEAplicarAtualizacoes(AppConfig var1, List<ClientVerifyService.ClienteDesatualizado> var2) {
      StringBuilder var3 = new StringBuilder();
      var3.append(var2.size()).append(" cliente(s) têm dados diferentes dos que estão no ZSGO:\n\n");
      int var4 = Math.min(var2.size(), 20);

      for (int var5 = 0; var5 < var4; var5++) {
         ClientVerifyService.ClienteDesatualizado var6 = (ClientVerifyService.ClienteDesatualizado)var2.get(var5);
         String var7 = var6.dadosAtuais.nome != null ? var6.dadosAtuais.nome : (var6.nomeAnterior != null ? var6.nomeAnterior : var6.sourceId);
         var3.append("- ").append(var7).append(" (id ").append(var6.sourceId).append(", zsgo ").append(var6.zsgoCode).append(")\n");
      }

      if (var2.size() > var4) {
         var3.append("... e mais ").append(var2.size() - var4).append(".\n");
      }

      var3.append("\nQueres atualizar já estes clientes no ZSGO agora?");
      int var8 = JOptionPane.showConfirmDialog(this, var3.toString(), "Clientes desatualizados", 0, 3);
      if (var8 == 0) {
         this.correrEmBackground(
            this.btnVerificarAlteracoes,
            () -> {
               StatusListener var3x = this.criarStatusListenerVerificacao();
               int[] var4x = ClientListingRun.aplicarAtualizacoes(var1, var2, var3x);
               List var5x = ClientListingRun.listar(var1);
               SwingUtilities.invokeLater(
                  () -> {
                     this.painelClientesLista.mostrar(var5x, new HashSet<>());
                     HistoricoRun.registar(
                        var1,
                        this.usuarioAtual.username,
                        "APLICAR_ATUALIZACOES_CLIENTES",
                        var4x[0] + " cliente(s) atualizado(s) com sucesso, " + var4x[1] + " com erro."
                     );
                     this.carregarResumo();
                     JOptionPane.showMessageDialog(
                        this, var4x[0] + " cliente(s) atualizado(s) com sucesso, " + var4x[1] + " com erro.", "Atualização concluída", 1
                     );
                  }
               );
            }
         );
      }
   }

   private JPanel montarAbaHistorico() {
      JPanel var1 = new JPanel(new BorderLayout(10, 12));
      var1.setBorder(new EmptyBorder(18, 4, 4, 4));
      JPanel var2 = new JPanel(new FlowLayout(0, 0, 10));
      var2.setOpaque(false);
      var2.add(this.btnAtualizarHistorico);
      var1.add(var2, "North");
      var1.add(this.painelHistorico, "Center");
      this.btnAtualizarHistorico.addActionListener(var1x -> this.carregarHistorico());
      return var1;
   }

   private void carregarHistorico() {
      this.correrEmBackground(this.btnAtualizarHistorico, () -> {
         List var1 = HistoricoRun.listar(this.appConfigInicial, 2000);
         SwingUtilities.invokeLater(() -> this.painelHistorico.mostrar(var1));
      });
   }

   private JPanel envolverComRotulo(JLabel var1, JTextField var2) {
      JPanel var3 = new JPanel();
      var3.setLayout(new BoxLayout(var3, 1));
      var3.setOpaque(false);
      var1.setAlignmentX(0.0F);
      var2.setAlignmentX(0.0F);
      var3.add(var1);
      var3.add(Box.createVerticalStrut(4));
      var3.add(var2);
      return var3;
   }

   private JButton criarBotaoDourado(String var1) {
      final JButton var2 = new JButton(var1) {
         @Override
         protected void paintComponent(Graphics var1) {
            Graphics2D var2x = (Graphics2D)var1.create();
            var2x.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            Color var3 = !this.getModel().isPressed() && !this.getModel().isRollover() ? Tema.PRIMARY : Tema.PRIMARY_HOVER;
            var2x.setColor(var3);
            var2x.fillRoundRect(0, 0, this.getWidth(), this.getHeight(), 8, 8);
            var2x.dispose();
            super.paintComponent(var1);
         }
      };
      var2.setUI(new BasicButtonUI());
      var2.setFont(Tema.FONT_BOLD);
      var2.setBorder(new EmptyBorder(10, 20, 10, 20));
      var2.setContentAreaFilled(false);
      var2.setFocusPainted(false);
      var2.setOpaque(false);
      var2.setCursor(Cursor.getPredefinedCursor(12));
      var2.addMouseListener(new MouseAdapter() {
         @Override
         public void mouseEntered(MouseEvent var1) {
            var2.repaint();
         }

         @Override
         public void mouseExited(MouseEvent var1) {
            var2.repaint();
         }
      });
      return var2;
   }

   private JTextField criarCampoTexto(String var1) {
      JTextField var2 = new JTextField(var1, 6);
      var2.setFont(Tema.FONT_BASE);
      var2.setBorder(new EmptyBorder(8, 10, 8, 10));
      return var2;
   }

   @Override
   public void aoMudarTema() {
      boolean var1 = Tema.getModo() == Tema.Modo.CLARO;
      this.btnTema.setText(var1 ? "Modo escuro" : "Modo claro");
      this.btnTema.setBackground(Tema.SURFACE_2);
      this.btnTema.setForeground(Tema.FOREGROUND);
      this.btnTema.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      this.btnFerramentas.setBackground(Tema.SURFACE_2);
      this.btnFerramentas.setForeground(Tema.FOREGROUND);
      this.btnFerramentas.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true), new EmptyBorder(4, 10, 4, 10)));
      this.labelSessao.setForeground(Tema.MUTED_FOREGROUND);
      this.btnSair.setBackground(Tema.SURFACE_2);
      this.btnSair.setForeground(Tema.FOREGROUND);
      this.btnSair.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      this.btnGerirUtilizadores.setBackground(Tema.SURFACE_2);
      this.btnGerirUtilizadores.setForeground(Tema.FOREGROUND);
      this.btnGerirUtilizadores.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      this.abaHistorico.setBackground(Tema.SURFACE);
      this.btnAtualizarHistorico.setForeground(Tema.PRIMARY_FOREGROUND);
      this.getContentPane().setBackground(Tema.BACKGROUND);
      this.header.setBackground(Tema.SURFACE);
      this.header.setBorder(new MatteBorder(0, 0, 1, 0, Tema.BORDER));
      this.corpo.setBackground(Tema.BACKGROUND);
      this.corpo.setOpaque(true);
      this.conteudo.setBackground(Tema.SURFACE);
      this.abaResumo.setBackground(Tema.SURFACE);
      this.abaClientes.setBackground(Tema.SURFACE);
      this.abaFaturacao.setBackground(Tema.SURFACE);
      this.abaListaClientes.setBackground(Tema.SURFACE);
      this.infoClientes.setForeground(Tema.MUTED_FOREGROUND);
      this.labelEstadoVerificacao.setForeground(Tema.MUTED_FOREGROUND);
      this.labelEstadoFaturacao.setForeground(Tema.MUTED_FOREGROUND);
      this.btnSincronizar.setForeground(Tema.PRIMARY_FOREGROUND);
      this.btnFaturar.setForeground(Tema.PRIMARY_FOREGROUND);
      this.btnAtualizarClientes.setForeground(Tema.PRIMARY_FOREGROUND);
      this.btnVerificarAlteracoes.setForeground(Tema.PRIMARY_FOREGROUND);
      Border var2 = BorderFactory.createLineBorder(Tema.BORDER, 1, true);
      this.wrapperClientes.setBorder(var2);
      this.revalidate();
      this.repaint();
   }

   private void estilizarCampo(JTextField var1) {
      var1.setForeground(Tema.FOREGROUND);
      var1.setBackground(Tema.SURFACE_2);
      var1.setCaretColor(Tema.FOREGROUND);
      var1.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true), new EmptyBorder(8, 10, 8, 10)));
   }

   private void aplicarBordaTitulada(JPanel var1, String var2) {
      Border var3 = BorderFactory.createLineBorder(Tema.BORDER, 1, true);
      TitledBorder var4 = BorderFactory.createTitledBorder(var3, var2);
      var4.setTitleFont(Tema.FONT_BOLD);
      var4.setTitleColor(Tema.MUTED_FOREGROUND);
      var1.setBorder(var4);
   }

   private void correrEmBackground(JButton var1, PainelApp.Tarefa var2) {
      var1.setEnabled(false);
      String var3 = var1.getText();
      var1.setText("A correr...");
      new Thread(() -> {
         try {
            var2.correr();
         } catch (Exception var8) {
            SwingUtilities.invokeLater(() -> JOptionPane.showMessageDialog(this, "Ocorreu um erro geral: " + var8.getMessage(), "Erro", 0));
            var8.printStackTrace();
         } finally {
            SwingUtilities.invokeLater(() -> {
               var1.setEnabled(true);
               var1.setText(var3);
            });
         }
      }, "painel-worker").start();
   }

   public static void main(String[] var0) {
      SwingUtilities.invokeLater(() -> {
         AppConfig var0x;
         try {
            var0x = new AppConfig("config.properties");
         } catch (Exception var2) {
            JOptionPane.showMessageDialog(null, "Erro ao ler config.properties: " + var2.getMessage(), "Erro", 0);
            return;
         }

         abrirComLogin(var0x);
      });
   }

   private static void abrirComLogin(AppConfig var0) {
      AppUserDao.Usuario var1 = PainelLogin.mostrarLogin(var0);
      if (var1 != null) {
         HistoricoRun.registar(var0, var1.username, "LOGIN", "Sessão iniciada.");
         PainelApp var2 = new PainelApp(var0, var1);
         var2.setVisible(true);
      }
   }

   private interface Tarefa {
      void correr() throws Exception;
   }
}
