"use client";

import { useRouter } from "next/navigation";
import { FormularioZsgo, type OpcaoSeletor } from "@/components/zsgo/formulario-zsgo";
import type { Esquema } from "@/lib/zsgo/especificacao";
import { operacaoZsgoAction } from "../actions";

/** Áreas sem lista (ex.: SAF-T): o formulário de criar e, depois, o detalhe do pedido. */
export function NovoSemLista({ slug, esquema, opcoes, nomeChave }: { slug: string; esquema: Esquema; opcoes: Record<string, OpcaoSeletor[]>; nomeChave: string }) {
  const router = useRouter();
  return (
    <FormularioZsgo
      esquema={esquema}
      opcoes={opcoes}
      textoBotao="Pedir ao ZSGO"
      aoEnviar={async (corpo) => {
        const r = await operacaoZsgoAction(slug, "criar", null, corpo);
        if (!r.ok) return r;
        const chave = r.chave ?? (r.dados as Record<string, unknown> | null)?.[nomeChave];
        if (chave) router.push(`/zsgo/${slug}/${encodeURIComponent(String(chave))}`);
        else router.refresh();
        return { ok: true };
      }}
    />
  );
}
