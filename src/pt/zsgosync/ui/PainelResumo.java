package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.GridLayout;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.time.Month;
import java.time.format.TextStyle;
import java.util.List;
import java.util.Locale;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.border.EmptyBorder;
import pt.zsgosync.db.HistoricoDao;
import pt.zsgosync.service.DashboardService;

public class PainelResumo extends JPanel implements Tema.TemaOuvinte {
   private static final NumberFormat MOEDA = NumberFormat.getCurrencyInstance(new Locale("pt", "PT"));
   private final CartaoResumo cartaoClientes = new CartaoResumo();
   private final CartaoResumo cartaoFaturado = new CartaoResumo();
   private final CartaoResumo cartaoNotasCredito = new CartaoResumo();
   private final CartaoResumo cartaoErros = new CartaoResumo();
   private final ProgressoCircular anelClientes = new ProgressoCircular(Tema.CARD_TEAL_FG, Tema.BORDER, Tema.FOREGROUND);
   private final ProgressoCircular anelFaturas = new ProgressoCircular(Tema.PRIMARY, Tema.BORDER, Tema.FOREGROUND);
   private final ProgressoCircular anelNotasCredito = new ProgressoCircular(Tema.CARD_BLUE_FG, Tema.BORDER, Tema.FOREGROUND);
   private final JPanel wrapperAneis = new JPanel(new GridLayout(1, 3, 20, 0));
   private final JLabel labelTituloAneis = new JLabel("Resumo do mês");
   private final JLabel labelAnelClientes = new JLabel("Clientes sincronizados", 0);
   private final JLabel labelAnelFaturas = new JLabel("Faturas emitidas", 0);
   private final JLabel labelAnelNotasCredito = new JLabel("Notas de crédito emitidas", 0);
   private final GraficoBarras grafico = new GraficoBarras(Tema.CARD_CORAL_BG, Tema.PRIMARY, Tema.MUTED_FOREGROUND, Tema.BORDER);
   private final JPanel wrapperGrafico = new JPanel(new BorderLayout());
   private final JPanel wrapperAvisos = new JPanel(new BorderLayout());
   private final JPanel listaAvisos = new JPanel();
   private final JLabel labelSemAvisos = new JLabel("Sem avisos recentes.");
   private final JLabel labelTituloGrafico = new JLabel("Faturado por mês");
   private final JLabel labelTituloAvisos = new JLabel("Avisos recentes");
   private JPanel cartaoAneisRef;
   // Navegação entre meses: por defeito o mês anterior (o último faturado).
   private java.time.YearMonth mes = java.time.YearMonth.now().minusMonths(1L);
   private final javax.swing.JButton btnMesAnterior = new javax.swing.JButton("◀");
   private final javax.swing.JButton btnMesSeguinte = new javax.swing.JButton("▶");
   private final javax.swing.JButton btnMesAtual = new javax.swing.JButton("Último mês");
   private final JLabel labelMes = new JLabel(" ", 0);
   private java.util.function.Consumer<java.time.YearMonth> aoMudarMes = m -> {};

   public java.time.YearMonth getMes() {
      return this.mes;
   }

   /** Chamado sempre que o utilizador muda de mês (para recarregar os dados). */
   public void aoMudarMes(java.util.function.Consumer<java.time.YearMonth> var1) {
      this.aoMudarMes = var1;
   }

   private void mudarMes(java.time.YearMonth var1) {
      java.time.YearMonth var2 = java.time.YearMonth.now();
      this.mes = var1.isAfter(var2) ? var2 : var1;
      this.atualizarNavegacao();
      this.aoMudarMes.accept(this.mes);
   }

   private void atualizarNavegacao() {
      this.labelMes.setText(nomeMes(this.mes));
      this.btnMesSeguinte.setEnabled(this.mes.isBefore(java.time.YearMonth.now()));
      this.btnMesAtual.setEnabled(!this.mes.equals(java.time.YearMonth.now().minusMonths(1L)));
   }

   private static String nomeMes(java.time.YearMonth var0) {
      String var1 = var0.getMonth().getDisplayName(TextStyle.FULL, new Locale("pt", "PT"));
      return var1.substring(0, 1).toUpperCase(Locale.ROOT) + var1.substring(1) + " de " + var0.getYear();
   }

