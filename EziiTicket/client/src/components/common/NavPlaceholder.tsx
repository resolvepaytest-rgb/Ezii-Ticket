type NavPlaceholderProps = {
  title: string;
  description?: string;
};

export function NavPlaceholder({ title, description }: NavPlaceholderProps) {
  return (
    <div className="max-w-4xl rounded-xl border border-black/10 bg-white/5 p-6 text-sm dark:border-white/10">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-2 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
