import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  LayoutDashboard,
  Users,
  Clock,
  FileChartColumn,
  Settings,
  MapPin,
  Activity,
  Calendar,
  UserCheck,
  Fingerprint,
  FileCheck,
  User,
  Shield,
} from "lucide-react";
import { usePermissions } from "@/contexts/PermissionContext";
import { useClientProducts } from "@/contexts/ClientProductsContext";
import { MenuKey } from "@/types/shared";
import { cn } from "@/lib/utils";

interface PageResult {
  type: "page";
  href: string;
  label: string;
  keywords: string[];
  parent?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

// Permission key mapping for pages
const permissionToMenuKey: Record<string, MenuKey> = {
  "Dashboard": "dashboard",
  "Employee Dashboard": "employee_dashboard",
  "Mark Attendance": "mark_attendance",
  "Optional Holidays": "optional_holidays",
  "Employee Reports": "employee_reports",
  "Reports": "reports",
  "Compliance Reports": "compliance_reports",
  "Modifications & Approvals": "modifications_approvals",
  "Roster Management": "roster_management",
  "Overtime Summary": "overtime_summary",
  "Attendance For Payrun": "attendance_for_payrun",
  "Attendance Configuration": "attendance_configuration",
  "Attendance Framework": "attendance_framework",
  "Attendance Cut Off": "attendance_cut_off",
  "Geo-Fence Configuration": "geo_fence_configuration",
  "Geotagging Configuration": "geotagging_configuration",
  "Roles": "roles",
  "Workflow": "workflow",
  "History Migration": "history_migration",
  "Biometric Device Integration": "biometric_device_integration",
  "Users": "users",
};

// All navigable pages including submenus (tabs, configuration items)
const ALL_PAGES: Array<{ href: string; label: string; permission?: string; keywords?: string[]; parent?: string }> = [
  // Main pages
  { href: "/admin-dashboard", label: "Team Dashboard", permission: "Dashboard" },
  { href: "/employee-dashboard", label: "Employee Dashboard", permission: "Employee Dashboard" },
  { href: "/employee-attendance", label: "Mark Attendance", permission: "Mark Attendance", keywords: ["clock in", "punch", "check in"] },
  // Mark Attendance tabs (employee-side submenu)
  { href: "/employee-attendance?tab=my-log", label: "My Logs", permission: "Mark Attendance", parent: "Mark Attendance", keywords: ["my logs", "attendance log", "tabs"] },
  { href: "/employee-attendance?tab=regularization", label: "Regularization Requests (Employee)", permission: "Mark Attendance", parent: "Mark Attendance", keywords: ["regularization", "regularisation", "tabs"] },
  { href: "/employee-attendance?tab=working-method", label: "Working Method Schedule", permission: "Mark Attendance", parent: "Mark Attendance", keywords: ["working method", "work method schedule", "tabs"] },
  { href: "/employee-geotag", label: "Geotag Attendance", permission: "Mark Attendance" },
  { href: "/employee-holidays", label: "Holiday Management", permission: "Optional Holidays", keywords: ["holidays"] },
  { href: "/modifications-approvals", label: "Modifications & Approvals", permission: "Modifications & Approvals", keywords: ["approvals"] },
  // Modifications & Approvals tabs (submenu)
  { href: "/modifications-approvals?tab=regularization", label: "Regularization Requests", permission: "Modifications & Approvals", parent: "Modifications & Approvals", keywords: ["regularization", "regularisation", "tabs"] },
  { href: "/modifications-approvals?tab=optional-holiday", label: "Optional Holiday Request", permission: "Modifications & Approvals", parent: "Modifications & Approvals", keywords: ["optional holiday", "holiday request", "tabs"] },
  { href: "/modifications-approvals?tab=overtime", label: "Overtime Request", permission: "Modifications & Approvals", parent: "Modifications & Approvals", keywords: ["overtime", "OT", "tabs"] },
  { href: "/modifications-approvals?tab=attendance-payrun", label: "Attendance for Payrun (Modifications)", permission: "Modifications & Approvals", parent: "Modifications & Approvals", keywords: ["attendance payrun", "payrun request", "tabs"] },
  { href: "/modifications-approvals?tab=working-method", label: "Working Method Request", permission: "Modifications & Approvals", parent: "Modifications & Approvals", keywords: ["working method", "work method", "tabs"] },
  { href: "/modifications-approvals?tab=employees", label: "Modifications Employees", permission: "Modifications & Approvals", parent: "Modifications & Approvals", keywords: ["modifications employees", "tabs"] },
  { href: "/roster-management", label: "Roster Management", permission: "Roster Management", keywords: ["roster", "schedule"] },
  { href: "/overtime-summary", label: "Overtime Summary", permission: "Overtime Summary", keywords: ["overtime", "OT"] },
  { href: "/attendance-for-payrun", label: "Attendance for Payrun", permission: "Attendance For Payrun", keywords: ["payrun", "payroll"] },
  { href: "/configuration", label: "Attendance Configuration", permission: "Attendance Configuration", keywords: ["config", "setup"] },
  // Configuration sub-items (submenu)
  { href: "/business-hours", label: "Business Hours and Quantity Management", permission: "Attendance Configuration", parent: "Configuration", keywords: ["business hours", "quantity", "sessions", "config"] },
  { href: "/attendance-notifications", label: "Attendance Notifications Engine", permission: "Attendance Configuration", parent: "Configuration", keywords: ["notifications", "late arrival", "early departure", "config"] },
  { href: "/working-method", label: "Working Method", permission: "Attendance Configuration", parent: "Configuration", keywords: ["working method", "work method", "time output", "config"] },
  { href: "/recording-mode", label: "Recording Mode", permission: "Attendance Configuration", parent: "Configuration", keywords: ["recording mode", "recording options", "config"] },
  { href: "/ip-whitelist", label: "IP Whitelisted Configuration", permission: "IP Whitelisted Configuration", parent: "Configuration", keywords: ["ip whitelisted", "ip whitelist", "office network", "clock-in", "clock-out", "restrict attendance", "config"] },
  { href: "/attendance-process-scheduler", label: "Attendance Process Scheduler", permission: "Attendance Configuration", parent: "Configuration", keywords: ["process scheduler", "scheduler", "processing frequency", "config"] },
  { href: "/communication", label: "Communication", permission: "Attendance Configuration", parent: "Configuration", keywords: ["communication", "multi-channel", "config"] },
  { href: "/attendance-framework", label: "Attendance Framework", permission: "Attendance Framework", keywords: ["framework", "work pattern"] },
  { href: "/cutoff", label: "Attendance Cut-Off", permission: "Attendance Cut Off", keywords: ["cutoff", "cut off"] },
  { href: "/geofencing", label: "Geo Fence Configuration", permission: "Geo-Fence Configuration", keywords: ["geofence", "geo-fence", "location"] },
  { href: "/geotagging-configuration", label: "Geotagging Configuration", permission: "Geotagging Configuration", keywords: ["geotag"] },
  { href: "/roles", label: "Roles", permission: "Roles" },
  { href: "/workflow", label: "Workflow", permission: "Workflow" },
  { href: "/history-migration", label: "History Migration", permission: "History Migration", keywords: ["migration"] },
  { href: "/biometric-device-integration", label: "Biometric Device Integration", permission: "Biometric Device Integration", keywords: ["biometric", "device"] },
  { href: "/users", label: "Users", permission: "Users" },
  // Reports
  { href: "/reports/check-in-out", label: "Check In / Check Out Report", permission: "Reports", keywords: ["check in", "check out"] },
  { href: "/reports/man-hours", label: "Man Hours Report", permission: "Reports", keywords: ["man hours"] },
  { href: "/reports/month-wise-capacity", label: "Month-wise Capacity Report", permission: "Reports", keywords: ["month wise", "capacity", "man hours capacity"] },
  { href: "/reports/attendance-register", label: "Attendance Register Report", permission: "Reports", keywords: ["register"] },
  { href: "/reports/attendance-log", label: "Attendance Log Report", permission: "Reports", keywords: ["log"] },
  { href: "/reports/attendance-control", label: "Attendance Control Report", permission: "Reports", keywords: ["control"] },
  { href: "/reports/attendance-exception", label: "Attendance Exception Report", permission: "Reports", keywords: ["exception"] },
  { href: "/reports/modification-attendance", label: "Attendance Regularisations Report", permission: "Reports", keywords: ["regularisation"] },
  { href: "/reports/work-schedule-changes", label: "Work Schedule Changes Report", permission: "Reports", keywords: ["work schedule", "schedule changes", "working method"] },
  // Employee reports
  { href: "/employee-reports/check-in-out", label: "Clock in / Clock out Report", permission: "Employee Reports" },
  { href: "/employee-reports/man-hours", label: "Man Hours Report (Employee)", permission: "Employee Reports" },
  { href: "/employee-reports/attendance-register", label: "Attendance Register (Employee)", permission: "Employee Reports" },
  { href: "/employee-reports/attendance-log", label: "Attendance Log (Employee)", permission: "Employee Reports" },
  { href: "/employee-reports/attendance-exception", label: "Attendance Exception (Employee)", permission: "Employee Reports" },
  { href: "/employee-reports/attendance-regularization", label: "Attendance Regularization (Employee)", permission: "Employee Reports" },
  // Compliance reports
  { href: "/reports/muster-roll-cum-wage-register", label: "Muster Roll cum Wage Register", permission: "Compliance Reports", keywords: ["muster roll", "wage"] },
  { href: "/reports/muster-roll-with-wages", label: "Muster Roll with Wages", permission: "Compliance Reports", keywords: ["muster roll"] },
];

const PAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Team Dashboard": LayoutDashboard,
  "Employee Dashboard": User,
  "Mark Attendance": Clock,
  "My Logs": Clock,
  "Regularization Requests (Employee)": FileCheck,
  "Working Method Schedule": Activity,
  "Geotag Attendance": MapPin,
  "Holiday Management": Calendar,
  "Modifications & Approvals": UserCheck,
  "Regularization Requests": FileCheck,
  "Optional Holiday Request": Calendar,
  "Overtime Request": Clock,
  "Attendance for Payrun (Modifications)": FileChartColumn,
  "Working Method Request": Activity,
  "Modifications Employees": Users,
  "Roster Management": Calendar,
  "Overtime Summary": Clock,
  "Attendance for Payrun": FileChartColumn,
  "Attendance Configuration": Settings,
  "Business Hours and Quantity Management": Clock,
  "Attendance Notifications Engine": Activity,
  "Working Method": Activity,
  "Recording Mode": Clock,
  "IP Whitelisted Configuration": Shield,
  "Attendance Process Scheduler": Calendar,
  "Communication": Activity,
  "Attendance Framework": Settings,
  "Attendance Cut-Off": Calendar,
  "Geo Fence Configuration": MapPin,
  "Geotagging Configuration": MapPin,
  "Roles": Users,
  "Workflow": Activity,
  "History Migration": FileChartColumn,
  "Biometric Device Integration": Fingerprint,
  "Users": Users,
};

interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function matchesQuery(text: string, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  return t.includes(q) || q.split(/\s+/).every((word) => t.includes(word));
}

const STEP_SIZE = 5; // Items to jump with PageUp/PageDown

export function GlobalSearchModal({ open, onOpenChange }: GlobalSearchModalProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { hasPermission } = usePermissions();
  const { isNgo } = useClientProducts();

  const searchInputFocus = isNgo
    ? "focus-visible:ring-[#FB9745] focus-visible:border-[#FB9745]"
    : "focus-visible:ring-blue-500 focus-visible:border-blue-500";

  const canViewPage = useCallback(
    (permission?: string) => {
      if (!permission) return true;
      const menuKey = permissionToMenuKey[permission];
      if (!menuKey) return true;
      return hasPermission(menuKey, "view");
    },
    [hasPermission]
  );

  const pageResults = useMemo((): PageResult[] => {
    const matches = (p: typeof ALL_PAGES[0]) =>
      matchesQuery(p.label, query) ||
      (p.keywords && p.keywords.some((k) => matchesQuery(k, query))) ||
      (p.parent && matchesQuery(p.parent, query));
    return ALL_PAGES.filter((p) => canViewPage(p.permission) && matches(p)).map((p) => ({
      type: "page" as const,
      href: p.href,
      label: p.label,
      keywords: p.keywords || [],
      parent: p.parent,
      icon: PAGE_ICONS[p.label] || PAGE_ICONS[p.parent || ""],
    }));
  }, [query, canViewPage]);

  const handleSelect = useCallback(
    (item: PageResult) => {
      onOpenChange(false);
      setQuery("");
      setSelectedIndex(0);
      // Support full href with query params (e.g. /modifications-approvals?tab=regularization)
      navigate(item.href);
    },
    [navigate, onOpenChange]
  );

  // Reset selection when modal opens
  useEffect(() => {
    if (open) setSelectedIndex(0);
  }, [open]);

  // Keep selectedIndex in bounds when results change
  useEffect(() => {
    const max = Math.max(0, pageResults.length - 1);
    setSelectedIndex((i) => (pageResults.length === 0 ? 0 : Math.min(i, max)));
  }, [pageResults.length]);

  // Scroll selected item into view
  useEffect(() => {
    const el = resultRefs.current[selectedIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (pageResults.length === 0) return;
      const max = pageResults.length - 1;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i >= max ? 0 : i + 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i <= 0 ? max : i - 1));
          break;
        case "PageDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(max, i + STEP_SIZE));
          break;
        case "PageUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(0, i - STEP_SIZE));
          break;
        case "Enter":
          e.preventDefault();
          const item = pageResults[selectedIndex];
          if (item) handleSelect(item);
          break;
      }
    },
    [pageResults, selectedIndex, handleSelect]
  );

  const hasResults = pageResults.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base font-semibold">Search</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className={cn("pl-9 h-10", searchInputFocus)}
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="max-h-[320px] overflow-y-auto">
          <div className="px-2 pb-4">
            {pageResults.length > 0 && (
              <div className="py-2">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Pages
                </p>
                <div className="space-y-0.5">
                  {pageResults.map((item, index) => {
                    const Icon = item.icon;
                    const isSelected = index === selectedIndex;
                    return (
                      <button
                        key={item.href}
                        ref={(el) => { resultRefs.current[index] = el; }}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-sm transition-colors",
                          "border-l-2 border-r-2 border-transparent",
                          "hover:bg-accent hover:text-accent-foreground",
                          isNgo ? "hover:border-l-[#FB9745] hover:border-r-[#FB9745]" : "hover:border-l-blue-500 hover:border-r-blue-500",
                          isSelected && "bg-accent text-accent-foreground",
                          isSelected && (isNgo ? "border-l-[#FB9745] border-r-[#FB9745]" : "border-l-blue-500 border-r-blue-500")
                        )}
                      >
                        {Icon ? (
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileChartColumn className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span>{item.label}</span>
                          {item.parent && (
                            <span className="text-xs text-muted-foreground truncate">{item.parent}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!hasResults && query.trim() && (
              <div className="py-8 text-center text-sm text-muted-foreground">No results found</div>
            )}
            {!query.trim() && !hasResults && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Type to search pages
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