   private JPanel montarNavegacao() {
      JPanel var1 = new JPanel(new FlowLayout(0, 8, 0));
      var1.setOpaque(false);
      this.labelMes.setFont(Tema.FONT_BOLD.deriveFont(18.0F));
      this.labelMes.setPreferredSize(new Dimension(220, 30));
      for (javax.swing.JButton var3 : new javax.swing.JButton[]{this.btnMesAnterior, this.btnMesSeguinte, this.btnMesAtual}) {
         var3.setFocusPainted(false);
         var3.setFont(Tema.FONT_BOLD);
         var3.setCursor(java.awt.Cursor.getPredefinedCursor(12));
      }
      this.btnMesAnterior.setToolTipText("Mês anterior");
      this.btnMesSeguinte.setToolTipText("Mês seguinte");
      this.btnMesAtual.setToolTipText("Voltar ao último mês faturado");
      this.btnMesAnterior.addActionListener(var1x -> this.mudarMes(this.mes.minusMonths(1L)));
      this.btnMesSeguinte.addActionListener(var1x -> this.mudarMes(this.mes.plusMonths(1L)));
      this.btnMesAtual.addActionListener(var1x -> this.mudarMes(java.time.YearMonth.now().minusMonths(1L)));
      var1.add(this.btnMesAnterior);
      var1.add(this.labelMes);
      var1.add(this.btnMesSeguinte);
      var1.add(Box.createHorizontalStrut(10));
      var1.add(this.btnMesAtual);
      var1.setAlignmentX(0.0F);
      this.atualizarNavegacao();
      return var1;
   }

   public PainelResumo() {
      this.setLayout(new BorderLayout(0, 14));
      this.setOpaque(false);
      this.setBorder(new EmptyBorder(18, 4, 4, 4));
      JPanel var1 = new JPanel();
      var1.setLayout(new BoxLayout(var1, 1));
      var1.setOpaque(false);
      JPanel var12 = this.montarNavegacao();
      var1.add(var12);
      var1.add(Box.createVerticalStrut(12));
      this.wrapperAneis.setOpaque(false);
      this.labelTituloAneis.setFont(Tema.FONT_BOLD.deriveFont(14.0F));
      this.labelTituloAneis.setAlignmentX(0.0F);
      JPanel var2 = new JPanel(new BorderLayout(0, 12));
      var2.setOpaque(false);
      var2.setBorder(new EmptyBorder(14, 16, 16, 16));
      var2.add(this.labelTituloAneis, "North");
      JPanel var3 = envolverAnel(this.anelClientes, this.labelAnelClientes);
      JPanel var4 = envolverAnel(this.anelFaturas, this.labelAnelFaturas);
      JPanel var5 = envolverAnel(this.anelNotasCredito, this.labelAnelNotasCredito);
      this.wrapperAneis.add(var3);
      this.wrapperAneis.add(var4);
      this.wrapperAneis.add(var5);
      var2.add(this.wrapperAneis, "Center");
      JPanel var6 = new JPanel(new BorderLayout());
      var6.setOpaque(true);
      var6.setAlignmentX(0.0F);
      var6.add(var2, "Center");
      var1.add(var6);
      var1.add(Box.createVerticalStrut(14));
      JPanel var7 = new JPanel(new GridLayout(1, 4, 14, 0));
      var7.setOpaque(false);
      var7.setAlignmentX(0.0F);
      var7.add(this.cartaoClientes);
      var7.add(this.cartaoFaturado);
      var7.add(this.cartaoNotasCredito);
      var7.add(this.cartaoErros);
      var1.add(var7);
      this.add(var1, "North");
      this.cartaoAneisRef = var6;
      JPanel var8 = new JPanel(new BorderLayout(14, 0));
      var8.setOpaque(false);
      this.wrapperGrafico.setBorder(new EmptyBorder(14, 16, 14, 16));
      JPanel var9 = new JPanel(new BorderLayout());
      var9.setOpaque(false);
      this.labelTituloGrafico.setFont(Tema.FONT_BOLD.deriveFont(14.0F));
      var9.add(this.labelTituloGrafico, "North");
      JPanel var10 = new JPanel();
      var10.setOpaque(false);
      var10.setPreferredSize(new Dimension(1, 10));
      var9.add(var10, "Center");
      this.wrapperGrafico.add(var9, "North");
      this.wrapperGrafico.add(this.grafico, "Center");
      this.wrapperAvisos.setBorder(new EmptyBorder(14, 16, 14, 16));
      this.wrapperAvisos.setPreferredSize(new Dimension(260, 10));
      this.labelTituloAvisos.setFont(Tema.FONT_BOLD.deriveFont(14.0F));
      this.wrapperAvisos.add(this.labelTituloAvisos, "North");
      this.listaAvisos.setLayout(new BoxLayout(this.listaAvisos, 1));
      this.listaAvisos.setOpaque(false);
      JScrollPane var11 = new JScrollPane(this.listaAvisos);
      var11.setBorder(BorderFactory.createEmptyBorder());
      var11.setOpaque(false);
      var11.getViewport().setOpaque(false);
      this.wrapperAvisos.add(var11, "Center");
      var8.add(this.wrapperGrafico, "Center");
      var8.add(this.wrapperAvisos, "East");
      this.add(var8, "Center");
      Tema.registar(this);
      this.aplicarCoresAgora();
   }

