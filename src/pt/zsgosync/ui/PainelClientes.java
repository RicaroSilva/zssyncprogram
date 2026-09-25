package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.Cursor;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.GridLayout;
import java.awt.Toolkit;
import java.awt.datatransfer.StringSelection;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JDialog;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.RowFilter;
import javax.swing.SwingUtilities;
import javax.swing.border.EmptyBorder;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
import pt.zsgosync.db.ClientListingDao;

/**
 * Lista dos clientes criados no ZSGO (tabela zsgo_client_sync): cartões de
 * resumo que também servem de filtro, pesquisa, estado a cores e detalhe
 * por duplo-clique.
 */
public class PainelClientes extends JPanel implements Tema.TemaOuvinte {
   private static final String[] FILTROS = {"Todos", "Sincronizados", "Com erro", "Desatualizados no ZSGO", "Com isenção de IVA"};
   private static final int COL_ESTADO = 3;
   private static final SimpleDateFormat DATA_FMT = new SimpleDateFormat("dd/MM/yyyy HH:mm");
   private static final Locale PT = new Locale("pt", "PT");

   private final DefaultTableModel modelo = new DefaultTableModel(
      new String[]{"Cliente", "Nome", "NIF", "Estado", "Código ZSGO", "Email", "Localidade", "IVA", "Última alteração", "Observação"}, 0
   ) {
      @Override
      public boolean isCellEditable(int r, int c) {
         return false;
      }
   };
   private final JTable tabela = new JTable(this.modelo);
   private final TableRowSorter<DefaultTableModel> sorter = new TableRowSorter<>(this.modelo);
   private final JScrollPane scroll = new JScrollPane(this.tabela);
   private final List<ClientListingDao.ClienteResumo> linhas = new ArrayList<>();
   private Set<String> desatualizados = new HashSet<>();

   private final CartaoResumo cartaoTotal = new CartaoResumo();
   private final CartaoResumo cartaoSincronizados = new CartaoResumo();
   private final CartaoResumo cartaoErros = new CartaoResumo();
   private final CartaoResumo cartaoDesatualizados = new CartaoResumo();
   private final JComboBox<String> filtro = new JComboBox<>(FILTROS);
   private final JTextField procura = new JTextField(20);
   private final JLabel labelFiltro = new JLabel("Mostrar:");
   private final JLabel labelProcura = new JLabel("Procurar:");
   private final JLabel labelContagem = new JLabel(" ");
   private final JLabel labelDica = new JLabel("Duplo-clique num cliente para ver todos os dados e o erro completo.");

