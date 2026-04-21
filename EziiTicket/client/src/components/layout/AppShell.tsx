import type { PropsWithChildren } from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CirclePlus } from "lucide-react";
import { Header } from "./Header";
import type { HeaderUserInfo, HeaderVariant } from "./Header";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { collectHeaderSearchItems, type HeaderSearchItem } from "./headerSearch";

type AppShellProps = PropsWithChildren<{
  productName: string;
  userLabel: string;
  userInfo?: HeaderUserInfo;
  onLogout?: () => void;
  sidebarOrgName?: string;
  sidebarOrgSubtitle?: string;
  sidebarOrgLogoUrl?: string;
  sidebarItems?: SidebarItem[];
  activeNavKey?: string;
  onNavSelect?: (key: string) => void;
  showCreateTicketButton?: boolean;
  onCreateTicketClick?: () => void;
  showViewModeToggle?: boolean;
  viewMode?: "team" | "my_view";
  onViewModeChange?: (mode: "team" | "my_view") => void;
  headerVariant?: HeaderVariant;
  onHeaderNotificationsClick?: () => void;
  notificationUnreadCount?: number;
  onHeaderSupportClick?: () => void;
  onHeaderSettingsClick?: () => void;
  headerSearchItems?: HeaderSearchItem[];
  className?: string;
}>;

export function AppShell({
  productName,
  userLabel,
  userInfo,
  onLogout,
  sidebarOrgName,
  sidebarOrgSubtitle,
  sidebarOrgLogoUrl,
  sidebarItems,
  activeNavKey,
  onNavSelect,
  showCreateTicketButton = false,
  onCreateTicketClick,
  showViewModeToggle = false,
  viewMode = "my_view",
  onViewModeChange,
  headerVariant = "default",
  onHeaderNotificationsClick,
  notificationUnreadCount = 0,
  onHeaderSupportClick,
  onHeaderSettingsClick,
  headerSearchItems,
  className,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const resolvedHeaderSearchItems =
    headerSearchItems ?? collectHeaderSearchItems(sidebarItems ?? []);

  const initialText = (() => {
    const name = (userInfo?.name || userLabel || "U").trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  })();

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!userPanelOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserPanelOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [userPanelOpen]);

  return (
    <div className={cn("flex h-svh flex-col overflow-hidden text-foreground", className)}>
      <Header
        productName={productName}
        userLabel={userLabel}
        userInfo={userInfo}
        variant={headerVariant}
        isUserPanelOpen={userPanelOpen}
        onUserPanelToggle={() => setUserPanelOpen((v) => !v)}
        onMobileMenuClick={() => setMobileOpen(true)}
        onNotificationsClick={onHeaderNotificationsClick}
        notificationUnreadCount={notificationUnreadCount}
        onSupportClick={onHeaderSupportClick}
        onSettingsClick={onHeaderSettingsClick}
        searchItems={resolvedHeaderSearchItems}
        onSearchSelect={onNavSelect}
      />

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-30 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/30"
              aria-label="Close menu overlay"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-[16rem]">
              <Sidebar
                orgName={sidebarOrgName}
                orgSubtitle={sidebarOrgSubtitle}
                orgLogoUrl={sidebarOrgLogoUrl}
                items={sidebarItems}
                activeKey={activeNavKey}
                onSelect={(k) => {
                  onNavSelect?.(k);
                  setMobileOpen(false);
                }}
                showViewModeToggle={showViewModeToggle}
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
                className="h-full w-full"
              />
            </div>
          </div>
        ) : null}

        <Sidebar
          orgName={sidebarOrgName}
          orgSubtitle={sidebarOrgSubtitle}
          orgLogoUrl={sidebarOrgLogoUrl}
          items={sidebarItems}
          activeKey={activeNavKey}
          onSelect={onNavSelect}
          showViewModeToggle={showViewModeToggle}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          className="hidden h-full min-h-0 md:flex md:flex-col"
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      {showCreateTicketButton ? (
        <button
          type="button"
          onClick={onCreateTicketClick}
          className="fixed bottom-5 right-4 z-30 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--brand))] px-3 py-2 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 md:bottom-6 md:right-6"
        >
          <CirclePlus className="h-4 w-4" />
          <span>Create Ticket</span>
        </button>
      ) : null}

      {userPanelOpen ? (
        <>
          <button
            type="button"
            aria-label="Close user info panel"
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setUserPanelOpen(false)}
          />
          <div className="fixed right-6 top-[4.75rem] z-50 w-[360px] max-w-[92vw] max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-black/10 bg-background/95 p-4 shadow-xl backdrop-blur-xl dark:border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand)/0.2)] text-lg font-semibold text-[hsl(var(--brand))]">
                {initialText}
              </div>
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">
                  {userInfo?.name || userLabel}
                </div>
                <div className="mt-1 inline-flex rounded-full border border-black/10 px-2 py-1 text-xs text-muted-foreground dark:border-white/10">
                  {userInfo?.roleName || "User"}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="rounded-xl border border-black/10 bg-white/5 p-3 dark:border-white/10">
                <div className="text-xs text-muted-foreground">EMAIL</div>
                <div className="text-sm">{userInfo?.email || "-"}</div>
              </div>
              <div className="rounded-xl border border-black/10 bg-white/5 p-3 dark:border-white/10">
                <div className="text-xs text-muted-foreground">
                  EMPLOYEE ID
                </div>
                <div className="text-sm">{userInfo?.employeeId || "-"}</div>
              </div>
              <div className="rounded-xl border border-black/10 bg-white/5 p-3 dark:border-white/10">
                <div className="text-xs text-muted-foreground">POSITION</div>
                <div className="text-sm">{userInfo?.position || "-"}</div>
              </div>
              <div className="rounded-xl border border-black/10 bg-white/5 p-3 dark:border-white/10">
                <div className="text-xs text-muted-foreground">
                  DATE OF JOINING
                </div>
                <div className="text-sm">{userInfo?.dateOfJoining || "-"}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="mt-4 w-full rounded-xl border border-red-300/60 bg-transparent px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50/20"
            >
              Logout
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

