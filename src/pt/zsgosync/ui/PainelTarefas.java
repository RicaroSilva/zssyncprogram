package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.sql.Connection;
import java.sql.DriverManager;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.function.Supplier;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JCheckBox;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JSpinner;
import javax.swing.SpinnerDateModel;
import javax.swing.SpinnerNumberModel;
import javax.swing.SwingUtilities;
import javax.swing.Timer;
import javax.swing.border.EmptyBorder;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.TarefaDao;
import pt.zsgosync.service.TarefasService;
import pt.zsgosync.util.Erros;

/**
 * Separador "Tarefas agendadas": ligar/desligar cada tarefa, escolher a
 * hora, ver o resultado da última execução e correr já. Quem corre as
 * tarefas à hora marcada é o agendador (agendador.bat), que fica aberto
 * numa janela à parte — este ecrã mostra se ele está ligado.
 */
public class PainelTarefas extends JPanel implements Tema.TemaOuvinte {
   private static final DateTimeFormatter DATA = DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm");
   private static final long SEGUNDOS_LIGADO = 90;

   private final Supplier<AppConfig> config;
   private final String utilizador;
   private final JPanel estadoAgendador = new JPanel(new BorderLayout(12, 4));
   private final Bolinha bolinha = new Bolinha();
   private final JLabel labelAgendador = new JLabel(" ");
   private final JLabel labelAgendadorAjuda = new JLabel(" ");
   private final JPanel listaCartoes = new JPanel();
   private final JLabel labelNota = new JLabel();
   private final List<CartaoTarefa> cartoes = new ArrayList<>();
   private final Timer timer = new Timer(10000, e -> this.recarregar());

   public PainelTarefas(Supplier<AppConfig> config, String utilizador) {
      this.config = config;
      this.utilizador = utilizador;
      this.setLayout(new BorderLayout(0, 14));
      this.setOpaque(false);
      this.setBorder(new EmptyBorder(16, 4, 4, 4));

      this.labelAgendador.setFont(Tema.FONT_BOLD.deriveFont(14.0F));
      this.labelAgendadorAjuda.setFont(Tema.FONT_BASE.deriveFont(12.5F));
      JPanel textos = new JPanel();
      textos.setOpaque(false);
      textos.setLayout(new BoxLayout(textos, BoxLayout.Y_AXIS));
      textos.add(this.labelAgendador);
      textos.add(Box.createVerticalStrut(4));
      textos.add(this.labelAgendadorAjuda);
      JPanel ladoBolinha = new JPanel(new FlowLayout(FlowLayout.CENTER, 0, 4));
      ladoBolinha.setOpaque(false);
      ladoBolinha.add(this.bolinha);
      this.estadoAgendador.setBorder(new EmptyBorder(14, 16, 14, 16));
      this.estadoAgendador.add(ladoBolinha, BorderLayout.WEST);
      this.estadoAgendador.add(textos, BorderLayout.CENTER);
      JButton atualizar = new JButton("Atualizar");
      atualizar.addActionListener(e -> this.recarregar());
      JPanel ladoBotao = new JPanel(new FlowLayout(FlowLayout.RIGHT, 0, 4));
      ladoBotao.setOpaque(false);
      ladoBotao.add(atualizar);
      this.estadoAgendador.add(ladoBotao, BorderLayout.EAST);
      this.add(this.estadoAgendador, BorderLayout.NORTH);

      this.listaCartoes.setOpaque(false);
      this.listaCartoes.setLayout(new BoxLayout(this.listaCartoes, BoxLayout.Y_AXIS));
      JPanel envolve = new JPanel(new BorderLayout());
      envolve.setOpaque(false);
      envolve.add(this.listaCartoes, BorderLayout.NORTH);
      JScrollPane sp = new JScrollPane(envolve);
      sp.setBorder(BorderFactory.createEmptyBorder());
      sp.setOpaque(false);
      sp.getViewport().setOpaque(false);
      sp.getVerticalScrollBar().setUnitIncrement(16);
      this.add(sp, BorderLayout.CENTER);

      this.labelNota.setFont(Tema.FONT_BASE.deriveFont(12.0F));
      this.labelNota.setText("<html><b>Como funciona:</b> as tarefas ligadas correm à hora marcada enquanto o <b>agendador.bat</b> estiver aberto "
         + "(na pasta do programa; abre uma janela preta que deve ficar aberta). Para arrancar sozinho quando se liga o computador, "
         + "põe um atalho do agendador.bat na pasta de Arranque do Windows (tecla Windows+R, escrever <b>shell:startup</b>, Enter). "
         + "Tudo o que as tarefas fazem fica também registado no Histórico.</html>");
      this.add(this.labelNota, BorderLayout.SOUTH);

      Tema.registar(this);
      this.aplicarCores();
   }

