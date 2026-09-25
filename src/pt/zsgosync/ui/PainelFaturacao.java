package pt.zsgosync.ui;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.GridLayout;
import java.awt.Toolkit;
import java.awt.datatransfer.StringSelection;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.function.Supplier;
import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.DefaultListCellRenderer;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JDialog;
import javax.swing.JFileChooser;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JMenuItem;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JPopupMenu;
import javax.swing.JProgressBar;
import javax.swing.JScrollPane;
import javax.swing.JTabbedPane;
import javax.swing.JTable;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.RowFilter;
import javax.swing.SwingConstants;
import javax.swing.SwingUtilities;
import javax.swing.border.EmptyBorder;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;
import javax.swing.table.DefaultTableCellRenderer;
import javax.swing.table.DefaultTableModel;
import javax.swing.table.TableRowSorter;
import pt.zsgosync.RelatorioRun;
import pt.zsgosync.config.AppConfig;
import pt.zsgosync.db.CreditNoteSyncDao;
import pt.zsgosync.db.InvoiceLineDetailDao;
import pt.zsgosync.db.InvoiceSyncDao;
import pt.zsgosync.progress.ProgressListener;
import pt.zsgosync.progress.StatusListener;
import pt.zsgosync.service.ConferenciaService;
import pt.zsgosync.service.RelatorioService;
import pt.zsgosync.util.Erros;
import pt.zsgosync.zsgo.ZsgoDocumento;

/**
 * Ecrã único de faturação: escolhe-se o mês e vê-se logo cada fatura desse
 * mês — o que o programa enviou, o que está no ZSGO e a diferença. Daqui
 * gera-se a faturação em falta e confere-se com o ZSGO.
 */
public class PainelFaturacao extends JPanel implements Tema.TemaOuvinte {
   private static final NumberFormat MOEDA = NumberFormat.getCurrencyInstance(new Locale("pt", "PT"));
   private static final Locale PT = new Locale("pt", "PT");
   private static final String[] FILTROS = {"Todas", "Com erro", "Com diferença no ZSGO", "Por conferir", "Faturadas"};
   private static final int COL_ESTADO = 2;
   private static final int COL_DIFERENCA = 8;

   private final Supplier<AppConfig> config;
   private final JComboBox<YearMonth> comboMes = new JComboBox<>();
   private final JButton btnGerar;
   private final JButton btnConferir = new JButton("Conferir com o ZSGO");
   private final JButton btnExportar = new JButton("Exportar ▾");
   private final JLabel labelEstado;
   private final JProgressBar progresso;
   private final CartaoResumo cartaoFaturadas = new CartaoResumo();
   private final CartaoResumo cartaoErros = new CartaoResumo();
   private final CartaoResumo cartaoConferencia = new CartaoResumo();
   private final CartaoResumo cartaoNotas = new CartaoResumo();
   private final JComboBox<String> comboFiltro = new JComboBox<>(FILTROS);
   private final JTextField campoProcura = new JTextField(18);
   private final JLabel labelProcura = new JLabel("Procurar:");
   private final JLabel labelMes = new JLabel("Mês:");
   private final JLabel labelDica = new JLabel("Duplo-clique numa fatura para ver o detalhe (rubricas, erro completo e o documento no ZSGO).");
   private final JTabbedPane abas = new JTabbedPane();

   private final DefaultTableModel modeloFaturas = new DefaultTableModel(
      new String[]{"Cliente", "Nome", "Estado", "Nº no ZSGO", "Enviado", "Total no ZSGO", "Líquido ZSGO", "IVA ZSGO", "Diferença", "Observação"}, 0
   ) {
      @Override
      public boolean isCellEditable(int r, int c) {
         return false;
      }

      @Override
      public Class<?> getColumnClass(int c) {
         return c >= 4 && c <= 8 ? BigDecimal.class : String.class;
      }
   };
   private final JTable tabelaFaturas = new JTable(this.modeloFaturas);
   private final TableRowSorter<DefaultTableModel> sorterFaturas = new TableRowSorter<>(this.modeloFaturas);
   private final List<InvoiceSyncDao.FaturaDetalhe> linhasFaturas = new ArrayList<>();

   private final DefaultTableModel modeloNotas = new DefaultTableModel(
      new String[]{"Cliente", "Nome", "Estado", "Chargeback (id)", "Transação original (id)", "Valor", "ID no ZSGO", "Observação"}, 0
   ) {
      @Override
      public boolean isCellEditable(int r, int c) {
         return false;
      }

      @Override
      public Class<?> getColumnClass(int c) {
         return c == 5 ? BigDecimal.class : String.class;
      }
   };
   private final JTable tabelaNotas = new JTable(this.modeloNotas);

   private RelatorioService.Relatorio relatorio;
   private int anoAtual;
   private int mesAtual;

   public PainelFaturacao(Supplier<AppConfig> config, JButton btnGerar, JLabel labelEstado, JProgressBar progresso) {
      this.config = config;
      this.btnGerar = btnGerar;
      this.labelEstado = labelEstado;
      this.progresso = progresso;
      this.setLayout(new BorderLayout(0, 12));
      this.setOpaque(false);
      this.setBorder(new EmptyBorder(16, 4, 4, 4));
      this.add(this.montarTopo(), BorderLayout.NORTH);
      this.add(this.montarAbas(), BorderLayout.CENTER);
      this.labelDica.setFont(Tema.FONT_BASE.deriveFont(11.0F));
      this.add(this.labelDica, BorderLayout.SOUTH);
      this.mostrarCartoesVazios();
      Tema.registar(this);
      this.aplicarCores();
   }

   public YearMonth getMesSelecionado() {
      return (YearMonth) this.comboMes.getSelectedItem();
   }

   // ------------------------------------------------------------ topo

