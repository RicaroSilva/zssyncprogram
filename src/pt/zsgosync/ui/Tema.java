package pt.zsgosync.ui;

import com.formdev.flatlaf.FlatDarkLaf;
import com.formdev.flatlaf.FlatLaf;
import com.formdev.flatlaf.FlatLightLaf;
import java.awt.Color;
import java.awt.Font;
import java.util.ArrayList;
import java.util.List;
import javax.swing.LookAndFeel;
import javax.swing.UIManager;

public final class Tema {
   private static Tema.Modo modoAtual = Tema.Modo.CLARO;
   public static Color BACKGROUND;
   public static Color SURFACE;
   public static Color SURFACE_2;
   public static Color FOREGROUND;
   public static Color MUTED;
   public static Color MUTED_FOREGROUND;
   public static Color BORDER;
   public static Color PRIMARY;
   public static Color PRIMARY_HOVER;
   public static Color PRIMARY_FOREGROUND;
   public static Color DESTRUCTIVE;
   public static Color SUCCESS;
   public static Color CARD_TEAL_BG;
   public static Color CARD_TEAL_FG;
   public static Color CARD_CORAL_BG;
   public static Color CARD_CORAL_FG;
   public static Color CARD_BLUE_BG;
   public static Color CARD_BLUE_FG;
   public static Color CARD_PURPLE_BG;
   public static Color CARD_PURPLE_FG;
   public static final Font FONT_BASE = new Font("Segoe UI", 0, 14);
   public static final Font FONT_BOLD = new Font("Segoe UI", 1, 14);
   public static final Font FONT_MONO = new Font("Monospaced", 0, 12);
   private static final List<Tema.TemaOuvinte> ouvintes = new ArrayList<>();

   private Tema() {
   }

   public static void registar(Tema.TemaOuvinte var0) {
      ouvintes.add(var0);
   }

   public static Tema.Modo getModo() {
      return modoAtual;
   }

   public static void alternar() {
      aplicarModo(modoAtual == Tema.Modo.CLARO ? Tema.Modo.ESCURO : Tema.Modo.CLARO);

      for (Tema.TemaOuvinte var1 : ouvintes) {
         var1.aoMudarTema();
      }
   }

   public static void aplicarModo(Tema.Modo var0) {
      modoAtual = var0;
      if (var0 == Tema.Modo.CLARO) {
         BACKGROUND = hex("#FBF9F8");
         SURFACE = hex("#FFFFFF");
         SURFACE_2 = hex("#F6F3F2");
         FOREGROUND = hex("#1B1C1C");
         MUTED = hex("#F0EDED");
         MUTED_FOREGROUND = hex("#414750");
         BORDER = hex("#E2E8F0");
         PRIMARY = hex("#A07C08");
         PRIMARY_HOVER = hex("#8A6B06");
         PRIMARY_FOREGROUND = hex("#1A1305");
         DESTRUCTIVE = hex("#BA1A1A");
         SUCCESS = hex("#2F8F3E");
         CARD_TEAL_BG = hex("#DCF3EA");
         CARD_TEAL_FG = hex("#0F6E56");
         CARD_CORAL_BG = hex("#FBE4DA");
         CARD_CORAL_FG = hex("#993C1D");
         CARD_BLUE_BG = hex("#DCEAFB");
         CARD_BLUE_FG = hex("#0C447C");
         CARD_PURPLE_BG = hex("#E9E7FB");
         CARD_PURPLE_FG = hex("#3C3489");
      } else {
         BACKGROUND = hex("#0D0F14");
         SURFACE = hex("#141820");
         SURFACE_2 = hex("#1A1E2A");
         FOREGROUND = hex("#F0F0F2");
         MUTED = hex("#1A1E2A");
         MUTED_FOREGROUND = hex("#8A8FA0");
         BORDER = hex("#252836");
         PRIMARY = hex("#C9A227");
         PRIMARY_HOVER = hex("#B8921E");
         PRIMARY_FOREGROUND = hex("#0D0F14");
         DESTRUCTIVE = hex("#EF5350");
         SUCCESS = hex("#5CC46A");
         CARD_TEAL_BG = hex("#0F3A30");
         CARD_TEAL_FG = hex("#5DCAA5");
         CARD_CORAL_BG = hex("#3D2016");
         CARD_CORAL_FG = hex("#F0997B");
         CARD_BLUE_BG = hex("#0F2C45");
         CARD_BLUE_FG = hex("#85B7EB");
         CARD_PURPLE_BG = hex("#241F45");
         CARD_PURPLE_FG = hex("#AFA9EC");
      }

      aplicarLookAndFeel(var0);
   }

   private static void aplicarLookAndFeel(Tema.Modo var0) {
      try {
         UIManager.setLookAndFeel((LookAndFeel)(var0 == Tema.Modo.CLARO ? new FlatLightLaf() : new FlatDarkLaf()));
         FlatLaf.updateUI();
      } catch (Exception var2) {
         System.err.println("Aviso: não foi possível aplicar o FlatLaf: " + var2.getMessage());
      }
   }

   private static Color hex(String var0) {
      return Color.decode(var0);
   }

   static {
      aplicarModo(Tema.Modo.CLARO);
   }

   public static enum Modo {
      CLARO,
      ESCURO;
   }

   public interface TemaOuvinte {
      void aoMudarTema();
   }
}
