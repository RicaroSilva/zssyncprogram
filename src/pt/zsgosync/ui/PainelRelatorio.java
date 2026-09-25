package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.FlowLayout;
import java.io.File;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Vector;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JFileChooser;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTabbedPane;
import javax.swing.JTable;
import javax.swing.JViewport;
import javax.swing.RowFilter;
import javax.swing.RowFilter.Entry;
import javax.swing.border.EmptyBorder;
import javax.swing.filechooser.FileNameExtensionFilter;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.db.InvoiceLineDetailDao;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.service.RelatorioService;

public class PainelRelatorio extends JPanel implements Tema.TemaOuvinte {
   private static final int COL_LINHAS_ISENTO = 6;
   private final JLabel labelResumoFaturas = new JLabel(" ");
   private final JLabel labelResumoNotasCredito = new JLabel(" ");
   private final DefaultTableModel modeloErros = new DefaultTableModel(new String[]{"Tipo", "ID do Cliente (user.id)", "Erro"}, 0) {
      @Override
      public boolean isCellEditable(int var1, int var2) {
         return false;
      }
   };
   private final JTable tabelaErros = new JTable(this.modeloErros);
   private final DefaultTableModel modeloLinhas = new DefaultTableModel(
      new String[]{"ID do Cliente (user.id)", "Nome", "NIF", "Rubrica", "Referência produto", "Nº transações", "Isento IVA", "Valor"}, 0
   ) {
      @Override
      public boolean isCellEditable(int var1, int var2) {
         return false;
      }
   };
   private final JTable tabelaLinhas = new JTable(this.modeloLinhas);
   private final TableRowSorter<DefaultTableModel> sorterLinhas = new TableRowSorter<>(this.modeloLinhas);
   private final JComboBox<String> filtroIsencao = new JComboBox<>(new String[]{"Todos", "Isentos de IVA", "Não isentos"});
   private final JButton btnDescarregarCsv = new JButton("Descarregar CSV");
   private final JTabbedPane subTabs = new JTabbedPane();
   private static final NumberFormat MOEDA = NumberFormat.getCurrencyInstance(new Locale("pt", "PT"));
   private static final NumberFormat NUMERO_CSV = NumberFormat.getNumberInstance(new Locale("pt", "PT"));
   private int anoAtual;
   private int mesAtual;

   public PainelRelatorio() {
      this.setLayout(new BorderLayout(10, 10));
      this.setOpaque(false);
      this.setBorder(new EmptyBorder(10, 0, 0, 0));
      JPanel var1 = new JPanel();
      var1.setLayout(new BoxLayout(var1, 1));
      var1.setOpaque(false);
      this.labelResumoFaturas.setFont(Tema.FONT_BOLD.deriveFont(14.0F));
      this.labelResumoNotasCredito.setFont(Tema.FONT_BOLD.deriveFont(14.0F));
      var1.add(this.labelResumoFaturas);
      var1.add(Box.createVerticalStrut(6));
      var1.add(this.labelResumoNotasCredito);
      var1.add(Box.createVerticalStrut(10));
      JPanel var2 = new JPanel(new FlowLayout(0, 8, 0));
      var2.setOpaque(false);
      JLabel var3 = new JLabel("Filtro (linhas por rubrica):");
      var3.setFont(Tema.FONT_BASE);
      this.filtroIsencao.setFont(Tema.FONT_BASE);
      var2.add(var3);
      var2.add(this.filtroIsencao);
      var2.add(Box.createHorizontalStrut(14));
      var2.add(this.btnDescarregarCsv);
      var2.setAlignmentX(0.0F);
      var1.add(var2);
      this.add(var1, "North");
      this.estilizarTabela(this.tabelaErros, new int[]{90, 150, 560});
      DetalheErro.instalar(this.tabelaErros, 1, 2);
      this.estilizarTabela(this.tabelaLinhas, new int[]{110, 170, 100, 150, 150, 110, 90, 110});
      this.tabelaLinhas.setRowSorter(this.sorterLinhas);
      this.subTabs.addTab("Erros", new JScrollPane(this.tabelaErros));
      this.subTabs.addTab("Linhas por rubrica", new JScrollPane(this.tabelaLinhas));
      this.subTabs.setFont(Tema.FONT_BOLD);
      this.add(this.subTabs, "Center");
      this.filtroIsencao.addActionListener(var1x -> this.aplicarFiltroLinhas());
      this.btnDescarregarCsv.addActionListener(var1x -> this.descarregarCsv());
      this.mostrarVazio();
      Tema.registar(this);
   }

