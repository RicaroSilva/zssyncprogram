package pt.zsgosync.ui;

import java.awt.BorderLayout;
import javax.swing.BorderFactory;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.border.EmptyBorder;

/**
 * Faturação ocasional — EM PREPARAÇÃO.
 *
 * Utilizadores com um determinado produto no perfil do Cyclos ("ocasionais")
 * vão ter uma lógica de faturação diferente: faturas diárias, emitidas por
 * transação (não por conta), e o destinatário da fatura vem num campo da
 * própria transação. Os detalhes ainda vão ser explicados — ver CLAUDE.md.
 * Para já este ecrã só reserva o lugar no menu.
 */
public class PainelFaturacaoOcasional extends JPanel implements Tema.TemaOuvinte {
   private final JPanel caixa = new JPanel(new BorderLayout(0, 12));
   private final JLabel titulo = new JLabel("Faturação ocasional — em preparação");
   private final JLabel texto = new JLabel();

   public PainelFaturacaoOcasional() {
      this.setLayout(new BorderLayout());
      this.setOpaque(false);
      this.setBorder(new EmptyBorder(16, 4, 4, 4));
      this.titulo.setFont(Tema.FONT_BOLD.deriveFont(18.0F));
      this.texto.setFont(Tema.FONT_BASE.deriveFont(14.0F));
      this.texto.setText("<html><div style='width:640px'>"
         + "Este ecrã vai servir para a faturação dos <b>utilizadores ocasionais</b> — os que têm um determinado produto no perfil do Cyclos.<br><br>"
         + "Para estes utilizadores a faturação vai ser diferente da mensal:"
         + "<ul>"
         + "<li>as faturas são <b>diárias</b>;</li>"
         + "<li>são emitidas <b>por transação</b>, e não por conta;</li>"
         + "<li>quem recebe a fatura vem indicado na própria transação.</li>"
         + "</ul>"
         + "Ainda falta definir os pormenores desta lógica. Quando estiver definida, aparece aqui a lista das transações por faturar "
         + "e o botão para gerar as faturas do dia."
         + "</div></html>");
      this.caixa.add(this.titulo, BorderLayout.NORTH);
      this.caixa.add(this.texto, BorderLayout.CENTER);
      JPanel topo = new JPanel(new BorderLayout());
      topo.setOpaque(false);
      topo.add(this.caixa, BorderLayout.NORTH);
      this.add(topo, BorderLayout.CENTER);
      Tema.registar(this);
      this.aoMudarTema();
   }

   @Override
   public void aoMudarTema() {
      this.caixa.setOpaque(true);
      this.caixa.setBackground(Tema.SURFACE);
      this.caixa.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true), new EmptyBorder(22, 26, 22, 26)));
      this.titulo.setForeground(Tema.FOREGROUND);
      this.texto.setForeground(Tema.MUTED_FOREGROUND);
      this.repaint();
   }
}
