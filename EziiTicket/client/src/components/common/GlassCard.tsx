import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type GlassCardProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * Frosted surface: readable in light (lifted card + blur) and dark (glass edge + depth).
 * Prefer layout-only `className` (padding, radius, overflow); avoid overriding `bg-*` unless intentional (e.g. solid accent).
 */
export function GlassCard({ className, children }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl text-card-foreground",
        // Light: clearer edge + soft lift (content stays high-contrast on `bg-card` tint)
        "border border-black/[0.08] bg-card/[0.82] shadow-md shadow-black/[0.06]",
        "ring-1 ring-black/[0.04]",
        "backdrop-blur-xl backdrop-saturate-150",
        "supports-[backdrop-filter]:bg-card/70",
        // Dark: brighter glass stack so panels separate from `bg-background`
        "dark:border-white/[0.14] dark:bg-white/[0.08] dark:shadow-[0_10px_44px_rgba(0,0,0,0.5)] dark:ring-white/[0.08]",
        "dark:supports-[backdrop-filter]:bg-white/[0.1]",
        className
      )}
    >
      {children}
    </div>
  );
}
