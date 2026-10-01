import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "accent" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]";

const VARIANTES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
  secondary: "border border-primary text-primary bg-transparent hover-bg-primary-10",
  outline: "border-foreground-20 border text-foreground bg-transparent hover-bg-foreground-5",
  accent: "bg-accent text-accent-foreground hover:bg-accent-hover shadow-sm",
  ghost: "bg-transparent hover:bg-muted",
  destructive: "bg-destructive text-white hover:opacity-90 shadow-sm",
};

const TAMANHOS: Record<ButtonSize, string> = {
  sm: "h-9 px-3",
  md: "h-11 px-5",
  lg: "h-12 px-7 text-base",
};

export function buttonVariants(opts: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  const { variant = "primary", size = "md", className } = opts;
  return cn(BASE, VARIANTES[variant], TAMANHOS[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button className={buttonVariants({ variant, size, className })} {...props} />;
}
