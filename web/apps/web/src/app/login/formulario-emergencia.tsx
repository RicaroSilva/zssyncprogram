"use client";

import { useState } from "react";
import { Button } from "@/components/button";
import { loginEmergenciaAction, loginPainelAction } from "./actions";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";

/** Formulário utilizador/senha — acesso de emergência (credenciais do .env)
 *  ou conta do painel em Java (zsgo_app_users). */
export function FormularioLoginEmergencia({ tipo = "emergencia" }: { tipo?: "emergencia" | "painel" }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciarTransicao, avisoEspera] = usarTransicaoComEspera();

  // onSubmit (e não <form action>): com "action" o React limpa os campos
  // depois de cada tentativa, e um erro na senha obrigava a reescrever o
  // utilizador.
  function submeter(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    setErro(null);
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    iniciarTransicao(async () => {
      const resultado = await (tipo === "painel" ? loginPainelAction : loginEmergenciaAction)(username, password);
      if (!resultado.ok) setErro(resultado.erro ?? "Não foi possível autenticar.");
    });
  }

  return (
    <form onSubmit={submeter} className="mt-6 space-y-3 text-left">
      <div>
        <label htmlFor={`username-${tipo}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Utilizador
        </label>
        <input
          id={`username-${tipo}`}
          name="username"
          type="text"
          autoComplete="username"
          required
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
        />
      </div>
      <div>
        <label htmlFor={`password-${tipo}`} className="mb-1.5 block text-sm font-medium text-foreground">
          Senha
        </label>
        <input
          id={`password-${tipo}`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
        />
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <Button type="submit" variant={tipo === "painel" ? "primary" : "outline"} size="lg" disabled={pendente} className="w-full">
        {tipo === "painel" ? "Entrar com a conta do painel" : "Entrar com utilizador e senha"}
      </Button>
      {avisoEspera}
    </form>
  );
}
