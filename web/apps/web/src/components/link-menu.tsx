"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Ligação do menu do painel, sublinhada quando é a página atual. */
export function LinkMenu({ href, children }: { href: string; children: ReactNode }) {
  const atual = usePathname()?.startsWith(href);
  return (
    <Link href={href} aria-current={atual ? "page" : undefined} className={cn("hover:text-accent", atual && "text-accent underline decoration-2 underline-offset-8")}>
      {children}
    </Link>
  );
}
