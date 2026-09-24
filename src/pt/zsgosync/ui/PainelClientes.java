package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.FlowLayout;
import java.text.SimpleDateFormat;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.Vector;
import javax.swing.BorderFactory;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.RowFilter;
import javax.swing.RowFilter.Entry;
import javax.swing.border.EmptyBorder;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
import pt.zsgosync.db.ClientListingDao;

public class PainelClientes extends JPanel implements Tema.TemaOuvinte {
   private static final int COL_ESTADO = 2;
   private static final int COL_ISENCAO = 10;
   private static final int COL_VERIFICACAO = 12;
   private static final String[] COLUNAS = new String[]{
      "ID (user.id)",
      "ZSGO code",
      "Estado",
      "Nome",
      "NIF",
      "Email",
      "Morada",
      "Código Postal",
      "Cidade",
      "País",
      "Isenção",
      "Região",
      "Verificação",
      "Atualizado em"
   };
   private final DefaultTableModel modelo = new DefaultTableModel(COLUNAS, 0) {
      @Override
      public boolean isCellEditable(int var1, int var2) {
         return false;
      }
   };
   private final JTable tabela = new JTable(this.modelo);
   private final TableRowSorter<DefaultTableModel> sorter = new TableRowSorter<>(this.modelo);
   private final JComboBox<String> filtro = new JComboBox<>(new String[]{"Todos", "Sincronizados", "Com erro", "Com isenção de IVA", "Desatualizados no ZSGO"});
   private final JLabel labelContagem = new JLabel(" ");
   private final JScrollPane scroll;
   private static final SimpleDateFormat DATA_FMT = new SimpleDateFormat("dd/MM/yyyy HH:mm");
   private final DefaultTableCellRenderer rendererPadrao;
   private Set<String> desatualizadosAtuais = new HashSet<>();

   public PainelClientes() {
      this.setLayout(new BorderLayout(10, 10));
      this.setOpaque(false);
      this.setBorder(new EmptyBorder(10, 0, 0, 0));
      JPanel var1 = new JPanel(new BorderLayout());
      var1.setOpaque(false);
      JPanel var2 = new JPanel(new FlowLayout(0, 8, 0));
      var2.setOpaque(false);
      JLabel var3 = new JLabel("Filtro:");
      var3.setFont(Tema.FONT_BASE);
      this.filtro.setFont(Tema.FONT_BASE);
      var2.add(var3);
      var2.add(this.filtro);
      var1.add(var2, "West");
      var1.add(this.labelContagem, "East");
      this.add(var1, "North");
      this.tabela.setRowSorter(this.sorter);
      this.tabela.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      this.tabela.setRowHeight(26);
      this.tabela.getColumnModel().getColumn(0).setPreferredWidth(90);
      this.tabela.getColumnModel().getColumn(1).setPreferredWidth(90);
      this.tabela.getColumnModel().getColumn(2).setPreferredWidth(110);
      this.tabela.getColumnModel().getColumn(3).setPreferredWidth(170);
      this.tabela.getColumnModel().getColumn(4).setPreferredWidth(100);
      this.tabela.getColumnModel().getColumn(5).setPreferredWidth(170);
      this.tabela.getColumnModel().getColumn(6).setPreferredWidth(170);
      this.tabela.getColumnModel().getColumn(7).setPreferredWidth(90);
      this.tabela.getColumnModel().getColumn(8).setPreferredWidth(110);
      this.tabela.getColumnModel().getColumn(9).setPreferredWidth(60);
      this.tabela.getColumnModel().getColumn(10).setPreferredWidth(80);
      this.tabela.getColumnModel().getColumn(11).setPreferredWidth(70);
      this.tabela.getColumnModel().getColumn(12).setPreferredWidth(130);
      this.tabela.getColumnModel().getColumn(13).setPreferredWidth(130);
      this.rendererPadrao = new DefaultTableCellRenderer() {
         @Override
         public Component getTableCellRendererComponent(JTable var1, Object var2x, boolean var3x, boolean var4, int var5, int var6) {
            Component var7 = super.getTableCellRendererComponent(var1, var2x, var3x, var4, var5, var6);
            if (!var3x) {
               if (var6 == 12 && "DESATUALIZADO".equals(var2x)) {
                  var7.setForeground(Tema.DESTRUCTIVE);
               } else {
                  var7.setForeground(Tema.FOREGROUND);
               }
            }

            return var7;
         }
      };
      this.tabela.setDefaultRenderer(Object.class, this.rendererPadrao);
      this.scroll = new JScrollPane(this.tabela);
      this.add(this.scroll, "Center");
      this.filtro.addActionListener(var1x -> this.aplicarFiltro());
      Tema.registar(this);
      this.aplicarCoresAgora();
   }