   /** Chamado ao entrar no separador: carrega e mantém atualizado enquanto estiver visível. */
   public void aoMostrar() {
      this.recarregar();
      this.timer.restart();
   }

   public void aoEsconder() {
      this.timer.stop();
   }

   public void recarregar() {
      new Thread(() -> {
         try {
            AppConfig cfg = this.config.get();
            List<TarefaDao.Tarefa> tarefas;
            Long segundos;
            TarefaDao.Batimento bat;
            try (Connection c = DriverManager.getConnection(cfg.get("db.url"), cfg.get("db.user"), cfg.get("db.password"))) {
               TarefaDao dao = new TarefaDao();
               dao.ensureTableExists(c);
               tarefas = dao.listar(c);
               segundos = dao.segundosDesdeUltimoSinal(c);
               bat = dao.obterBatimento(c);
            }
            SwingUtilities.invokeLater(() -> this.mostrar(tarefas, segundos, bat));
         } catch (Exception e) {
            SwingUtilities.invokeLater(() -> {
               this.bolinha.cor = Tema.DESTRUCTIVE;
               this.labelAgendador.setText("Não foi possível ler as tarefas da base de dados");
               this.labelAgendadorAjuda.setText(Erros.descrever(e));
               this.repaint();
            });
         }
      }, "carregar-tarefas").start();
   }

   private void mostrar(List<TarefaDao.Tarefa> tarefas, Long segundos, TarefaDao.Batimento bat) {
      boolean ligado = segundos != null && segundos <= SEGUNDOS_LIGADO;
      if (ligado) {
         this.bolinha.cor = Tema.SUCCESS;
         this.labelAgendador.setText("Agendador ligado" + (bat != null && bat.maquina != null ? " no computador " + bat.maquina : ""));
         this.labelAgendadorAjuda.setText("Último sinal há " + segundos + " s"
            + (bat != null && bat.iniciadoEm != null ? " · a correr desde " + bat.iniciadoEm.toLocalDateTime().format(DATA) : "")
            + ". As tarefas ligadas vão correr à hora marcada.");
      } else {
         this.bolinha.cor = Tema.DESTRUCTIVE;
         this.labelAgendador.setText("Agendador desligado — as tarefas não vão correr sozinhas");
         this.labelAgendadorAjuda.setText(segundos == null
            ? "Abre o ficheiro agendador.bat (na pasta do programa) e deixa a janela aberta."
            : "Último sinal há " + formatarDuracao(segundos) + (bat != null && bat.maquina != null ? " (computador " + bat.maquina + ")" : "")
               + ". Abre o agendador.bat e deixa a janela aberta.");
      }

      if (this.cartoes.size() != tarefas.size()) {
         this.cartoes.clear();
         this.listaCartoes.removeAll();
         for (TarefaDao.Tarefa t : tarefas) {
            CartaoTarefa c = new CartaoTarefa(t);
            this.cartoes.add(c);
            this.listaCartoes.add(c);
            this.listaCartoes.add(Box.createVerticalStrut(12));
         }
      }
      for (int i = 0; i < tarefas.size(); i++) {
         this.cartoes.get(i).atualizar(tarefas.get(i));
      }
      this.aplicarCores();
      this.revalidate();
      this.repaint();
   }

   private static String formatarDuracao(long s) {
      if (s < 120) {
         return s + " s";
      } else if (s < 7200) {
         return s / 60 + " min";
      } else if (s < 172800) {
         return s / 3600 + " h";
      }
      return s / 86400 + " dias";
   }

