package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.Frame;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.RenderingHints;
import java.awt.event.KeyAdapter;
import java.awt.event.KeyEvent;
import java.net.URL;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.ImageIcon;
import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JDialog;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JPasswordField;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import javax.swing.border.EmptyBorder;
import javax.swing.plaf.basic.BasicButtonUI;
import pt.zsgosync.AppUserRun;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.AppUserDao;

public class PainelLogin {
   private static final int LARGURA_PAINEL_MARCA = 260;

   public static AppUserDao.Usuario mostrarLogin(AppConfig var0) {
      try {
         int var1 = AppUserRun.contarUtilizadores(var0);
         return var1 == 0 ? mostrarCriarPrimeiroAdmin(var0) : mostrarLoginNormal(var0);
      } catch (Exception var2) {
         JOptionPane.showMessageDialog(null, "Não foi possível ligar à base de dados para autenticação:\n" + var2.getMessage(), "Erro de ligação", 0);
         return null;
      }
   }

   private static AppUserDao.Usuario mostrarLoginNormal(AppConfig var0) {
      JDialog var1 = new JDialog((Frame)null, "Lusopay — Iniciar sessão", true);
      var1.setDefaultCloseOperation(2);
      var1.setSize(660, 440);
      var1.setLocationRelativeTo(null);
      var1.setResizable(false);
      JPanel var2 = new JPanel(new BorderLayout());
      var2.setBackground(Tema.SURFACE);
      var2.add(criarPainelMarca("Bem-vindo!", "Inicia sessão para\ncontinuar a gerir a\nfaturação e o ZSGO."), "West");
      JPanel var3 = new JPanel();
      var3.setLayout(new BoxLayout(var3, 1));
      var3.setBorder(new EmptyBorder(48, 44, 40, 44));
      var3.setBackground(Tema.SURFACE);
      var3.add(Box.createVerticalGlue());
      JLabel var4 = new JLabel("Iniciar sessão");
      var4.setFont(Tema.FONT_BOLD.deriveFont(22.0F));
      var4.setForeground(Tema.FOREGROUND);
      var4.setAlignmentX(0.0F);
      JLabel var5 = new JLabel("Identifica-te para continuar.");
      var5.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      var5.setForeground(Tema.MUTED_FOREGROUND);
      var5.setAlignmentX(0.0F);
      JTextField var6 = criarCampo();
      JPasswordField var7 = new JPasswordField();
      estilizarCampo(var7);
      JLabel var8 = new JLabel(" ");
      var8.setFont(Tema.FONT_BASE.deriveFont(12.0F));
      var8.setForeground(Tema.DESTRUCTIVE);
      var8.setAlignmentX(0.0F);
      JButton var9 = criarBotaoDourado("Entrar");
      var9.setAlignmentX(0.0F);
      var9.setMaximumSize(new Dimension(2147483647, 42));
      JButton var10 = criarBotaoSecundario("Cancelar");
      AppUserDao.Usuario[] var11 = new AppUserDao.Usuario[1];
      final Runnable var12 = () -> {
         String var7x = var6.getText().trim();
         String var8x = new String(var7.getPassword());
         if (!var7x.isEmpty() && !var8x.isEmpty()) {
            var9.setEnabled(false);
            var9.setText("A verificar...");
            new Thread(() -> {
               AppUserDao.Usuario var7xx = null;
               String var8xx = null;

               try {
                  var7xx = AppUserRun.autenticar(var0, var7x, var8x);
                  if (var7xx == null) {
                     var8xx = "Utilizador ou password incorretos (ou conta desativada).";
                  }
               } catch (Exception var11x) {
                  var8xx = "Falha ao ligar à base de dados: " + var11x.getMessage();
               }

               AppUserDao.Usuario var9x = var7xx;
               String var10x = var8xx;
               SwingUtilities.invokeLater(() -> {
                  if (var9x != null) {
                     var11[0] = var9x;
                     var1.dispose();
                  } else {
                     var9.setEnabled(true);
                     var9.setText("Entrar");
                     var8.setText(var10x);
                  }
               });
            }, "login").start();
         } else {
            var8.setText("Preenche o utilizador e a password.");
         }
      };
      var9.addActionListener(var1x -> var12.run());
      var10.addActionListener(var1x -> var1.dispose());
      var7.addKeyListener(new KeyAdapter() {
         @Override
         public void keyPressed(KeyEvent var1) {
            if (var1.getKeyCode() == 10) {
               var12.run();
            }
         }
      });
      JPanel var13 = new JPanel(new FlowLayout(2, 8, 0));
      var13.setOpaque(false);
      var13.setAlignmentX(0.0F);
      var13.setMaximumSize(new Dimension(2147483647, 40));
      var13.add(var10);
      var3.add(var4);
      var3.add(Box.createVerticalStrut(4));
      var3.add(var5);
      var3.add(Box.createVerticalStrut(28));
      var3.add(envolverComRotulo("Utilizador", var6));
      var3.add(Box.createVerticalStrut(14));
      var3.add(envolverComRotulo("Password", var7));
      var3.add(Box.createVerticalStrut(10));
      var3.add(var8);
      var3.add(Box.createVerticalStrut(10));
      var3.add(var9);
      var3.add(Box.createVerticalStrut(8));
      var3.add(var13);
      var3.add(Box.createVerticalGlue());
      var2.add(var3, "Center");
      var1.setContentPane(var2);
      var1.setVisible(true);
      return var11[0];
   }

