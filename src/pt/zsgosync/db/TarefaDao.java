package pt.zsgosync.db;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

/**
 * Tarefas agendadas (zsgo_tarefas) e o "sinal de vida" do agendador
 * (zsgo_agendador), para o painel saber se o agendador está a correr.
 */
public class TarefaDao {
   public static final String SINCRONIZAR_CLIENTES = "SINCRONIZAR_CLIENTES";
   public static final String ATUALIZAR_CLIENTES = "ATUALIZAR_CLIENTES";
   public static final String FATURACAO_MENSAL = "FATURACAO_MENSAL";

   public static class Tarefa {
      public String codigo;
      public boolean ativa;
      public String hora;
      /** Só para a faturação mensal: dia do mês em que corre (null = todos os dias). */
      public Integer diaMes;
      public Timestamp ultimaExecucao;
      public String ultimoEstado;
      public String ultimoResultado;
      public Timestamp aCorrerDesde;
   }

   public static class Batimento {
      public String maquina;
      public Timestamp ultimoSinal;
      public Timestamp iniciadoEm;
   }

   public void ensureTableExists(Connection c) throws SQLException {
      try (Statement st = c.createStatement()) {
         st.execute("""
            CREATE TABLE IF NOT EXISTS zsgo_tarefas (
                codigo            VARCHAR(40) PRIMARY KEY,
                ativa             BOOLEAN     NOT NULL DEFAULT FALSE,
                hora              VARCHAR(5)  NOT NULL DEFAULT '07:00',
                dia_mes           INTEGER,
                ultima_execucao   TIMESTAMP,
                ultimo_estado     VARCHAR(20),
                ultimo_resultado  TEXT,
                a_correr_desde    TIMESTAMP,
                atualizado_em     TIMESTAMP   NOT NULL DEFAULT now()
            )
            """);
         st.execute("""
            CREATE TABLE IF NOT EXISTS zsgo_agendador (
                id            INTEGER PRIMARY KEY DEFAULT 1,
                maquina       VARCHAR(120),
                ultimo_sinal  TIMESTAMP,
                iniciado_em   TIMESTAMP
            )
            """);
         // Tarefas por defeito: todas desligadas até alguém as ligar no painel.
         st.execute("INSERT INTO zsgo_tarefas (codigo, hora) VALUES ('" + SINCRONIZAR_CLIENTES + "', '07:00') ON CONFLICT DO NOTHING");
         st.execute("INSERT INTO zsgo_tarefas (codigo, hora) VALUES ('" + ATUALIZAR_CLIENTES + "', '07:30') ON CONFLICT DO NOTHING");
         st.execute("INSERT INTO zsgo_tarefas (codigo, hora, dia_mes) VALUES ('" + FATURACAO_MENSAL + "', '08:00', 1) ON CONFLICT DO NOTHING");
      }
   }

