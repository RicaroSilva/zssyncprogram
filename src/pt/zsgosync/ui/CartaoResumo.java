package pt.zsgosync.ui;

import java.awt.Color;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.border.EmptyBorder;

public class CartaoResumo extends JPanel {
   private Color corFundo;
   private final JLabel labelTitulo = new JLabel(" ");
   private final JLabel labelValor = new JLabel(" ");
   private final JLabel labelTendencia = new JLabel(" ");

   public CartaoResumo() {
      this.setOpaque(false);
      this.setLayout(new BoxLayout(this, 1));
      this.setBorder(new EmptyBorder(14, 16, 14, 16));
      this.labelTitulo.setAlignmentX(0.0F);
      this.labelValor.setAlignmentX(0.0F);
      this.labelTendencia.setAlignmentX(0.0F);
      this.add(this.labelTitulo);
      this.add(Box.createVerticalStrut(6));
      this.add(this.labelValor);
      this.add(Box.createVerticalStrut(2));
      this.add(this.labelTendencia);
   }

   public void configurar(String var1, String var2, String var3, Color var4, Color var5) {
      this.corFundo = var4;
      this.labelTitulo.setText(var1);
      this.labelTitulo.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      this.labelTitulo.setForeground(var5);
      this.labelValor.setText(var2);
      this.labelValor.setFont(Tema.FONT_BOLD.deriveFont(24.0F));
      this.labelValor.setForeground(var5);
      this.labelTendencia.setText(var3 != null ? var3 : " ");
      this.labelTendencia.setFont(Tema.FONT_BASE.deriveFont(12.0F));
      this.labelTendencia.setForeground(var5);
      this.repaint();
   }

   @Override
   protected void paintComponent(Graphics var1) {
      Graphics2D var2 = (Graphics2D)var1.create();
      var2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
      if (this.corFundo != null) {
         var2.setColor(this.corFundo);
         var2.fillRoundRect(0, 0, this.getWidth(), this.getHeight(), 14, 14);
      }

      var2.dispose();
      super.paintComponent(var1);
   }
}
