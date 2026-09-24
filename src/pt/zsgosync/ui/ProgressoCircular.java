package pt.zsgosync.ui;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import javax.swing.JComponent;

public class ProgressoCircular extends JComponent {
   private int total = 0;
   private int feitos = 0;
   private Color corAnel;
   private Color corFundo;
   private Color corTexto;

   public ProgressoCircular(Color var1, Color var2, Color var3) {
      this.corAnel = var1;
      this.corFundo = var2;
      this.corTexto = var3;
      this.setPreferredSize(new Dimension(140, 140));
      this.setOpaque(false);
   }

   public void definirCores(Color var1, Color var2, Color var3) {
      this.corAnel = var1;
      this.corFundo = var2;
      this.corTexto = var3;
      this.repaint();
   }

   public void definir(int var1, int var2) {
      this.feitos = var1;
      this.total = Math.max(var2, 1);
      this.repaint();
   }

   public void reiniciar() {
      this.feitos = 0;
      this.total = 0;
      this.repaint();
   }

   @Override
   protected void paintComponent(Graphics var1) {
      Graphics2D var2 = (Graphics2D)var1.create();
      var2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
      int var3 = Math.min(this.getWidth(), this.getHeight()) - 16;
      int var4 = (this.getWidth() - var3) / 2;
      int var5 = (this.getHeight() - var3) / 2;
      int var6 = Math.max(8, var3 / 12);
      var2.setStroke(new BasicStroke(var6, 1, 1));
      var2.setColor(this.corFundo);
      var2.drawOval(var4, var5, var3, var3);
      double var7 = this.total > 0 ? (double)this.feitos / this.total : 0.0;
      int var9 = (int)Math.round(var7 * 360.0);
      var2.setColor(this.corAnel);
      var2.drawArc(var4, var5, var3, var3, 90, -var9);
      String var10 = this.total > 0 ? (int)Math.round(var7 * 100.0) + "%" : "";
      var2.setFont(new Font("Segoe UI", 1, var3 / 6));
      var2.setColor(this.corTexto);
      FontMetrics var11 = var2.getFontMetrics();
      int var12 = this.getWidth() / 2 - var11.stringWidth(var10) / 2;
      int var13 = this.getHeight() / 2 + var11.getAscent() / 2 - 4;
      var2.drawString(var10, var12, var13);
      var2.dispose();
   }
}