   public void mostrar(List<ClientListingDao.ClienteResumo> var1) {
      this.mostrar(var1, null);
   }

   public void mostrar(List<ClientListingDao.ClienteResumo> var1, Set<String> var2) {
      this.desatualizadosAtuais = (Set<String>)(var2 != null ? var2 : new HashSet<>());
      this.modelo.setRowCount(0);

      for (ClientListingDao.ClienteResumo var4 : var1) {
         Vector var5 = new Vector();
         var5.add(var4.sourceId);
         var5.add(var4.zsgoCode != null ? var4.zsgoCode : "");
         var5.add(var4.status != null ? var4.status : "");
         var5.add(var4.nome != null ? var4.nome : "");
         var5.add(var4.nif != null ? var4.nif : "");
         var5.add(var4.email != null ? var4.email : "");
         var5.add(var4.morada != null ? var4.morada : "");
         var5.add(var4.codigoPostal != null ? var4.codigoPostal : "");
         var5.add(var4.cidade != null ? var4.cidade : "");
         var5.add(var4.pais != null ? var4.pais : "");
         var5.add(var4.exemptionCode != null ? var4.exemptionCode : "");
         var5.add(var4.regionCode != null ? var4.regionCode : "");
         var5.add(this.desatualizadosAtuais.contains(var4.sourceId) ? "DESATUALIZADO" : "-");
         var5.add(var4.atualizadoEm != null ? DATA_FMT.format(var4.atualizadoEm) : "");
         this.modelo.addRow(var5);
      }

      String var6 = this.desatualizadosAtuais.isEmpty() ? "" : " — " + this.desatualizadosAtuais.size() + " por atualizar no ZSGO";
      this.labelContagem.setText(var1.size() + " clientes no total" + var6);
      this.aplicarFiltro();
   }

   public void mostrarErro(String var1) {
      this.modelo.setRowCount(0);
      this.labelContagem.setText("Erro ao consultar: " + var1);
   }

   private void aplicarFiltro() {
      final String var1 = (String)this.filtro.getSelectedItem();
      if (var1 != null && !var1.equals("Todos")) {
         this.sorter.setRowFilter(new RowFilter<DefaultTableModel, Integer>() {
            @Override
            public boolean include(Entry<? extends DefaultTableModel, ? extends Integer> var1x) {
               String var2 = var1;
               switch (var2) {
                  case "Sincronizados":
                     return "SINCRONIZADO".equals(var1x.getStringValue(2));
                  case "Com erro":
                     return "ERRO".equals(var1x.getStringValue(2));
                  case "Com isenção de IVA":
                     String var4 = var1x.getStringValue(10);
                     return var4 != null && !var4.isBlank();
                  case "Desatualizados no ZSGO":
                     return "DESATUALIZADO".equals(var1x.getStringValue(12));
                  default:
                     return true;
               }
            }
         });
      } else {
         this.sorter.setRowFilter(null);
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
      this.rendererPadrao.setBackground(Tema.SURFACE);
      this.rendererPadrao.setForeground(Tema.FOREGROUND);
      this.scroll.getViewport().setBackground(Tema.SURFACE);
      this.scroll.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      this.tabela.repaint();
      this.revalidate();
      this.repaint();
   }
}
