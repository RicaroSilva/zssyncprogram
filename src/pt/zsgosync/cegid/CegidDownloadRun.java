package pt.zsgosync.cegid;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import pt.zsgosync.config.AppConfig;

/**
 * Descarrega os PDFs das faturas antigas do Cegid (lp_cloudware_*) para o S3 —
 * o mesmo que o menu "Histórico Cegid" da aplicação web, mas sem precisar da
 * aplicação: corre num PC qualquer com o config.properties.
 *
 * Divide o trabalho por vários PCs (cada um na sua ligação à internet, porque o
 * Cegid limita os pedidos por minuto por ligação): cada PC trata só as faturas
 * cujo nº interno dá o resto "parte-1" a dividir por "de" — nunca as mesmas.
 * O progresso fica na mesma tabela (zsgo_web_cegid_documento), por isso o
 * painel web mostra todas as partes.
 *
 *   java -cp zsgo-client-sync.jar pt.zsgosync.cegid.CegidDownloadRun config.properties PARTE DE
 *   ex.: ... config.properties 2 2   (parte 2 de 2)
 *
 * Mesmas regras da web: nome = nº da fatura com "/"→"-" ("FR 2024-3342.pdf");
 * pedidos ao Cegid espaçados a um ritmo que se ajusta aos 429; o PDF
 * (…/public-file/…) não entra no ritmo. Antes de descarregar confirma no S3
 * (HEAD) se o ficheiro já lá está. Só lê as tabelas lp_cloudware_*.
 */
public class CegidDownloadRun {

   private static final String UA = "Mozilla/5.0 (faturacao-java; copia de documentos)";
   private static final Pattern ENDERECOS = Pattern.compile(
      "(?:https?://[^\"'`\\s<>\\\\]+)?/(?:public-file|rus/public-rus/public_links/link|public_links/link)/eyJ[A-Za-z0-9_.-]+");
   private static final Pattern LINK = Pattern.compile("^(https?://[^/]+/(?:rus/public-rus/)?public_links/link/)([^/?#]+)");

   private final AppConfig cfg;
   private final int parte;
   private final int de;
   private final boolean repetirErros;
   private final HttpClient http = HttpClient.newBuilder()
      .followRedirects(HttpClient.Redirect.NORMAL)
      .connectTimeout(Duration.ofSeconds(30))
      .build();

   // S3
   private final String s3Endpoint;
   private final String s3Bucket;
   private final String s3Regiao;
   private final String s3Chave;
   private final String s3Segredo;
   private final String prefixo;

   // ritmo dos pedidos ao Cegid (páginas por minuto)
   private final double ritmoInicial;
   private final double ritmoMaximo;
   private double porMinuto;
   private long proximaVez;
   private long ultimoCorte;
   private int semTravao;
   private volatile long travaoAte;

   // atalhos aprendidos (link guardado → destino do redirecionamento)
   private final Map<String, String> atalhos = new ConcurrentHashMap<>();
   private final Set<String> imagens = ConcurrentHashMap.newKeySet();

   // contadores
   private final AtomicInteger guardadas = new AtomicInteger();
   private final AtomicInteger jaExistiam = new AtomicInteger();
   private final AtomicInteger erros = new AtomicInteger();
   private final AtomicInteger travoes = new AtomicInteger();
   private final ArrayDeque<Long> concluidas = new ArrayDeque<>();
   private volatile String ultima = "—";
   private volatile int errosSeguidos;

   private Map<Integer, String> nomes;

   public CegidDownloadRun(AppConfig cfg, int parte, int de, boolean repetirErros) {
      this.cfg = cfg;
      this.parte = parte;
      this.de = de;
      this.repetirErros = repetirErros;
      String ep = cfg.get("cegid.s3.endpoint");
      this.s3Endpoint = ep.replaceAll("/+$", "");
      this.s3Bucket = cfg.getOrDefault("cegid.s3.bucket", "faturas-cegid");
      this.s3Regiao = cfg.getOrDefault("cegid.s3.region", "us-east-1");
      this.s3Chave = cfg.get("cegid.s3.access_key");
      this.s3Segredo = cfg.get("cegid.s3.secret_key");
      String p = cfg.getOrDefault("cegid.s3.prefixo", "").replaceAll("^/+", "");
      this.prefixo = p.isEmpty() || p.endsWith("/") ? p : p + "/";
      this.ritmoInicial = Math.max(1, cfg.getInt("cegid.download.paginas_por_minuto", 15));
      this.ritmoMaximo = Math.max(ritmoInicial, cfg.getInt("cegid.download.paginas_por_minuto_max", 60));
      this.porMinuto = ritmoInicial;
   }