   public PainelClientes() {
      this.setLayout(new BorderLayout(0, 10));
      this.setOpaque(false);
      this.setBorder(new EmptyBorder(6, 0, 0, 0));

      JPanel cartoes = new JPanel(new GridLayout(1, 4, 12, 0));
      cartoes.setOpaque(false);
      cartoes.add(this.cartaoTotal);
      cartoes.add(this.cartaoSincronizados);
      cartoes.add(this.cartaoErros);
      cartoes.add(this.cartaoDesatualizados);
      this.ligarCartao(this.cartaoTotal, "Todos");
      this.ligarCartao(this.cartaoSincronizados, "Sincronizados");
      this.ligarCartao(this.cartaoErros, "Com erro");
      this.ligarCartao(this.cartaoDesatualizados, "Desatualizados no ZSGO");

      JPanel barra = new JPanel(new BorderLayout());
      barra.setOpaque(false);
      JPanel filtros = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
      filtros.setOpaque(false);
      for (JLabel l : new JLabel[]{this.labelFiltro, this.labelProcura, this.labelContagem}) {
         l.setFont(Tema.FONT_BASE);
      }
      this.filtro.setFont(Tema.FONT_BASE);
      this.procura.setToolTipText("ID do cliente, nome, NIF, email, código ZSGO ou cidade");
      filtros.add(this.labelFiltro);
      filtros.add(this.filtro);
      filtros.add(Box.createHorizontalStrut(12));
      filtros.add(this.labelProcura);
      filtros.add(this.procura);
      barra.add(filtros, BorderLayout.WEST);
      barra.add(this.labelContagem, BorderLayout.EAST);

      JPanel topo = new JPanel();
      topo.setLayout(new BoxLayout(topo, BoxLayout.Y_AXIS));
      topo.setOpaque(false);
      cartoes.setAlignmentX(0.0F);
      barra.setAlignmentX(0.0F);
      topo.add(cartoes);
      topo.add(Box.createVerticalStrut(10));
      topo.add(barra);
      this.add(topo, BorderLayout.NORTH);

      this.tabela.setRowSorter(this.sorter);
      this.tabela.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      this.tabela.setRowHeight(26);
      int[] larguras = {65, 220, 95, 150, 90, 200, 110, 90, 125, 300};
      for (int i = 0; i < larguras.length; i++) {
         this.tabela.getColumnModel().getColumn(i).setPreferredWidth(larguras[i]);
      }
      this.tabela.getColumnModel().getColumn(COL_ESTADO).setMinWidth(135);
      this.tabela.getColumnModel().getColumn(8).setMinWidth(120);
      this.tabela.setDefaultRenderer(Object.class, new DefaultTableCellRenderer());
      this.tabela.getColumnModel().getColumn(COL_ESTADO).setCellRenderer(new RendererEstado());
      this.tabela.addMouseListener(new MouseAdapter() {
         @Override
         public void mouseClicked(MouseEvent e) {
            if (e.getClickCount() == 2) {
               int v = PainelClientes.this.tabela.rowAtPoint(e.getPoint());
               if (v >= 0) {
                  PainelClientes.this.abrirDetalhe(PainelClientes.this.linhas.get(PainelClientes.this.tabela.convertRowIndexToModel(v)));
               }
            }
         }
      });
      this.add(this.scroll, BorderLayout.CENTER);
      this.labelDica.setFont(Tema.FONT_BASE.deriveFont(11.0F));
      this.add(this.labelDica, BorderLayout.SOUTH);

      this.filtro.addActionListener(e -> this.aplicarFiltro());
      this.procura.getDocument().addDocumentListener(new DocumentListener() {
         public void insertUpdate(DocumentEvent e) {
            PainelClientes.this.aplicarFiltro();
         }

         public void removeUpdate(DocumentEvent e) {
            PainelClientes.this.aplicarFiltro();
         }

         public void changedUpdate(DocumentEvent e) {
            PainelClientes.this.aplicarFiltro();
         }
      });
      this.configurarCartoes(0, 0, 0, 0, 0);
      Tema.registar(this);
      this.aplicarCoresAgora();
   }

   private void ligarCartao(CartaoResumo c, String filtroAlvo) {
      c.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
      c.setToolTipText("Mostrar: " + filtroAlvo);
      c.addMouseListener(new MouseAdapter() {
         @Override
         public void mouseClicked(MouseEvent e) {
            PainelClientes.this.filtro.setSelectedItem(filtroAlvo);
         }
      });
   }

   public boolean temDados() {
      return !this.linhas.isEmpty();
   }

   public void mostrar(List<ClientListingDao.ClienteResumo> lista) {
      this.mostrar(lista, null);
   }

   public void mostrar(List<ClientListingDao.ClienteResumo> lista, Set<String> desatualizados) {
      if (desatualizados != null) {
         this.desatualizados = desatualizados;
      }
      this.linhas.clear();
      this.modelo.setRowCount(0);
      int sinc = 0;
      int erro = 0;
      int isentos = 0;
      for (ClientListingDao.ClienteResumo c : lista) {
         this.linhas.add(c);
         if ("SINCRONIZADO".equals(c.status)) {
            sinc++;
         } else if ("ERRO".equals(c.status)) {
            erro++;
         }
         if (c.exemptionCode != null && !c.exemptionCode.isBlank()) {
            isentos++;
         }
         this.modelo.addRow(new Object[]{
            c.sourceId,
            nvl(c.nome),
            nvl(c.nif),
            this.estado(c),
            nvl(c.zsgoCode),
            nvl(c.email),
            localidade(c),
            c.exemptionCode != null && !c.exemptionCode.isBlank() ? "Isento (" + c.exemptionCode + ")" : "Normal",
            c.atualizadoEm != null ? DATA_FMT.format(c.atualizadoEm) : "",
            "ERRO".equals(c.status) ? primeiraLinha(c.ultimoErro) : ""
         });
      }
      this.configurarCartoes(lista.size(), sinc, erro, this.desatualizados.size(), isentos);
      this.aplicarFiltro();
   }

   public void mostrarErro(String msg) {
      this.linhas.clear();
      this.modelo.setRowCount(0);
      this.labelContagem.setText("Erro ao consultar: " + msg);
   }

