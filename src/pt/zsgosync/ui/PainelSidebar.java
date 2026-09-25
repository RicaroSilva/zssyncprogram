package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.function.Consumer;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.border.EmptyBorder;

public class PainelSidebar extends JPanel implements Tema.TemaOuvinte {
   private final Map<String, PainelSidebar.LinhaItem> linhas = new LinkedHashMap<>();
   private String selecionado;
   private Consumer<String> aoSelecionar;

   public PainelSidebar(List<PainelSidebar.Item> var1) {
      this.setLayout(new BoxLayout(this, 1));
      this.setPreferredSize(new Dimension(224, 10));
      this.setBorder(new EmptyBorder(18, 12, 18, 12));

      for (final PainelSidebar.Item var3 : var1) {
         PainelSidebar.LinhaItem var4 = new PainelSidebar.LinhaItem(var3);
         var4.setAlignmentX(0.0F);
         var4.setMaximumSize(new Dimension(2147483647, 42));
         var4.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent var1) {
               PainelSidebar.this.selecionar(var3.id);
            }
         });
         this.add(var4);
         this.add(Box.createVerticalStrut(4));
         this.linhas.put(var3.id, var4);
      }

      this.add(Box.createVerticalGlue());
      Tema.registar(this);
      this.aplicarCoresAgora();
   }

   public void aoSelecionar(Consumer<String> var1) {
      this.aoSelecionar = var1;
   }

   public void selecionar(String var1) {
      this.selecionado = var1;

      for (Entry var3 : this.linhas.entrySet()) {
         ((PainelSidebar.LinhaItem)var3.getValue()).definirAtivo(((String)var3.getKey()).equals(var1));
      }

      if (this.aoSelecionar != null) {
         this.aoSelecionar.accept(var1);
      }
   }

   @Override
   public void aoMudarTema() {
      this.aplicarCoresAgora();
   }

   private void aplicarCoresAgora() {
      this.setBackground(Tema.SURFACE);
      this.setOpaque(true);

      for (PainelSidebar.LinhaItem var2 : this.linhas.values()) {
         var2.aplicarCores();
      }

      this.revalidate();
      this.repaint();
   }

   public static class Item {
      public final String id;
      public final String icone;
      public final String rotulo;

      public Item(String var1, String var2, String var3) {
         this.id = var1;
         this.icone = var2;
         this.rotulo = var3;
      }
   }

   private static class LinhaItem extends JPanel {
      private final PainelSidebar.Item item;
      private final IconeVetorial icone;
      private final JLabel rotulo;
      private boolean ativo = false;
      private boolean hover = false;

      LinhaItem(PainelSidebar.Item var1) {
         this.item = var1;
         this.setOpaque(false);
         this.setLayout(new BorderLayout(10, 0));
         this.setBorder(new EmptyBorder(9, 12, 9, 12));
         this.setCursor(Cursor.getPredefinedCursor(12));
         this.icone = new IconeVetorial(var1.icone, Tema.MUTED_FOREGROUND);
         this.rotulo = new JLabel(var1.rotulo);
         this.add(this.icone, "West");
         this.add(this.rotulo, "Center");
         this.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseEntered(MouseEvent var1) {
               LinhaItem.this.hover = true;
               LinhaItem.this.repaint();
            }

            @Override
            public void mouseExited(MouseEvent var1) {
               LinhaItem.this.hover = false;
               LinhaItem.this.repaint();
            }
         });
      }

      void definirAtivo(boolean var1) {
         this.ativo = var1;
         this.aplicarCores();
      }

      void aplicarCores() {
         Color var1 = this.ativo ? Tema.PRIMARY_FOREGROUND : Tema.MUTED_FOREGROUND;
         this.icone.definirCor(var1);
         this.rotulo.setFont(this.ativo ? Tema.FONT_BOLD.deriveFont(13.0F) : Tema.FONT_BASE.deriveFont(13.0F));
         this.rotulo.setForeground(var1);
         this.repaint();
      }

      @Override
      protected void paintComponent(Graphics var1) {
         Graphics2D var2 = (Graphics2D)var1.create();
         var2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
         if (this.ativo) {
            var2.setColor(Tema.PRIMARY);
            var2.fillRoundRect(0, 0, this.getWidth(), this.getHeight(), 10, 10);
         } else if (this.hover) {
            var2.setColor(Tema.SURFACE_2);
            var2.fillRoundRect(0, 0, this.getWidth(), this.getHeight(), 10, 10);
         }

         var2.dispose();
         super.paintComponent(var1);
      }
   }
}
