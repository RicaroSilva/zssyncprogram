package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Toolkit;
import java.awt.datatransfer.StringSelection;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import javax.swing.JButton;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.JTextArea;
import javax.swing.table.DefaultTableCellRenderer;

/**
 * Ajuda a ver erros longos numa tabela: tooltip com o texto completo e
 * duplo-clique numa linha abre uma janela com o erro inteiro (copiável).
 */
public final class DetalheErro {
   private static final int MAX_TOOLTIP = 1500;

   private DetalheErro() {
   }

   /** Liga tooltip + duplo-clique à tabela. colunaId pode ser -1. */
   public static void instalar(final JTable var0, final int var1, final int var2) {
      var0.setToolTipText("");
      var0.getColumnModel().getColumn(var2).setCellRenderer(new DefaultTableCellRenderer() {
         @Override
         public Component getTableCellRendererComponent(JTable var1x, Object var2x, boolean var3, boolean var4, int var5, int var6) {
            Component var7 = super.getTableCellRendererComponent(var1x, var2x, var3, var4, var5, var6);
            if (!var3) {
               var7.setBackground(Tema.SURFACE);
               var7.setForeground(Tema.FOREGROUND);
            }

            String var8 = var2x == null ? "" : var2x.toString();
            this.setToolTipText(var8.isEmpty() ? null : tooltip(var8));
            return var7;
         }
      });
      var0.addMouseListener(new MouseAdapter() {
         @Override
         public void mouseClicked(MouseEvent var1x) {
            if (var1x.getClickCount() == 2) {
               int var2x = var0.rowAtPoint(var1x.getPoint());
               if (var2x >= 0) {
                  int var3 = var0.convertRowIndexToModel(var2x);
                  Object var4 = var1 >= 0 ? var0.getModel().getValueAt(var3, var1) : null;
                  Object var5 = var0.getModel().getValueAt(var3, var2);
                  mostrar(var0, var4 == null ? null : var4.toString(), var5 == null ? "" : var5.toString());
               }
            }
         }
      });
   }

   public static void mostrar(Component var0, String var1, String var2) {
      JTextArea var3 = new JTextArea(var2.isEmpty() ? "(sem texto de erro gravado)" : var2);
      var3.setEditable(false);
      var3.setLineWrap(true);
      var3.setWrapStyleWord(true);
      var3.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      var3.setCaretPosition(0);
      JScrollPane var4 = new JScrollPane(var3);
      var4.setPreferredSize(new Dimension(760, 380));
      JButton var5 = new JButton("Copiar");
      var5.addActionListener(var1x -> Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(var2), null));
      JPanel var6 = new JPanel(new BorderLayout(0, 8));
      var6.add(var4, "Center");
      var6.add(var5, "South");
      JOptionPane.showMessageDialog(var0, var6, var1 == null ? "Detalhe do erro" : "Erro — cliente " + var1, JOptionPane.PLAIN_MESSAGE);
   }

   private static String tooltip(String var0) {
      String var1 = var0.length() > MAX_TOOLTIP ? var0.substring(0, MAX_TOOLTIP) + " …" : var0;
      var1 = var1.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
      return "<html><div style='width:520px'>" + var1 + "<br/><i>(duplo-clique para ver tudo)</i></div></html>";
   }
}
