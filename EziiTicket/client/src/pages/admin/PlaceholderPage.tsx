import { GlassCard } from "@components/common/GlassCard";

export function PlaceholderPage({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <div className="max-w-4xl">
      <GlassCard className="flex flex-col gap-4 p-6">
        <div>
          <div className="text-xl font-semibold tracking-tight">{title}</div>
          {message ? (
            <div className="mt-1 text-sm text-muted-foreground">{message}</div>
          ) : null}
        </div>

        <div className="rounded-xl border border-black/10 bg-white/5 p-4 text-sm text-muted-foreground dark:border-white/10">
          Coming soon. This screen is reserved for your Phase-2 UI.
        </div>
      </GlassCard>
    </div>
  );
}

