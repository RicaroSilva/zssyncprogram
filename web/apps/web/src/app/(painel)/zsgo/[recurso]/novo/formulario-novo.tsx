"use client";

import { useRouter } from "next/navigation";
import { FormularioZsgo, type OpcaoSeletor } from "@/components/zsgo/formulario-zsgo";
import type { Esquema } from "@/lib/zsgo/especificacao";
import { operacaoZsgoAction } from "../../actions";

export function FormularioNovo({
  slug,
  esquema,
  opcoes,
  singular,
  comDetalhe,
  inicial,
}: {
  slug: string;
  esquema: Esquema;
  opcoes: Record<string, OpcaoSeletor[]>;
  singular: string;
  comDetalhe: boolean;
  inicial?: Record<string, unknown>;
}) {
  const router = useRouter();
  return (
    <FormularioZsgo
      esquema={esquema}
      inicial={inicial}
      opcoes={opcoes}
      textoBotao={`Criar ${singular} no ZSGO`}
      confirmar={`Criar este ${singular} no ZSGO? Fica criado a sério (não é um rascunho desta página).`}
      aoCancelar={() => router.push(`/zsgo/${slug}`)}
      aoEnviar={async (corpo) => {
        const r = await operacaoZsgoAction(slug, "criar", null, corpo);
        if (!r.ok) return r;
        router.push(comDetalhe && r.chave ? `/zsgo/${slug}/${encodeURIComponent(r.chave)}?criado=1` : `/zsgo/${slug}?criado=1`);
        return { ok: true };
      }}
    />
  );
}
