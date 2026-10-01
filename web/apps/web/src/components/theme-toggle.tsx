"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  if (!montado) return <div className="h-9 w-9" aria-hidden />;

  const escuro = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(escuro ? "light" : "dark")}
      aria-label={escuro ? "Ativar modo claro" : "Ativar modo escuro"}
      className="hover-bg-primary-10 inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors"
    >
      {escuro ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