   public static void main(String[] args) throws Exception {
      String ficheiro = args.length > 0 ? args[0] : "config.properties";
      AppConfig cfg = new AppConfig(ficheiro);
      int de = args.length > 2 ? Integer.parseInt(args[2].trim()) : cfg.getInt("cegid.download.dividir_por", 1);
      int parte = args.length > 1 ? Integer.parseInt(args[1].trim()) : cfg.getInt("cegid.download.parte", 1);
      boolean repetir = args.length > 3 && args[3].toLowerCase(Locale.ROOT).startsWith("erro");
      if (de < 1 || parte < 1 || parte > de) throw new IllegalArgumentException("Parte inválida: " + parte + " de " + de);
      new CegidDownloadRun(cfg, parte, de, repetir).correr();
   }

   // ───────────────────────────────── principal ─────────────────────────────────

   public void correr() throws Exception {
      log("Download dos PDFs do Cegid — parte " + parte + " de " + de + (repetirErros ? " (inclui os que deram erro)" : ""));
      log("Destino: " + s3Endpoint + "/" + s3Bucket + (prefixo.isEmpty() ? "" : "/" + prefixo));
      try (Connection db = DriverManager.getConnection(cfg.get("db.url"), cfg.get("db.user"), cfg.get("db.password"))) {
         prepararTabela(db);
         nomes = nomesEsperados(db);
         log(nomes.size() + " faturas do Cegid na base de dados. A começar… (Ctrl+C para parar; volta a correr e continua onde ficou)");
      }
      int paralelos = Math.max(1, Math.min(20, cfg.getInt("cegid.download.paralelos", 6)));
      ArrayDeque<Object[]> fila = new ArrayDeque<>();
      long[] ultimoId = { 0 };
      boolean[] acabou = { false };
      Object trinco = new Object();
      long inicio = System.currentTimeMillis();

      Runnable trabalhador = () -> {
         try (Connection db = DriverManager.getConnection(cfg.get("db.url"), cfg.get("db.user"), cfg.get("db.password"))) {
            while (true) {
               Object[] doc;
               synchronized (trinco) {
                  if (fila.isEmpty() && !acabou[0]) encher(db, fila, ultimoId, acabou);
                  doc = fila.poll();
               }
               if (doc == null) return;
               if (errosSeguidos >= 50) {
                  log("PAREI: 50 faturas seguidas falharam (o Cegid pode estar em baixo). Tente mais tarde.");
                  return;
               }
               tratar(db, (Integer) doc[0], (String) doc[1]);
            }
         } catch (Exception e) {
            log("Trabalhador parou com erro: " + e);
         }
      };
      List<Thread> threads = new ArrayList<>();
      for (int i = 0; i < paralelos; i++) {
         Thread t = new Thread(trabalhador, "cegid-" + i);
         t.start();
         threads.add(t);
      }
      Thread estado = new Thread(() -> {
         while (true) {
            try {
               Thread.sleep(30_000);
            } catch (InterruptedException e) {
               return;
            }
            mostrarEstado(inicio);
         }
      });
      estado.setDaemon(true);
      estado.start();
      for (Thread t : threads) t.join();
      mostrarEstado(inicio);
      log("Terminado: " + guardadas.get() + " guardada(s), " + jaExistiam.get() + " já estavam no S3, " + erros.get() + " com erro.");
   }