   private static JPanel envolverAnel(ProgressoCircular var0, JLabel var1) {
      var0.setPreferredSize(new Dimension(110, 110));
      JPanel var2 = new JPanel(new BorderLayout(0, 8));
      var2.setOpaque(false);
      JPanel var3 = new JPanel(new FlowLayout(1, 0, 0));
      var3.setOpaque(false);
      var3.add(var0);
      var2.add(var3, "Center");
      var1.setFont(Tema.FONT_BASE.deriveFont(12.0F));
      var2.add(var1, "South");
      return var2;
   }

   public void mostrar(DashboardService.Resumo var1) {
      if (var1.mesReferencia != null && !var1.mesReferencia.equals(this.mes)) {
         return;
      }
      this.labelTituloAneis.setText("Resumo de " + nomeMes(var1.mesReferencia));
      String var2 = Month.of(var1.mesReferencia.getMonthValue()).getDisplayName(TextStyle.FULL, new Locale("pt", "PT"));
      var2 = var2.substring(0, 1).toUpperCase(Locale.ROOT) + var2.substring(1);
      this.anelClientes.definir(var1.percentClientesSincronizados, 100);
      this.anelFaturas.definir(var1.percentFaturasSucesso, 100);
      this.anelNotasCredito.definir(var1.percentNotasCreditoSucesso, 100);
      this.cartaoClientes
         .configurar(
            "Clientes sincronizados",
            String.valueOf(var1.clientesSincronizados),
            var1.clientesPendentes > 0 ? var1.clientesPendentes + " pendente(s)" : "Tudo sincronizado",
            Tema.CARD_TEAL_BG,
            Tema.CARD_TEAL_FG
         );
      this.cartaoFaturado
         .configurar(
            "Faturado em " + var2,
            MOEDA.format(var1.valorFaturadoMes),
            formatarTendencia(var1.variacaoFaturadoPercentagem(), "vs mês anterior"),
            Tema.CARD_CORAL_BG,
            Tema.CARD_CORAL_FG
         );
      this.cartaoNotasCredito
         .configurar(
            "Notas de crédito em " + var2,
            String.valueOf(var1.notasCreditoMes),
            formatarTendencia(var1.variacaoNotasCreditoPercentagem(), "vs mês anterior"),
            Tema.CARD_BLUE_BG,
            Tema.CARD_BLUE_FG
         );
      this.cartaoErros
         .configurar(
            "Clientes com erro",
            String.valueOf(var1.clientesComErro),
            var1.clientesComErro > 0 ? "Convém rever" : "Nenhum",
            Tema.CARD_PURPLE_BG,
            Tema.CARD_PURPLE_FG
         );
      this.grafico.definirDados(var1.historicoFaturacao);
      this.listaAvisos.removeAll();
      List<HistoricoDao.Entrada> var3 = var1.avisosRecentes;
      if (var3 != null && !var3.isEmpty()) {
         for (HistoricoDao.Entrada var5 : var3) {
            this.listaAvisos.add(this.criarLinhaAviso(var5));
            this.listaAvisos.add(Box.createVerticalStrut(10));
         }
      } else {
         this.listaAvisos.add(this.labelSemAvisos);
      }

      this.listaAvisos.revalidate();
      this.listaAvisos.repaint();
   }

