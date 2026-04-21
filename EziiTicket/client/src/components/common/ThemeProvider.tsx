import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { useUIStore } from "@store/useUIStore";

/**
 * Centralized theme + brand controller.
 * - mode: adds/removes `dark` on <html>
 * - brand: sets `data-brand` on <html> (`ezii` | `resolve` | `client` | `ngo`)
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const mode = useUIStore((s) => s.mode);
  const brand = useUIStore((s) => s.brand);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.dataset.brand = brand;
  }, [mode, brand]);

  return children;
}