   private void encher(Connection db, ArrayDeque<Object[]> fila, long[] ultimoId, boolean[] acabou) throws Exception {
      String sql = "SELECT i.mpinv_id, i.document_cw_url FROM lp_cloudware_monthly_processing_invoices i"
         + " LEFT JOIN zsgo_web_cegid_documento d ON d.mpinv_id = i.mpinv_id"
         + " WHERE i.mpinv_id > ? AND i.document_cw_url IS NOT NULL AND i.document_cw_url <> ''"
         + " AND (d.mpinv_id IS NULL OR (? AND d.estado = 'ERRO'))"
         + " AND i.mpinv_id % ? = ? ORDER BY i.mpinv_id LIMIT 200";
      try (PreparedStatement ps = db.prepareStatement(sql)) {
         ps.setLong(1, ultimoId[0]);
         ps.setBoolean(2, repetirErros);
         ps.setInt(3, de);
         ps.setInt(4, parte - 1);
         try (ResultSet rs = ps.executeQuery()) {
            int n = 0;
            while (rs.next()) {
               fila.add(new Object[] { rs.getInt(1), rs.getString(2) });
               ultimoId[0] = rs.getInt(1);
               n++;
            }
            if (n == 0) acabou[0] = true;
         }
      }
   }

   private void tratar(Connection db, int id, String url) {
      String chave = prefixo + nomes.getOrDefault(id, "sem-numero-" + id) + ".pdf";
      try {
         Long existente = tamanhoNoS3(chave);
         if (existente != null) {
            gravar(db, id, "OK", chave, existente, null, "application/pdf", null, 0);
            jaExistiam.incrementAndGet();
            return;
         }
         byte[] pdf = obterPdf(url);
         guardarNoS3(chave, pdf);
         gravar(db, id, "OK", chave, (long) pdf.length, sha256Hex(pdf), "application/pdf", null, 1);
         guardadas.incrementAndGet();
         errosSeguidos = 0;
         ultima = chave + " (" + LocalTime.now().withNano(0) + ")";
         synchronized (concluidas) {
            long agora = System.currentTimeMillis();
            concluidas.add(agora);
            while (!concluidas.isEmpty() && agora - concluidas.peekFirst() > 600_000) concluidas.pollFirst();
         }
      } catch (Exception e) {
         erros.incrementAndGet();
         errosSeguidos++;
         String msg = String.valueOf(e.getMessage());
         try {
            gravar(db, id, "ERRO", null, null, null, null, msg.length() > 2000 ? msg.substring(0, 2000) : msg, 1);
         } catch (Exception ignorar) {
            // fica para a próxima
         }
         log("Erro na fatura nº interno " + id + ": " + msg);
      }
   }

   private void mostrarEstado(long inicio) {
      double ritmo;
      synchronized (concluidas) {
         long janela = concluidas.isEmpty() ? 60_000 : Math.max(60_000, System.currentTimeMillis() - concluidas.peekFirst());
         ritmo = concluidas.size() > 1 ? (concluidas.size() - 1) * 60_000.0 / janela : 0;
      }
      log(String.format(Locale.ROOT, "Guardadas %d · já no S3 %d · erros %d · %.1f por minuto · ritmo do Cegid %.0f páginas/min · abrandar %d× · última: %s",
         guardadas.get(), jaExistiam.get(), erros.get(), ritmo, porMinuto, travoes.get(), ultima));
   }

   // ───────────────────────────────── base de dados ─────────────────────────────────

   private static void prepararTabela(Connection db) throws Exception {
      try (Statement st = db.createStatement()) {
         st.execute("CREATE TABLE IF NOT EXISTS zsgo_web_cegid_documento (mpinv_id INTEGER PRIMARY KEY, estado TEXT NOT NULL, chave TEXT,"
            + " tamanho BIGINT, sha256 TEXT, tipo TEXT, erro TEXT, tentativas INTEGER NOT NULL DEFAULT 0, atualizado_em TIMESTAMP(3) NOT NULL DEFAULT now())");
      }
   }

