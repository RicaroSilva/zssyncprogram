"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { loginEmergenciaAction } from "./actions";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";

export function FormularioLoginEmergencia() {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao, avisoEspera] = usarTransicaoComEspera();

  function submeter(formData: FormData) {
    setErro(null);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    iniciarTransicao(async () => {
      const resultado = await loginEmergenciaAction(username, password);
      if (!resultado.ok) setErro(resultado.erro ?? "Não foi possível autenticar.");
    });
  }

  return (
    <form action={submeter} className="mt-6 space-y-3 text-left">
      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-foreground">
          Utilizador
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
        />
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Button type="submit" variant="outline" size="lg" disabled={pendente} className="w-full">
        Entrar com utilizador e senha
      </Button>
      {avisoEspera}
    </form>
  );
}