   public List<Tarefa> listar(Connection c) throws SQLException {
      List<Tarefa> r = new ArrayList<>();
      String sql = "SELECT * FROM zsgo_tarefas ORDER BY CASE codigo WHEN '" + SINCRONIZAR_CLIENTES + "' THEN 1 WHEN '" + ATUALIZAR_CLIENTES
         + "' THEN 2 ELSE 3 END";
      try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
         while (rs.next()) {
            Tarefa t = new Tarefa();
            t.codigo = rs.getString("codigo");
            t.ativa = rs.getBoolean("ativa");
            t.hora = rs.getString("hora");
            int d = rs.getInt("dia_mes");
            t.diaMes = rs.wasNull() ? null : d;
            t.ultimaExecucao = rs.getTimestamp("ultima_execucao");
            t.ultimoEstado = rs.getString("ultimo_estado");
            t.ultimoResultado = rs.getString("ultimo_resultado");
            t.aCorrerDesde = rs.getTimestamp("a_correr_desde");
            r.add(t);
         }
      }
      return r;
   }

   public void guardar(Connection c, String codigo, boolean ativa, String hora, Integer diaMes) throws SQLException {
      try (PreparedStatement ps = c.prepareStatement("UPDATE zsgo_tarefas SET ativa = ?, hora = ?, dia_mes = ?, atualizado_em = now() WHERE codigo = ?")) {
         ps.setBoolean(1, ativa);
         ps.setString(2, hora);
         if (diaMes != null) {
            ps.setInt(3, diaMes);
         } else {
            ps.setNull(3, java.sql.Types.INTEGER);
         }
         ps.setString(4, codigo);
         ps.executeUpdate();
      }
   }

   /**
    * Marca a tarefa como "a correr". Devolve false se já estiver a correr
    * noutro lado (painel ou agendador) — evita correr a mesma tarefa duas
    * vezes ao mesmo tempo. Uma marcação com mais de 6 horas é considerada
    * abandonada (ex.: o computador desligou-se a meio).
    */
   public boolean reservar(Connection c, String codigo) throws SQLException {
      try (PreparedStatement ps = c.prepareStatement(
         "UPDATE zsgo_tarefas SET a_correr_desde = now(), ultimo_estado = 'A_CORRER' WHERE codigo = ? AND (a_correr_desde IS NULL OR a_correr_desde < now() - interval '6 hours')"
      )) {
         ps.setString(1, codigo);
         return ps.executeUpdate() == 1;
      }
   }

   public void concluir(Connection c, String codigo, String estado, String resultado) throws SQLException {
      try (PreparedStatement ps = c.prepareStatement(
         "UPDATE zsgo_tarefas SET a_correr_desde = NULL, ultima_execucao = ?, ultimo_estado = ?, ultimo_resultado = ? WHERE codigo = ?"
      )) {
         // Hora do computador (a mesma que decide se a tarefa "está na hora"), não a da BD.
         ps.setTimestamp(1, Timestamp.valueOf(java.time.LocalDateTime.now()));
         ps.setString(2, estado);
         ps.setString(3, resultado);
         ps.setString(4, codigo);
         ps.executeUpdate();
      }
   }

   public void batimento(Connection c, String maquina, boolean arranque) throws SQLException {
      String sql = arranque
         ? "INSERT INTO zsgo_agendador (id, maquina, ultimo_sinal, iniciado_em) VALUES (1, ?, now(), now()) ON CONFLICT (id) DO UPDATE SET maquina = EXCLUDED.maquina, ultimo_sinal = now(), iniciado_em = now()"
         : "INSERT INTO zsgo_agendador (id, maquina, ultimo_sinal, iniciado_em) VALUES (1, ?, now(), now()) ON CONFLICT (id) DO UPDATE SET maquina = EXCLUDED.maquina, ultimo_sinal = now()";
      try (PreparedStatement ps = c.prepareStatement(sql)) {
         ps.setString(1, maquina);
         ps.executeUpdate();
      }
   }

   public Batimento obterBatimento(Connection c) throws SQLException {
      try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT maquina, ultimo_sinal, iniciado_em FROM zsgo_agendador WHERE id = 1")) {
         if (!rs.next()) {
            return null;
         }
         Batimento b = new Batimento();
         b.maquina = rs.getString("maquina");
         b.ultimoSinal = rs.getTimestamp("ultimo_sinal");
         b.iniciadoEm = rs.getTimestamp("iniciado_em");
         return b;
      }
   }

   /** Segundos desde o último sinal do agendador, segundo o relógio da base de dados (null se nunca correu). */
   public Long segundosDesdeUltimoSinal(Connection c) throws SQLException {
      try (Statement st = c.createStatement();
           ResultSet rs = st.executeQuery("SELECT EXTRACT(EPOCH FROM (now() - ultimo_sinal))::bigint FROM zsgo_agendador WHERE id = 1")) {
         return rs.next() ? rs.getLong(1) : null;
      }
   }
}