   /** Mesmo cálculo da web: nº com "/"→"-"; repetidos (sem maiúsculas) levam "-<nº interno>". */
   private static Map<Integer, String> nomesEsperados(Connection db) throws Exception {
      Map<Integer, String> r = new HashMap<>();
      Set<String> usados = new HashSet<>();
      try (Statement st = db.createStatement();
           ResultSet rs = st.executeQuery("SELECT mpinv_id, document_cw_number FROM lp_cloudware_monthly_processing_invoices ORDER BY mpinv_id")) {
         while (rs.next()) {
            int id = rs.getInt(1);
            String base = nomeDoNumero(rs.getString(2));
            String nome = base.isEmpty() ? "sem-numero-" + id : base;
            if (usados.contains(nome.toLowerCase(Locale.ROOT))) nome = base + "-" + id;
            usados.add(nome.toLowerCase(Locale.ROOT));
            r.put(id, nome);
         }
      }
      return r;
   }

   static String nomeDoNumero(String numero) {
      if (numero == null) return "";
      return numero.trim().replaceAll("[/\\\\]+", "-").replaceAll("[:*?\"<>|\\x00-\\x1f]+", "").replaceAll("\\s+", " ").trim();
   }

   private static void gravar(Connection db, int id, String estado, String chave, Long tamanho, String sha, String tipo, String erro, int tentativas)
      throws Exception {
      String sql = "INSERT INTO zsgo_web_cegid_documento (mpinv_id, estado, chave, tamanho, sha256, tipo, erro, tentativas, atualizado_em)"
         + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())"
         + " ON CONFLICT (mpinv_id) DO UPDATE SET estado = EXCLUDED.estado, chave = COALESCE(EXCLUDED.chave, zsgo_web_cegid_documento.chave),"
         + " tamanho = COALESCE(EXCLUDED.tamanho, zsgo_web_cegid_documento.tamanho), sha256 = COALESCE(EXCLUDED.sha256, zsgo_web_cegid_documento.sha256),"
         + " tipo = COALESCE(EXCLUDED.tipo, zsgo_web_cegid_documento.tipo), erro = EXCLUDED.erro,"
         + " tentativas = zsgo_web_cegid_documento.tentativas + EXCLUDED.tentativas, atualizado_em = now()";
      try (PreparedStatement ps = db.prepareStatement(sql)) {
         ps.setInt(1, id);
         ps.setString(2, estado);
         ps.setString(3, chave);
         if (tamanho == null) ps.setNull(4, java.sql.Types.BIGINT);
         else ps.setLong(4, tamanho);
         ps.setString(5, sha);
         ps.setString(6, tipo);
         ps.setString(7, erro);
         ps.setInt(8, tentativas);
         ps.executeUpdate();
      }
   }

   // ───────────────────────────────── Cegid ─────────────────────────────────

   private static String tipoPedido(String u) {
      if (u.contains("/public-file/")) return "ficheiro";
      if (u.matches(".*/public_links/link/eyJ.*")) return "gerar";
      if (u.contains("/rus/public-rus/public_links/link/")) return "pagina";
      if (u.contains("/public_links/link/")) return "link";
      return "outro";
   }

   /** Pedidos ao Cegid espaçados (página, link, gerar documento); o PDF não entra. */
   private void esperarVez() throws InterruptedException {
      long espera;
      synchronized (this) {
         long agora = System.currentTimeMillis();
         long quando = Math.max(agora, proximaVez);
         proximaVez = quando + (long) (60_000 / porMinuto);
         espera = quando - agora;
      }
      if (espera > 0) Thread.sleep(espera);
   }

   private synchronized void travaoRecebido(int segundos) {
      travaoAte = Math.max(travaoAte, System.currentTimeMillis() + segundos * 1000L);
      travoes.incrementAndGet();
      if (System.currentTimeMillis() - ultimoCorte < 60_000) return;
      ultimoCorte = System.currentTimeMillis();
      semTravao = 0;
      porMinuto = Math.max(Math.max(2, ritmoInicial / 2), porMinuto * 0.8);
   }

   private synchronized void pedidoSemTravao() {
      int passo = porMinuto < ritmoInicial ? 10 : 20;
      if (++semTravao < passo) return;
      semTravao = 0;
      porMinuto = Math.min(ritmoMaximo, porMinuto + 1);
   }

   private HttpResponse<byte[]> pedir(String u) throws Exception {
      String tipo = tipoPedido(u);
      boolean doCegid = tipo.equals("pagina") || tipo.equals("link") || tipo.equals("gerar");
      for (int tentativa = 1; ; tentativa++) {
         long falta = travaoAte - System.currentTimeMillis();
         if (falta > 0) Thread.sleep(falta);
         if (doCegid) esperarVez();
         HttpRequest req = HttpRequest.newBuilder(URI.create(u)).timeout(Duration.ofSeconds(90)).header("User-Agent", UA).GET().build();
         HttpResponse<byte[]> r = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
         if (r.statusCode() != 429) {
            if (doCegid) pedidoSemTravao();
            return r;
         }
         if (tentativa >= 4) return r;
         int segundos = 10 * tentativa;
         try {
            segundos = Integer.parseInt(r.headers().firstValue("retry-after").orElse("").trim());
         } catch (NumberFormatException ignorar) {
            // fica o valor por omissão
         }
         segundos = Math.min(120, Math.max(1, segundos));
         travaoRecebido(segundos);
         Thread.sleep(segundos * 1000L);
      }
   }

   private static boolean ehPdf(byte[] d) {
      return d.length >= 5 && d[0] == '%' && d[1] == 'P' && d[2] == 'D' && d[3] == 'F' && d[4] == '-';
   }

   private String aplicarAtalho(String u) {
      Matcher m = LINK.matcher(u);
      if (!m.find()) return u;
      String destino = atalhos.get(m.group(1));
      return destino != null ? destino + m.group(2) : u;
   }

   private void aprenderAtalho(String origem, String fim) {
      Matcher a = LINK.matcher(origem);
      Matcher b = LINK.matcher(fim);
      if (a.find() && b.find() && a.group(2).equals(b.group(2)) && !a.group(1).equals(b.group(1))) atalhos.put(a.group(1), b.group(1));
   }

   /** O PDF de uma fatura a partir do link guardado no Cyclos. */
   private byte[] obterPdf(String url) throws Exception {
      String alvo = aplicarAtalho(url);
      HttpResponse<byte[]> r = pedir(alvo);
      if (!alvo.equals(url) && r.statusCode() != 200) { // o atalho não serve para este token
         alvo = url;
         r = pedir(alvo);
      }
      String fim = r.uri().toString();
      if (!fim.equals(alvo)) aprenderAtalho(alvo, fim);
      if (r.statusCode() != 200) throw new RuntimeException("O link respondeu " + r.statusCode());
      if (ehPdf(r.body())) return r.body();
      Set<String> visitados = new HashSet<>(List.of(alvo, fim));
      byte[] pdf = seguir(new String(r.body(), StandardCharsets.UTF_8), fim, visitados, 0);
      if (pdf != null) return pdf;
      throw new RuntimeException("O link não devolveu um PDF (veio " + r.headers().firstValue("content-type").orElse("?") + ", " + r.body().length + " bytes)");
   }

   /** Na página do Cegid: 1.º os ficheiros públicos (ignora o logótipo), depois o pedido de gerar o documento. */
   private byte[] seguir(String texto, String base, Set<String> visitados, int nivel) throws Exception {
      if (nivel > 2) return null;
      Set<String> encontrados = new LinkedHashSet<>();
      Matcher m = ENDERECOS.matcher(texto.replace("\\/", "/"));
      while (m.find()) encontrados.add(URI.create(base).resolve(m.group()).toString());
      List<String> ordem = new ArrayList<>();
      for (String u : encontrados) if (u.contains("/public-file/")) ordem.add(u);
      for (String u : encontrados) if (!u.contains("/public-file/")) ordem.add(u);
      for (String u : ordem) {
         if (!visitados.add(u) || imagens.contains(u.replaceAll("\\?.*", ""))) continue;
         boolean gerar = !u.contains("/public-file/");
         for (int vez = 0; vez < (gerar ? 3 : 1); vez++) {
            if (vez > 0) Thread.sleep(1500L * vez);
            HttpResponse<byte[]> r = pedir(u);
            if (r.statusCode() != 200) break;
            if (ehPdf(r.body())) return r.body();
            String tipo = r.headers().firstValue("content-type").orElse("");
            if (tipo.startsWith("image/")) {
               imagens.add(u.replaceAll("\\?.*", ""));
               break;
            }
            byte[] achado = seguir(new String(r.body(), StandardCharsets.UTF_8), r.uri().toString(), visitados, nivel + 1);
            if (achado != null) return achado;
         }
      }
      return null;
   }

   // ───────────────────────────────── S3 (assinatura V4) ─────────────────────────────────

   private static String codificar(String s) {
      StringBuilder b = new StringBuilder();
      for (String parte : s.split("/", -1)) {
         if (b.length() > 0) b.append('/');
         b.append(URLEncoder.encode(parte, StandardCharsets.UTF_8).replace("+", "%20").replace("*", "%2A").replace("%7E", "~"));
      }
      return b.toString();
   }

   private HttpResponse<byte[]> s3(String metodo, String chave, byte[] corpo) throws Exception {
      String caminho = "/" + codificar(s3Bucket) + "/" + codificar(chave);
      URI uri = URI.create(s3Endpoint + caminho);
      String host = uri.getRawAuthority();
      String hash = sha256Hex(corpo == null ? new byte[0] : corpo);
      Instant agora = Instant.now();
      String data = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(agora);
      String dia = data.substring(0, 8);
      boolean comTipo = corpo != null;
      String cabCanon = (comTipo ? "content-type:application/pdf\n" : "") + "host:" + host + "\nx-amz-content-sha256:" + hash + "\nx-amz-date:" + data + "\n";
      String assinados = (comTipo ? "content-type;" : "") + "host;x-amz-content-sha256;x-amz-date";
      String canon = metodo + "\n" + uri.getRawPath() + "\n\n" + cabCanon + "\n" + assinados + "\n" + hash;
      String ambito = dia + "/" + s3Regiao + "/s3/aws4_request";
      String texto = "AWS4-HMAC-SHA256\n" + data + "\n" + ambito + "\n" + sha256Hex(canon.getBytes(StandardCharsets.UTF_8));
      byte[] k = hmac(hmac(hmac(hmac(("AWS4" + s3Segredo).getBytes(StandardCharsets.UTF_8), dia), s3Regiao), "s3"), "aws4_request");
      String assinatura = HexFormat.of().formatHex(hmac(k, texto));
      HttpRequest.Builder b = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(60))
         .header("x-amz-content-sha256", hash).header("x-amz-date", data)
         .header("Authorization", "AWS4-HMAC-SHA256 Credential=" + s3Chave + "/" + ambito + ", SignedHeaders=" + assinados + ", Signature=" + assinatura);
      if (comTipo) b.header("content-type", "application/pdf").PUT(HttpRequest.BodyPublishers.ofByteArray(corpo));
      else b.method(metodo, HttpRequest.BodyPublishers.noBody());
      return http.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
   }

   /** Tamanho do ficheiro se já está no S3; null se não está. */
   private Long tamanhoNoS3(String chave) throws Exception {
      HttpResponse<byte[]> r = s3("HEAD", chave, null);
      if (r.statusCode() == 404) return null;
      if (r.statusCode() != 200) throw new RuntimeException("O S3 respondeu " + r.statusCode() + " ao verificar " + chave);
      return r.headers().firstValueAsLong("content-length").orElse(0L);
   }

   private void guardarNoS3(String chave, byte[] pdf) throws Exception {
      HttpResponse<byte[]> r = s3("PUT", chave, pdf);
      if (r.statusCode() != 200 && r.statusCode() != 201) {
         throw new RuntimeException("O S3 respondeu " + r.statusCode() + " ao guardar " + chave + ": " + new String(r.body(), StandardCharsets.UTF_8));
      }
   }

   private static byte[] hmac(byte[] chave, String texto) throws Exception {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(chave, "HmacSHA256"));
      return mac.doFinal(texto.getBytes(StandardCharsets.UTF_8));
   }

   private static String sha256Hex(byte[] d) throws Exception {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(d));
   }

   private static void log(String s) {
      System.out.println("[" + LocalTime.now().withNano(0) + "] " + s);
   }
}
