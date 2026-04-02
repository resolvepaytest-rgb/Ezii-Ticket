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
import { EZII_BRAND } from "@/lib/eziiBrand";
import { useUIStore } from "@store/useUIStore";
import { useState } from "react";

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
  className,
}: HeaderProps) {
  const mode = useUIStore((s) => s.mode);
  const toggleMode = useUIStore((s) => s.toggleMode);
  const [searchQuery, setSearchQuery] = useState("");

  const initialText = (userInfo?.name || userLabel || "U")
    .trim()
    .slice(0, 2)
    .toUpperCase();
  const unreadLabel =
    notificationUnreadCount > 9 ? "9+" : notificationUnreadCount > 0 ? String(notificationUnreadCount) : "";

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
              <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/20 ring-1 ring-black/10 dark:ring-white/10" />
              <span className="hidden max-w-[7rem] truncate text-sm font-semibold leading-none text-foreground sm:inline md:max-w-[9rem]">
                {productName}
              </span>
            </div>

            <div className="min-w-0 flex-1 px-1 sm:px-3">
              <div className="relative mx-auto w-full max-w-2xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search across ETS..."
                  className="h-10 w-full rounded-full border border-black/10 bg-white pl-10 pr-4 text-sm text-foreground shadow-sm outline-none ring-[#1E88E5]/25 placeholder:text-muted-foreground focus:ring-2 dark:border-white/15 dark:bg-white/10"
                  aria-label="Search across ETS"
                />
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
                  "ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ring-2 ring-white dark:ring-background",
                  isUserPanelOpen && "ring-[#1E88E5]/50"
                )}
                style={{ background: EZII_BRAND.primary }}
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
              <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/20 ring-1 ring-black/10 dark:ring-white/10" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold leading-none">
                  {productName}
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
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/25 text-xs font-semibold text-primary ring-1 ring-black/10 dark:ring-white/10">
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
