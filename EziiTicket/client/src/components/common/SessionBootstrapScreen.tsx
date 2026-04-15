import { GlassCard } from "@components/common/GlassCard";
import { cn } from "@/lib/utils";
import { Check, Loader2, Shield, Ticket } from "lucide-react";

export type SessionBootstrapStage =
  | "loading"
  | "checking_credentials"
  | "verifying_credentials";

type SessionBootstrapScreenProps = {
  stage: SessionBootstrapStage;
  /** Shown under the logo (e.g. product name). */
  productTitle?: string;
  className?: string;
};

const STEPS: { id: SessionBootstrapStage; title: string; subtitle: string }[] = [
  {
    id: "loading",
    title: "Loading",
    subtitle: "Preparing the app…",
  },
  {
    id: "checking_credentials",
    title: "Check credentials",
    subtitle: "Validating your session…",
  },
  {
    id: "verifying_credentials",
    title: "Verify credentials",
    subtitle: "Just a sec — loading your permissions…",
  },
];

function stepIndex(stage: SessionBootstrapStage): number {
  return STEPS.findIndex((s) => s.id === stage);
}

export function SessionBootstrapScreen({
  stage,
  productTitle = "Ezii Ticketing",
  className,
}: SessionBootstrapScreenProps) {
  const active = stepIndex(stage);
  const current = STEPS[active] ?? STEPS[0]!;

  return (
    <div
      className={cn(
        "flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-background via-background to-muted/25 p-6",
        className
      )}
      aria-busy="true"
      aria-live="polite"
      aria-label={current.title}
    >
      <GlassCard className="w-full max-w-md px-8 py-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Ticket className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </div>
          <h1 className="mt-5 text-lg font-semibold tracking-tight text-foreground">{productTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Signing you in securely</p>
        </div>

        <ol className="mt-10 space-y-0" role="list">
          {STEPS.map((step, i) => {
            const done = i < active;
            const currentStep = i === active;
            return (
              <li key={step.id} className="relative flex gap-3">
                {i < STEPS.length - 1 ? (
                  <div
                    className={cn(
                      "absolute left-[15px] top-8 h-[calc(100%+0.5rem)] w-px bg-border",
                      done && "bg-primary/40"
                    )}
                    aria-hidden
                  />
                ) : null}
                <div className="relative z-[1] flex shrink-0 flex-col items-center">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors",
                      done &&
                        "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25",
                      currentStep &&
                        !done &&
                        "border-primary/60 bg-background text-primary ring-4 ring-primary/15",
                      !done &&
                        !currentStep &&
                        "border-muted-foreground/25 bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {done ? (
                      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    ) : currentStep ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <span className="text-[11px] tabular-nums opacity-80">{i + 1}</span>
                    )}
                  </div>
                </div>
                <div className={cn("min-w-0 flex-1 pb-8", i === STEPS.length - 1 && "pb-0")}>
                  <p
                    className={cn(
                      "text-sm font-medium leading-tight",
                      currentStep ? "text-foreground" : done ? "text-foreground/90" : "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.subtitle}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5 shrink-0 text-primary/80" aria-hidden />
          <span className="text-left leading-snug">
            <span className="font-medium text-foreground/90">{current.title}</span>
            {" — "}
            {stage === "verifying_credentials"
              ? "Almost there. Your workspace will open next."
              : stage === "checking_credentials"
                ? "Confirming your token with the server."
                : "Starting up…"}
          </span>
        </div>
      </GlassCard>
    </div>
  );
}
