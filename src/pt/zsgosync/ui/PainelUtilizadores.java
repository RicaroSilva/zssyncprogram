package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.FlowLayout;
import java.awt.Frame;
import java.text.SimpleDateFormat;
import java.util.List;
import java.util.Vector;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JDialog;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JPasswordField;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import javax.swing.border.EmptyBorder;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import pt.zsgosync.AppUserRun;
import pt.zsgosync.HistoricoRun;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.AppUserDao;

public class PainelUtilizadores extends JDialog {
   private final AppConfig appConfig;
   private final String utilizadorAtual;
   private final DefaultTableModel modelo = new DefaultTableModel(new String[]{"Utilizador", "Papel", "Ativo", "Criado por", "Criado em"}, 0) {
      @Override
      public boolean isCellEditable(int var1, int var2) {
         return false;
      }
   };
   private final JTable tabela = new JTable(this.modelo);
   private static final SimpleDateFormat DATA_FMT = new SimpleDateFormat("dd/MM/yyyy HH:mm");

   public PainelUtilizadores(Frame var1, AppConfig var2, String var3) {
      super(var1, "Gerir utilizadores", true);
      this.appConfig = var2;
      this.utilizadorAtual = var3;
      this.setSize(640, 420);
      this.setLocationRelativeTo(var1);
      JPanel var4 = new JPanel(new BorderLayout(10, 10));
      var4.setBorder(new EmptyBorder(14, 14, 14, 14));
      var4.setBackground(Tema.SURFACE);
      this.tabela.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      this.tabela.setRowHeight(26);
      this.tabela.setDefaultRenderer(Object.class, new DefaultTableCellRenderer());
      var4.add(new JScrollPane(this.tabela), "Center");
      JButton var5 = new JButton("Criar utilizador");
      JButton var6 = new JButton("Ativar/Desativar selecionado");
      JButton var7 = new JButton("Repor password do selecionado");
      JButton var8 = new JButton("Fechar");
      JPanel var9 = new JPanel(new FlowLayout(0, 8, 0));
      var9.setOpaque(false);
      var9.add(var5);
      var9.add(var6);
      var9.add(var7);
      var9.add(Box.createHorizontalStrut(20));
      var9.add(var8);
      var4.add(var9, "South");
      this.setContentPane(var4);
      var5.addActionListener(var1x -> this.mostrarCriarUtilizador());
      var6.addActionListener(var1x -> this.alternarAtivo());
      var7.addActionListener(var1x -> this.reporPassword());
      var8.addActionListener(var1x -> this.dispose());
      this.carregar();
   }

   private void carregar() {
      new Thread(() -> {
         try {
            List<AppUserDao.Usuario> var1 = AppUserRun.listar(this.appConfig);
            SwingUtilities.invokeLater(() -> {
               this.modelo.setRowCount(0);

               for (AppUserDao.Usuario var3 : var1) {
                  Vector var4 = new Vector();
                  var4.add(var3.username);
                  var4.add(var3.role);
                  var4.add(var3.ativo ? "Sim" : "Não");
                  var4.add(var3.criadoPor != null ? var3.criadoPor : "");
                  var4.add(var3.criadoEm != null ? DATA_FMT.format(var3.criadoEm) : "");
                  this.modelo.addRow(var4);
               }
            });
         } catch (Exception var2) {
            SwingUtilities.invokeLater(() -> JOptionPane.showMessageDialog(this, "Falha ao carregar utilizadores: " + var2.getMessage(), "Erro", 0));
         }
      }, "carregar-utilizadores").start();
   }

   private String utilizadorSelecionado() {
      int var1 = this.tabela.getSelectedRow();
      if (var1 < 0) {
         JOptionPane.showMessageDialog(this, "Seleciona primeiro um utilizador na tabela.", "Nenhuma seleção", 2);
         return null;
      } else {
         return (String)this.modelo.getValueAt(var1, 0);
      }
   }

