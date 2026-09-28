package pt.zsgosync.ui;

import java.awt.BasicStroke;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.Window;
import java.util.ArrayList;
import java.util.List;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.Icon;
import javax.swing.JButton;
import javax.swing.JDialog;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JProgressBar;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.SwingUtilities;
import javax.swing.WindowConstants;
import javax.swing.border.EmptyBorder;
import pt.zsgosync.progress.StatusListener;

/**
 * Janela que mostra, passo a passo, tudo o que acontece ao gerar a faturação
 * do mês: pré-análise, clientes criados/atualizados, resumo e emissão.
 * Todos os métodos podem ser chamados de qualquer thread.
 */
public class DialogoPassosFaturacao extends JDialog {
   public enum Estado {
      PENDENTE,
      A_CORRER,
      OK,
      AVISO,
      ERRO,
      SALTADO
   }

   private final List<Linha> linhas = new ArrayList<>();
   private final JTextArea resumo = new JTextArea();
   private final JScrollPane resumoScroll;
   private final JPanel botoes = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
   private volatile boolean aCorrer = true;

   public DialogoPassosFaturacao(Window dono, String titulo, String... passos) {
      super(dono, titulo, ModalityType.MODELESS);
      this.setDefaultCloseOperation(WindowConstants.DO_NOTHING_ON_CLOSE);
      this.addWindowListener(new java.awt.event.WindowAdapter() {
         @Override
         public void windowClosing(java.awt.event.WindowEvent e) {
            if (!DialogoPassosFaturacao.this.aCorrer) {
               DialogoPassosFaturacao.this.fecharPorCancelar();
            }
         }
      });

      JPanel lista = new JPanel();
      lista.setLayout(new BoxLayout(lista, BoxLayout.Y_AXIS));
      lista.setOpaque(false);
      for (int i = 0; i < passos.length; i++) {
         Linha l = new Linha(i + 1, passos[i]);
         this.linhas.add(l);
         lista.add(l.painel);
         lista.add(Box.createVerticalStrut(6));
      }

      this.resumo.setEditable(false);
      this.resumo.setLineWrap(true);
      this.resumo.setWrapStyleWord(true);
      this.resumo.setFont(Tema.FONT_BASE.deriveFont(13f));
      this.resumo.setBorder(new EmptyBorder(8, 10, 8, 10));
      this.resumoScroll = new JScrollPane(this.resumo);
      this.resumoScroll.setPreferredSize(new Dimension(560, 220));
      this.resumoScroll.setVisible(false);

      JPanel centro = new JPanel(new BorderLayout(0, 10));
      centro.setOpaque(false);
      centro.add(lista, BorderLayout.NORTH);
      centro.add(this.resumoScroll, BorderLayout.CENTER);

      JPanel raiz = new JPanel(new BorderLayout(0, 12));
      raiz.setBorder(new EmptyBorder(16, 18, 14, 18));
      raiz.add(centro, BorderLayout.CENTER);
      this.botoes.setOpaque(false);
      raiz.add(this.botoes, BorderLayout.SOUTH);
      this.setContentPane(raiz);
      this.setMinimumSize(new Dimension(620, 300));
      this.pack();
      this.setLocationRelativeTo(dono);
   }

   private Runnable aoCancelar = () -> {};

   private void fecharPorCancelar() {
      Runnable r = this.aoCancelar;
      this.aoCancelar = () -> {};
      this.dispose();
      r.run();
   }

   public void iniciar(int passo, String detalhe) {
      this.mudar(passo, Estado.A_CORRER, detalhe);
   }

   public void concluir(int passo, Estado estado, String detalhe) {
      this.mudar(passo, estado, detalhe);
   }

