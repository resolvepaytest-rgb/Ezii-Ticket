import { cn } from "@/lib/utils";

export type LoaderProps = {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
};

export function Loader({ label = "Loading...", className, size = "md" }: LoaderProps) {
  const spinnerSize =
    size === "sm" ? "h-4 w-4 border-2" : size === "lg" ? "h-8 w-8 border-3" : "h-5 w-5 border-2";

  const labelSize = size === "sm" ? "text-sm" : size === "lg" ? "text-base" : "text-sm";

  return (
    <div className={cn("flex items-center justify-center gap-3 text-muted-foreground", className)}>
      <div
        aria-label={label}
        className={cn(
          "animate-spin rounded-full border-primary/40 border-t-primary",
          spinnerSize
        )}
      />
      {label ? <span className={labelSize}>{label}</span> : null}
    </div>
  );
}