   private static AppUserDao.Usuario mostrarCriarPrimeiroAdmin(AppConfig var0) {
      JDialog var1 = new JDialog((Frame)null, "Lusopay — Criar conta de administrador", true);
      var1.setDefaultCloseOperation(2);
      var1.setSize(680, 520);
      var1.setLocationRelativeTo(null);
      var1.setResizable(false);
      JPanel var2 = new JPanel(new BorderLayout());
      var2.setBackground(Tema.SURFACE);
      var2.add(criarPainelMarca("Primeira\nutilização.", "Ainda não há nenhuma\nconta configurada.\nCria a primeira — fica\ncomo administrador."), "West");
      JPanel var3 = new JPanel();
      var3.setLayout(new BoxLayout(var3, 1));
      var3.setBorder(new EmptyBorder(44, 44, 40, 44));
      var3.setBackground(Tema.SURFACE);
      var3.add(Box.createVerticalGlue());
      JLabel var4 = new JLabel("Criar conta de administrador");
      var4.setFont(Tema.FONT_BOLD.deriveFont(20.0F));
      var4.setForeground(Tema.FOREGROUND);
      var4.setAlignmentX(0.0F);
      JLabel var5 = new JLabel("Esta vai ser a tua conta principal de acesso ao programa.");
      var5.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      var5.setForeground(Tema.MUTED_FOREGROUND);
      var5.setAlignmentX(0.0F);
      JTextField var6 = criarCampo();
      JPasswordField var7 = new JPasswordField();
      estilizarCampo(var7);
      JPasswordField var8 = new JPasswordField();
      estilizarCampo(var8);
      JLabel var9 = new JLabel(" ");
      var9.setFont(Tema.FONT_BASE.deriveFont(12.0F));
      var9.setForeground(Tema.DESTRUCTIVE);
      var9.setAlignmentX(0.0F);
      JButton var10 = criarBotaoDourado("Criar conta e entrar");
      var10.setAlignmentX(0.0F);
      var10.setMaximumSize(new Dimension(2147483647, 42));
      AppUserDao.Usuario[] var11 = new AppUserDao.Usuario[1];
      var10.addActionListener(var8x -> {
         String var9x = var6.getText().trim();
         String var10x = new String(var7.getPassword());
         String var11x = new String(var8.getPassword());
         if (!var9x.isEmpty() && !var10x.isEmpty()) {
            if (var10x.length() < 6) {
               var9.setText("A password deve ter pelo menos 6 caracteres.");
            } else if (!var10x.equals(var11x)) {
               var9.setText("As passwords não coincidem.");
            } else {
               var10.setEnabled(false);
               var10.setText("A criar...");
               new Thread(() -> {
                  String var7xx = null;

                  try {
                     AppUserRun.criarPrimeiroAdmin(var0, var9x, var10x);
                  } catch (Exception var9xx) {
                     var7xx = "Falha ao criar a conta: " + var9xx.getMessage();
                  }

                  String var8xx = var7xx;
                  SwingUtilities.invokeLater(() -> {
                     if (var8xx == null) {
                        AppUserDao.Usuario var6xxx = new AppUserDao.Usuario();
                        var6xxx.username = var9x;
                        var6xxx.role = "ADMIN";
                        var6xxx.ativo = true;
                        var11[0] = var6xxx;
                        var1.dispose();
                     } else {
                        var10.setEnabled(true);
                        var10.setText("Criar conta e entrar");
                        var9.setText(var8xx);
                     }
                  });
               }, "criar-primeiro-admin").start();
            }
         } else {
            var9.setText("Preenche o utilizador e a password.");
         }
      });
      var3.add(var4);
      var3.add(Box.createVerticalStrut(4));
      var3.add(var5);
      var3.add(Box.createVerticalStrut(24));
      var3.add(envolverComRotulo("Utilizador", var6));
      var3.add(Box.createVerticalStrut(14));
      var3.add(envolverComRotulo("Password", var7));
      var3.add(Box.createVerticalStrut(14));
      var3.add(envolverComRotulo("Confirmar password", var8));
      var3.add(Box.createVerticalStrut(10));
      var3.add(var9);
      var3.add(Box.createVerticalStrut(10));
      var3.add(var10);
      var3.add(Box.createVerticalGlue());
      var2.add(var3, "Center");
      var1.setContentPane(var2);
      var1.setVisible(true);
      return var11[0];
   }

