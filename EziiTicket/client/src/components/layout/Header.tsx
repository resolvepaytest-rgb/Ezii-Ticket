import {
  Bell,
  ChevronDown,
  HelpCircle,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUIStore } from "@store/useUIStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HeaderSearchItem } from "./headerSearch";

export type HeaderUserInfo = {
  name: string;
  email?: string | null;
  employeeId?: string | null;
  roleName?: string | null;
  position?: string | null;
  dateOfJoining?: string | null;
};

export type HeaderVariant = "default" | "system_admin";

type HeaderProps = {
  productName: string;
  userLabel: string;
  userInfo?: HeaderUserInfo;
  variant?: HeaderVariant;
  onMobileMenuClick?: () => void;
  onNotificationsClick?: () => void;
  notificationUnreadCount?: number;
  onSupportClick?: () => void;
  onSettingsClick?: () => void;
  isUserPanelOpen?: boolean;
  onUserPanelToggle?: () => void;
  searchItems?: HeaderSearchItem[];
  onSearchSelect?: (key: string) => void;
  className?: string;
};

export function Header({
  productName,
  userLabel,
  userInfo,
  variant = "default",
  onMobileMenuClick,
  onNotificationsClick,
  notificationUnreadCount = 0,
  onSupportClick,
  onSettingsClick,
  isUserPanelOpen,
  onUserPanelToggle,
  searchItems = [],
  onSearchSelect,
  className,
}: HeaderProps) {
  const mode = useUIStore((s) => s.mode);
  const toggleMode = useUIStore((s) => s.toggleMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const searchBlurTimerRef = useRef<number | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const resultButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [searchOverlayRect, setSearchOverlayRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!trimmedQuery) return searchItems;
    return searchItems.filter(
      (item) =>
        item.label.toLowerCase().includes(trimmedQuery) ||
        item.sectionLabel?.toLowerCase().includes(trimmedQuery)
    );
  }, [searchItems, trimmedQuery]);

  useEffect(() => {
    if (activeResultIndex < 0) return;
    resultButtonRefs.current[activeResultIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeResultIndex]);

  const selectSearchResult = (item: HeaderSearchItem) => {
    if (searchBlurTimerRef.current) {
      window.clearTimeout(searchBlurTimerRef.current);
    }
    onSearchSelect?.(item.key);
    setSearchOpen(false);
    setSearchQuery("");
    setActiveResultIndex(-1);
  };
  useEffect(() => {
    if (!searchOpen) return;
    const updatePosition = () => {
      const el = searchContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setSearchOverlayRect({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [searchOpen]);

  const initialText = (() => {
    const name = (userInfo?.name || userLabel || "U").trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  })();
  const unreadLabel =
    notificationUnreadCount > 9 ? "9+" : notificationUnreadCount > 0 ? String(notificationUnreadCount) : "";
  const brandLabel = productName || "eziiticket";

  return (
    <div
      className={cn(
        "z-20 shrink-0 overflow-x-auto border-b border-black/10 backdrop-blur-xl dark:border-white/10",
        variant === "system_admin"
          ? "bg-gradient-to-r from-[#1E88E5]/10 via-white/95 to-white/90 supports-[backdrop-filter]:bg-gradient-to-r supports-[backdrop-filter]:from-[#1E88E5]/10 dark:from-white/5 dark:via-background/80 dark:to-background/90"
          : "bg-white/5 supports-[backdrop-filter]:bg-white/10",
        className
      )}
    >
      <div
        className={cn(
          "flex h-14 w-full items-center gap-2 px-3 sm:gap-3 sm:px-4",
          variant === "default" && "justify-between"
        )}
      >
        {variant === "system_admin" ? (
          <>
            <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/10 md:hidden"
                onClick={onMobileMenuClick}
                aria-label="Open menu"
              >
                <Menu />
              </Button>
              <span
                className="hidden items-center text-xl font-bold leading-none tracking-tight sm:inline-flex"
                aria-label={brandLabel}
              >
                <span className="text-[#1E88E5]">ezii</span>
                <span className="text-[#F97316]">ticket</span>
              </span>
            </div>

            <div className="min-w-0 flex-1 px-1 sm:px-3">
              <div ref={searchContainerRef} className="relative mx-auto w-full max-w-xl">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    const nextQuery = e.target.value;
                    setSearchQuery(nextQuery);
                    setActiveResultIndex(0);
                    resultButtonRefs.current = [];
                  }}
                  onKeyDown={(e) => {
                    if (!searchOpen || searchResults.length === 0) return;
                    if (e.key === "ArrowDown" || e.key === "PageDown") {
                      e.preventDefault();
                      setActiveResultIndex((prev) => (prev + 1) % searchResults.length);
                      return;
                    }
                    if (e.key === "ArrowUp" || e.key === "PageUp") {
                      e.preventDefault();
                      setActiveResultIndex((prev) =>
                        prev <= 0 ? searchResults.length - 1 : prev - 1
                      );
                      return;
                    }
                    if (e.key === "Enter" && activeResultIndex >= 0) {
                      e.preventDefault();
                      const selected = searchResults[activeResultIndex];
                      if (selected) selectSearchResult(selected);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setSearchOpen(false);
                      setActiveResultIndex(-1);
                    }
                  }}
                  onFocus={() => {
                    setSearchOpen(true);
                    setActiveResultIndex(searchResults.length > 0 ? 0 : -1);
                  }}
                  onBlur={() => {
                    if (searchBlurTimerRef.current) {
                      window.clearTimeout(searchBlurTimerRef.current);
                    }
                    searchBlurTimerRef.current = window.setTimeout(() => {
                      setSearchOpen(false);
                      setActiveResultIndex(-1);
                    }, 120);
                  }}
                  placeholder="Search across ETS..."
                  className="h-8 w-full rounded-full border border-black/10 bg-white pl-8 pr-3 text-xs text-foreground shadow-sm outline-none ring-[#1E88E5]/25 placeholder:text-muted-foreground focus:ring-2 dark:border-white/15 dark:bg-white/10"
                  aria-label="Search across ETS"
                  role="combobox"
                  aria-expanded={searchOpen ? true : false}
                  aria-controls="header-search-results"
                  aria-activedescendant={
                    activeResultIndex >= 0 ? `header-search-result-${activeResultIndex}` : undefined
                  }
                />
                {searchOpen &&
                searchOverlayRect &&
                typeof document !== "undefined" &&
                createPortal(
                  <div
                    className="fixed z-[70] overflow-hidden rounded-2xl border border-[#1E88E5]/25 bg-white shadow-2xl ring-1 ring-[#1E88E5]/20 dark:border-[#1E88E5]/35 dark:bg-zinc-900 dark:ring-[#1E88E5]/25"
                    style={{
                      top: searchOverlayRect.top,
                      left: searchOverlayRect.left,
                      width: searchOverlayRect.width,
                    }}
                  >
                    <div className="border-b border-black/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground dark:border-white/10">
                      Pages
                    </div>
                    {searchResults.length > 0 ? (
                      <ul
                        id="header-search-results"
                        className="max-h-72 overflow-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        role="listbox"
                      >
                        {searchResults.map((item, index) => (
                          <li key={item.key}>
                            <button
                              id={`header-search-result-${index}`}
                              type="button"
                              ref={(el) => {
                                resultButtonRefs.current[index] = el;
                              }}
                              className={cn(
                                "block w-full rounded-lg px-3 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/10",
                                activeResultIndex === index &&
                                  "bg-[#1E88E5]/10 ring-1 ring-inset ring-[#1E88E5]/40 dark:bg-[#1E88E5]/20"
                              )}
                              role="option"
                              aria-selected={activeResultIndex === index}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectSearchResult(item);
                              }}
                              onMouseEnter={() => setActiveResultIndex(index)}
                            >
                              <span className="block text-sm font-medium text-foreground">{item.label}</span>
                              {item.sectionLabel ? (
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {item.sectionLabel}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        No accessible screens found.
                      </div>
                    )}
                  </div>,
                  document.body
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 border-black/10 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/10"
                onClick={toggleMode}
                aria-label="Toggle theme"
                title={mode === "dark" ? "Switch to light" : "Switch to dark"}
              >
                {mode === "dark" ? <Sun /> : <Moon />}
              </Button>
              <button
                type="button"
                onClick={onSupportClick}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/10"
                aria-label="Support"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white/90 dark:border-white/10 dark:bg-white/10">
                  <HelpCircle className="h-4 w-4" />
                </span>
                <span className="hidden font-medium text-foreground/80 lg:inline">Support</span>
              </button>
              <button
                type="button"
                onClick={() => onNotificationsClick?.()}
                className="relative rounded-full p-2 text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/10"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadLabel ? (
                  <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#DC3545] px-1 py-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-background">
                    {unreadLabel}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={onSettingsClick}
                className="rounded-full p-2 text-muted-foreground hover:bg-black/[0.04] dark:hover:bg-white/10"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={onUserPanelToggle}
                title={userLabel}
                className={cn(
                  "ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand))] text-xs font-bold text-white shadow-sm ring-2 ring-white dark:ring-background",
                  isUserPanelOpen && "ring-[hsl(var(--brand)/0.5)]"
                )}
                aria-expanded={isUserPanelOpen}
                aria-haspopup="dialog"
              >
                {initialText}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="border-black/10 bg-white/5 hover:bg-white/10 dark:border-white/10 md:hidden"
                onClick={onMobileMenuClick}
                aria-label="Open menu"
              >
                <Menu />
              </Button>
              <div className="min-w-0">
                <div
                  className="inline-flex items-center text-xl font-bold leading-none tracking-tight"
                  aria-label={brandLabel}
                >
                  <span className="text-[#1E88E5]">ezii</span>
                  <span className="text-[#F97316]">ticket</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="border-black/10 bg-white/5 hover:bg-white/10 dark:border-white/10"
                onClick={toggleMode}
                aria-label="Toggle theme"
                title={mode === "dark" ? "Switch to light" : "Switch to dark"}
              >
                {mode === "dark" ? <Sun /> : <Moon />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="relative border-black/10 bg-white/5 hover:bg-white/10 dark:border-white/10"
                onClick={() => onNotificationsClick?.()}
                aria-label="Notifications"
              >
                <Bell />
                {unreadLabel ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[#DC3545] px-1 py-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-background">
                    {unreadLabel}
                  </span>
                ) : null}
              </Button>

              <div className="relative">
                <button
                  type="button"
                  onClick={onUserPanelToggle}
                  className="flex items-center gap-2 rounded-lg border border-black/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 dark:border-white/10"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--brand)/0.25)] text-xs font-semibold text-[hsl(var(--brand))] ring-1 ring-black/10 dark:ring-white/10">
                    {initialText}
                  </div>
                  <span className="hidden max-w-[220px] truncate sm:inline">
                    {userLabel}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isUserPanelOpen ? "rotate-180" : ""
                    )}
                  />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
