"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { usarTransicaoComEspera } from "@/lib/usar-transicao-com-espera";
import { eliminarPerfilAction, guardarPerfilAction, type Matriz } from "./actions";

const ACOES = [
  { chave: "consultar", nome: "Consultar" },
  { chave: "criar", nome: "Criar / gerar" },
  { chave: "editar", nome: "Editar" },
  { chave: "eliminar", nome: "Eliminar" },
] as const;

const campo = "h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]";

export function FormularioPerfil(props: {
  id: string | null;
  nome: string;
  descricao: string;
  matriz: Matriz;
  recursos: Array<{ chave: string; nome: string; ajuda: string }>;
  podeEliminar: boolean;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(props.nome);
  const [descricao, setDescricao] = useState(props.descricao);
  const [matriz, setMatriz] = useState<Matriz>(props.matriz);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar, aviso] = usarTransicaoComEspera();

  function alternar(recurso: string, acao: (typeof ACOES)[number]["chave"], valor: boolean) {
    const atual = matriz[recurso] ?? { consultar: false, criar: false, editar: false, eliminar: false };
    const novo = { ...atual, [acao]: valor };
    if (acao !== "consultar" && valor) novo.consultar = true;
    if (acao === "consultar" && !valor) Object.assign(novo, { criar: false, editar: false, eliminar: false });
    setMatriz({ ...matriz, [recurso]: novo });
  }

  function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await guardarPerfilAction(props.id, nome, descricao, matriz);
      if (!r.ok) setErro(r.erro ?? "Não foi possível guardar.");
      else router.push("/perfis");
    });
  }

  function eliminar() {
    if (!props.id || !window.confirm(`Eliminar o perfil "${props.nome}"?`)) return;
    iniciar(async () => {
      const r = await eliminarPerfilAction(props.id!);
      if (!r.ok) setErro(r.erro ?? "Não foi possível eliminar.");
      else router.push("/perfis");
    });
  }

  return (
    <form onSubmit={guardar} className="mt-8 space-y-5">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nome" className="mb-1.5 block text-sm font-medium">
            Nome
          </label>
          <input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </div>
        <div>
          <label htmlFor="descricao" className="mb-1.5 block text-sm font-medium">
            Descrição
          </label>
          <input id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} className={campo} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full max-w-4xl text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 pr-4">Área</th>
              {ACOES.map((a) => (
                <th key={a.chave} className="px-3 py-2 text-center">
                  {a.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.recursos.map((r) => (
              <tr key={r.chave} className="border-b border-border">
                <td className="py-2 pr-4">
                  <b>{r.nome}</b>
                  <p className="text-xs text-muted-foreground">{r.ajuda}</p>
                </td>
                {ACOES.map((a) => (
                  <td key={a.chave} className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${r.nome}: ${a.nome}`}
                      className="h-4 w-4 accent-[--primary]"
                      checked={!!matriz[r.chave]?.[a.chave]}
                      onChange={(e) => alternar(r.chave, a.chave, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pendente}>
          Guardar
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/perfis")}>
          Cancelar
        </Button>
        {props.id && props.podeEliminar && (
          <Button type="button" variant="destructive" onClick={eliminar} disabled={pendente} className="ml-auto">
            Eliminar perfil
          </Button>
        )}
      </div>
      {aviso}
    </form>
  );
}
