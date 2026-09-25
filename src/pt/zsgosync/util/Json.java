package pt.zsgosync.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Leitor de JSON mínimo (sem dependências): devolve Map, List, String,
 * Double/Long, Boolean ou null. Chega para ler as respostas do ZSGO.
 */
public final class Json {
   private final String s;
   private int i;

   private Json(String s) {
      this.s = s;
   }

   public static Object ler(String texto) {
      Json p = new Json(texto);
      p.espacos();
      Object v = p.valor();
      p.espacos();
      if (p.i != p.s.length()) {
         throw p.erro("conteúdo a mais depois do JSON");
      }
      return v;
   }

   /** Caminho tipo "data.items" num Map; devolve null se não existir. */
   @SuppressWarnings("unchecked")
   public static Object caminho(Object raiz, String caminho) {
      Object atual = raiz;
      for (String parte : caminho.split("\\.")) {
         if (!(atual instanceof Map)) {
            return null;
         }
         atual = ((Map<String, Object>) atual).get(parte);
      }
      return atual;
   }

   private Object valor() {
      if (this.i >= this.s.length()) {
         throw this.erro("fim inesperado");
      }
      char c = this.s.charAt(this.i);
      switch (c) {
         case '{':
            return this.objeto();
         case '[':
            return this.lista();
         case '"':
            return this.texto();
         case 't':
            this.literal("true");
            return Boolean.TRUE;
         case 'f':
            this.literal("false");
            return Boolean.FALSE;
         case 'n':
            this.literal("null");
            return null;
         default:
            return this.numero();
      }
   }

   private Map<String, Object> objeto() {
      Map<String, Object> m = new LinkedHashMap<>();
      this.i++;
      this.espacos();
      if (this.proximo('}')) {
         return m;
      }
      while (true) {
         this.espacos();
         String chave = this.texto();
         this.espacos();
         this.esperar(':');
         this.espacos();
         m.put(chave, this.valor());
         this.espacos();
         if (this.proximo('}')) {
            return m;
         }
         this.esperar(',');
      }
   }

   private List<Object> lista() {
      List<Object> l = new ArrayList<>();
      this.i++;
      this.espacos();
      if (this.proximo(']')) {
         return l;
      }
      while (true) {
         this.espacos();
         l.add(this.valor());
         this.espacos();
         if (this.proximo(']')) {
            return l;
         }
         this.esperar(',');
      }
   }

   private String texto() {
      this.esperar('"');
      StringBuilder b = new StringBuilder();
      while (this.i < this.s.length()) {
         char c = this.s.charAt(this.i++);
         if (c == '"') {
            return b.toString();
         }
         if (c == '\\') {
            char e = this.s.charAt(this.i++);
            switch (e) {
               case 'n': b.append('\n'); break;
               case 't': b.append('\t'); break;
               case 'r': b.append('\r'); break;
               case 'b': b.append('\b'); break;
               case 'f': b.append('\f'); break;
               case 'u':
                  b.append((char) Integer.parseInt(this.s.substring(this.i, this.i + 4), 16));
                  this.i += 4;
                  break;
               default: b.append(e);
            }
         } else {
            b.append(c);
         }
      }
      throw this.erro("texto sem fim");
   }

   private Object numero() {
      int inicio = this.i;
      while (this.i < this.s.length() && "+-0123456789.eE".indexOf(this.s.charAt(this.i)) >= 0) {
         this.i++;
      }
      String n = this.s.substring(inicio, this.i);
      if (n.isEmpty()) {
         throw this.erro("valor inválido");
      }
      if (n.contains(".") || n.contains("e") || n.contains("E")) {
         return Double.parseDouble(n);
      }
      return Long.parseLong(n);
   }

   private void literal(String l) {
      if (!this.s.startsWith(l, this.i)) {
         throw this.erro("esperava " + l);
      }
      this.i += l.length();
   }

   private boolean proximo(char c) {
      if (this.i < this.s.length() && this.s.charAt(this.i) == c) {
         this.i++;
         return true;
      }
      return false;
   }

   private void esperar(char c) {
      if (!this.proximo(c)) {
         throw this.erro("esperava '" + c + "'");
      }
   }

   private void espacos() {
      while (this.i < this.s.length() && Character.isWhitespace(this.s.charAt(this.i))) {
         this.i++;
      }
   }

   private IllegalArgumentException erro(String msg) {
      return new IllegalArgumentException("JSON inválido (" + msg + ") na posição " + this.i);
   }
}