   /** Progresso do passo (detalhe + barra) no formato dos serviços existentes. */
   public StatusListener estado(int passo) {
      return (texto, feitos, total) -> SwingUtilities.invokeLater(() -> {
         Linha l = this.linhas.get(passo);
         l.detalhe.setText(texto);
         l.barra.setVisible(true);
         if (total > 0 && feitos >= 0) {
            l.barra.setIndeterminate(false);
            l.barra.setMaximum(total);
            l.barra.setValue(Math.min(feitos, total));
         } else {
            l.barra.setIndeterminate(true);
         }
      });
   }

   /** Mostra o resumo e os botões para emitir ou cancelar. */
   public void pedirConfirmacao(String texto, String textoBotao, Runnable emitir, Runnable cancelar) {
      SwingUtilities.invokeLater(() -> {
         this.aCorrer = false;
         this.aoCancelar = cancelar;
         for (Linha l : this.linhas) {
            l.barra.setVisible(false);
         }
         this.resumo.setText(texto);
         this.resumo.setCaretPosition(0);
         this.resumoScroll.setVisible(true);
         this.botoes.removeAll();
         JButton cancelarBtn = new JButton("Cancelar");
         cancelarBtn.addActionListener(e -> this.fecharPorCancelar());
         JButton emitirBtn = new JButton(textoBotao);
         emitirBtn.putClientProperty("JButton.buttonType", "default");
         emitirBtn.setBackground(Tema.PRIMARY);
         emitirBtn.setForeground(Tema.PRIMARY_FOREGROUND);
         emitirBtn.addActionListener(e -> {
            this.aCorrer = true;
            this.aoCancelar = () -> {};
            this.botoes.removeAll();
            this.botoes.revalidate();
            this.botoes.repaint();
            emitir.run();
         });
         this.botoes.add(cancelarBtn);
         this.botoes.add(emitirBtn);
         this.ajustar();
         this.getRootPane().setDefaultButton(emitirBtn);
         emitirBtn.requestFocusInWindow();
      });
   }

   /** Fim: deixa só o botão Fechar (e acrescenta uma nota ao resumo, se houver). */
   public void terminar(String nota) {
      SwingUtilities.invokeLater(() -> {
         this.aCorrer = false;
         this.aoCancelar = () -> {};
         this.resumoScroll.setVisible(false);
         this.botoes.removeAll();
         if (nota != null && !nota.isBlank()) {
            JTextArea t = new JTextArea(nota);
            t.setEditable(false);
            t.setFocusable(false);
            t.setOpaque(false);
            t.setLineWrap(true);
            t.setWrapStyleWord(true);
            t.setFont(Tema.FONT_BOLD.deriveFont(13f));
            t.setColumns(38);
            this.botoes.add(t);
         }
         JButton fechar = new JButton("Fechar");
         fechar.addActionListener(e -> this.dispose());
         this.botoes.add(fechar);
         this.revalidate();
         this.pack();
         this.getRootPane().setDefaultButton(fechar);
      });
   }

   private void mudar(int passo, Estado estado, String detalhe) {
      SwingUtilities.invokeLater(() -> {
         Linha l = this.linhas.get(passo);
         l.estado = estado;
         l.icone.repaint();
         l.titulo.setFont(l.titulo.getFont().deriveFont(estado == Estado.A_CORRER ? Font.BOLD : Font.PLAIN));
         l.titulo.setForeground(estado == Estado.PENDENTE || estado == Estado.SALTADO ? Tema.MUTED_FOREGROUND : Tema.FOREGROUND);
         if (detalhe != null) {
            l.detalhe.setText(detalhe);
         }
         l.detalhe.setVisible(!l.detalhe.getText().isEmpty());
         l.detalhe.setForeground(estado == Estado.ERRO ? Tema.DESTRUCTIVE : Tema.MUTED_FOREGROUND);
         l.barra.setVisible(estado == Estado.A_CORRER);
         l.barra.setIndeterminate(estado == Estado.A_CORRER);
         this.ajustar();
      });
   }

   private void ajustar() {
      this.revalidate();
      this.repaint();
      Dimension atual = this.getSize();
      Dimension pref = this.getPreferredSize();
      if (pref.height > atual.height || pref.width > atual.width) {
         this.setSize(Math.max(atual.width, pref.width), Math.max(atual.height, pref.height));
      }
   }