   private JPanel montarTopo() {
      YearMonth anterior = YearMonth.now().minusMonths(1L);
      for (int i = -1; i < 24; i++) {
         this.comboMes.addItem(anterior.minusMonths(i));
      }
      this.comboMes.setSelectedItem(anterior);
      this.comboMes.setMaximumRowCount(14);
      this.comboMes.setRenderer(new DefaultListCellRenderer() {
         @Override
         public Component getListCellRendererComponent(JList<?> l, Object v, int i, boolean s, boolean f) {
            return super.getListCellRendererComponent(l, v instanceof YearMonth ym ? nomeMes(ym) : v, i, s, f);
         }
      });
      this.comboMes.setFont(Tema.FONT_BASE);
      this.comboMes.addActionListener(e -> this.recarregar());

      this.btnConferir.setToolTipText("Vai buscar ao ZSGO o valor real de cada fatura deste mês e compara com o que foi enviado. Não altera nada no ZSGO.");
      this.btnConferir.addActionListener(e -> this.conferir());
      JPopupMenu menuExportar = new JPopupMenu();
      JMenuItem itemFaturas = new JMenuItem("Faturas do mês (CSV)");
      itemFaturas.addActionListener(e -> this.exportarFaturas());
      JMenuItem itemRubricas = new JMenuItem("Linhas por rubrica (CSV)");
      itemRubricas.addActionListener(e -> this.exportarRubricas());
      JMenuItem itemNotas = new JMenuItem("Notas de crédito (CSV)");
      itemNotas.addActionListener(e -> this.exportarTabela(this.tabelaNotas, "notas_credito"));
      menuExportar.add(itemFaturas);
      menuExportar.add(itemRubricas);
      menuExportar.add(itemNotas);
      this.btnExportar.addActionListener(e -> menuExportar.show(this.btnExportar, 0, this.btnExportar.getHeight()));

      JPanel linhaAcoes = new JPanel(new FlowLayout(FlowLayout.LEFT, 10, 0));
      linhaAcoes.setOpaque(false);
      this.labelMes.setFont(Tema.FONT_BOLD);
      linhaAcoes.add(this.labelMes);
      linhaAcoes.add(this.comboMes);
      linhaAcoes.add(Box.createHorizontalStrut(10));
      linhaAcoes.add(this.btnGerar);
      linhaAcoes.add(this.btnConferir);
      linhaAcoes.add(this.btnExportar);

      JPanel linhaEstado = new JPanel(new BorderLayout(12, 0));
      linhaEstado.setOpaque(false);
      this.labelEstado.setFont(Tema.FONT_BASE.deriveFont(12.0F));
      this.progresso.setPreferredSize(new Dimension(260, 14));
      this.progresso.setVisible(false);
      linhaEstado.add(this.progresso, BorderLayout.WEST);
      linhaEstado.add(this.labelEstado, BorderLayout.CENTER);

      JPanel cartoes = new JPanel(new GridLayout(1, 4, 12, 0));
      cartoes.setOpaque(false);
      cartoes.add(this.cartaoFaturadas);
      cartoes.add(this.cartaoErros);
      cartoes.add(this.cartaoConferencia);
      cartoes.add(this.cartaoNotas);
      this.cartaoErros.setCursor(java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR));
      this.cartaoErros.setToolTipText("Mostrar só as faturas com erro");
      this.cartaoErros.addMouseListener(new MouseAdapter() {
         @Override
         public void mouseClicked(MouseEvent e) {
            PainelFaturacao.this.abas.setSelectedIndex(0);
            PainelFaturacao.this.comboFiltro.setSelectedItem("Com erro");
         }
      });
      this.cartaoConferencia.setCursor(java.awt.Cursor.getPredefinedCursor(java.awt.Cursor.HAND_CURSOR));
      this.cartaoConferencia.setToolTipText("Mostrar só as faturas com diferença no ZSGO");
      this.cartaoConferencia.addMouseListener(new MouseAdapter() {
         @Override
         public void mouseClicked(MouseEvent e) {
            PainelFaturacao.this.abas.setSelectedIndex(0);
            PainelFaturacao.this.comboFiltro.setSelectedItem("Com diferença no ZSGO");
         }
      });