   // ------------------------------------------------------------ cartão de cada tarefa

   private class CartaoTarefa extends JPanel {
      final String codigo;
      final JCheckBox ativa = new JCheckBox("Ligada");
      final JLabel titulo = new JLabel();
      final JLabel descricao = new JLabel();
      final JSpinner hora = new JSpinner(new SpinnerDateModel());
      final JSpinner dia = new JSpinner(new SpinnerNumberModel(1, 1, 31, 1));
      final JLabel labelQuando = new JLabel();
      final JLabel labelDia = new JLabel("de cada mês, às");
      final JButton guardar = new JButton("Guardar");
      final JButton executar = new JButton("Executar agora");
      final JLabel ultima = new JLabel(" ");
      final JLabel proxima = new JLabel(" ");
      final JLabel progresso = new JLabel(" ");
      boolean aCarregar;
      boolean aExecutar;
      TarefaDao.Tarefa atual;

      CartaoTarefa(TarefaDao.Tarefa t) {
         this.codigo = t.codigo;
         this.setOpaque(false);
         this.setLayout(new BorderLayout(0, 8));
         this.setBorder(new EmptyBorder(14, 18, 14, 18));
         this.setAlignmentX(0.0F);
         this.setMaximumSize(new Dimension(Integer.MAX_VALUE, 190));

         this.titulo.setText(TarefasService.nome(t.codigo));
         this.titulo.setFont(Tema.FONT_BOLD.deriveFont(15.0F));
         this.descricao.setText(TarefasService.descricao(t.codigo));
         this.descricao.setFont(Tema.FONT_BASE.deriveFont(12.5F));
         JPanel cabeca = new JPanel(new BorderLayout(10, 2));
         cabeca.setOpaque(false);
         JPanel textos = new JPanel();
         textos.setOpaque(false);
         textos.setLayout(new BoxLayout(textos, BoxLayout.Y_AXIS));
         textos.add(this.titulo);
         textos.add(Box.createVerticalStrut(2));
         textos.add(this.descricao);
         cabeca.add(textos, BorderLayout.CENTER);
         this.ativa.setFont(Tema.FONT_BOLD);
         this.ativa.setOpaque(false);
         cabeca.add(this.ativa, BorderLayout.EAST);

         this.hora.setEditor(new JSpinner.DateEditor(this.hora, "HH:mm"));
         this.hora.setPreferredSize(new Dimension(80, 30));
         this.dia.setPreferredSize(new Dimension(60, 30));
         boolean mensal = t.diaMes != null;
         this.labelQuando.setText(mensal ? "No dia" : "Todos os dias às");
         JPanel quando = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
         quando.setOpaque(false);
         quando.add(this.labelQuando);
         if (mensal) {
            quando.add(this.dia);
            quando.add(this.labelDia);
         }
         quando.add(this.hora);
         quando.add(Box.createHorizontalStrut(6));
         quando.add(this.guardar);
         this.guardar.setEnabled(false);
         this.guardar.setToolTipText("Grava a hora e o estado (ligada/desligada) desta tarefa.");

         JPanel rodape = new JPanel(new BorderLayout(10, 2));
         rodape.setOpaque(false);
         JPanel info = new JPanel();
         info.setOpaque(false);
         info.setLayout(new BoxLayout(info, BoxLayout.Y_AXIS));
         for (JLabel l : new JLabel[]{this.ultima, this.proxima, this.progresso}) {
            l.setFont(Tema.FONT_BASE.deriveFont(12.5F));
            info.add(l);
         }
         rodape.add(info, BorderLayout.CENTER);
         JPanel ladoExec = new JPanel(new FlowLayout(FlowLayout.RIGHT, 0, 0));
         ladoExec.setOpaque(false);
         ladoExec.add(this.executar);
         rodape.add(ladoExec, BorderLayout.EAST);

         this.add(cabeca, BorderLayout.NORTH);
         this.add(quando, BorderLayout.CENTER);
         this.add(rodape, BorderLayout.SOUTH);

         this.ativa.addActionListener(e -> this.alterado());
         this.hora.addChangeListener(e -> this.alterado());
         this.dia.addChangeListener(e -> this.alterado());
         this.guardar.addActionListener(e -> this.gravar());
         this.executar.addActionListener(e -> this.executarAgora());
         for (JComponent b : new JComponent[]{this.guardar, this.executar}) {
            b.setFont(Tema.FONT_BOLD);
         }
      }

