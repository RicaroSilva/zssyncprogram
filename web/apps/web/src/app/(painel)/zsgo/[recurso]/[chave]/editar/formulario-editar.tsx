"use client";

import { useRouter } from "next/navigation";
import { FormularioZsgo, type OpcaoSeletor } from "@/components/zsgo/formulario-zsgo";
import type { Esquema } from "@/lib/zsgo/especificacao";
import { operacaoZsgoAction } from "../../../actions";

export function FormularioEditar({ slug, chave, esquema, opcoes, inicial }: { slug: string; chave: string; esquema: Esquema; opcoes: Record<string, OpcaoSeletor[]>; inicial: Record<string, unknown> }) {
  const router = useRouter();
  const voltar = `/zsgo/${slug}/${encodeURIComponent(chave)}`;
  return (
    <FormularioZsgo
      esquema={esquema}
      inicial={inicial}
      opcoes={opcoes}
      textoBotao="Guardar no ZSGO"
      aoCancelar={() => router.push(voltar)}
      aoEnviar={async (corpo) => {
        const r = await operacaoZsgoAction(slug, "editar", chave, corpo);
        if (!r.ok) return r;
        router.push(`${voltar}?guardado=1`);
        return { ok: true };
      }}
    />
  );
}
