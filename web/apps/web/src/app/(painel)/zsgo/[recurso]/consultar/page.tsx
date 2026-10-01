import { redirect } from "next/navigation";

/** "Consultar um pedido anterior" (ex.: SAF-T pelo processId) → detalhe. */
export default async function Consultar({ params, searchParams }: { params: Promise<{ recurso: string }>; searchParams: Promise<{ chave?: string }> }) {
  const { recurso } = await params;
  const { chave } = await searchParams;
  redirect(chave ? `/zsgo/${recurso}/${encodeURIComponent(chave.trim())}` : `/zsgo/${recurso}`);
}
