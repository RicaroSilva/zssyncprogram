package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.io.File;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Vector;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JFileChooser;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.JTextField;
import javax.swing.RowFilter;
import javax.swing.RowFilter.Entry;
import javax.swing.border.EmptyBorder;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import javax.swing.filechooser.FileNameExtensionFilter;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
import pt.zsgosync.db.HistoricoDao;

public class PainelHistorico extends JPanel implements Tema.TemaOuvinte {
   private static final int COL_ACAO = 1;
   private static final String[] COLUNAS = new String[]{"Data/Hora", "Utilizador", "Ação", "Detalhe"};
   private final DefaultTableModel modelo = new DefaultTableModel(COLUNAS, 0) {
      @Override
      public boolean isCellEditable(int var1, int var2) {
         return false;
      }
   };
   private final JTable tabela = new JTable(this.modelo);
   private final TableRowSorter<DefaultTableModel> sorter = new TableRowSorter<>(this.modelo);
   private final JComboBox<String> filtroAcao = new JComboBox<>(new String[]{"Todas as ações"});
   private final JTextField campoBusca = new JTextField();
   private final JButton btnDescarregarCsv = new JButton("Descarregar CSV");
   private final JLabel labelContagem = new JLabel(" ");
   private final JScrollPane scroll;
   private static final SimpleDateFormat DATA_FMT = new SimpleDateFormat("dd/MM/yyyy HH:mm:ss");

   public PainelHistorico() {
      this.setLayout(new BorderLayout(10, 10));
      this.setOpaque(false);
      this.setBorder(new EmptyBorder(10, 0, 0, 0));
      JPanel var1 = new JPanel(new BorderLayout());
      var1.setOpaque(false);
      JPanel var2 = new JPanel(new FlowLayout(0, 8, 0));
      var2.setOpaque(false);
      JLabel var3 = new JLabel("Ação:");
      var3.setFont(Tema.FONT_BASE);
      this.filtroAcao.setFont(Tema.FONT_BASE);
      JLabel var4 = new JLabel("Procurar:");
      var4.setFont(Tema.FONT_BASE);
      this.campoBusca.setFont(Tema.FONT_BASE);
      this.campoBusca.setPreferredSize(new Dimension(200, this.campoBusca.getPreferredSize().height));
      var2.add(var3);
      var2.add(this.filtroAcao);
      var2.add(Box.createHorizontalStrut(12));
      var2.add(var4);
      var2.add(this.campoBusca);
      var2.add(Box.createHorizontalStrut(12));
      var2.add(this.btnDescarregarCsv);
      var1.add(var2, "West");
      var1.add(this.labelContagem, "East");
      this.add(var1, "North");
      this.tabela.setRowSorter(this.sorter);
      this.tabela.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      this.tabela.setRowHeight(26);
      this.tabela.getColumnModel().getColumn(0).setPreferredWidth(140);
      this.tabela.getColumnModel().getColumn(1).setPreferredWidth(120);
      this.tabela.getColumnModel().getColumn(2).setPreferredWidth(190);
      this.tabela.getColumnModel().getColumn(3).setPreferredWidth(430);
      this.tabela.setDefaultRenderer(Object.class, new DefaultTableCellRenderer());
      this.scroll = new JScrollPane(this.tabela);
      this.add(this.scroll, "Center");
      this.filtroAcao.addActionListener(var1x -> this.aplicarFiltro());
      this.campoBusca.getDocument().addDocumentListener(new DocumentListener() {
         @Override
         public void insertUpdate(DocumentEvent var1) {
            PainelHistorico.this.aplicarFiltro();
         }

         @Override
         public void removeUpdate(DocumentEvent var1) {
            PainelHistorico.this.aplicarFiltro();
         }

         @Override
         public void changedUpdate(DocumentEvent var1) {
            PainelHistorico.this.aplicarFiltro();
         }
      });
      this.btnDescarregarCsv.addActionListener(var1x -> this.descarregarCsv());
      Tema.registar(this);
      this.aplicarCoresAgora();
   }

   public void mostrar(List<HistoricoDao.Entrada> var1) {
      String var2 = (String)this.filtroAcao.getSelectedItem();
      LinkedHashSet<String> var3 = new LinkedHashSet<>();
      var3.add("Todas as ações");

      for (HistoricoDao.Entrada var5 : var1) {
         if (var5.acao != null) {
            var3.add(var5.acao);
         }
      }

      this.filtroAcao.removeAllItems();

      for (String var9 : var3) {
         this.filtroAcao.addItem(var9);
      }

      if (var2 != null && var3.contains(var2)) {
         this.filtroAcao.setSelectedItem(var2);
      }

      this.modelo.setRowCount(0);

      for (HistoricoDao.Entrada var10 : var1) {
         Vector var6 = new Vector();
         var6.add(var10.criadoEm != null ? DATA_FMT.format(var10.criadoEm) : "");
         var6.add(var10.utilizador != null ? var10.utilizador : "");
         var6.add(var10.acao != null ? var10.acao : "");
         var6.add(var10.detalhe != null ? var10.detalhe : "");
         this.modelo.addRow(var6);
      }

      this.labelContagem.setText(var1.size() + " entrada(s)");
      this.aplicarFiltro();
   }

