import { AppProviders } from "./providers";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app.store";

export function AppLayout() {
  const counter = useAppStore((s) => s.counter);
  const inc = useAppStore((s) => s.inc);
  const reset = useAppStore((s) => s.reset);

  return (
    <AppProviders>
      <div className="min-h-svh bg-background text-foreground">
        <div className="mx-auto w-full max-w-3xl px-6 py-12">
          <h1 className="text-3xl font-semibold tracking-tight">EziiTicket</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            React + Vite + Tailwind + Shadcn + Zustand
          </p>

          <div className="mt-8 flex items-center gap-3">
            <Button onClick={inc}>Count: {counter}</Button>
            <Button variant="secondary" onClick={reset}>
              Reset
            </Button>
          </div>
        </div>
      </div>
    </AppProviders>
  );
}

