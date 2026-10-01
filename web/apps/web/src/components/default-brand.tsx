/** Logótipo predefinido embutido na aplicação — usado quando nenhum
 *  logótipo personalizado foi carregado em admin "Identidade". */
export function LogotipoPredefinido({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 32" className={className} role="img" aria-label="Lusopay">
      <rect x="0" y="4" width="24" height="24" rx="6" fill="var(--primary)" />
      <path d="M8 20 L12 12 L16 17 L20 10" stroke="var(--primary-foreground)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x="32" y="22" fontFamily="var(--font-heading), sans-serif" fontWeight="700" fontSize="16" fill="var(--foreground)">
        Lusopay
      </text>
    </svg>
  );
}
