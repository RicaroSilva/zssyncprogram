/* eslint-disable @next/next/no-img-element */
/** Logótipo da aplicação (public/logo.png; o ícone do separador do browser é app/icon.png). */
export function LogotipoPredefinido({ className }: { className?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/logo.png" alt="" width={256} height={256} className={className ? `${className} w-auto` : "h-8 w-auto"} />
      <span className="font-heading text-base font-bold text-foreground">Lusopay</span>
    </span>
  );
}
