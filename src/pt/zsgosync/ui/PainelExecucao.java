package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.CardLayout;
import java.awt.Color;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Vector;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.SwingUtilities;
import javax.swing.border.EmptyBorder;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import pt.zsgosync.progress.ProgressListener;

public class PainelExecucao extends JPanel implements Tema.TemaOuvinte {
   private final CardLayout cards = new CardLayout();
   private final JPanel corpo = new JPanel(this.cards);
   private final ProgressoCircular progresso;
   private final JLabel labelFase = new JLabel(" ");
   private final JLabel labelContagem = new JLabel(" ");
   private final JLabel labelResumo = new JLabel(" ");
   private final DefaultTableModel modeloErros = new DefaultTableModel(new String[]{"ID do Cliente (user.id)", "Erro"}, 0) {
      @Override
      public boolean isCellEditable(int var1, int var2) {
         return false;
      }
   };
   private final JTable tabelaErros = new JTable(this.modeloErros);
   private final JScrollPane scrollErros;
   private int ultimoOk = 0;
   private int ultimoSkip = 0;
   private int ultimoFailed = 0;
   private BigDecimal ultimoValor = BigDecimal.ZERO;
   private String ultimaFase = "";
   private boolean aMostrarResultado = false;
   private static final NumberFormat MOEDA = NumberFormat.getCurrencyInstance(new Locale("pt", "PT"));

   public PainelExecucao() {
      this.setLayout(new BorderLayout());
      this.setOpaque(false);
      this.progresso = new ProgressoCircular(Tema.PRIMARY, Tema.SURFACE_2, Tema.FOREGROUND);
      this.corpo.setOpaque(false);
      this.corpo.add(this.montarCartaoProgresso(), "PROGRESSO");
      JPanel var1 = this.montarCartaoResultado();
      this.corpo.add(var1, "RESULTADO");
      this.add(this.corpo, "Center");
      this.scrollErros = (JScrollPane)((BorderLayout)var1.getLayout()).getLayoutComponent(var1, "Center");
      this.mostrarEspera();
      Tema.registar(this);
   }

   private JPanel montarCartaoProgresso() {
      JPanel var1 = new JPanel();
      var1.setLayout(new BoxLayout(var1, 1));
      var1.setOpaque(false);
      var1.setBorder(new EmptyBorder(30, 10, 10, 10));
      this.progresso.setAlignmentX(0.5F);
      this.labelFase.setAlignmentX(0.5F);
      this.labelFase.setFont(Tema.FONT_BOLD.deriveFont(15.0F));
      this.labelContagem.setAlignmentX(0.5F);
      this.labelContagem.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      var1.add(Box.createVerticalGlue());
      var1.add(this.progresso);
      var1.add(Box.createVerticalStrut(14));
      var1.add(this.labelFase);
      var1.add(Box.createVerticalStrut(4));
      var1.add(this.labelContagem);
      var1.add(Box.createVerticalGlue());
      return var1;
   }

   private JPanel montarCartaoResultado() {
      JPanel var1 = new JPanel(new BorderLayout(10, 10));
      var1.setOpaque(false);
      var1.setBorder(new EmptyBorder(14, 4, 4, 4));
      this.labelResumo.setFont(Tema.FONT_BOLD.deriveFont(14.0F));
      var1.add(this.labelResumo, "North");
      this.tabelaErros.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      this.tabelaErros.setRowHeight(26);
      this.tabelaErros.getColumnModel().getColumn(0).setPreferredWidth(160);
      this.tabelaErros.getColumnModel().getColumn(1).setPreferredWidth(540);
      this.tabelaErros.setDefaultRenderer(Object.class, new DefaultTableCellRenderer());
      JScrollPane var2 = new JScrollPane(this.tabelaErros);
      var1.add(var2, "Center");
      return var1;
   }

   public void mostrarEspera() {
      this.labelFase.setText("Pronto");
      this.labelContagem.setText("Clica no botão acima para começar.");
      this.progresso.reiniciar();
      this.aMostrarResultado = false;
      this.cards.show(this.corpo, "PROGRESSO");
      this.aplicarCoresAgora();
   }