   private void estilizarTabela(JTable var1, int[] var2) {
      var1.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      var1.setRowHeight(26);

      for (int var3 = 0; var3 < var2.length; var3++) {
         var1.getColumnModel().getColumn(var3).setPreferredWidth(var2[var3]);
      }

      var1.setDefaultRenderer(Object.class, new DefaultTableCellRenderer());
   }

   public void mostrarVazio() {
      this.labelResumoFaturas.setText("Faturas: escolhe um ano/mês e clica em Consultar.");
      this.labelResumoNotasCredito.setText(" ");
      this.modeloErros.setRowCount(0);
      this.modeloLinhas.setRowCount(0);
      this.aplicarCoresAgora();
   }

   public void mostrar(RelatorioService.Relatorio var1) {
      this.mostrar(var1, 0, 0);
   }

   public void mostrar(RelatorioService.Relatorio var1, int var2, int var3) {
      this.anoAtual = var2;
      this.mesAtual = var3;
      InvoiceSyncDao.Resumo var5 = var1.resumoFaturas;
      CreditNoteSyncDao.Resumo var6 = var1.resumoNotasCredito;
      this.labelResumoFaturas
         .setText(
            String.format(
               "Faturas — %d faturadas (%s), %d com erro, %d pendentes/noutro estado",
               var5.sincronizados,
               MOEDA.format(var5.valorTotal),
               var5.comErro,
               var5.pendentesOuOutros
            )
         );
      this.labelResumoNotasCredito
         .setText(String.format("Notas de Crédito — %d emitidas (%s), %d com erro", var6.sincronizados, MOEDA.format(var6.valorTotal), var6.comErro));
      this.modeloErros.setRowCount(0);

      for (InvoiceSyncDao.LinhaErro var8 : var1.errosFaturas) {
         Vector var4 = new Vector();
         var4.add("Fatura");
         var4.add(var8.clienteId);
         var4.add(var8.erro != null && !var8.erro.isBlank() ? var8.erro : "(erro sem mensagem gravada — execução antiga; volta a faturar para registar o motivo)");
         this.modeloErros.addRow(var4);
      }

      for (CreditNoteSyncDao.LinhaErro var13 : var1.errosNotasCredito) {
         Vector var9 = new Vector();
         var9.add("Nota Créd.");
         var9.add(var13.clienteId);
         var9.add(var13.erro != null && !var13.erro.isBlank() ? var13.erro : "(erro sem mensagem gravada — execução antiga; volta a faturar para registar o motivo)");
         this.modeloErros.addRow(var9);
      }

      this.modeloLinhas.setRowCount(0);
      if (var1.linhasPorRubrica != null) {
         for (InvoiceLineDetailDao.LinhaDetalhe var14 : var1.linhasPorRubrica) {
            Vector var10 = new Vector();
            var10.add(var14.clienteId);
            var10.add(var14.nome != null ? var14.nome : "");
            var10.add(var14.nif != null ? var14.nif : "");
            var10.add(var14.rubrica);
            var10.add(var14.productReference);
            var10.add(var14.nrTransacoes);
            var10.add(var14.isIsentoIva() ? "Sim" : "Não");
            var10.add(var14.valor != null ? MOEDA.format(var14.valor) : "");
            this.modeloLinhas.addRow(var10);
         }
      }

      this.aplicarFiltroLinhas();
      this.aplicarCoresAgora();
   }

   public void mostrarErro(String var1) {
      this.labelResumoFaturas.setText("Erro ao consultar: " + var1);
      this.labelResumoNotasCredito.setText(" ");
      this.modeloErros.setRowCount(0);
      this.modeloLinhas.setRowCount(0);
      this.aplicarCoresAgora();
   }

   private void aplicarFiltroLinhas() {
      String var1 = (String)this.filtroIsencao.getSelectedItem();
      if (var1 != null && !var1.equals("Todos")) {
         final String var2 = var1.equals("Isentos de IVA") ? "Sim" : "Não";
         this.sorterLinhas.setRowFilter(new RowFilter<DefaultTableModel, Integer>() {
            @Override
            public boolean include(Entry<? extends DefaultTableModel, ? extends Integer> var1) {
               return var2.equals(var1.getStringValue(6));
            }
         });
      } else {
         this.sorterLinhas.setRowFilter(null);
      }
   }