   public void mostrarErro(String var1) {
      this.modelo.setRowCount(0);
      this.labelContagem.setText("Erro ao consultar: " + var1);
   }

   private void aplicarFiltro() {
      final String var1 = (String)this.filtroAcao.getSelectedItem();
      final String var2 = this.campoBusca.getText().trim().toLowerCase(Locale.ROOT);
      this.sorter
         .setRowFilter(
            new RowFilter<DefaultTableModel, Integer>() {
               @Override
               public boolean include(Entry<? extends DefaultTableModel, ? extends Integer> var1x) {
                  if (var1 != null && !var1.equals("Todas as ações") && !var1.equals(var1x.getStringValue(1))) {
                     return false;
                  } else if (!var2.isEmpty()) {
                     String var2x = (var1x.getStringValue(0) + " " + var1x.getStringValue(1) + " " + var1x.getStringValue(2) + " " + var1x.getStringValue(3))
                        .toLowerCase(Locale.ROOT);
                     return var2x.contains(var2);
                  } else {
                     return true;
                  }
               }
            }
         );
   }

   private void descarregarCsv() {
      int var1 = this.tabela.getRowCount();
      if (var1 == 0) {
         JOptionPane.showMessageDialog(this, "Não há linhas para exportar.", "Nada para exportar", 1);
      } else {
         JFileChooser var2 = new JFileChooser();
         var2.setDialogTitle("Guardar histórico como CSV");
         var2.setSelectedFile(new File("historico.csv"));
         var2.setFileFilter(new FileNameExtensionFilter("Ficheiro CSV", "csv"));
         int var3 = var2.showSaveDialog(this);
         if (var3 == 0) {
            File var4 = var2.getSelectedFile();
            if (!var4.getName().toLowerCase(Locale.ROOT).endsWith(".csv")) {
               var4 = new File(var4.getParentFile(), var4.getName() + ".csv");
            }

            try {
               this.escreverCsv(var4);
               JOptionPane.showMessageDialog(this, "Exportado com sucesso:\n" + var4.getAbsolutePath(), "CSV gerado", 1);
            } catch (IOException var6) {
               JOptionPane.showMessageDialog(this, "Falha ao gravar o CSV: " + var6.getMessage(), "Erro", 0);
            }
         }
      }
   }

   private void escreverCsv(File var1) throws IOException {
      try (OutputStreamWriter var2 = new OutputStreamWriter(Files.newOutputStream(var1.toPath()), StandardCharsets.UTF_8)) {
         var2.write(65279);
         int var3 = this.tabela.getColumnCount();

         for (int var4 = 0; var4 < var3; var4++) {
            if (var4 > 0) {
               var2.write(59);
            }

            var2.write(csvEscape(this.tabela.getColumnName(var4)));
         }

         var2.write("\r\n");
         int var10 = this.tabela.getRowCount();

         for (int var5 = 0; var5 < var10; var5++) {
            for (int var6 = 0; var6 < var3; var6++) {
               if (var6 > 0) {
                  var2.write(59);
               }

               Object var7 = this.tabela.getValueAt(var5, var6);
               var2.write(csvEscape(var7 != null ? var7.toString() : ""));
            }

            var2.write("\r\n");
         }
      }
   }

   private static String csvEscape(String var0) {
      if (var0 == null) {
         return "";
      } else {
         return !var0.contains(";") && !var0.contains("\"") && !var0.contains("\n") ? var0 : "\"" + var0.replace("\"", "\"\"") + "\"";
      }
   }

   @Override
   public void aoMudarTema() {
      this.aplicarCoresAgora();
   }

   private void aplicarCoresAgora() {
      this.labelContagem.setForeground(Tema.MUTED_FOREGROUND);
      this.labelContagem.setFont(Tema.FONT_BASE);
      this.tabela.setBackground(Tema.SURFACE);
      this.tabela.setForeground(Tema.FOREGROUND);
      this.tabela.setSelectionBackground(Tema.SURFACE_2);
      this.tabela.setSelectionForeground(Tema.FOREGROUND);
      this.tabela.setGridColor(Tema.BORDER);
      this.tabela.getTableHeader().setBackground(Tema.SURFACE_2);
      this.tabela.getTableHeader().setForeground(Tema.MUTED_FOREGROUND);
      this.tabela.getTableHeader().setFont(Tema.FONT_BOLD.deriveFont(12.0F));
      DefaultTableCellRenderer var1 = (DefaultTableCellRenderer)this.tabela.getDefaultRenderer(Object.class);
      var1.setBackground(Tema.SURFACE);
      var1.setForeground(Tema.FOREGROUND);
      this.scroll.getViewport().setBackground(Tema.SURFACE);
      this.scroll.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      this.revalidate();
      this.repaint();
   }
}