   public ProgressListener criarListener(final String var1) {
      SwingUtilities.invokeLater(() -> {
         this.labelFase.setText(var1);
         this.labelContagem.setText("A preparar...");
         this.progresso.reiniciar();
         this.aMostrarResultado = false;
         this.cards.show(this.corpo, "PROGRESSO");
      });
      return new ProgressListener() {
         @Override
         public void aoIniciar(int var1x) {
            SwingUtilities.invokeLater(() -> {
               PainelExecucao.this.labelContagem.setText("0 / " + var1x);
               PainelExecucao.this.progresso.definir(0, var1x);
            });
         }

         @Override
         public void aoProgredir(int var1x, int var2) {
            SwingUtilities.invokeLater(() -> {
               PainelExecucao.this.labelContagem.setText(var1x + " / " + var2);
               PainelExecucao.this.progresso.definir(var1x, var2);
            });
         }

         @Override
         public void aoItemFalhar(String var1x, String var2) {
            SwingUtilities.invokeLater(() -> {
               Vector var3 = new Vector();
               var3.add(var1x);
               var3.add(var2);
               PainelExecucao.this.modeloErros.addRow(var3);
            });
         }

         @Override
         public void aoConcluir(int var1x, int var2, int var3, BigDecimal var4) {
            SwingUtilities.invokeLater(() -> {
               PainelExecucao.this.ultimoOk = var1x;
               PainelExecucao.this.ultimoSkip = var2;
               PainelExecucao.this.ultimoFailed = var3;
               PainelExecucao.this.ultimoValor = var4;
               PainelExecucao.this.ultimaFase = var1;
               PainelExecucao.this.aMostrarResultado = true;
               PainelExecucao.this.atualizarTextoResumo();
               PainelExecucao.this.cards.show(PainelExecucao.this.corpo, "RESULTADO");
            });
         }
      };
   }

   private void atualizarTextoResumo() {
      String var1 = toHex(Tema.SUCCESS);
      String var2 = toHex(this.ultimoFailed > 0 ? Tema.DESTRUCTIVE : Tema.SUCCESS);
      String var3 = toHex(Tema.MUTED_FOREGROUND);
      String var4 = "";
      if (this.ultimoValor != null && this.ultimoValor.compareTo(BigDecimal.ZERO) != 0) {
         var4 = "<br/>Valor total: <b style='color:" + toHex(Tema.PRIMARY) + ";'>" + MOEDA.format(this.ultimoValor) + "</b>";
      }

      this.labelResumo
         .setText(
            "<html><span style='color:"
               + toHex(Tema.FOREGROUND)
               + ";'>"
               + this.ultimaFase
               + " concluída</span> — <span style='color:"
               + var1
               + ";'>"
               + this.ultimoOk
               + " com sucesso</span>, <span style='color:"
               + var3
               + ";'>"
               + this.ultimoSkip
               + " já faturados</span>, <span style='color:"
               + var2
               + ";'>"
               + this.ultimoFailed
               + " com erro</span>"
               + var4
               + "</html>"
         );
   }

   public void limparErros() {
      SwingUtilities.invokeLater(() -> this.modeloErros.setRowCount(0));
   }

   @Override
   public void aoMudarTema() {
      this.aplicarCoresAgora();
      if (this.aMostrarResultado) {
         this.atualizarTextoResumo();
      }
   }

   private void aplicarCoresAgora() {
      this.labelFase.setForeground(Tema.FOREGROUND);
      this.labelContagem.setForeground(Tema.MUTED_FOREGROUND);
      this.labelResumo.setForeground(Tema.FOREGROUND);
      this.progresso.definirCores(Tema.PRIMARY, Tema.SURFACE_2, Tema.FOREGROUND);
      this.tabelaErros.setBackground(Tema.SURFACE);
      this.tabelaErros.setForeground(Tema.FOREGROUND);
      this.tabelaErros.setSelectionBackground(Tema.SURFACE_2);
      this.tabelaErros.setSelectionForeground(Tema.FOREGROUND);
      this.tabelaErros.setGridColor(Tema.BORDER);
      this.tabelaErros.getTableHeader().setBackground(Tema.SURFACE_2);
      this.tabelaErros.getTableHeader().setForeground(Tema.MUTED_FOREGROUND);
      this.tabelaErros.getTableHeader().setFont(Tema.FONT_BOLD.deriveFont(12.0F));
      DefaultTableCellRenderer var1 = (DefaultTableCellRenderer)this.tabelaErros.getDefaultRenderer(Object.class);
      var1.setBackground(Tema.SURFACE);
      var1.setForeground(Tema.FOREGROUND);
      this.scrollErros.getViewport().setBackground(Tema.SURFACE);
      this.scrollErros.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      this.revalidate();
      this.repaint();
   }

   private static String toHex(Color var0) {
      return String.format("#%02x%02x%02x", var0.getRed(), var0.getGreen(), var0.getBlue());
   }
}
