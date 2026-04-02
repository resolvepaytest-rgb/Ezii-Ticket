import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type GlassCardProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * Frosted surface that reads well in light mode (soft card + blur) and dark mode (glass + depth).
 */
export function GlassCard({ className, children }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card/85 text-card-foreground shadow-sm backdrop-blur-md",
        "dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_8px_40px_rgba(0,0,0,0.35)]",
        "supports-[backdrop-filter]:bg-card/75 dark:supports-[backdrop-filter]:bg-white/[0.08]",
        className
      )}
    >
      {children}
    </div>
  );
}
