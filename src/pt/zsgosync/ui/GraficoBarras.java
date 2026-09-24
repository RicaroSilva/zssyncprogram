package pt.zsgosync.ui;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.math.BigDecimal;
import java.math.MathContext;
import java.time.Month;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.swing.JComponent;
import pt.zsgosync.service.DashboardService;

public class GraficoBarras extends JComponent {
   private List<DashboardService.PontoMensal> pontos = new ArrayList<>();
   private Color corBarra;
   private Color corBarraDestaque;
   private Color corTexto;
   private Color corGrade;

   public GraficoBarras(Color var1, Color var2, Color var3, Color var4) {
      this.corBarra = var1;
      this.corBarraDestaque = var2;
      this.corTexto = var3;
      this.corGrade = var4;
      this.setOpaque(false);
      this.setPreferredSize(new Dimension(400, 160));
   }

   public void definirCores(Color var1, Color var2, Color var3, Color var4) {
      this.corBarra = var1;
      this.corBarraDestaque = var2;
      this.corTexto = var3;
      this.corGrade = var4;
      this.repaint();
   }

   public void definirDados(List<DashboardService.PontoMensal> var1) {
      this.pontos = (List<DashboardService.PontoMensal>)(var1 != null ? var1 : new ArrayList<>());
      this.repaint();
   }

   @Override
   protected void paintComponent(Graphics var1) {
      Graphics2D var2 = (Graphics2D)var1.create();
      var2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
      int var3 = this.getWidth();
      int var4 = this.getHeight();
      byte var5 = 22;
      int var6 = var4 - var5 - 6;
      if (this.pontos.isEmpty()) {
         var2.dispose();
      } else {
         BigDecimal var7 = BigDecimal.ZERO;

         for (DashboardService.PontoMensal var9 : this.pontos) {
            if (var9.valor != null && var9.valor.compareTo(var7) > 0) {
               var7 = var9.valor;
            }
         }

         if (var7.compareTo(BigDecimal.ZERO) == 0) {
            var7 = BigDecimal.ONE;
         }

         int var22 = this.pontos.size();
         byte var23 = 10;
         int var10 = Math.max(8, (var3 - var23 * (var22 + 1)) / var22);
         int var11 = var23;
         var2.setFont(new Font("Segoe UI", 0, 11));
         FontMetrics var12 = var2.getFontMetrics();

         for (int var13 = 0; var13 < var22; var13++) {
            DashboardService.PontoMensal var14 = this.pontos.get(var13);
            double var15 = var14.valor != null ? var14.valor.divide(var7, MathContext.DECIMAL64).doubleValue() : 0.0;
            int var17 = (int)Math.round(var15 * (var6 - 10));
            int var18 = var6 - var17 + 4;
            boolean var19 = var13 == var22 - 1;
            var2.setColor(var19 ? this.corBarraDestaque : this.corBarra);
            var2.fillRoundRect(var11, var18, var10, Math.max(var17, 2), 4, 4);
            String var20 = Month.of(var14.mes).getDisplayName(TextStyle.SHORT, new Locale("pt", "PT"));
            var20 = var20.substring(0, 1).toUpperCase(Locale.ROOT) + var20.substring(1);
            var2.setColor(this.corTexto);
            int var21 = var12.stringWidth(var20);
            var2.drawString(var20, var11 + (var10 - var21) / 2, var4 - 6);
            var11 += var10 + var23;
         }

         var2.dispose();
      }
   }
}