      JPanel topo = new JPanel();
      topo.setLayout(new BoxLayout(topo, BoxLayout.Y_AXIS));
      topo.setOpaque(false);
      for (JPanel p : new JPanel[]{linhaAcoes, linhaEstado, cartoes}) {
         p.setAlignmentX(0.0F);
      }
      topo.add(linhaAcoes);
      topo.add(Box.createVerticalStrut(8));
      topo.add(linhaEstado);
      topo.add(Box.createVerticalStrut(10));
      topo.add(cartoes);
      return topo;
   }

   private JTabbedPane montarAbas() {
      JPanel filtros = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 4));
      filtros.setOpaque(false);
      JLabel labelFiltro = new JLabel("Mostrar:");
      labelFiltro.setFont(Tema.FONT_BASE);
      this.labelProcura.setFont(Tema.FONT_BASE);
      filtros.add(labelFiltro);
      filtros.add(this.comboFiltro);
      filtros.add(Box.createHorizontalStrut(12));
      filtros.add(this.labelProcura);
      filtros.add(this.campoProcura);
      this.campoProcura.setToolTipText("Cliente, nome, NIF ou nº do documento");
      this.comboFiltro.addActionListener(e -> this.aplicarFiltro());
      this.campoProcura.getDocument().addDocumentListener(new DocumentListener() {
         public void insertUpdate(DocumentEvent e) {
            PainelFaturacao.this.aplicarFiltro();
         }

         public void removeUpdate(DocumentEvent e) {
            PainelFaturacao.this.aplicarFiltro();
         }

         public void changedUpdate(DocumentEvent e) {
            PainelFaturacao.this.aplicarFiltro();
         }
      });

      this.estilizarTabela(this.tabelaFaturas, new int[]{70, 190, 150, 110, 90, 100, 95, 85, 85, 380});
      this.tabelaFaturas.setRowSorter(this.sorterFaturas);
      this.tabelaFaturas.getColumnModel().getColumn(COL_ESTADO).setCellRenderer(new RendererEstado());
      RendererValor rv = new RendererValor(false);
      for (int c = 4; c <= 7; c++) {
         this.tabelaFaturas.getColumnModel().getColumn(c).setCellRenderer(rv);
      }
      this.tabelaFaturas.getColumnModel().getColumn(COL_DIFERENCA).setCellRenderer(new RendererValor(true));
      this.tabelaFaturas.addMouseListener(new MouseAdapter() {
         @Override
         public void mouseClicked(MouseEvent e) {
            if (e.getClickCount() == 2) {
               int v = PainelFaturacao.this.tabelaFaturas.rowAtPoint(e.getPoint());
               if (v >= 0) {
                  PainelFaturacao.this.abrirDetalhe(PainelFaturacao.this.linhasFaturas.get(PainelFaturacao.this.tabelaFaturas.convertRowIndexToModel(v)));
               }
            }
         }
      });

      JPanel abaFaturas = new JPanel(new BorderLayout(0, 6));
      abaFaturas.setOpaque(false);
      abaFaturas.add(filtros, BorderLayout.NORTH);
      abaFaturas.add(new JScrollPane(this.tabelaFaturas), BorderLayout.CENTER);

      this.estilizarTabela(this.tabelaNotas, new int[]{70, 190, 110, 120, 150, 80, 130, 420});
      this.tabelaNotas.setAutoCreateRowSorter(true);
      this.tabelaNotas.getColumnModel().getColumn(2).setCellRenderer(new RendererEstado());
      this.tabelaNotas.getColumnModel().getColumn(5).setCellRenderer(new RendererValor(false));
      DetalheErro.instalar(this.tabelaNotas, 0, 7);

      this.abas.addTab("Faturas", abaFaturas);
      this.abas.addTab("Notas de crédito", new JScrollPane(this.tabelaNotas));
      this.abas.setFont(Tema.FONT_BOLD);
      return this.abas;
   }

   private void estilizarTabela(JTable t, int[] larguras) {
      t.setFont(Tema.FONT_BASE.deriveFont(13.0F));
      t.setRowHeight(26);
      t.setAutoResizeMode(JTable.AUTO_RESIZE_SUBSEQUENT_COLUMNS);
      for (int i = 0; i < larguras.length; i++) {
         t.getColumnModel().getColumn(i).setPreferredWidth(larguras[i]);
      }
      t.setDefaultRenderer(Object.class, new DefaultTableCellRenderer());
   }

   // ------------------------------------------------------------ dados

   /** Volta a ler da base de dados as faturas do mês escolhido. */
   public void recarregar() {
      this.recarregar(" ");
   }

   // ------------------------------------------------------------ atualização ao vivo

   /** Enquanto a faturação corre, a lista volta a ser lida da BD de poucos em poucos segundos. */
   private final javax.swing.Timer timerAoVivo = new javax.swing.Timer(3000, e -> this.atualizarSilencioso());
   private volatile boolean aCarregarSilencioso = false;

   public void iniciarAtualizacaoAoVivo() {
      SwingUtilities.invokeLater(() -> {
         this.timerAoVivo.setInitialDelay(1500);
         this.timerAoVivo.restart();
      });
   }

   public void pararAtualizacaoAoVivo() {
      SwingUtilities.invokeLater(this.timerAoVivo::stop);
   }

   /** Relê as faturas sem mexer na linha de estado/progresso nem na posição da lista. */
   private void atualizarSilencioso() {
      YearMonth ym = this.getMesSelecionado();
      if (ym == null || this.aCarregarSilencioso) {
         return;
      }
      this.aCarregarSilencioso = true;
      new Thread(() -> {
         try {
            RelatorioService.Relatorio r = RelatorioRun.obter(this.config.get(), ym.getYear(), ym.getMonthValue());
            SwingUtilities.invokeLater(() -> {
               if (ym.equals(this.getMesSelecionado())) {
                  this.mostrarMantendoPosicao(r);
               }
            });
         } catch (Exception e) {
            // Falha pontual a meio da faturação: tenta outra vez no próximo ciclo.
         } finally {
            this.aCarregarSilencioso = false;
         }
      }, "faturacao-ao-vivo").start();
   }

   private void mostrarMantendoPosicao(RelatorioService.Relatorio r) {
      java.awt.Rectangle vista = this.tabelaFaturas.getVisibleRect();
      int sel = this.tabelaFaturas.getSelectedRow();
      String clienteSel = sel >= 0 ? this.linhasFaturas.get(this.tabelaFaturas.convertRowIndexToModel(sel)).clienteId : null;
      this.mostrar(r);
      this.tabelaFaturas.scrollRectToVisible(vista);
      if (clienteSel != null) {
         for (int i = 0; i < this.tabelaFaturas.getRowCount(); i++) {
            if (clienteSel.equals(this.linhasFaturas.get(this.tabelaFaturas.convertRowIndexToModel(i)).clienteId)) {
               this.tabelaFaturas.setRowSelectionInterval(i, i);
               break;
            }
         }
      }
   }

   /** Recarrega sem apagar a mensagem atual (ex.: o resumo da faturação que acabou de correr). */
   public void recarregarMantendoEstado() {
      this.recarregar(this.labelEstado.getText());
   }

   /** Recarrega e, no fim, deixa a mensagem indicada na linha de estado. */
   private void recarregar(String mensagemFinal) {
      YearMonth ym = this.getMesSelecionado();
      if (ym == null) {
         return;
      }
      this.anoAtual = ym.getYear();
      this.mesAtual = ym.getMonthValue();
      this.mostrarEstado("A carregar as faturas de " + nomeMes(ym) + "...", -1, -1);
      new Thread(() -> {
         try {
            RelatorioService.Relatorio r = RelatorioRun.obter(this.config.get(), ym.getYear(), ym.getMonthValue());
            SwingUtilities.invokeLater(() -> {
               if (ym.equals(this.getMesSelecionado())) {
                  this.mostrar(r);
                  this.mostrarEstado(mensagemFinal, 0, 0);
               }
            });
         } catch (Exception e) {
            SwingUtilities.invokeLater(() -> this.mostrarEstado("Não foi possível carregar: " + Erros.descrever(e), 0, 0));
         }
      }, "carregar-faturacao").start();
   }

   private void mostrar(RelatorioService.Relatorio r) {
      this.relatorio = r;
      this.linhasFaturas.clear();
      this.modeloFaturas.setRowCount(0);
      int faturadas = 0;
      int erros = 0;
      int conferidas = 0;
      int diferencas = 0;
      BigDecimal valorFaturado = BigDecimal.ZERO;
      for (InvoiceSyncDao.FaturaDetalhe f : r.faturas) {
         this.linhasFaturas.add(f);
         String estado = estadoSimples(f);
         if ("Faturada".equals(estado)) {
            faturadas++;
            if (f.valorTotal != null) {
               valorFaturado = valorFaturado.add(f.valorTotal);
            }
         } else if (estado.startsWith("Erro")) {
            erros++;
         }
         if (f.zsgoConferidoEm != null && f.zsgoErroConferencia == null) {
            conferidas++;
            if (f.temDiferenca()) {
               diferencas++;
            }
         }
         this.modeloFaturas.addRow(new Object[]{
            f.clienteId,
            nomeCliente(f),
            estado,
            f.zsgoNumero != null ? f.zsgoNumero : (f.zsgoSaleId != null ? "(por conferir)" : ""),
            f.valorTotal,
            f.zsgoTotal,
            f.zsgoLiquido,
            f.zsgoIva,
            f.diferenca(),
            observacao(f)
         });
      }

      int notasOk = 0;
      int notasErro = 0;
      BigDecimal valorNotas = BigDecimal.ZERO;
      this.modeloNotas.setRowCount(0);
      if (r.notasCredito != null) {
         for (CreditNoteSyncDao.NotaCredito n : r.notasCredito) {
            boolean ok = "SINCRONIZADO".equals(n.status);
            if (ok) {
               notasOk++;
               if (n.valorEstorno != null) {
                  valorNotas = valorNotas.add(n.valorEstorno);
               }
            } else if ("ERRO".equals(n.status)) {
               notasErro++;
            }
            this.modeloNotas.addRow(new Object[]{
               n.clienteId,
               n.nome != null ? n.nome : "—",
               ok ? "Emitida" : ("ERRO".equals(n.status) ? "Erro" : n.status),
               n.chargebackId,
               n.transacaoOriginalId,
               n.valorEstorno,
               n.zsgoNcId != null ? n.zsgoNcId : "",
               ok ? "" : semVazio(n.ultimoErro)
            });
         }
      }

      this.cartaoFaturadas.configurar("Faturadas", String.valueOf(faturadas), MOEDA.format(valorFaturado) + " no total", Tema.CARD_TEAL_BG, Tema.CARD_TEAL_FG);
      this.cartaoErros.configurar("Com erro", String.valueOf(erros), erros == 0 ? "Nenhuma" : "Clica para ver os motivos", Tema.CARD_CORAL_BG, Tema.CARD_CORAL_FG);
      int comId = 0;
      for (InvoiceSyncDao.FaturaDetalhe f : r.faturas) {
         if (f.zsgoSaleId != null) {
            comId++;
         }
      }
      String textoConf = conferidas == 0
         ? "Carrega em Conferir com o ZSGO"
         : (diferencas == 0 ? "Todas iguais ao ZSGO" : diferencas + " com diferença (clica)") + (conferidas < comId ? " (" + (comId - conferidas) + " por conferir)" : "");
      this.cartaoConferencia.configurar("Conferidas com o ZSGO", conferidas + " / " + comId, textoConf, Tema.CARD_BLUE_BG, Tema.CARD_BLUE_FG);
      this.cartaoNotas.configurar(
         "Notas de crédito", String.valueOf(notasOk), notasErro > 0 ? notasErro + " com erro" : MOEDA.format(valorNotas) + " estornados", Tema.CARD_PURPLE_BG, Tema.CARD_PURPLE_FG
      );
      this.abas.setTitleAt(0, "Faturas (" + r.faturas.size() + ")");
      this.abas.setTitleAt(1, "Notas de crédito (" + (r.notasCredito != null ? r.notasCredito.size() : 0) + ")");
      this.aplicarFiltro();
      this.aplicarCores();
   }

   private void mostrarCartoesVazios() {
      this.cartaoFaturadas.configurar("Faturadas", "—", " ", Tema.CARD_TEAL_BG, Tema.CARD_TEAL_FG);
      this.cartaoErros.configurar("Com erro", "—", " ", Tema.CARD_CORAL_BG, Tema.CARD_CORAL_FG);
      this.cartaoConferencia.configurar("Conferidas com o ZSGO", "—", " ", Tema.CARD_BLUE_BG, Tema.CARD_BLUE_FG);
      this.cartaoNotas.configurar("Notas de crédito", "—", " ", Tema.CARD_PURPLE_BG, Tema.CARD_PURPLE_FG);
   }

   static String estadoSimples(InvoiceSyncDao.FaturaDetalhe f) {
      if ("SINCRONIZADO".equals(f.status)) {
         return f.zsgoAnulado ? "Anulada no ZSGO" : "Faturada";
      }
      if ("ERRO".equals(f.status)) {
         return f.zsgoSaleId != null ? "Erro (já no ZSGO)" : "Erro";
      }
      if ("FATURA_CRIADA".equals(f.status) || "PDF_GERADO".equals(f.status)) {
         return "Incompleta";
      }
      return f.status == null ? "—" : f.status;
   }

   private static String nomeCliente(InvoiceSyncDao.FaturaDetalhe f) {
      String nome = f.nome != null ? f.nome : "—";
      if (f.isRedirecionada()) {
         nome = nome + " (via " + f.origemId + (f.nomeOrigem != null ? " " + f.nomeOrigem : "") + ")";
      }
      return nome;
   }

   private static String observacao(InvoiceSyncDao.FaturaDetalhe f) {
      if (!"SINCRONIZADO".equals(f.status)) {
         return semVazio(f.ultimoErro);
      }
      if (f.zsgoErroConferencia != null) {
         return "Não foi possível ler do ZSGO: " + f.zsgoErroConferencia;
      }
      if (f.zsgoConferidoEm == null) {
         return "Por conferir com o ZSGO";
      }
      if (f.zsgoAnulado) {
         return "Este documento está ANULADO no ZSGO";
      }
      BigDecimal d = f.diferenca();
      if (d != null && d.abs().compareTo(new BigDecimal("0.01")) >= 0) {
         return "O ZSGO tem " + MOEDA.format(f.zsgoTotal) + ", foi enviado " + MOEDA.format(f.valorTotal);
      }
      return "Igual ao ZSGO";
   }

   private static String semVazio(String s) {
      return s == null || s.isBlank() ? "(erro sem mensagem gravada — execução antiga; volta a gerar para registar o motivo)" : s;
   }

   private void aplicarFiltro() {
      final String filtro = (String) this.comboFiltro.getSelectedItem();
      final String procura = this.campoProcura.getText().trim().toLowerCase(PT);
      this.sorterFaturas.setRowFilter(new RowFilter<DefaultTableModel, Integer>() {
         @Override
         public boolean include(RowFilter.Entry<? extends DefaultTableModel, ? extends Integer> e) {
            InvoiceSyncDao.FaturaDetalhe f = PainelFaturacao.this.linhasFaturas.get(e.getIdentifier());
            String estado = estadoSimples(f);
            boolean passa = switch (filtro == null ? "Todas" : filtro) {
               case "Com erro" -> estado.startsWith("Erro") || "Incompleta".equals(estado);
               case "Com diferença no ZSGO" -> f.temDiferenca() || f.zsgoErroConferencia != null;
               case "Por conferir" -> f.zsgoSaleId != null && f.zsgoConferidoEm == null;
               case "Faturadas" -> "Faturada".equals(estado);
               default -> true;
            };
            if (!passa || procura.isEmpty()) {
               return passa;
            }
            String alvo = (f.clienteId + " " + f.origemId + " " + f.nome + " " + f.nif + " " + f.zsgoNumero + " " + f.zsgoSaleId).toLowerCase(PT);
            return alvo.contains(procura);
         }
      });
   }

   // ------------------------------------------------------------ conferência

   private void conferir() {
      YearMonth ym = this.getMesSelecionado();
      this.btnConferir.setEnabled(false);
      this.btnGerar.setEnabled(false);
      StatusListener st = (t, a, b) -> SwingUtilities.invokeLater(() -> this.mostrarEstado(t, a, b));
      new Thread(() -> {
         try {
            ConferenciaService.Resultado r = ConferenciaService.conferir(this.config.get(), ym.getYear(), ym.getMonthValue(), st);
            SwingUtilities.invokeLater(() -> {
               this.recarregar("Conferência de " + nomeMes(ym) + " concluída — " + r.iguais + " iguais, " + r.diferentes + " com diferença"
                  + (r.erros > 0 ? ", " + r.erros + " não foi possível ler do ZSGO." : "."));
               if (r.diferentes > 0 || r.erros > 0) {
                  this.comboFiltro.setSelectedItem("Com diferença no ZSGO");
               }
            });
         } catch (Exception e) {
            SwingUtilities.invokeLater(() -> {
               this.mostrarEstado("A conferência falhou: " + Erros.descrever(e), 0, 0);
               JOptionPane.showMessageDialog(this, "A conferência com o ZSGO falhou:\n" + Erros.descrever(e), "Erro", JOptionPane.ERROR_MESSAGE);
            });
         } finally {
            SwingUtilities.invokeLater(() -> {
               this.btnConferir.setEnabled(true);
               this.btnGerar.setEnabled(true);
            });
         }
      }, "conferencia-zsgo").start();
   }

   // ------------------------------------------------------------ geração (chamado pelo PainelApp)

   /** Listener para a fase de faturas ou de notas de crédito: mostra o progresso no topo. */
   private String resumoFaturas = "";

   public ProgressListener criarListener(String fase) {
      boolean ehFaturas = fase.startsWith("Faturas");
      if (ehFaturas) {
         this.resumoFaturas = "";
      }
      return new ProgressListener() {
         private int total;

         @Override
         public void aoIniciar(int t) {
            this.total = t;
            SwingUtilities.invokeLater(() -> PainelFaturacao.this.mostrarEstado(fase + ": a processar 0 / " + t + "...", 0, Math.max(t, 1)));
         }

         @Override
         public void aoProgredir(int feitos, int t) {
            SwingUtilities.invokeLater(() -> PainelFaturacao.this.mostrarEstado(fase + ": a processar " + feitos + " / " + t + "...", feitos, Math.max(t, 1)));
         }

         @Override
         public void aoItemFalhar(String cliente, String erro) {
         }

         @Override
         public void aoConcluir(int ok, int ignorados, int falhados, BigDecimal valor) {
            String msg = fase + ": " + ok + " criada(s), " + ignorados + " já feita(s), " + falhados + " com erro"
               + (valor != null && valor.signum() != 0 ? " (" + MOEDA.format(valor) + ")" : "");
            if (ehFaturas) {
               PainelFaturacao.this.resumoFaturas = msg;
            }
            String completo = ehFaturas || PainelFaturacao.this.resumoFaturas.isEmpty() ? msg + "." : PainelFaturacao.this.resumoFaturas + "  ·  " + msg + ".";
            SwingUtilities.invokeLater(() -> PainelFaturacao.this.mostrarEstado(completo, this.total, Math.max(this.total, 1)));
         }
      };
   }

   public void mostrarEstado(String texto, int atual, int total) {
      this.labelEstado.setText(texto);
      if (total == 0) {
         this.progresso.setVisible(false);
      } else if (total < 0) {
         this.progresso.setVisible(true);
         this.progresso.setIndeterminate(true);
         this.progresso.setStringPainted(false);
      } else {
         this.progresso.setVisible(true);
         this.progresso.setIndeterminate(false);
         this.progresso.setStringPainted(true);
         this.progresso.setMaximum(total);
         this.progresso.setValue(atual);
      }
      this.revalidate();
   }

   // ------------------------------------------------------------ detalhe

   private void abrirDetalhe(InvoiceSyncDao.FaturaDetalhe f) {
      JTextArea texto = new JTextArea(this.textoDetalhe(f, null));
      texto.setEditable(false);
      texto.setFont(Tema.FONT_MONO.deriveFont(13.0F));
      texto.setLineWrap(true);
      texto.setWrapStyleWord(true);
      texto.setCaretPosition(0);
      JScrollPane scroll = new JScrollPane(texto);
      scroll.setPreferredSize(new Dimension(820, 460));

      JDialog dialogo = new JDialog(SwingUtilities.getWindowAncestor(this), "Fatura — cliente " + f.clienteId + (f.isRedirecionada() ? " (via " + f.origemId + ")" : ""));
      dialogo.setModal(true);
      JButton btnLer = new JButton("Ler do ZSGO agora");
      btnLer.setEnabled(f.zsgoSaleId != null);
      btnLer.setToolTipText("Vai buscar o documento ao ZSGO neste momento e mostra as linhas e a resposta completa.");
      btnLer.addActionListener(e -> {
         btnLer.setEnabled(false);
         btnLer.setText("A ler...");
         new Thread(() -> {
            String novo;
            try {
               ZsgoDocumento d = ConferenciaService.lerDocumento(this.config.get(), f.zsgoSaleId);
               novo = this.textoDetalhe(f, d);
            } catch (Exception ex) {
               novo = this.textoDetalhe(f, null) + "\n\nNÃO FOI POSSÍVEL LER DO ZSGO: " + Erros.descrever(ex);
            }
            String fim = novo;
            SwingUtilities.invokeLater(() -> {
               texto.setText(fim);
               texto.setCaretPosition(0);
               btnLer.setText("Ler do ZSGO agora");
               btnLer.setEnabled(true);
            });
         }, "ler-zsgo").start();
      });
      JButton btnCopiar = new JButton("Copiar");
      btnCopiar.addActionListener(e -> Toolkit.getDefaultToolkit().getSystemClipboard().setContents(new StringSelection(texto.getText()), null));
      JButton btnFechar = new JButton("Fechar");
      btnFechar.addActionListener(e -> dialogo.dispose());
      JPanel botoes = new JPanel(new FlowLayout(FlowLayout.RIGHT));
      botoes.add(btnLer);
      botoes.add(btnCopiar);
      botoes.add(btnFechar);
      JPanel conteudo = new JPanel(new BorderLayout(0, 8));
      conteudo.setBorder(new EmptyBorder(12, 12, 12, 12));
      conteudo.add(scroll, BorderLayout.CENTER);
      conteudo.add(botoes, BorderLayout.SOUTH);
      dialogo.setContentPane(conteudo);
      dialogo.pack();
      dialogo.setLocationRelativeTo(this);
      dialogo.setVisible(true);
   }

   private String textoDetalhe(InvoiceSyncDao.FaturaDetalhe f, ZsgoDocumento d) {
      SimpleDateFormat df = new SimpleDateFormat("dd/MM/yyyy HH:mm");
      StringBuilder b = new StringBuilder();
      b.append("CLIENTE\n");
      b.append("  ").append(f.clienteId).append(" — ").append(f.nome != null ? f.nome : "(sem nome)");
      if (f.nif != null) {
         b.append("   NIF ").append(f.nif);
      }
      b.append('\n');
      if (f.isRedirecionada()) {
         b.append("  Comissões da conta ").append(f.origemId).append(f.nomeOrigem != null ? " (" + f.nomeOrigem + ")" : "").append(" faturadas a este cliente\n");
      }
      b.append("\nNO PROGRAMA\n");
      b.append("  Estado: ").append(estadoSimples(f)).append("  (").append(f.status).append(", ").append(f.tentativas).append(" tentativa(s)");
      if (f.atualizadoEm != null) {
         b.append(", última alteração ").append(df.format(f.atualizadoEm));
      }
      b.append(")\n");
      b.append("  Valor enviado ao ZSGO: ").append(f.valorTotal != null ? MOEDA.format(f.valorTotal) : "—").append("  (enviado como preço COM IVA incluído)\n");
      b.append("  ID do documento no ZSGO: ").append(f.zsgoSaleId != null ? f.zsgoSaleId : "— (ainda não criado)").append('\n');
      if (f.ultimoErro != null && !"SINCRONIZADO".equals(f.status)) {
         b.append("\nERRO\n  ").append(f.ultimoErro).append('\n');
      }
      b.append("\nRUBRICAS ENVIADAS (").append(f.nLinhas).append(" linha(s), ").append(f.nTransacoes).append(" transações");
      if (f.somaLinhas != null) {
         b.append(", soma ").append(MOEDA.format(f.somaLinhas));
      }
      b.append(")\n");
      if (f.rubricas != null) {
         for (String l : f.rubricas.split("\n")) {
            b.append("  • ").append(l).append('\n');
         }
      } else {
         b.append("  (sem detalhe de rubricas gravado)\n");
      }

      b.append("\nNO ZSGO\n");
      if (d != null) {
         b.append("  (lido agora do ZSGO)\n");
         b.append("  Documento: ").append(d.numero != null ? d.numero : "—").append("   Tipo: ").append(d.tipo != null ? d.tipo : "—")
            .append("   Estado: ").append(d.estado != null ? d.estado : "—").append(d.anulado ? "  *** ANULADO ***" : "").append('\n');
         if (d.data != null) {
            b.append("  Data: ").append(d.data).append('\n');
         }
         b.append("  Total: ").append(d.total != null ? MOEDA.format(d.total) : "—")
            .append("   Líquido: ").append(d.liquido != null ? MOEDA.format(d.liquido) : "—")
            .append("   IVA: ").append(d.iva != null ? MOEDA.format(d.iva) : "—").append('\n');
         if (d.total != null && f.valorTotal != null) {
            b.append("  Diferença para o enviado: ").append(MOEDA.format(d.total.subtract(f.valorTotal))).append('\n');
         }
         b.append("  Linhas no ZSGO (").append(d.linhas.size()).append("):\n");
         for (ZsgoDocumento.Linha l : d.linhas) {
            b.append("  • ").append(l.produto != null ? l.produto : "?")
               .append(" | qtd ").append(l.quantidade != null ? l.quantidade.stripTrailingZeros().toPlainString() : "?")
               .append(" | preço ").append(l.precoUnitario != null ? MOEDA.format(l.precoUnitario) : "?")
               .append(" | IVA ").append(l.taxaIva != null ? l.taxaIva.stripTrailingZeros().toPlainString() + "%" : "?")
               .append(" | total ").append(l.total != null ? MOEDA.format(l.total) : "?");
            if (l.notas != null) {
               b.append(" | ").append(l.notas);
            }
            b.append('\n');
         }
         b.append("\nRESPOSTA COMPLETA DO ZSGO\n").append(d.json).append('\n');
      } else if (f.zsgoConferidoEm != null) {
         b.append("  (última conferência: ").append(df.format(f.zsgoConferidoEm)).append(" — carrega em \"Ler do ZSGO agora\" para ver as linhas)\n");
         if (f.zsgoErroConferencia != null) {
            b.append("  Não foi possível ler: ").append(f.zsgoErroConferencia).append('\n');
         } else {
            b.append("  Documento: ").append(f.zsgoNumero != null ? f.zsgoNumero : "—").append("   Estado: ").append(f.zsgoEstado != null ? f.zsgoEstado : "—")
               .append(f.zsgoAnulado ? "  *** ANULADO ***" : "").append('\n');
            b.append("  Total: ").append(f.zsgoTotal != null ? MOEDA.format(f.zsgoTotal) : "—")
               .append("   Líquido: ").append(f.zsgoLiquido != null ? MOEDA.format(f.zsgoLiquido) : "—")
               .append("   IVA: ").append(f.zsgoIva != null ? MOEDA.format(f.zsgoIva) : "—").append('\n');
            if (f.diferenca() != null) {
               b.append("  Diferença para o enviado: ").append(MOEDA.format(f.diferenca())).append('\n');
            }
         }
      } else if (f.zsgoSaleId != null) {
         b.append("  Ainda não conferido — carrega em \"Ler do ZSGO agora\".\n");
      } else {
         b.append("  Este documento não existe no ZSGO.\n");
      }
      if (f.pdfUrl != null) {
         b.append("\nPDF: ").append(f.pdfUrl).append('\n');
      }
      return b.toString();
   }

   // ------------------------------------------------------------ exportar

   private void exportarFaturas() {
      this.exportarTabela(this.tabelaFaturas, "faturas");
   }

   private void exportarRubricas() {
      if (this.relatorio == null || this.relatorio.linhasPorRubrica == null || this.relatorio.linhasPorRubrica.isEmpty()) {
         JOptionPane.showMessageDialog(this, "Não há linhas por rubrica neste mês.", "Exportar", JOptionPane.INFORMATION_MESSAGE);
         return;
      }
      StringBuilder b = new StringBuilder("﻿Cliente;Nome;NIF;Rubrica;Referência produto;Nº transações;Isento IVA;Valor\r\n");
      NumberFormat num = NumberFormat.getNumberInstance(PT);
      num.setMinimumFractionDigits(2);
      for (InvoiceLineDetailDao.LinhaDetalhe l : this.relatorio.linhasPorRubrica) {
         b.append(csv(l.clienteId)).append(';').append(csv(l.nome)).append(';').append(csv(l.nif)).append(';').append(csv(l.rubrica)).append(';')
            .append(csv(l.productReference)).append(';').append(l.nrTransacoes).append(';').append(l.isIsentoIva() ? "Sim" : "Não").append(';')
            .append(l.valor != null ? num.format(l.valor) : "").append("\r\n");
      }
      this.gravar(b.toString(), String.format("rubricas_%04d_%02d.csv", this.anoAtual, this.mesAtual));
   }

   private void exportarTabela(JTable t, String nome) {
      if (t.getRowCount() == 0) {
         JOptionPane.showMessageDialog(this, "Não há linhas para exportar.", "Exportar", JOptionPane.INFORMATION_MESSAGE);
         return;
      }
      NumberFormat num = NumberFormat.getNumberInstance(PT);
      num.setMinimumFractionDigits(2);
      StringBuilder b = new StringBuilder("﻿");
      for (int c = 0; c < t.getColumnCount(); c++) {
         b.append(c > 0 ? ";" : "").append(csv(t.getColumnName(c)));
      }
      b.append("\r\n");
      for (int r = 0; r < t.getRowCount(); r++) {
         for (int c = 0; c < t.getColumnCount(); c++) {
            Object v = t.getValueAt(r, c);
            b.append(c > 0 ? ";" : "").append(v instanceof BigDecimal bd ? num.format(bd) : csv(v == null ? "" : v.toString()));
         }
         b.append("\r\n");
      }
      this.gravar(b.toString(), String.format("%s_%04d_%02d.csv", nome, this.anoAtual, this.mesAtual));
   }

   private void gravar(String conteudo, String nomeSugerido) {
      JFileChooser fc = new JFileChooser();
      fc.setSelectedFile(new File(nomeSugerido));
      if (fc.showSaveDialog(this) != JFileChooser.APPROVE_OPTION) {
         return;
      }
      File f = fc.getSelectedFile();
      if (!f.getName().toLowerCase(Locale.ROOT).endsWith(".csv")) {
         f = new File(f.getParentFile(), f.getName() + ".csv");
      }
      try {
         Files.writeString(f.toPath(), conteudo, StandardCharsets.UTF_8);
         JOptionPane.showMessageDialog(this, "Exportado para:\n" + f.getAbsolutePath(), "Exportar", JOptionPane.INFORMATION_MESSAGE);
      } catch (IOException e) {
         JOptionPane.showMessageDialog(this, "Não foi possível gravar: " + e.getMessage(), "Erro", JOptionPane.ERROR_MESSAGE);
      }
   }

   private static String csv(String s) {
      if (s == null) {
         return "";
      }
      return s.contains(";") || s.contains("\"") || s.contains("\n") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
   }

   static String nomeMes(YearMonth ym) {
      String m = ym.getMonth().getDisplayName(TextStyle.FULL, PT);
      return Character.toUpperCase(m.charAt(0)) + m.substring(1) + " de " + ym.getYear();
   }

   // ------------------------------------------------------------ aparência

   private class RendererEstado extends DefaultTableCellRenderer {
      @Override
      public Component getTableCellRendererComponent(JTable t, Object v, boolean sel, boolean foco, int r, int c) {
         super.getTableCellRendererComponent(t, v, sel, foco, r, c);
         String s = v == null ? "" : v.toString();
         this.setFont(Tema.FONT_BOLD.deriveFont(12.5F));
         if (!sel) {
            this.setBackground(Tema.SURFACE);
         }
         if (s.startsWith("Faturada") || s.startsWith("Emitida")) {
            this.setForeground(Tema.SUCCESS);
            this.setText("✔ " + s);
         } else if (s.startsWith("Erro") || s.startsWith("Anulada")) {
            this.setForeground(Tema.DESTRUCTIVE);
            this.setText("✖ " + s);
         } else {
            this.setForeground(Tema.MUTED_FOREGROUND);
         }
         return this;
      }
   }

   private static class RendererValor extends DefaultTableCellRenderer {
      private final boolean destacar;

      RendererValor(boolean destacar) {
         this.destacar = destacar;
         this.setHorizontalAlignment(SwingConstants.RIGHT);
      }

      @Override
      public Component getTableCellRendererComponent(JTable t, Object v, boolean sel, boolean foco, int r, int c) {
         super.getTableCellRendererComponent(t, v instanceof BigDecimal bd ? MOEDA.format(bd) : "", sel, foco, r, c);
         if (!sel) {
            this.setBackground(Tema.SURFACE);
         }
         Color cor = Tema.FOREGROUND;
         this.setFont(Tema.FONT_BASE.deriveFont(13.0F));
         if (this.destacar && v instanceof BigDecimal bd) {
            if (bd.abs().compareTo(new BigDecimal("0.01")) >= 0) {
               cor = Tema.DESTRUCTIVE;
               this.setFont(Tema.FONT_BOLD.deriveFont(13.0F));
            } else {
               cor = Tema.SUCCESS;
            }
         }
         this.setForeground(cor);
         return this;
      }
   }

   @Override
   public void aoMudarTema() {
      this.aplicarCores();
      if (this.relatorio != null) {
         this.mostrar(this.relatorio);
      }
   }

   private void aplicarCores() {
      for (JLabel l : new JLabel[]{this.labelMes, this.labelProcura}) {
         l.setForeground(Tema.FOREGROUND);
      }
      this.labelEstado.setForeground(Tema.MUTED_FOREGROUND);
      this.labelDica.setForeground(Tema.MUTED_FOREGROUND);
      for (JButton b : new JButton[]{this.btnConferir, this.btnExportar}) {
         b.setFont(Tema.FONT_BOLD);
         b.setBackground(Tema.SURFACE_2);
         b.setForeground(Tema.FOREGROUND);
         b.setFocusPainted(false);
         b.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(Tema.BORDER, 1, true), new EmptyBorder(9, 16, 9, 16)));
      }
      for (JTable t : new JTable[]{this.tabelaFaturas, this.tabelaNotas}) {
         t.setBackground(Tema.SURFACE);
         t.setForeground(Tema.FOREGROUND);
         t.setSelectionBackground(Tema.SURFACE_2);
         t.setSelectionForeground(Tema.FOREGROUND);
         t.setGridColor(Tema.BORDER);
         t.getTableHeader().setBackground(Tema.SURFACE_2);
         t.getTableHeader().setForeground(Tema.MUTED_FOREGROUND);
         t.getTableHeader().setFont(Tema.FONT_BOLD.deriveFont(12.0F));
         DefaultTableCellRenderer r = (DefaultTableCellRenderer) t.getDefaultRenderer(Object.class);
         r.setBackground(Tema.SURFACE);
         r.setForeground(Tema.FOREGROUND);
         if (t.getParent() != null) {
            t.getParent().setBackground(Tema.SURFACE);
         }
      }
      this.repaint();
   }
}
