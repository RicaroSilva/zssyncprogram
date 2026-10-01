"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";
import { guardarUtilizadorAction, type DadosUtilizador } from "./actions";

const campo = "h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]";

export function FormularioUtilizador({ id, inicial, perfis }: { id: string | null; inicial: DadosUtilizador; perfis: Array<{ id: string; nome: string; descricao: string | null }> }) {
  const router = useRouter();
  const [dados, setDados] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar, aviso] = usarTransicaoComEspera();

  function submeter(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await guardarUtilizadorAction(id, dados);
      if (!r.ok) setErro(r.erro ?? "Não foi possível guardar.");
      else router.push("/utilizadores?guardado=1");
    });
  }

  return (
    <form onSubmit={submeter} className="mt-8 max-w-xl space-y-5">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email (o mesmo da conta Keycloak)
        </label>
        <input id="email" type="email" required disabled={!!id} value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} className={campo} />
      </div>
      <div>
        <label htmlFor="nome" className="mb-1.5 block text-sm font-medium">
          Nome
        </label>
        <input id="nome" required value={dados.nomeExibicao} onChange={(e) => setDados({ ...dados, nomeExibicao: e.target.value })} className={campo} />
      </div>
      <div>
        <label htmlFor="estado" className="mb-1.5 block text-sm font-medium">
          Estado
        </label>
        <select id="estado" value={dados.estado} onChange={(e) => setDados({ ...dados, estado: e.target.value })} className={campo}>
          <option value="ATIVO">Ativo</option>
          <option value="SUSPENSO">Suspenso</option>
          <option value="BLOQUEADO">Bloqueado</option>
        </select>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Perfis</legend>
        <div className="space-y-2">
          {perfis.map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[--primary]"
                checked={dados.perfis.includes(p.id)}
                onChange={(e) => setDados({ ...dados, perfis: e.target.checked ? [...dados.perfis, p.id] : dados.perfis.filter((x) => x !== p.id) })}
              />
              <span>
                <b>{p.nome}</b>
                {p.descricao && <span className="text-muted-foreground"> — {p.descricao}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={pendente}>
          Guardar
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/utilizadores")}>
          Cancelar
        </Button>
      </div>
      {aviso}
    </form>
  );
}