      void alterado() {
         if (!this.aCarregar) {
            this.guardar.setEnabled(true);
         }
      }

      void atualizar(TarefaDao.Tarefa t) {
         this.atual = t;
         // Não apaga o que o utilizador está a editar e ainda não gravou.
         if (!this.guardar.isEnabled()) {
            this.aCarregar = true;
            this.ativa.setSelected(t.ativa);
            LocalTime h = TarefasService.hora(t.hora);
            Calendar cal = Calendar.getInstance();
            cal.set(Calendar.HOUR_OF_DAY, h.getHour());
            cal.set(Calendar.MINUTE, h.getMinute());
            this.hora.setValue(cal.getTime());
            if (t.diaMes != null) {
               this.dia.setValue(t.diaMes);
            }
            this.aCarregar = false;
         }

         if (t.aCorrerDesde != null) {
            this.ultima.setText("⏳ A correr desde " + t.aCorrerDesde.toLocalDateTime().format(DATA) + "...");
            this.ultima.setForeground(Tema.PRIMARY);
         } else if (t.ultimaExecucao == null) {
            this.ultima.setText("Ainda nunca correu.");
            this.ultima.setForeground(Tema.MUTED_FOREGROUND);
         } else {
            boolean ok = "OK".equals(t.ultimoEstado);
            this.ultima.setText("<html>" + (ok ? "✔" : "✖") + " Última execução " + t.ultimaExecucao.toLocalDateTime().format(DATA) + ": "
               + escapar(t.ultimoResultado != null ? t.ultimoResultado : "") + "</html>");
            this.ultima.setForeground(ok ? Tema.SUCCESS : Tema.DESTRUCTIVE);
         }
         LocalDateTime p = TarefasService.proximaExecucao(t, LocalDateTime.now());
         this.proxima.setText(t.ativa ? (p != null ? "Próxima execução: " + p.format(DATA) : "Próxima execução: —") : "Desligada — não corre sozinha.");
         this.proxima.setForeground(Tema.MUTED_FOREGROUND);
         this.executar.setEnabled(!this.aExecutar && t.aCorrerDesde == null);
      }

      void gravar() {
         Date d = (Date) this.hora.getValue();
         LocalTime h = d.toInstant().atZone(ZoneId.systemDefault()).toLocalTime();
         String hhmm = String.format("%02d:%02d", h.getHour(), h.getMinute());
         Integer diaMes = this.atual != null && this.atual.diaMes != null ? (Integer) this.dia.getValue() : null;
         boolean liga = this.ativa.isSelected();
         this.guardar.setEnabled(false);
         new Thread(() -> {
            try {
               AppConfig cfg = PainelTarefas.this.config.get();
               try (Connection c = DriverManager.getConnection(cfg.get("db.url"), cfg.get("db.user"), cfg.get("db.password"))) {
                  new TarefaDao().guardar(c, this.codigo, liga, hhmm, diaMes);
               }
               pt.zsgosync.HistoricoRun.registar(cfg, PainelTarefas.this.utilizador, "TAREFA_CONFIGURADA",
                  TarefasService.nome(this.codigo) + ": " + (liga ? "ligada, " + (diaMes != null ? "dia " + diaMes + " " : "") + "às " + hhmm : "desligada"));
               PainelTarefas.this.recarregar();
            } catch (Exception e) {
               SwingUtilities.invokeLater(() -> {
                  this.guardar.setEnabled(true);
                  JOptionPane.showMessageDialog(PainelTarefas.this, "Não foi possível gravar: " + Erros.descrever(e), "Erro", JOptionPane.ERROR_MESSAGE);
               });
            }
         }, "gravar-tarefa").start();
      }