   private void configurarCartoes(int total, int sinc, int erro, int desat, int isentos) {
      this.cartaoTotal.configurar("Clientes no ZSGO", String.valueOf(total), isentos > 0 ? isentos + " com isenção de IVA" : "Todos os registados", Tema.CARD_BLUE_BG, Tema.CARD_BLUE_FG);
      this.cartaoSincronizados.configurar("Sincronizados", String.valueOf(sinc), total > 0 ? Math.round(100.0 * sinc / total) + "% do total" : " ", Tema.CARD_TEAL_BG, Tema.CARD_TEAL_FG);
      this.cartaoErros.configurar("Com erro", String.valueOf(erro), erro == 0 ? "Nenhum" : "Clica para ver", Tema.CARD_CORAL_BG, Tema.CARD_CORAL_FG);
      this.cartaoDesatualizados.configurar(
         "Desatualizados no ZSGO", String.valueOf(desat), desat == 0 ? "Usa \"Verificar alterações\"" : "Dados mudaram no Cyclos", Tema.CARD_PURPLE_BG, Tema.CARD_PURPLE_FG
      );
   }

   private String estado(ClientListingDao.ClienteResumo c) {
      if (this.desatualizados.contains(c.sourceId)) {
         return "Desatualizado";
      }
      if ("SINCRONIZADO".equals(c.status)) {
         return "Sincronizado";
      }
      if ("ERRO".equals(c.status)) {
         return "Erro";
      }
      return c.status == null ? "—" : c.status.substring(0, 1) + c.status.substring(1).toLowerCase(PT);
   }

   private static String localidade(ClientListingDao.ClienteResumo c) {
      String cidade = nvl(c.cidade);
      return c.pais != null && !"PT".equalsIgnoreCase(c.pais) ? (cidade.isEmpty() ? c.pais : cidade + " (" + c.pais + ")") : cidade;
   }

   private static String nvl(String s) {
      return s == null ? "" : s;
   }

   private static String primeiraLinha(String s) {
      if (s == null || s.isBlank()) {
         return "(erro sem mensagem gravada)";
      }
      int i = s.indexOf(" | Dados enviados");
      return i > 0 ? s.substring(0, i) : s;
   }

   private void aplicarFiltro() {
      final String f = (String) this.filtro.getSelectedItem();
      final String p = this.procura.getText().trim().toLowerCase(PT);
      this.sorter.setRowFilter(new RowFilter<DefaultTableModel, Integer>() {
         @Override
         public boolean include(RowFilter.Entry<? extends DefaultTableModel, ? extends Integer> e) {
            ClientListingDao.ClienteResumo c = PainelClientes.this.linhas.get(e.getIdentifier());
            boolean passa = switch (f == null ? "Todos" : f) {
               case "Sincronizados" -> "SINCRONIZADO".equals(c.status);
               case "Com erro" -> "ERRO".equals(c.status);
               case "Desatualizados no ZSGO" -> PainelClientes.this.desatualizados.contains(c.sourceId);
               case "Com isenção de IVA" -> c.exemptionCode != null && !c.exemptionCode.isBlank();
               default -> true;
            };
            if (!passa || p.isEmpty()) {
               return passa;
            }
            return (c.sourceId + " " + c.nome + " " + c.nif + " " + c.email + " " + c.zsgoCode + " " + c.cidade).toLowerCase(PT).contains(p);
         }
      });
      this.labelContagem.setText(this.tabela.getRowCount() + " de " + this.linhas.size() + " cliente(s)");
   }

