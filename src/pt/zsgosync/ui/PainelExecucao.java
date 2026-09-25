package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.CardLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Vector;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JFileChooser;
import javax.swing.JOptionPane;
import javax.swing.JSplitPane;
import javax.swing.RowFilter;
import javax.swing.ListSelectionModel;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.SwingUtilities;
import javax.swing.border.EmptyBorder;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
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
   private final TableRowSorter<DefaultTableModel> sorterErros = new TableRowSorter<>(this.modeloErros);
   private final JScrollPane scrollErros = new JScrollPane(this.tabelaErros);
   // Erros agrupados por causa: com centenas de erros, isto mostra logo que
   // (quase) todos têm o mesmo motivo. Clicar numa causa filtra a lista.
   private final DefaultTableModel modeloCausas = new DefaultTableModel(new String[]{"Causa do erro", "Nº"}, 0) {
      @Override
      public boolean isCellEditable(int var1, int var2) {
         return false;
      }

      @Override
      public Class<?> getColumnClass(int var1) {
         return var1 == 1 ? Integer.class : String.class;
      }
   };
   private final JTable tabelaCausas = new JTable(this.modeloCausas);
   private final JScrollPane scrollCausas = new JScrollPane(this.tabelaCausas);
   private final Map<String, Integer> linhaPorCausa = new HashMap<>();
   private final JLabel labelDica = new JLabel("Clica numa causa para filtrar · duplo-clique num erro para ver o texto completo");
   private final JButton btnExportar = new JButton("Exportar erros (CSV)");
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
      this.tabelaErros.setRowSorter(this.sorterErros);
      DetalheErro.instalar(this.tabelaErros, 0, 1);
      this.tabelaCausas.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      this.tabelaCausas.setRowHeight(24);
      this.tabelaCausas.setDefaultRenderer(Object.class, new DefaultTableCellRenderer());
      this.tabelaCausas.getColumnModel().getColumn(0).setPreferredWidth(560);
      this.tabelaCausas.getColumnModel().getColumn(1).setPreferredWidth(60);
      this.tabelaCausas.getColumnModel().getColumn(1).setMaxWidth(90);
      this.tabelaCausas.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
      TableRowSorter<DefaultTableModel> var3 = new TableRowSorter<>(this.modeloCausas);
      var3.setSortKeys(java.util.List.of(new javax.swing.RowSorter.SortKey(1, javax.swing.SortOrder.DESCENDING)));
      var3.setSortsOnUpdates(true);
      this.tabelaCausas.setRowSorter(var3);
      DetalheErro.instalar(this.tabelaCausas, -1, 0);
      this.tabelaCausas.getSelectionModel().addListSelectionListener(var1x -> {
         if (!var1x.getValueIsAdjusting()) {
            this.filtrarPorCausaSelecionada();
         }
      });
      this.scrollCausas.setPreferredSize(new Dimension(600, 130));
      JSplitPane var2 = new JSplitPane(0, this.scrollCausas, this.scrollErros);
      var2.setResizeWeight(0.3);
      var2.setBorder(null);
      var2.setOpaque(false);
      var1.add(var2, "Center");
      JPanel var4 = new JPanel(new BorderLayout(8, 0));
      var4.setOpaque(false);
      this.labelDica.setFont(Tema.FONT_BASE.deriveFont(11.0F));
      var4.add(this.labelDica, "Center");
      JPanel var5 = new JPanel(new FlowLayout(2, 0, 0));
      var5.setOpaque(false);
      var5.add(this.btnExportar);
      var4.add(var5, "East");
      this.btnExportar.addActionListener(var1x -> this.exportarCsv());
      var1.add(var4, "South");
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
               String var3 = var2 == null || var2.isBlank() ? "(erro sem mensagem)" : var2;
               Vector<Object> var4 = new Vector<>();
               var4.add(var1x);
               var4.add(var3);
               PainelExecucao.this.modeloErros.addRow(var4);
               PainelExecucao.this.contarCausa(var3);
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
      SwingUtilities.invokeLater(() -> {
         this.modeloErros.setRowCount(0);
         this.modeloCausas.setRowCount(0);
         this.linhaPorCausa.clear();
         this.sorterErros.setRowFilter(null);
      });
   }

   /**
    * Reduz um erro à sua "causa": tira o payload/dados enviados e troca
    * números e ids por '#', para que erros iguais de clientes diferentes
    * fiquem agrupados na mesma linha.
    */
   static String causaDe(String var0) {
      String var1 = var0;
      for (String var5 : new String[]{" | Payload enviado", " | Dados enviados", " Payload enviado:"}) {
         int var6 = var1.indexOf(var5);
         if (var6 > 0) {
            var1 = var1.substring(0, var6);
         }
      }

      var1 = var1.replaceAll("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", "#")
         .replaceAll("\\b\\d{4,}\\b", "#")
         .replaceAll("\\s+", " ")
         .trim();
      return var1.length() > 300 ? var1.substring(0, 300) + " …" : var1;
   }

   private void contarCausa(String var1) {
      String var2 = causaDe(var1);
      Integer var3 = this.linhaPorCausa.get(var2);
      if (var3 == null) {
         this.linhaPorCausa.put(var2, this.modeloCausas.getRowCount());
         this.modeloCausas.addRow(new Object[]{var2, 1});
      } else {
         this.modeloCausas.setValueAt((Integer)this.modeloCausas.getValueAt(var3, 1) + 1, var3, 1);
      }
   }

   private void filtrarPorCausaSelecionada() {
      int var1 = this.tabelaCausas.getSelectedRow();
      if (var1 < 0) {
         this.sorterErros.setRowFilter(null);
         return;
      }

      final String var2 = (String)this.modeloCausas.getValueAt(this.tabelaCausas.convertRowIndexToModel(var1), 0);
      this.sorterErros.setRowFilter(new RowFilter<DefaultTableModel, Integer>() {
         @Override
         public boolean include(RowFilter.Entry<? extends DefaultTableModel, ? extends Integer> var1x) {
            return var2.equals(causaDe(String.valueOf(var1x.getValue(1))));
         }
      });
   }

   private void exportarCsv() {
      if (this.modeloErros.getRowCount() == 0) {
         JOptionPane.showMessageDialog(this, "Não há erros para exportar.", "Exportar erros", 1);
         return;
      }

      JFileChooser var1 = new JFileChooser();
      var1.setSelectedFile(new File("erros-" + this.ultimaFase.toLowerCase().replaceAll("[^a-z0-9]+", "-") + ".csv"));
      if (var1.showSaveDialog(this) == 0) {
         StringBuilder var2 = new StringBuilder("\uFEFFcliente;causa;erro\r\n");

         for (int var3 = 0; var3 < this.modeloErros.getRowCount(); var3++) {
            String var4 = String.valueOf(this.modeloErros.getValueAt(var3, 0));
            String var5 = String.valueOf(this.modeloErros.getValueAt(var3, 1));
            var2.append(csv(var4)).append(';').append(csv(causaDe(var5))).append(';').append(csv(var5)).append("\r\n");
         }

         try {
            Files.writeString(var1.getSelectedFile().toPath(), var2, StandardCharsets.UTF_8);
            JOptionPane.showMessageDialog(this, this.modeloErros.getRowCount() + " erro(s) exportado(s) para:\n" + var1.getSelectedFile(), "Exportar erros", 1);
         } catch (IOException var6) {
            JOptionPane.showMessageDialog(this, "Não foi possível gravar o ficheiro: " + var6.getMessage(), "Erro", 0);
         }
      }
   }

   private static String csv(String var0) {
      return "\"" + var0.replace("\"", "\"\"") + "\"";
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
      this.tabelaCausas.setBackground(Tema.SURFACE);
      this.tabelaCausas.setForeground(Tema.FOREGROUND);
      this.tabelaCausas.setSelectionBackground(Tema.SURFACE_2);
      this.tabelaCausas.setSelectionForeground(Tema.FOREGROUND);
      this.tabelaCausas.setGridColor(Tema.BORDER);
      this.tabelaCausas.getTableHeader().setBackground(Tema.SURFACE_2);
      this.tabelaCausas.getTableHeader().setForeground(Tema.MUTED_FOREGROUND);
      this.tabelaCausas.getTableHeader().setFont(Tema.FONT_BOLD.deriveFont(12.0F));
      DefaultTableCellRenderer var2 = (DefaultTableCellRenderer)this.tabelaCausas.getDefaultRenderer(Object.class);
      var2.setBackground(Tema.SURFACE);
      var2.setForeground(Tema.FOREGROUND);
      this.scrollCausas.getViewport().setBackground(Tema.SURFACE);
      this.scrollCausas.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      this.labelDica.setForeground(Tema.MUTED_FOREGROUND);
      this.revalidate();
      this.repaint();
   }

   private static String toHex(Color var0) {
      return String.format("#%02x%02x%02x", var0.getRed(), var0.getGreen(), var0.getBlue());
   }
}