   private JPanel criarLinhaAviso(HistoricoDao.Entrada var1) {
      JPanel var2 = new JPanel();
      var2.setLayout(new BoxLayout(var2, 1));
      var2.setOpaque(false);
      var2.setAlignmentX(0.0F);
      JLabel var3 = new JLabel(descreverAcao(var1));
      var3.setFont(Tema.FONT_BOLD.deriveFont(12.5F));
      var3.setForeground(Tema.FOREGROUND);
      var3.setAlignmentX(0.0F);
      JLabel var4 = new JLabel(
         var1.criadoEm != null ? new SimpleDateFormat("dd/MM HH:mm").format(var1.criadoEm) + (var1.utilizador != null ? " — " + var1.utilizador : "") : ""
      );
      var4.setFont(Tema.FONT_BASE.deriveFont(11.0F));
      var4.setForeground(Tema.MUTED_FOREGROUND);
      var4.setAlignmentX(0.0F);
      var2.add(var3);
      var2.add(var4);
      return var2;
   }

   private static String descreverAcao(HistoricoDao.Entrada var0) {
      String var1 = var0.detalhe != null && !var0.detalhe.isBlank() ? var0.detalhe : var0.acao;
      return var1.length() > 70 ? var1.substring(0, 67) + "..." : var1;
   }

   private static String formatarTendencia(Double var0, String var1) {
      if (var0 == null) {
         return var1;
      } else {
         String var2 = var0 >= 0.0 ? "↑" : "↓";
         return var2 + " " + String.format(new Locale("pt", "PT"), "%.0f%%", Math.abs(var0)) + " " + var1;
      }
   }

   @Override
   public void aoMudarTema() {
      this.aplicarCoresAgora();
   }

   private void aplicarCoresAgora() {
      this.cartaoAneisRef.setBackground(Tema.SURFACE);
      this.cartaoAneisRef.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      this.labelTituloAneis.setForeground(Tema.FOREGROUND);
      this.labelAnelClientes.setForeground(Tema.MUTED_FOREGROUND);
      this.labelAnelFaturas.setForeground(Tema.MUTED_FOREGROUND);
      this.labelAnelNotasCredito.setForeground(Tema.MUTED_FOREGROUND);
      this.anelClientes.definirCores(Tema.CARD_TEAL_FG, Tema.BORDER, Tema.FOREGROUND);
      this.anelFaturas.definirCores(Tema.PRIMARY, Tema.BORDER, Tema.FOREGROUND);
      this.anelNotasCredito.definirCores(Tema.CARD_BLUE_FG, Tema.BORDER, Tema.FOREGROUND);
      this.wrapperGrafico.setBackground(Tema.SURFACE);
      this.wrapperAvisos.setBackground(Tema.SURFACE);
      this.wrapperGrafico.setOpaque(true);
      this.wrapperAvisos.setOpaque(true);
      this.wrapperGrafico.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true), new EmptyBorder(14, 16, 14, 16)));
      this.wrapperAvisos.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true), new EmptyBorder(14, 16, 14, 16)));
      this.labelTituloGrafico.setForeground(Tema.FOREGROUND);
      this.labelTituloAvisos.setForeground(Tema.FOREGROUND);
      this.labelSemAvisos.setForeground(Tema.MUTED_FOREGROUND);
      this.labelSemAvisos.setFont(Tema.FONT_BASE);
      this.grafico.definirCores(Tema.CARD_CORAL_BG, Tema.PRIMARY, Tema.MUTED_FOREGROUND, Tema.BORDER);
      this.labelMes.setForeground(Tema.FOREGROUND);
      for (javax.swing.JButton var2 : new javax.swing.JButton[]{this.btnMesAnterior, this.btnMesSeguinte, this.btnMesAtual}) {
         var2.setBackground(Tema.SURFACE_2);
         var2.setForeground(Tema.FOREGROUND);
         var2.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true), new EmptyBorder(6, 14, 6, 14)));
      }
      this.revalidate();
      this.repaint();
   }
}