   private void descarregarCsv() {
      int var1 = this.tabelaLinhas.getRowCount();
      if (var1 == 0) {
         JOptionPane.showMessageDialog(this, "Não há linhas para exportar (consulta um relatório primeiro, ou ajusta o filtro).", "Nada para exportar", 1);
      } else {
         JFileChooser var2 = new JFileChooser();
         var2.setDialogTitle("Guardar relatório como CSV");
         String var3 = this.anoAtual > 0 && this.mesAtual > 0
            ? String.format("relatorio_rubricas_%04d_%02d.csv", this.anoAtual, this.mesAtual)
            : "relatorio_rubricas.csv";
         var2.setSelectedFile(new File(var3));
         var2.setFileFilter(new FileNameExtensionFilter("Ficheiro CSV", "csv"));
         int var4 = var2.showSaveDialog(this);
         if (var4 == 0) {
            File var5 = var2.getSelectedFile();
            if (!var5.getName().toLowerCase(Locale.ROOT).endsWith(".csv")) {
               var5 = new File(var5.getParentFile(), var5.getName() + ".csv");
            }

            try {
               this.escreverCsv(var5);
               JOptionPane.showMessageDialog(this, "Exportado com sucesso:\n" + var5.getAbsolutePath(), "CSV gerado", 1);
            } catch (IOException var7) {
               JOptionPane.showMessageDialog(this, "Falha ao gravar o CSV: " + var7.getMessage(), "Erro", 0);
            }
         }
      }
   }

   private void escreverCsv(File var1) throws IOException {
      try (OutputStreamWriter var2 = new OutputStreamWriter(Files.newOutputStream(var1.toPath()), StandardCharsets.UTF_8)) {
         var2.write(65279);
         int var3 = this.tabelaLinhas.getColumnCount();

         for (int var4 = 0; var4 < var3; var4++) {
            if (var4 > 0) {
               var2.write(59);
            }

            var2.write(csvEscape(this.tabelaLinhas.getColumnName(var4)));
         }

         var2.write("\r\n");
         int var10 = this.tabelaLinhas.getRowCount();

         for (int var5 = 0; var5 < var10; var5++) {
            for (int var6 = 0; var6 < var3; var6++) {
               if (var6 > 0) {
                  var2.write(59);
               }

               Object var7 = this.tabelaLinhas.getValueAt(var5, var6);
               var2.write(csvEscape(formatarValorCsv(var7)));
            }

            var2.write("\r\n");
         }
      }
   }

   private static String formatarValorCsv(Object var0) {
      if (var0 == null) {
         return "";
      } else {
         return var0 instanceof BigDecimal ? NUMERO_CSV.format(var0) : var0.toString();
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
      this.labelResumoFaturas.setForeground(Tema.FOREGROUND);
      this.labelResumoNotasCredito.setForeground(Tema.FOREGROUND);
      this.subTabs.setBackground(Tema.SURFACE_2);
      this.subTabs.setForeground(Tema.MUTED_FOREGROUND);
      this.estilizarCoresTabela(this.tabelaErros);
      this.estilizarCoresTabela(this.tabelaLinhas);
      this.revalidate();
      this.repaint();
   }

   private void estilizarCoresTabela(JTable var1) {
      var1.setBackground(Tema.SURFACE);
      var1.setForeground(Tema.FOREGROUND);
      var1.setSelectionBackground(Tema.SURFACE_2);
      var1.setSelectionForeground(Tema.FOREGROUND);
      var1.setGridColor(Tema.BORDER);
      var1.getTableHeader().setBackground(Tema.SURFACE_2);
      var1.getTableHeader().setForeground(Tema.MUTED_FOREGROUND);
      var1.getTableHeader().setFont(Tema.FONT_BOLD.deriveFont(12.0F));
      DefaultTableCellRenderer var2 = (DefaultTableCellRenderer)var1.getDefaultRenderer(Object.class);
      var2.setBackground(Tema.SURFACE);
      var2.setForeground(Tema.FOREGROUND);
      if (var1.getParent() instanceof JViewport var4) {
         var4.setBackground(Tema.SURFACE);
         if (var4.getParent() instanceof JScrollPane var6) {
            var6.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
         }
      }
   }
}
