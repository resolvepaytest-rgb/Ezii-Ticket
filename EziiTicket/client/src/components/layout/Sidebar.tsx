import { ChevronDown, ChevronRight, CirclePlus } from "lucide-react";
import { getEtsSystemAdminSidebarItems } from "@/config/etsNavigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type React from "react";

export type SidebarItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: SidebarItem[];
};

type SidebarProps = {
  orgName?: string;
  orgSubtitle?: string;
  orgLogoUrl?: string;
  items?: SidebarItem[];
  activeKey?: string;
  onSelect?: (key: string) => void;
  showCreateTicketButton?: boolean;
  onCreateTicketClick?: () => void;
  showViewModeToggle?: boolean;
  viewMode?: "team" | "my_view";
  onViewModeChange?: (mode: "team" | "my_view") => void;
  className?: string;
};

export function Sidebar({
  orgName = "",
  orgSubtitle = "",
  orgLogoUrl,
  items = getEtsSystemAdminSidebarItems(),
  activeKey,
  onSelect,
  showCreateTicketButton = false,
  onCreateTicketClick,
  showViewModeToggle = false,
  viewMode = "my_view",
  onViewModeChange,
  className,
}: SidebarProps) {
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-r border-black/10 bg-white/5 p-3 backdrop-blur-xl supports-[backdrop-filter]:bg-white/10 dark:border-white/10",
        className
      )}
    >
      <div className="mb-3 px-2 py-2 text-center">
        <div className="mx-auto">
          {orgLogoUrl ? (
            <img
              src={orgLogoUrl}
              alt={orgName}
              className="mx-auto h-16 w-auto max-w-full object-contain dark:rounded-md dark:bg-white/95 dark:px-2 dark:py-1"
            />
          ) : (
            <div className="mx-auto h-14 w-14 rounded-xl bg-primary/20 ring-1 ring-black/10 dark:ring-white/10" />
          )}
        </div>
        <div className="mt-2 min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">{orgName}</div>
          {orgSubtitle ? (
            <div className="truncate text-xs text-muted-foreground">{orgSubtitle}</div>
          ) : null}
        </div>
      </div>

      <div className="my-3 h-px w-full bg-black/10 dark:bg-white/10" />

      <div className="scrollbar-slim flex-1 min-h-0 overflow-y-auto pr-1">
        <nav className="flex flex-col gap-1">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-3 py-3 text-xs text-muted-foreground dark:border-white/20 dark:bg-white/5">
              You don&apos;t have access.
            </div>
          ) : null}
          {items.map((it) => {
            const active = it.key === activeKey;
            const Icon = it.icon;
            const hasChildren = Boolean(it.children?.length);
            const childActive = Boolean(it.children?.some((c) => c.key === activeKey));
            const parentExpanded = expandedParents[it.key] ?? childActive;
            return (
              <div key={it.key} className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (hasChildren) {
                      setExpandedParents((prev) => ({ ...prev, [it.key]: !parentExpanded }));
                      return;
                    }
                    onSelect?.(it.key);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                    active || childActive
                      ? "bg-primary/15 text-foreground ring-1 ring-black/10 dark:ring-white/10"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4", active || childActive ? "text-primary" : "")} />
                  <span className="truncate">{it.label}</span>
                  {hasChildren ? (
                    parentExpanded ? (
                      <ChevronDown className="ml-auto h-4 w-4 opacity-70" />
                    ) : (
                      <ChevronRight className="ml-auto h-4 w-4 opacity-70" />
                    )
                  ) : null}
                </button>

                {hasChildren && parentExpanded ? (
                  <div className="ml-6 flex flex-col gap-1">
                    {it.children!.map((child) => {
                      const ChildIcon = child.icon;
                      const isChildActive = child.key === activeKey;
                      return (
                        <button
                          key={child.key}
                          type="button"
                          onClick={() => onSelect?.(child.key)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                            isChildActive
                              ? "bg-primary/15 text-foreground ring-1 ring-black/10 dark:ring-white/10"
                              : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                          )}
                        >
                          <ChildIcon className={cn("h-4 w-4", isChildActive ? "text-primary" : "")} />
                          <span className="truncate">{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>

      {showViewModeToggle || showCreateTicketButton ? (
        <div className="mt-2 space-y-2">
          {showCreateTicketButton ? (
            <div className="w-full rounded-xl bg-white/60 p-2 ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">
            <button
              type="button"
              onClick={() => onCreateTicketClick?.()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-md transition-opacity hover:opacity-90"
            >
              <CirclePlus className="h-4 w-4" />
              <span>Create Ticket</span>
            </button>
          </div>
          ) : null}
          {showViewModeToggle ? (
            <div className="w-full rounded-xl bg-white/60 p-1.5 ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">
              <div className="inline-flex w-full rounded-lg  bg-card p-1">
                <button
                  type="button"
                  onClick={() => onViewModeChange?.("team")}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                    viewMode === "team"
                      ? "bg-[hsl(var(--brand))] text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange?.("my_view")}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                    viewMode === "my_view"
                      ? "bg-[hsl(var(--brand))] text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  My view
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

