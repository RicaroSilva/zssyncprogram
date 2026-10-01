import { cn } from "@/lib/utils";

const ROTULO: Record<string, string> = {
  SINCRONIZADO: "Emitida",
  ERRO: "Com erro",
  PENDENTE: "Pendente",
  FATURA_CRIADA: "Criada no ZSGO",
  PDF_GERADO: "Falta enviar ao Cyclos",
  INCERTO: "Verificar no ZSGO",
};

/** Etiqueta de estado de uma fatura/cliente/nota de crédito. */
export function Estado({ estado, incerto, rotulos }: { estado: string; incerto?: boolean; rotulos?: Record<string, string> }) {
  const chave = incerto ? "INCERTO" : estado;
  const cor =
    chave === "SINCRONIZADO"
      ? "text-success border-success"
      : chave === "ERRO"
        ? "text-destructive border-destructive-40 bg-destructive-10"
        : chave === "INCERTO"
          ? "text-accent border-accent bg-primary-10"
          : "text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", cor)}>
      {rotulos?.[chave] ?? ROTULO[chave] ?? chave}
    </span>
  );
}
