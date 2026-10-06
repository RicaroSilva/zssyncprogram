"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Enquanto `ativo`, volta a ler a página a cada `segundos` (ex.: SAF-T a ser gerado). */
export function AtualizarSozinho({ ativo, segundos = 5 }: { ativo: boolean; segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [ativo, segundos, router]);
  return null;
}