   private static JPanel criarPainelMarca(String var0, String var1) {
      JPanel var2 = new JPanel() {
         @Override
         protected void paintComponent(Graphics var1) {
            Graphics2D var2x = (Graphics2D)var1.create();
            var2x.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            var2x.setColor(Tema.PRIMARY);
            var2x.fillRect(0, 0, this.getWidth(), this.getHeight());
            var2x.dispose();
            super.paintComponent(var1);
         }
      };
      var2.setOpaque(false);
      var2.setPreferredSize(new Dimension(260, 10));
      var2.setLayout(new BoxLayout(var2, 1));
      var2.setBorder(new EmptyBorder(40, 32, 40, 32));
      URL var3 = PainelLogin.class.getResource("/logo-lusopay.png");
      if (var3 != null) {
         ImageIcon var4 = new ImageIcon(var3);
         Image var5 = var4.getImage().getScaledInstance(-1, 34, 4);
         JLabel var6 = new JLabel(new ImageIcon(var5));
         var6.setAlignmentX(0.0F);
         var2.add(var6);
         var2.add(Box.createVerticalStrut(36));
      }

      JTextArea var7 = new JTextArea(var0);
      var7.setEditable(false);
      var7.setOpaque(false);
      var7.setLineWrap(true);
      var7.setWrapStyleWord(true);
      var7.setFocusable(false);
      var7.setRows(2);
      var7.setFont(Tema.FONT_BOLD.deriveFont(19.0F));
      var7.setForeground(Tema.PRIMARY_FOREGROUND);
      var7.setAlignmentX(0.0F);
      var7.setMaximumSize(new Dimension(196, 70));
      JTextArea var8 = new JTextArea(var1);
      var8.setEditable(false);
      var8.setOpaque(false);
      var8.setLineWrap(true);
      var8.setWrapStyleWord(true);
      var8.setFocusable(false);
      var8.setRows(5);
      var8.setFont(Tema.FONT_BASE.deriveFont(12.5F));
      var8.setForeground(Tema.PRIMARY_FOREGROUND);
      var8.setAlignmentX(0.0F);
      var8.setMaximumSize(new Dimension(196, 120));
      var2.add(var7);
      var2.add(Box.createVerticalStrut(10));
      var2.add(var8);
      var2.add(Box.createVerticalGlue());
      JLabel var9 = new JLabel("Painel ZSGO");
      var9.setFont(Tema.FONT_BASE.deriveFont(11.0F));
      var9.setForeground(Tema.PRIMARY_FOREGROUND);
      var9.setAlignmentX(0.0F);
      var2.add(var9);
      return var2;
   }

   private static JPanel envolverComRotulo(String var0, JComponent var1) {
      JPanel var2 = new JPanel();
      var2.setLayout(new BoxLayout(var2, 1));
      var2.setOpaque(false);
      var2.setAlignmentX(0.0F);
      var2.setMaximumSize(new Dimension(2147483647, 60));
      JLabel var3 = new JLabel(var0);
      var3.setFont(Tema.FONT_BASE.deriveFont(12.0F));
      var3.setForeground(Tema.MUTED_FOREGROUND);
      var3.setAlignmentX(0.0F);
      var1.setAlignmentX(0.0F);
      var1.setMaximumSize(new Dimension(2147483647, 40));
      var2.add(var3);
      var2.add(Box.createVerticalStrut(6));
      var2.add(var1);
      return var2;
   }

   private static JTextField criarCampo() {
      JTextField var0 = new JTextField();
      estilizarCampo(var0);
      return var0;
   }

   private static void estilizarCampo(JTextField var0) {
      var0.setFont(Tema.FONT_BASE.deriveFont(14.0F));
      var0.setForeground(Tema.FOREGROUND);
      var0.setBackground(Tema.SURFACE_2);
      var0.setCaretColor(Tema.FOREGROUND);
      var0.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true), new EmptyBorder(9, 12, 9, 12)));
   }

   private static JButton criarBotaoDourado(String var0) {
      JButton var1 = new JButton(var0) {
         @Override
         protected void paintComponent(Graphics var1) {
            Graphics2D var2 = (Graphics2D)var1.create();
            var2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            Color var3 = !this.getModel().isPressed() && !this.getModel().isRollover() ? Tema.PRIMARY : Tema.PRIMARY_HOVER;
            var2.setColor(var3);
            var2.fillRoundRect(0, 0, this.getWidth(), this.getHeight(), 8, 8);
            var2.dispose();
            super.paintComponent(var1);
         }
      };
      var1.setUI(new BasicButtonUI());
      var1.setFont(Tema.FONT_BOLD);
      var1.setForeground(Tema.PRIMARY_FOREGROUND);
      var1.setBorder(new EmptyBorder(10, 18, 10, 18));
      var1.setContentAreaFilled(false);
      var1.setFocusPainted(false);
      var1.setOpaque(false);
      var1.setHorizontalAlignment(0);
      var1.setCursor(Cursor.getPredefinedCursor(12));
      return var1;
   }

   private static JButton criarBotaoSecundario(String var0) {
      JButton var1 = new JButton(var0);
      var1.setFont(Tema.FONT_BASE);
      var1.setForeground(Tema.MUTED_FOREGROUND);
      var1.setBorder(new EmptyBorder(8, 12, 8, 12));
      var1.setContentAreaFilled(false);
      var1.setFocusPainted(false);
      var1.setCursor(Cursor.getPredefinedCursor(12));
      return var1;
   }
}
