package pt.zsgosync.ui;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.GeneralPath;
import java.awt.geom.RoundRectangle2D.Float;
import javax.swing.JComponent;

public class IconeVetorial extends JComponent {
   private final String tipo;
   private Color cor;

   public IconeVetorial(String var1, Color var2) {
      this.tipo = var1;
      this.cor = var2;
      this.setOpaque(false);
      this.setPreferredSize(new Dimension(18, 18));
      this.setMinimumSize(new Dimension(18, 18));
      this.setMaximumSize(new Dimension(18, 18));
   }

   public void definirCor(Color var1) {
      this.cor = var1;
      this.repaint();
   }

   @Override
   protected void paintComponent(Graphics var1) {
      Graphics2D var2 = (Graphics2D)var1.create();
      var2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
      var2.setColor(this.cor);
      var2.setStroke(new BasicStroke(1.7F, 1, 1));
      desenhar(var2, this.tipo, this.getWidth(), this.getHeight());
      var2.dispose();
   }

   public static void desenhar(Graphics2D var0, String var1, int var2, int var3) {
      byte var4 = 3;
      int var5 = var2 - 2 * var4;
      int var6 = var3 - 2 * var4;
      switch (var1) {
         case "resumo":
            int var25 = (var5 - 3) / 2;
            var0.draw(new Float(var4, var4, var25, var25, 2.0F, 2.0F));
            var0.draw(new Float(var4 + var25 + 3, var4, var25, var25, 2.0F, 2.0F));
            var0.draw(new Float(var4, var4 + var25 + 3, var25, var25, 2.0F, 2.0F));
            var0.draw(new Float(var4 + var25 + 3, var4 + var25 + 3, var25, var25, 2.0F, 2.0F));
            break;
         case "sincronizar":
            float var24 = var2 / 2.0F;
            float var30 = var3 / 2.0F;
            float var34 = Math.min(var5, var6) / 2.0F - 1.0F;
            java.awt.geom.Arc2D.Float var36 = new java.awt.geom.Arc2D.Float(var24 - var34, var30 - var34, var34 * 2.0F, var34 * 2.0F, 20.0F, 300.0F, 0);
            var0.draw(var36);
            pontaDeSeta(var0, var24, var30, var34, 20.0);
            break;
         case "faturacao":
            var0.draw(new Float(var4 + 1, var4, var5 - 2, var6, 2.0F, 2.0F));
            float var23 = var4 + var6 * 0.35F;
            float var29 = var4 + var6 * 0.55F;
            float var33 = var4 + var6 * 0.75F;
            var0.draw(new java.awt.geom.Line2D.Float(var4 + 3, var23, var2 - var4 - 3, var23));
            var0.draw(new java.awt.geom.Line2D.Float(var4 + 3, var29, var2 - var4 - 5, var29));
            var0.draw(new java.awt.geom.Line2D.Float(var4 + 3, var33, var2 - var4 - 3, var33));
            break;
         case "relatorio":
            float var22 = var3 - var4;
            float var28 = (var5 - 4) / 3.0F;
            var0.draw(new Float(var4, var22 - var6 * 0.4F, var28, var6 * 0.4F, 1.0F, 1.0F));
            var0.draw(new Float(var4 + var28 + 2.0F, var22 - var6 * 0.75F, var28, var6 * 0.75F, 1.0F, 1.0F));
            var0.draw(new Float(var4 + 2.0F * (var28 + 2.0F), var22 - var6 * 0.55F, var28, var6 * 0.55F, 1.0F, 1.0F));
            break;
         case "clientes":
            float var21 = var6 * 0.16F;
            float var27 = var4 + var21 + 1.0F;
            float var32 = var4 + var5 * 0.3F;
            float var35 = var4 + var5 * 0.68F;
            var0.draw(new java.awt.geom.Ellipse2D.Float(var32 - var21, var27 - var21, var21 * 2.0F, var21 * 2.0F));
            var0.draw(new java.awt.geom.Ellipse2D.Float(var35 - var21, var27 - var21, var21 * 2.0F, var21 * 2.0F));
            float var37 = var5 * 0.3F;
            float var38 = var27 + var21 * 1.3F;
            java.awt.geom.Arc2D.Float var15 = new java.awt.geom.Arc2D.Float(var32 - var37, var38, var37 * 2.0F, var37 * 1.6F, 0.0F, 180.0F, 0);
            java.awt.geom.Arc2D.Float var39 = new java.awt.geom.Arc2D.Float(var35 - var37, var38, var37 * 2.0F, var37 * 1.6F, 0.0F, 180.0F, 0);
            var0.draw(var15);
            var0.draw(var39);
            break;
         case "historico":
            float var20 = var2 / 2.0F;
            float var26 = var3 / 2.0F;
            float var31 = Math.min(var5, var6) / 2.0F;
            var0.draw(new java.awt.geom.Ellipse2D.Float(var20 - var31, var26 - var31, var31 * 2.0F, var31 * 2.0F));
            var0.draw(new java.awt.geom.Line2D.Float(var20, var26, var20, var26 - var31 * 0.55F));
            var0.draw(new java.awt.geom.Line2D.Float(var20, var26, var20 + var31 * 0.4F, var26 + var31 * 0.2F));
            break;
         case "utilizadores":
            float var9 = var2 / 2.0F;
            float var10 = var3 / 2.0F;
            float var11 = Math.min(var5, var6) / 2.0F;
            float var12 = var11 * 0.45F;
            var0.draw(new java.awt.geom.Ellipse2D.Float(var9 - var12, var10 - var12, var12 * 2.0F, var12 * 2.0F));

            for (int var13 = 0; var13 < 6; var13++) {
               double var14 = Math.toRadians(var13 * 60);
               float var16 = (float)(var9 + Math.cos(var14) * var12 * 1.3);
               float var17 = (float)(var10 + Math.sin(var14) * var12 * 1.3);
               float var18 = (float)(var9 + Math.cos(var14) * var11);
               float var19 = (float)(var10 + Math.sin(var14) * var11);
               var0.draw(new java.awt.geom.Line2D.Float(var16, var17, var18, var19));
            }
            break;
         default:
            var0.draw(new java.awt.geom.Ellipse2D.Float(var4, var4, var5, var6));
      }
   }

   private static void pontaDeSeta(Graphics2D var0, float var1, float var2, float var3, double var4) {
      double var6 = Math.toRadians(var4);
      float var8 = (float)(var1 + Math.cos(var6) * var3);
      float var9 = (float)(var2 + Math.sin(var6) * var3);
      double var10 = var6 + Math.toRadians(150.0);
      double var12 = var6 - Math.toRadians(150.0);
      float var14 = 3.2F;
      GeneralPath var15 = new GeneralPath();
      var15.moveTo(var8, var9);
      var15.lineTo(var8 + (float)Math.cos(var10) * var14, var9 + (float)Math.sin(var10) * var14);
      var15.moveTo(var8, var9);
      var15.lineTo(var8 + (float)Math.cos(var12) * var14, var9 + (float)Math.sin(var12) * var14);
      var0.draw(var15);
   }
}
