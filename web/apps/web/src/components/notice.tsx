import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function Notice({ children, className, icon }: { children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-[--border] bg-surface-2 p-4 text-sm text-muted-foreground", className)}>
      <span className="mt-0.5 text-primary">{icon ?? <Info className="h-4 w-4" />}</span>
      <div>{children}</div>
    </div>
  );
}
