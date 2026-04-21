import type { ReactNode } from "react";

type InstantTooltipProps = {
  disabled: boolean;
  message: string;
  children: ReactNode;
};

export function InstantTooltip({ disabled, message, children }: InstantTooltipProps) {
  return (
    <div className={`relative inline-flex ${disabled ? "group" : ""}`}>
      {children}
      {disabled ? (
        <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#111827] px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-75 group-hover:opacity-100">
          {message}
        </span>
      ) : null}
    </div>
  );
}