   private void abrirDetalhe(ClientListingDao.ClienteResumo c) {
      StringBuilder b = new StringBuilder();
      b.append("CLIENTE ").append(c.sourceId).append(" — ").append(c.nome != null ? c.nome : "(sem nome)").append("\n\n");
      b.append("Estado: ").append(this.estado(c)).append("   (").append(c.status).append(", ").append(c.tentativas).append(" tentativa(s))\n");
      b.append("Código no ZSGO: ").append(c.zsgoCode != null ? c.zsgoCode : "— (ainda não criado)").append('\n');
      b.append("Última alteração: ").append(c.atualizadoEm != null ? DATA_FMT.format(c.atualizadoEm) : "—").append("\n\n");
      b.append("DADOS NO ZSGO (os que foram enviados na criação)\n");
      b.append("  NIF: ").append(nvl(c.nif)).append('\n');
      b.append("  Email: ").append(nvl(c.email)).append('\n');
      b.append("  Morada: ").append(nvl(c.morada)).append('\n');
      b.append("  Código postal: ").append(nvl(c.codigoPostal)).append("   Cidade: ").append(nvl(c.cidade)).append('\n');
      b.append("  País: ").append(nvl(c.pais)).append("   Região fiscal: ").append(nvl(c.regionCode)).append('\n');
      b.append("  IVA: ").append(c.exemptionCode != null && !c.exemptionCode.isBlank() ? "isento, código " + c.exemptionCode : "normal").append('\n');
      if (this.desatualizados.contains(c.sourceId)) {
         b.append("\nOs dados deste cliente no Cyclos mudaram desde que foi enviado ao ZSGO.\nUsa \"Verificar alterações\" para os reenviar.\n");
      }
      if (c.ultimoErro != null && !c.ultimoErro.isBlank()) {
         b.append("\nÚLTIMO ERRO\n").append(c.ultimoErro).append('\n');
      }

      JTextArea texto = new JTextArea(b.toString());
      texto.setEditable(false);
      texto.setLineWrap(true);
      texto.setWrapStyleWord(true);
      texto.setFont(Tema.FONT_MONO.deriveFont(13.0F));
      texto.setCaretPosition(0);
      JScrollPane sp = new JScrollPane(texto);
      sp.setPreferredSize(new Dimension(720, 400));
      JDialog d = new JDialog(SwingUtilities.getWindowAncestor(this), "Cliente " + c.sourceId);
      d.setModal(true);
      JButton copiar = new JButton("Copiar");
      copiar.addActionListener(e -> Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(texto.getText()), null));
      JButton fechar = new JButton("Fechar");
      fechar.addActionListener(e -> d.dispose());
      JPanel botoes = new JPanel(new FlowLayout(FlowLayout.RIGHT));
      botoes.add(copiar);
      botoes.add(fechar);
      JPanel conteudo = new JPanel(new BorderLayout(0, 8));
      conteudo.setBorder(new EmptyBorder(12, 12, 12, 12));
      conteudo.add(sp, BorderLayout.CENTER);
      conteudo.add(botoes, BorderLayout.SOUTH);
      d.setContentPane(conteudo);
      d.pack();
      d.setLocationRelativeTo(this);
      d.setVisible(true);
   }

   private static class RendererEstado extends DefaultTableCellRenderer {
      @Override
      public Component getTableCellRendererComponent(JTable t, Object v, boolean sel, boolean foco, int r, int c) {
         super.getTableCellRendererComponent(t, v, sel, foco, r, c);
         String s = v == null ? "" : v.toString();
         this.setFont(Tema.FONT_BOLD.deriveFont(12.5F));
         if (!sel) {
            this.setBackground(Tema.SURFACE);
         }
         switch (s) {
            case "Sincronizado" -> {
               this.setForeground(Tema.SUCCESS);
               this.setText("✔ " + s);
            }
            case "Erro" -> {
               this.setForeground(Tema.DESTRUCTIVE);
               this.setText("✖ " + s);
            }
            case "Desatualizado" -> {
               this.setForeground(Tema.CARD_PURPLE_FG);
               this.setText("⚠ " + s);
            }
            default -> this.setForeground(Tema.MUTED_FOREGROUND);
         }
         return this;
      }
   }

   @Override
   public void aoMudarTema() {
      this.aplicarCoresAgora();
      if (!this.linhas.isEmpty()) {
         this.mostrar(new ArrayList<>(this.linhas), this.desatualizados);
      }
   }

   private void aplicarCoresAgora() {
      for (JLabel l : new JLabel[]{this.labelFiltro, this.labelProcura}) {
         l.setForeground(Tema.FOREGROUND);
      }
      this.labelContagem.setForeground(Tema.MUTED_FOREGROUND);
      this.labelDica.setForeground(Tema.MUTED_FOREGROUND);
      this.tabela.setBackground(Tema.SURFACE);
      this.tabela.setForeground(Tema.FOREGROUND);
      this.tabela.setSelectionBackground(Tema.SURFACE_2);
      this.tabela.setSelectionForeground(Tema.FOREGROUND);
      this.tabela.setGridColor(Tema.BORDER);
      this.tabela.getTableHeader().setBackground(Tema.SURFACE_2);
      this.tabela.getTableHeader().setForeground(Tema.MUTED_FOREGROUND);
      this.tabela.getTableHeader().setFont(Tema.FONT_BOLD.deriveFont(12.0F));
      DefaultTableCellRenderer r = (DefaultTableCellRenderer) this.tabela.getDefaultRenderer(Object.class);
      r.setBackground(Tema.SURFACE);
      r.setForeground(Tema.FOREGROUND);
      this.scroll.getViewport().setBackground(Tema.SURFACE);
      this.scroll.setBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true));
      this.revalidate();
      this.repaint();
   }
}
