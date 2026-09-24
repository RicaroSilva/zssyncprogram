package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Frame;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.text.SimpleDateFormat;
import java.util.Date;
import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JDialog;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.SwingUtilities;
import javax.swing.border.EmptyBorder;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.zsgo.ZsgoApiClient;

public class PainelDescobrirLimite extends JDialog {
   private static final int INTERVALO_SEGUNDOS = 5;
   private static final SimpleDateFormat HORA_FMT = new SimpleDateFormat("HH:mm:ss");
   private final AppConfig appConfig;
   private volatile boolean aCorrer = false;
   private final JTextArea log = new JTextArea();
   private final JLabel labelEstado = new JLabel("Parado.");
   private final JButton btnIniciar = new JButton("Iniciar");
   private final JButton btnParar = new JButton("Parar");
   private Integer ultimoRemaining;
   private long inicioAcompanhamentoMillis = -1L;

   public PainelDescobrirLimite(Frame var1, AppConfig var2) {
      super(var1, "Descobrir janela do limite de taxa (ZSGO)", false);
      this.appConfig = var2;
      this.setSize(560, 420);
      this.setLocationRelativeTo(var1);
      JPanel var3 = new JPanel(new BorderLayout(10, 10));
      var3.setBorder(new EmptyBorder(14, 14, 14, 14));
      var3.setBackground(Tema.SURFACE);
      JLabel var4 = new JLabel(
         "<html>Chama GET /countries a cada 5 segundos (carga mínima) e vigia o \"Remaining\".<br/>Quando ele voltar a subir, é sinal de que a janela do limite reiniciou.</html>"
      );
      var4.setFont(Tema.FONT_BASE);
      var3.add(var4, "North");
      this.log.setEditable(false);
      this.log.setFont(Tema.FONT_MONO);
      JScrollPane var5 = new JScrollPane(this.log);
      var5.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      var3.add(var5, "Center");
      JPanel var6 = new JPanel(new BorderLayout(10, 0));
      var6.setOpaque(false);
      this.labelEstado.setFont(Tema.FONT_BASE);
      var6.add(this.labelEstado, "Center");
      JPanel var7 = new JPanel();
      var7.setOpaque(false);
      var7.add(this.btnIniciar);
      var7.add(this.btnParar);
      var6.add(var7, "East");
      var3.add(var6, "South");
      this.setContentPane(var3);
      this.btnParar.setEnabled(false);
      this.btnIniciar.addActionListener(var1x -> this.iniciar());
      this.btnParar.addActionListener(var1x -> this.parar());
      this.addWindowListener(new WindowAdapter() {
         @Override
         public void windowClosing(WindowEvent var1) {
            PainelDescobrirLimite.this.parar();
         }
      });
   }

   private void iniciar() {
      this.aCorrer = true;
      this.ultimoRemaining = null;
      this.inicioAcompanhamentoMillis = -1L;
      this.btnIniciar.setEnabled(false);
      this.btnParar.setEnabled(true);
      this.labelEstado.setText("A vigiar...");
      this.adicionarLinha("A começar — um pedido a cada 5 segundos.");
      new Thread(() -> {
         while (this.aCorrer) {
            this.verificarUmaVez();

            try {
               Thread.sleep(5000L);
            } catch (InterruptedException var2) {
               Thread.currentThread().interrupt();
               break;
            }
         }
      }, "descobrir-limite-zsgo").start();
   }

   private void verificarUmaVez() {
      long var1 = System.currentTimeMillis();

      try {
         ZsgoApiClient var3 = new ZsgoApiClient(
            this.appConfig.get("zsgo.baseUrl"),
            this.appConfig.get("zsgo.token"),
            this.appConfig.getOrDefault("zsgo.default.priceLine", "1"),
            this.appConfig.getOrDefault("zsgo.default.paymentOptionId", null),
            this.appConfig.getOrDefault("zsgo.default.paymentMethodId", null),
            this.appConfig.getOrDefault("zsgo.default.familyId", "1"),
            this.appConfig.getOrDefault("zsgo.default.itemTypeCode", "S"),
            this.appConfig.getOrDefault("zsgo.default.unitCode", "UNI"),
            this.appConfig.getOrDefault("zsgo.default.saleTax", "23"),
            this.appConfig.getOrDefault("zsgo.default.exemptionCode", "M01")
         );
         ZsgoApiClient.ResultadoTesteLigacao var8 = var3.testarLigacao();
         Integer var5 = var8.valorRemaining();
         Integer var6 = var8.valorLimite();
         SwingUtilities.invokeLater(() -> this.processarLeitura(var1, var5, var6));
      } catch (Exception var7) {
         String var4 = var7.getMessage();
         SwingUtilities.invokeLater(() -> this.adicionarLinha(HORA_FMT.format(new Date(var1)) + " — erro: " + var4));
      }
   }

   private void processarLeitura(long var1, Integer var3, Integer var4) {
      String var5 = HORA_FMT.format(new Date(var1));
      if (var3 == null) {
         this.adicionarLinha(var5 + " — o ZSGO não devolveu um cabeçalho \"remaining\" desta vez.");
      } else {
         if (this.inicioAcompanhamentoMillis < 0L) {
            this.inicioAcompanhamentoMillis = var1;
         }

         StringBuilder var6 = new StringBuilder();
         var6.append(var5).append(" — remaining=").append(var3);
         if (var4 != null) {
            var6.append(" / limit=").append(var4);
         }

         if (this.ultimoRemaining != null && var3 > this.ultimoRemaining) {
            long var7 = var1 - this.inicioAcompanhamentoMillis;
            var6.append("   <<< SUBIU! Reset detetado — passaram ").append(formatarDuracao(var7)).append(" desde o início do acompanhamento.");
            this.labelEstado.setText("Reset detetado — janela ≈ " + formatarDuracao(var7) + ". A continuar a vigiar para confirmar...");
            this.inicioAcompanhamentoMillis = var1;
         }

         this.ultimoRemaining = var3;
         this.adicionarLinha(var6.toString());
      }
   }

   private void parar() {
      this.aCorrer = false;
      this.btnIniciar.setEnabled(true);
      this.btnParar.setEnabled(false);
      this.labelEstado.setText("Parado.");
      this.adicionarLinha("Parado.");
   }

   private void adicionarLinha(String var1) {
      this.log.append(var1 + "\n");
      this.log.setCaretPosition(this.log.getDocument().getLength());
   }

   private static String formatarDuracao(long var0) {
      long var2 = var0 / 1000L;
      long var4 = var2 / 3600L;
      long var6 = var2 % 3600L / 60L;
      long var8 = var2 % 60L;
      if (var4 > 0L) {
         return var4 + "h " + var6 + "m " + var8 + "s";
      } else {
         return var6 > 0L ? var6 + "m " + var8 + "s" : var8 + "s";
      }
   }
}