      void executarAgora() {
         String pergunta = TarefaDao.FATURACAO_MENSAL.equals(this.codigo)
            ? "Gerar agora a faturação do mês anterior (as faturas que ainda faltam)?"
            : "Executar agora \"" + TarefasService.nome(this.codigo) + "\"?";
         if (JOptionPane.showConfirmDialog(PainelTarefas.this, pergunta, "Executar agora", JOptionPane.YES_NO_OPTION) != JOptionPane.YES_OPTION) {
            return;
         }
         this.aExecutar = true;
         this.executar.setEnabled(false);
         this.executar.setText("A correr...");
         this.progresso.setText("A iniciar...");
         this.progresso.setForeground(Tema.PRIMARY);
         new Thread(() -> {
            String fim;
            boolean ok = true;
            try {
               fim = TarefasService.executar(PainelTarefas.this.config.get(), this.codigo, PainelTarefas.this.utilizador,
                  (texto, a, b) -> SwingUtilities.invokeLater(() -> this.progresso.setText(texto)));
            } catch (Exception e) {
               ok = false;
               fim = Erros.descrever(e);
            }
            String texto = fim;
            boolean sucesso = ok;
            SwingUtilities.invokeLater(() -> {
               this.aExecutar = false;
               this.executar.setText("Executar agora");
               this.progresso.setText(" ");
               PainelTarefas.this.recarregar();
               JOptionPane.showMessageDialog(PainelTarefas.this, texto, TarefasService.nome(this.codigo),
                  sucesso ? JOptionPane.INFORMATION_MESSAGE : JOptionPane.ERROR_MESSAGE);
            });
         }, "executar-tarefa").start();
      }

      @Override
      protected void paintComponent(Graphics g) {
         Graphics2D g2 = (Graphics2D) g.create();
         g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
         g2.setColor(Tema.SURFACE);
         g2.fillRoundRect(0, 0, this.getWidth() - 1, this.getHeight() - 1, 14, 14);
         g2.setColor(this.atual != null && this.atual.ativa ? Tema.PRIMARY : Tema.BORDER);
         g2.drawRoundRect(0, 0, this.getWidth() - 1, this.getHeight() - 1, 14, 14);
         g2.dispose();
         super.paintComponent(g);
      }

      void cores() {
         this.titulo.setForeground(Tema.FOREGROUND);
         this.descricao.setForeground(Tema.MUTED_FOREGROUND);
         this.ativa.setForeground(Tema.FOREGROUND);
         this.labelQuando.setForeground(Tema.FOREGROUND);
         this.labelDia.setForeground(Tema.FOREGROUND);
         for (JButton b : new JButton[]{this.guardar, this.executar}) {
            b.setBackground(Tema.SURFACE_2);
            b.setForeground(Tema.FOREGROUND);
            b.setFocusPainted(false);
         }
      }
   }

   private static String escapar(String s) {
      return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
   }

   /** Bolinha verde/vermelha do estado do agendador. */
   private static class Bolinha extends JComponent {
      Color cor = Color.GRAY;

      Bolinha() {
         this.setPreferredSize(new Dimension(18, 18));
      }

      @Override
      protected void paintComponent(Graphics g) {
         Graphics2D g2 = (Graphics2D) g.create();
         g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
         g2.setColor(this.cor);
         g2.fillOval(1, 1, 16, 16);
         g2.dispose();
      }
   }

   @Override
   public void aoMudarTema() {
      this.aplicarCores();
   }

   private void aplicarCores() {
      this.estadoAgendador.setOpaque(true);
      this.estadoAgendador.setBackground(Tema.SURFACE);
      this.estadoAgendador.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true), new EmptyBorder(14, 16, 14, 16)));
      this.labelAgendador.setForeground(Tema.FOREGROUND);
      this.labelAgendadorAjuda.setForeground(Tema.MUTED_FOREGROUND);
      this.labelNota.setForeground(Tema.MUTED_FOREGROUND);
      for (CartaoTarefa c : this.cartoes) {
         c.cores();
      }
      this.repaint();
   }
}