   private static class Linha {
      final JPanel painel = new JPanel(new BorderLayout(10, 0));
      final JLabel icone;
      final JLabel titulo;
      final JTextArea detalhe = new JTextArea();
      final JProgressBar barra = new JProgressBar();
      Estado estado = Estado.PENDENTE;

      Linha(int numero, String texto) {
         this.icone = new JLabel(new IconeEstado(this));
         this.icone.setVerticalAlignment(JLabel.TOP);
         this.titulo = new JLabel("Passo " + numero + " — " + texto);
         this.titulo.setFont(Tema.FONT_BASE);
         this.titulo.setForeground(Tema.MUTED_FOREGROUND);
         this.detalhe.setEditable(false);
         this.detalhe.setFocusable(false);
         this.detalhe.setOpaque(false);
         this.detalhe.setLineWrap(true);
         this.detalhe.setWrapStyleWord(true);
         this.detalhe.setFont(Tema.FONT_BASE.deriveFont(12.5f));
         this.detalhe.setForeground(Tema.MUTED_FOREGROUND);
         this.detalhe.setBorder(BorderFactory.createEmptyBorder());
         this.detalhe.setVisible(false);
         this.barra.setVisible(false);
         this.barra.setPreferredSize(new Dimension(10, 6));

         JPanel texto2 = new JPanel();
         texto2.setLayout(new BoxLayout(texto2, BoxLayout.Y_AXIS));
         texto2.setOpaque(false);
         for (Component c : new Component[]{this.titulo, this.detalhe, this.barra}) {
            ((javax.swing.JComponent) c).setAlignmentX(0f);
            texto2.add(c);
            texto2.add(Box.createVerticalStrut(3));
         }
         this.painel.setOpaque(false);
         this.painel.add(this.icone, BorderLayout.WEST);
         this.painel.add(texto2, BorderLayout.CENTER);
      }
   }

   /** Círculo colorido com o símbolo do estado (desenhado, não depende das fontes). */
   private static class IconeEstado implements Icon {
      private final Linha linha;

      IconeEstado(Linha linha) {
         this.linha = linha;
      }

      @Override
      public int getIconWidth() {
         return 20;
      }

      @Override
      public int getIconHeight() {
         return 20;
      }

      @Override
      public void paintIcon(Component c, Graphics g0, int x, int y) {
         Graphics2D g = (Graphics2D) g0.create();
         g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
         g.translate(x + 1, y + 1);
         Estado e = this.linha.estado;
         Color cor = switch (e) {
            case OK -> Tema.SUCCESS;
            case AVISO -> new Color(0xE0, 0x8A, 0x00);
            case ERRO -> Tema.DESTRUCTIVE;
            case A_CORRER -> Tema.PRIMARY;
            default -> Tema.BORDER;
         };
         g.setStroke(new BasicStroke(2f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
         if (e == Estado.PENDENTE || e == Estado.SALTADO) {
            g.setColor(cor);
            g.drawOval(1, 1, 16, 16);
            if (e == Estado.SALTADO) {
               g.drawLine(6, 9, 12, 9);
            }
         } else if (e == Estado.A_CORRER) {
            g.setColor(cor);
            g.drawOval(1, 1, 16, 16);
            g.fillOval(5, 5, 8, 8);
         } else {
            g.setColor(cor);
            g.fillOval(0, 0, 18, 18);
            g.setColor(Color.WHITE);
            if (e == Estado.OK) {
               g.drawLine(5, 9, 8, 12);
               g.drawLine(8, 12, 13, 6);
            } else if (e == Estado.ERRO) {
               g.drawLine(6, 6, 12, 12);
               g.drawLine(12, 6, 6, 12);
            } else {
               g.drawLine(9, 4, 9, 10);
               g.fillOval(8, 12, 3, 3);
            }
         }
         g.dispose();
      }
   }
}