   private void mostrarCriarUtilizador() {
      JTextField var1 = new JTextField();
      JPasswordField var2 = new JPasswordField();
      JComboBox var3 = new JComboBox<>(new String[]{"UTILIZADOR", "ADMIN"});
      JPanel var4 = new JPanel();
      var4.setLayout(new BoxLayout(var4, 1));
      var4.add(new JLabel("Utilizador:"));
      var4.add(var1);
      var4.add(Box.createVerticalStrut(8));
      var4.add(new JLabel("Password inicial:"));
      var4.add(var2);
      var4.add(Box.createVerticalStrut(8));
      var4.add(new JLabel("Papel:"));
      var4.add(var3);
      int var5 = JOptionPane.showConfirmDialog(this, var4, "Criar utilizador", 2, -1);
      if (var5 == 0) {
         String var6 = var1.getText().trim();
         String var7 = new String(var2.getPassword());
         String var8 = (String)var3.getSelectedItem();
         if (!var6.isEmpty() && !var7.isEmpty()) {
            if (var7.length() < 6) {
               JOptionPane.showMessageDialog(this, "A password deve ter pelo menos 6 caracteres.", "Password fraca", 2);
            } else {
               new Thread(
                     () -> {
                        try {
                           if (AppUserRun.existe(this.appConfig, var6)) {
                              SwingUtilities.invokeLater(
                                 () -> JOptionPane.showMessageDialog(this, "Já existe um utilizador com esse nome.", "Utilizador já existe", 2)
                              );
                              return;
                           }

                           AppUserRun.criar(this.appConfig, var6, var7, var8, this.utilizadorAtual);
                           HistoricoRun.registar(
                              this.appConfig, this.utilizadorAtual, "GESTAO_UTILIZADORES", "Criou o utilizador '" + var6 + "' com papel " + var8 + "."
                           );
                           SwingUtilities.invokeLater(this::carregar);
                        } catch (Exception var5x) {
                           SwingUtilities.invokeLater(() -> JOptionPane.showMessageDialog(this, "Falha ao criar utilizador: " + var5x.getMessage(), "Erro", 0));
                        }
                     },
                     "criar-utilizador"
                  )
                  .start();
            }
         } else {
            JOptionPane.showMessageDialog(this, "Utilizador e password são obrigatórios.", "Dados em falta", 2);
         }
      }
   }

   private void alternarAtivo() {
      String var1 = this.utilizadorSelecionado();
      if (var1 != null) {
         if (var1.equalsIgnoreCase(this.utilizadorAtual)) {
            JOptionPane.showMessageDialog(this, "Não podes desativar a tua própria conta enquanto tens sessão iniciada.", "Não permitido", 2);
         } else {
            int var2 = this.tabela.getSelectedRow();
            boolean var3 = "Sim".equals(this.modelo.getValueAt(var2, 2));
            boolean var4 = !var3;
            String var5 = var4 ? "ativar" : "desativar";
            int var6 = JOptionPane.showConfirmDialog(this, "Queres " + var5 + " o utilizador '" + var1 + "'?", "Confirmar", 0);
            if (var6 == 0) {
               new Thread(
                     () -> {
                        try {
                           AppUserRun.definirAtivo(this.appConfig, var1, var4);
                           HistoricoRun.registar(
                              this.appConfig, this.utilizadorAtual, "GESTAO_UTILIZADORES", (var4 ? "Ativou" : "Desativou") + " o utilizador '" + var1 + "'."
                           );
                           SwingUtilities.invokeLater(this::carregar);
                        } catch (Exception var4x) {
                           SwingUtilities.invokeLater(() -> JOptionPane.showMessageDialog(this, "Falha: " + var4x.getMessage(), "Erro", 0));
                        }
                     },
                     "alternar-ativo"
                  )
                  .start();
            }
         }
      }
   }

   private void reporPassword() {
      String var1 = this.utilizadorSelecionado();
      if (var1 != null) {
         JPasswordField var2 = new JPasswordField();
         int var3 = JOptionPane.showConfirmDialog(this, var2, "Nova password para '" + var1 + "'", 2, -1);
         if (var3 == 0) {
            String var4 = new String(var2.getPassword());
            if (var4.length() < 6) {
               JOptionPane.showMessageDialog(this, "A password deve ter pelo menos 6 caracteres.", "Password fraca", 2);
            } else {
               new Thread(() -> {
                  try {
                     AppUserRun.redefinirPassword(this.appConfig, var1, var4);
                     HistoricoRun.registar(this.appConfig, this.utilizadorAtual, "GESTAO_UTILIZADORES", "Redefiniu a password do utilizador '" + var1 + "'.");
                     SwingUtilities.invokeLater(() -> JOptionPane.showMessageDialog(this, "Password redefinida com sucesso.", "Sucesso", 1));
                  } catch (Exception var4x) {
                     SwingUtilities.invokeLater(() -> JOptionPane.showMessageDialog(this, "Falha: " + var4x.getMessage(), "Erro", 0));
                  }
               }, "repor-password").start();
            }
         }
      }
   }
}
