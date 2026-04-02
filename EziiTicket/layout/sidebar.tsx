import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/contexts/PermissionContext";
import { useClientProducts } from "@/contexts/ClientProductsContext";
import { useQuery } from "@tanstack/react-query";
import { MenuKey } from "../../types/shared";
import { getOrganizationProfile } from "@/lib/organizationService";
import { 
  Clock,
  LayoutDashboard,
  Users,
  Calendar,
  FileChartColumn,
  Settings,
  UserCheck,
  MapPin,
  LogOut,
  ChevronDown,
  ChevronRight,
  Building2,
  Activity,
  BarChart3,
  MessageSquare,
  User,
  Bell,
  Fingerprint,
  Globe,
  Navigation as NavigationIcon,
  FileCheck,
  Shield,
  Route
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import { Switch } from "@/components/ui/switch";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps = {}) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { hasPermission, permissions, isLoading } = usePermissions();
  const { isNgo } = useClientProducts();
  
  // Fetch organization profile for logo (always fetch for logo)
  const { data: organizationProfile, isLoading: isOrgLoading } = useQuery({
    queryKey: ['organization-profile'],
    queryFn: getOrganizationProfile,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });
  
  const [isSetupExpanded, setIsSetupExpanded] = useState(false);
  const [isProcessesExpanded, setIsProcessesExpanded] = useState(false);
  const [isReportsExpanded, setIsReportsExpanded] = useState(false);
  const [isComplianceReportsExpanded, setIsComplianceReportsExpanded] = useState(false);
  const [isEmployeeReportsExpanded, setIsEmployeeReportsExpanded] = useState(false);
  const [employeeNumber, setEmployeeNumber] = useState<string | null>(null);
  
  // Track manual user interactions to prevent auto-override
  const [manuallyExpandedSections, setManuallyExpandedSections] = useState<Set<string>>(new Set());
  
  // State for selected view with localStorage persistence
  const [selectedView, setSelectedView] = useState<'admin' | 'employee'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-selected-view');
      return saved === 'employee' ? 'employee' : 'admin';
    }
    return 'admin';
  });

  // Permission checks
  const hasEmployeeDashboardAccess = permissions.employee_dashboard?.canView || permissions.employee_dashboard?.canModify;
  const hasAdminDashboardAccess = permissions.dashboard?.canView || permissions.dashboard?.canModify;

  // Check if user has geotag configuration assigned (controls Geotag Attendance menu)
  const orgAuth = localStorage.getItem('orgAuth');
  const parsedOrgAuth = orgAuth ? JSON.parse(orgAuth) : null;
  const userId = parsedOrgAuth?.userId ?? parsedOrgAuth?.user_id;
  const isDemoUser = userId === 1 || userId === '1';

  // Demo mode toggle - only for user_id 1, default ON to show Demo Client branding
  const [demoMode, setDemoMode] = useState<boolean>(() => {
    if (!isDemoUser || typeof window === 'undefined') return false;
    const saved = localStorage.getItem('demo-mode-toggle');
    return saved === null ? true : saved === 'true';
  });
  useEffect(() => {
    if (isDemoUser && typeof window !== 'undefined') {
      localStorage.setItem('demo-mode-toggle', String(demoMode));
    }
  }, [demoMode, isDemoUser]);
  
  const { data: geotagAccessData } = useQuery<{ hasAccess: boolean; frameworkCount: number }>({
    queryKey: ['/api/geotagging/configurations/employee', userId],
    queryFn: async () => {
      const token = parsedOrgAuth?.token || '';
      const resp = await fetch(`/api/geotagging/configurations/employee?user_id=${encodeURIComponent(userId || '')}` , {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to fetch geotag configurations for employee');
      const data = await resp.json();
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.configurations)
            ? data.configurations
            : [];
      return { hasAccess: items.length > 0, frameworkCount: items.length };
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: !!userId
  });

  // Check if user has access to both views (for toggle display)
  const hasBothAccess = hasAdminDashboardAccess && hasEmployeeDashboardAccess;
  
  // Route-based view determination
  const routeView = useMemo(() => {
    const employeeRoutes = ['/employee-dashboard', '/employee-attendance', '/employee-geotag-history', '/employee-holidays'];
    const employeeReportRoutes = ['/employee-reports/check-in-out', '/employee-reports/man-hours', '/employee-reports/attendance-register', '/employee-reports/attendance-log', '/employee-reports/attendance-exception', '/employee-reports/attendance-regularization'];
    const adminRoutes = ['/', '/admin-dashboard', '/roles', '/reports', '/configuration', '/attendance-framework', '/cutoff', '/geofencing', '/geotagging-configuration', '/workflow', '/history-migration', '/biometric-device-integration', '/modifications-approvals', '/roster-management', '/overtime-summary', '/attendance-for-payrun'];
    
    if (employeeRoutes.includes(location) || employeeReportRoutes.includes(location) || location.startsWith('/employee-reports/')) {
      return 'employee';
    }
    if (adminRoutes.includes(location) || location.startsWith('/reports/')) {
      return 'admin';
    }
    return null;
  }, [location]);
  
  // Effective view: routeView takes precedence, then selectedView
  const effectiveView = useMemo(() => {
    if (isLoading) {
      return null; // Return null during loading to prevent flicker
    }
    
    // If user has both access types, use route-aware logic
    if (hasBothAccess) {
      return routeView || selectedView;
    }
    
    // If user has only one access type, show that view
    if (hasAdminDashboardAccess) {
      return 'admin';
    } else if (hasEmployeeDashboardAccess) {
      return 'employee';
    } else {
      return 'minimal';
    }
  }, [isLoading, hasBothAccess, routeView, selectedView, hasAdminDashboardAccess, hasEmployeeDashboardAccess]);
  
  // Handle view switching
  const handleViewToggle = (newView: 'admin' | 'employee') => {
    setSelectedView(newView);
    localStorage.setItem('sidebar-selected-view', newView);
    
    // Navigate to default route if current route is not compatible with target view
    const employeeRoutes = ['/employee-dashboard', '/employee-attendance', '/employee-geotag-history', '/employee-holidays'];
    const isCurrentRouteEmployee = employeeRoutes.includes(location) || location.startsWith('/employee-reports/');
    const isCurrentRouteAdmin = !isCurrentRouteEmployee;
    
    if (newView === 'employee' && isCurrentRouteAdmin) {
      navigate('/employee-dashboard');
    } else if (newView === 'admin' && isCurrentRouteEmployee) {
      navigate('/admin-dashboard');
    }
  };

  // Permission string to MenuKey mapping
  const permissionToMenuKey: Record<string, MenuKey> = {
    "Dashboard": "dashboard",
    "Employee Dashboard": "employee_dashboard",
    "Mark Attendance": "mark_attendance", 
    "Optional Holidays": "optional_holidays",
    "Employee Reports": "employee_reports", // Employee-side reports
    "Reports": "reports", // Admin-side reports
    "Compliance Reports": "compliance_reports",
    "Modifications & Approvals": "modifications_approvals",
    "Roster Management": "roster_management",
    "Overtime Summary": "overtime_summary",
    "Attendance For Payrun": "attendance_for_payrun",
    "Attendance Configuration": "attendance_configuration",
    "Attendance Framework": "attendance_framework",
    "Attendance Cut Off": "attendance_cut_off",
    "IP Whitelisted Configuration": "ip_whitelisted_configuration",
    "Geo-Fence Configuration": "geo_fence_configuration",
    "Geotagging Configuration": "geotagging_configuration",
    "Roles": "roles",
    "Workflow": "workflow", 
    "History Migration": "history_migration",
    "Biometric Device Integration": "biometric_device_integration",
    "Users": "users"
  };

  // Check if user has view permission for a menu item
  const canViewMenuItem = (permissionKey: string): boolean => {
    const menuKey = permissionToMenuKey[permissionKey];
    if (!menuKey) {
      console.warn(`No MenuKey mapping found for permission: ${permissionKey}`);
      return false;
    }
    return hasPermission(menuKey, 'view');
  };

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  // Admin navigation items (Team Dashboard)
  const adminNavigationItems = [
    {
      href: "/admin-dashboard",
      icon: LayoutDashboard,
      label: "Team Dashboard",
      permission: "Dashboard"
    }
  ].filter(item => canViewMenuItem(item.permission));

  // Get orgId and token for API calls
  const orgId = parsedOrgAuth?.orgId ?? parsedOrgAuth?.org_id;
  const token = parsedOrgAuth?.token;

  // First: Check user table for firstName via /api/employee-details
  const { data: employeeDetailsData } = useQuery<{
    success: boolean;
    data: { firstName?: string; first_name?: string };
  }>({
    queryKey: ['/api/employee-details-sidebar', orgId],
    queryFn: async () => {
      if (!token) throw new Error('Authentication token not found');
      if (!orgId) throw new Error('Organization ID not found');

      const params = new URLSearchParams({ orgId: String(orgId) });
      const url = `/api/employee-details?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch employee details: ${response.status}`);
      }

      const json = await response.json();
      if (!json?.success || !json?.data) {
        throw new Error('Invalid employee details response');
      }

      return json;
    },
    enabled: !!(token && orgId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });

  // Second: If firstName not found, get from profile API employer_name
  const firstNameFromUserTable = employeeDetailsData?.data?.firstName || employeeDetailsData?.data?.first_name || null;
  const employerName = firstNameFromUserTable ? null : ((organizationProfile as any)?.data?.employer_name || (organizationProfile as any)?.employer_name || '');
  const firstNameFromProfile = employerName ? employerName.split(' ')[0] : null;
  const firstName = firstNameFromUserTable || firstNameFromProfile;

  // Employee navigation items
  const employeeNavigationItems = [
    {
      href: "/employee-dashboard",
      icon: User,
      label: "My Dashboard",
      permission: "Employee Dashboard"
    }
  ].filter(item => canViewMenuItem(item.permission));

  // Employee-specific navigation items
  const employeeItems = [
    {
      href: "/employee-attendance",
      icon: Clock,
      label: "Mark Attendance", 
      permission: "Mark Attendance"
    },
    // Only show Geotag Attendance if user has geotag access
    ...(geotagAccessData?.hasAccess ? [{
      href: "/employee-geotag",
      icon: NavigationIcon,
      label: "Geotag Attendance",
      permission: "Mark Attendance"
    }] : []),
    {
      href: "/employee-holidays",
      icon: Calendar,
      label: "Holiday Management",
      permission: "Optional Holidays"  
    }
  ].filter(item => canViewMenuItem(item.permission));

  const processItems = [
    {
      href: "/modifications-approvals",
      icon: UserCheck,
      label: "Modifications & Approvals",
      permission: "Modifications & Approvals"
    },
    {
      href: "/roster-management", 
      icon: Calendar,
      label: "Roster Management",
      permission: "Roster Management"
    },
    {
      href: "/overtime-summary",
      icon: Clock,
      label: "Overtime Summary",
      permission: "Overtime Summary"
    },
    {
      href: "/attendance-for-payrun",
      icon: FileChartColumn,
      label: "Attendance for Payrun",
      permission: "Attendance For Payrun"
    }
  ].filter(item => canViewMenuItem(item.permission));

  const setupItems = [
    {
      href: "/configuration",
      icon: Settings,
      label: "Attendance Configuration",
      permission: "Attendance Configuration"
    },
    {
      href: "/attendance-framework",
      icon: Building2,
      label: "Attendance Framework",
      permission: "Attendance Framework"
    },
    {
      href: "/cutoff",
      icon: Calendar,
      label: "Attendance Cut-Off",
      permission: "Attendance Cut Off"
    },
    {
      href: "/ip-whitelist",
      icon: Shield,
      label: "IP Whitelisted Configuration",
      permission: "IP Whitelisted Configuration"
    },
    {
      href: "/geofencing",
      icon: MapPin,
      label: "Geo Fence Configuration",
      permission: "Geo-Fence Configuration"
    },
    {
      href: "/geotagging-configuration",
      icon: MapPin,
      label: "Geotagging Configuration",
      permission: "Geotagging Configuration"
    },
    {
      href: "/roles",
      icon: Users,
      label: "Roles",
      permission: "Roles"
    },
    {
      href: "/workflow", 
      icon: Activity,
      label: "Workflow",
      permission: "Workflow"
    },
    {
      href: "/history-migration",
      icon: FileChartColumn,
      label: "History Migration",
      permission: "History Migration"
    },
    {
      href: "/biometric-device-integration",
      icon: Fingerprint,
      label: "Biometric Device Integration",
      permission: "Biometric Device Integration"
    },
    {
      href: "/users",
      icon: Users,
      label: "Users",
      permission: "Users"
    }
  ].filter(item => canViewMenuItem(item.permission));

  const reportItems = [
    {
      href: "/reports/check-in-out",
      icon: Clock,
      label: "Check In / Check Out",
      permission: "Reports"
    },
    {
      href: "/reports/man-hours",
      icon: Clock,
      label: "Man Hours",
      permission: "Reports"
    },
    {
      href: "/reports/month-wise-capacity",
      icon: Clock,
      label: "Month-wise Capacity",
      permission: "Reports"
    },
    {
      href: "/reports/attendance-register",
      icon: Users,
      label: "Attendance Register",
      permission: "Reports"
    },
    {
      href: "/reports/attendance-log",
      icon: Clock,
      label: "Attendance Log",
      permission: "Reports"
    },
    {
      href: "/reports/attendance-control",
      icon: Clock,
      label: "Attendance Control",
      permission: "Reports"
    },
    {
      href: "/reports/attendance-exception",
      icon: Activity,
      label: "Attendance Exception",
      permission: "Reports"
    },
    {
      href: "/reports/modification-attendance",
      icon: FileCheck,
      label: "Attendance Regularisations",
      permission: "Reports"
    },
    {
      href: "/reports/work-schedule-changes",
      icon: Clock,
      label: "Work Schedule Changes",
      permission: "Reports"
    },
    // {
    //   href: "/reports/geotagging",
    //   icon: MapPin,
    //   label: "Geotagging",
    //   permission: "Reports"
    // },
    {
      href: "/reports/distance-covered",
      icon: Route,
      label: "Distance Covered",
      permission: "Reports"
    }
  ].filter(item => canViewMenuItem(item.permission));

  // Employee reports items
  const employeeReportsItems = [
    {
      href: "/employee-reports/check-in-out",
      icon: Clock,
      label: "Clock in / Clock out",
      permission: "Employee Reports"
    },
    {
      href: "/employee-reports/man-hours",
      icon: Clock,
      label: "Man Hours",
      permission: "Employee Reports"
    },
    {
      href: "/employee-reports/distance-covered",
      icon: Route,
      label: "Distance Covered",
      permission: "Employee Reports"
    },
    {
      href: "/employee-reports/attendance-register",
      icon: Users,
      label: "Attendance Register",
      permission: "Employee Reports"
    },
    {
      href: "/employee-reports/attendance-log",
      icon: Clock,
      label: "Attendance Log",
      permission: "Employee Reports"
    },
    {
      href: "/employee-reports/attendance-exception",
      icon: Activity,
      label: "Attendance Exception",
      permission: "Employee Reports"
    },
    {
      href: "/employee-reports/attendance-regularization",
      icon: FileCheck,
      label: "Attendance Regularization",
      permission: "Employee Reports"
    }
  ].filter(item => canViewMenuItem(item.permission));

  // Compliance Reports items (muster-roll reports) - role-based access
  const complianceReportItems = [
    {
      href: "/reports/muster-roll-cum-wage-register",
      icon: Users,
      label: "Muster Roll cum Wage Register",
      permission: "Compliance Reports"
    },
    {
      href: "/reports/muster-roll-with-wages",
      icon: Users,
      label: "Muster Roll with Wages",
      permission: "Compliance Reports"
    }
  ].filter(item => canViewMenuItem(item.permission));

  // Auto-expand logic based on current route
  const shouldExpandSections = useMemo(() => {
    const isInProcesses = processItems.some(item => location === item.href);
    const isInSetup = setupItems.some(item => location === item.href);
    const isInReports = reportItems.some(item => location.startsWith('/reports'));
    const isInComplianceReports = complianceReportItems.some(item => location.startsWith(item.href));
    const isInEmployeeReports = employeeReportsItems.some(item => location.startsWith('/employee-reports'));
    
    return {
      processes: isInProcesses,
      setup: isInSetup,
      reports: isInReports,
      complianceReports: isInComplianceReports,
      employeeReports: isInEmployeeReports
    };
  }, [location, processItems, setupItems, reportItems, complianceReportItems, employeeReportsItems]);

  // Update expanded states based on current route (but respect manual user interactions)
  useEffect(() => {
    if (!manuallyExpandedSections.has('processes')) {
      setIsProcessesExpanded(shouldExpandSections.processes);
    }
    if (!manuallyExpandedSections.has('setup')) {
      setIsSetupExpanded(shouldExpandSections.setup);
    }
    if (!manuallyExpandedSections.has('reports')) {
      setIsReportsExpanded(shouldExpandSections.reports);
    }
    if (!manuallyExpandedSections.has('complianceReports')) {
      setIsComplianceReportsExpanded(shouldExpandSections.complianceReports);
    }
    if (!manuallyExpandedSections.has('employeeReports')) {
      setIsEmployeeReportsExpanded(shouldExpandSections.employeeReports);
    }
  }, [shouldExpandSections, manuallyExpandedSections]);

  const handleLinkClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
        <div className="p-4 flex-shrink-0 lg:block hidden">
          <div className="mb-6">
            {isDemoUser && demoMode ? (
              /* Demo Client branding for user_id 1 when Demo Mode is ON */
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="h-16 w-16 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
                  DC
                </div>
                <div className="text-sm font-medium text-center text-gray-700">Demo Client</div>
              </div>
            ) : isOrgLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-48 mx-auto" />
                <Skeleton className="h-4 w-32 mx-auto" />
              </div>
            ) : organizationProfile?.organization_logo ? (
              <div className="flex flex-col items-center justify-center space-y-2">
                <img 
                  src={organizationProfile.organization_logo} 
                  alt={organizationProfile.organization_name || 'Organization Logo'}
                  className="h-16 w-auto max-w-48 object-contain"
                  onLoad={() => {}}
                  onError={(e) => {
                    console.error('❌ Logo failed to load:', e);
                    console.error('❌ Logo URL:', organizationProfile.organization_logo);
                  }}
                />
                {organizationProfile.organization_name && (
                  <div className={cn(
                    "text-sm font-medium text-center max-w-48",
                    isNgo ? "text-gray-700" : "text-gray-700"
                  )}>
                    {organizationProfile.organization_name}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500">
                No logo available
                <br />
                <span className="text-xs text-gray-400">
                  Profile: {organizationProfile ? 'Loaded' : 'Not loaded'}
                </span>
              </div>
            )}
          </div>
          {/* Demo Mode toggle - only for user_id 1 */}
          {isDemoUser && (
            <>
              <div className="border-t border-gray-200 my-4" />
              <div className="flex items-center justify-between">
                <span className="text-sm  text-gray-700">Demo Mode</span>
                <Switch
                  checked={demoMode}
                  onCheckedChange={setDemoMode}
                  aria-label="Toggle demo mode"
                  className="data-[state=checked]:bg-blue-600"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          
          <nav className="space-y-2">
            {/* Admin View - shown when effectiveView is admin */}
            {effectiveView === 'admin' && (
              <>
                {adminNavigationItems.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = location === item.href;
                  
                  return (
                    <Link 
                      key={item.href} 
                      href={item.href} 
                      className={cn(
                        "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm group",
                        isActive 
                          ? (isNgo ? "bg-[#FB9745]" : "bg-[#4F8EF7] text-white")
                          : isNgo 
                            ? "bg-white text-gray-600 border border-transparent rounded-lg hover:border-[#FB9745] hover:text-black hover:bg-white" 
                            : "text-gray-600 hover:bg-gray-200"
                      )}
                      onClick={handleLinkClick}
                    >
                      <IconComponent className={cn(
                        "h-4 w-4 transition-colors duration-200", 
                        isActive 
                          ? (isNgo ? "text-white" : "")
                          : isNgo 
                            ? "text-gray-600" 
                            : ""
                      )} />
                      <span className={cn(
                        isActive 
                          ? (isNgo ? "!text-gray-900" : "")
                          : isNgo ? "text-gray-600" : ""
                      )}>{item.label}</span>
                    </Link>
                  );
                })}
              </>
            )}

            {/* Employee View - shown when effectiveView is employee */}
            {effectiveView === 'employee' && (
              <>
                {employeeNavigationItems.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = location === item.href;
                  
                  return (
                    <Link 
                      key={item.href} 
                      href={item.href} 
                      className={cn(
                        "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm group",
                        isActive 
                          ? (isNgo ? "bg-[#FB9745]" : "bg-[#4F8EF7] text-white")
                          : isNgo 
                            ? "bg-white text-gray-600 border border-transparent rounded-lg hover:border-[#FB9745] hover:text-black hover:bg-white" 
                            : "text-gray-600 hover:bg-gray-200"
                      )}
                      onClick={handleLinkClick}
                    >
                      <IconComponent className={cn(
                        "h-4 w-4 transition-colors duration-200", 
                        isActive 
                          ? (isNgo ? "text-white" : "")
                          : isNgo 
                            ? "text-gray-600" 
                            : ""
                      )} />
                      <span className={cn(
                        isActive 
                          ? (isNgo ? "!text-gray-900" : "")
                          : isNgo ? "text-gray-600" : ""
                      )}>{item.label}</span>
                    </Link>
                  );
                })}

                {/* Employee-specific items */}
                {employeeItems.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = location === item.href;
                  
                  return (
                    <Link 
                      key={item.href} 
                      href={item.href} 
                      className={cn(
                        "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm group",
                        isActive 
                          ? (isNgo ? "bg-[#FB9745]" : "bg-[#4F8EF7] text-white")
                          : isNgo 
                            ? "bg-white text-gray-600 border border-transparent rounded-lg hover:border-[#FB9745] hover:text-black hover:bg-white" 
                            : "text-gray-600 hover:bg-gray-200"
                      )}
                      onClick={handleLinkClick}
                    >
                      <IconComponent className={cn(
                        "h-4 w-4 transition-colors duration-200", 
                        isActive 
                          ? (isNgo ? "text-white" : "")
                          : isNgo 
                            ? "text-gray-600" 
                            : ""
                      )} />
                      <span className={cn(
                        isActive 
                          ? (isNgo ? "!text-gray-900" : "")
                          : isNgo ? "text-gray-600" : ""
                      )}>{item.label}</span>
                    </Link>
                  );
                })}

                {/* Employee Reports Section - Only show if user has permission */}
                {canViewMenuItem("Employee Reports") && employeeReportsItems.length > 0 && (
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        const newExpanded = !isEmployeeReportsExpanded;
                        setIsEmployeeReportsExpanded(newExpanded);
                        // Mark as manually interacted to prevent auto-override
                        setManuallyExpandedSections(prev => new Set(prev).add('employeeReports'));
                      }}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2 text-left text-sm transition-colors duration-200",
                        isNgo 
                          ? "bg-white text-gray-600 border border-transparent rounded-lg hover:border-[#FB9745] hover:text-black hover:bg-white" 
                          : "text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <BarChart3 className={cn(
                          "h-4 w-4", 
                          isNgo ? "text-gray-600" : ""
                        )} />
                        <span>Employee Reports</span>
                      </div>
                      {isEmployeeReportsExpanded ? (
                        <ChevronDown className={cn(
                          "h-4 w-4", 
                          isNgo ? "text-gray-600" : ""
                        )} />
                      ) : (
                        <ChevronRight className={cn(
                          "h-4 w-4", 
                          isNgo ? "text-gray-600" : ""
                        )} />
                      )}
                    </button>
                    
                    {isEmployeeReportsExpanded && (
                      <div className="ml-6 space-y-1">
                        {employeeReportsItems.map((item) => {
                          const IconComponent = item.icon;
                          const isActive = location.startsWith(item.href);
                          
                          return (
                            <Link 
                              key={item.href} 
                              href={item.href} 
                              className={cn(
                                "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm group",
                                isActive 
                                  ? (isNgo ? "bg-[#FB9745]" : "bg-[#4F8EF7] text-white")
                                  : isNgo 
                                    ? "bg-white text-gray-600 border border-transparent hover:border-[#FB9745] hover:text-black hover:bg-white" 
                                    : "text-gray-600 hover:bg-gray-200"
                              )}
                              onClick={handleLinkClick}
                            >
                              <IconComponent className={cn(
                                "h-4 w-4 transition-colors duration-200", 
                                isActive 
                                  ? (isNgo ? "text-white" : "")
                                  : isNgo 
                                    ? "text-gray-600" 
                                    : ""
                              )} />
                              <span className={cn(
                                isActive 
                                  ? (isNgo ? "!text-gray-900" : "")
                                  : isNgo ? "text-gray-600" : ""
                              )}>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Admin-only sections - Process, Setup, Reports, Compliance Reports */}
            {effectiveView === 'admin' && (
              <>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      const newExpanded = !isProcessesExpanded;
                      setIsProcessesExpanded(newExpanded);
                      // Mark as manually interacted to prevent auto-override
                      setManuallyExpandedSections(prev => new Set(prev).add('processes'));
                    }}
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2 text-left text-sm transition-colors duration-200 group",
                      isNgo 
                        ? "bg-white text-gray-600 border border-transparent rounded-lg hover:border-[#FB9745] hover:text-black hover:bg-white" 
                        : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <Activity className={cn(
                        "h-4 w-4", 
                        isNgo ? "text-gray-600" : ""
                      )} />
                      <span>Processes</span>
                    </div>
                    {isProcessesExpanded ? (
                      <ChevronDown className={cn(
                        "h-4 w-4", 
                        isNgo ? "text-gray-600" : ""
                      )} />
                    ) : (
                      <ChevronRight className={cn(
                        "h-4 w-4", 
                        isNgo ? "text-gray-600" : ""
                      )} />
                    )}
                  </button>
                  
                  {isProcessesExpanded && (
                    <div className="ml-6 space-y-1">
                      {processItems.map((item) => {
                        const IconComponent = item.icon;
                        const isActive = location === item.href;
                        
                        return (
                          <Link 
                            key={item.href} 
                            href={item.href} 
                            className={cn(
                              "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm group",
                              isActive 
                                ? (isNgo ? "bg-[#FB9745]" : "bg-[#4F8EF7] text-white")
                                : isNgo 
                                  ? "bg-white text-gray-600 border border-transparent hover:border-[#FB9745] hover:text-black hover:bg-white" 
                                  : "text-gray-600 hover:bg-gray-200"
                            )}
                            onClick={handleLinkClick}
                          >
                            <IconComponent className={cn(
                              "h-4 w-4 transition-colors duration-200", 
                              isActive 
                                ? (isNgo ? "text-white" : "")
                                : isNgo 
                                  ? "text-gray-600" 
                                  : ""
                            )} />
                            <span className={cn(
                              isActive 
                                ? (isNgo ? "!text-gray-900" : "")
                                : isNgo ? "text-gray-600" : ""
                            )}>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <button
                    onClick={() => {
                      const newExpanded = !isSetupExpanded;
                      setIsSetupExpanded(newExpanded);
                      // Mark as manually interacted to prevent auto-override
                      setManuallyExpandedSections(prev => new Set(prev).add('setup'));
                    }}
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2 text-left text-sm transition-colors duration-200 group",
                      isNgo 
                        ? "bg-white text-gray-600 border border-transparent rounded-lg hover:border-[#FB9745] hover:text-black hover:bg-white" 
                        : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <Settings className={cn(
                        "h-4 w-4", 
                        isNgo ? "text-gray-600" : ""
                      )} />
                      <span>Setup</span>
                    </div>
                    {isSetupExpanded ? (
                      <ChevronDown className={cn(
                        "h-4 w-4", 
                        isNgo ? "text-gray-600" : ""
                      )} />
                    ) : (
                      <ChevronRight className={cn(
                        "h-4 w-4", 
                        isNgo ? "text-gray-600" : ""
                      )} />
                    )}
                  </button>
                  
                  {isSetupExpanded && (
                    <div className="ml-6 space-y-1">
                      {setupItems.map((item) => {
                        const IconComponent = item.icon;
                        const isActive = location === item.href;
                        
                        return (
                          <Link 
                            key={item.href} 
                            href={item.href} 
                            className={cn(
                              "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm group",
                              isActive 
                                ? (isNgo ? "bg-[#FB9745]" : "bg-[#4F8EF7] text-white")
                                : isNgo 
                                  ? "bg-white text-gray-600 border border-transparent hover:border-[#FB9745] hover:text-black hover:bg-white" 
                                  : "text-gray-600 hover:bg-gray-200"
                            )}
                            onClick={handleLinkClick}
                          >
                            <IconComponent className={cn(
                              "h-4 w-4 transition-colors duration-200", 
                              isActive 
                                ? (isNgo ? "text-white" : "")
                                : isNgo 
                                  ? "text-gray-600" 
                                  : ""
                            )} />
                            <span className={cn(
                              isActive 
                                ? (isNgo ? "!text-gray-900" : "")
                                : isNgo ? "text-gray-600" : ""
                            )}>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Reports Section */}
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      const newExpanded = !isReportsExpanded;
                      setIsReportsExpanded(newExpanded);
                      // Mark as manually interacted to prevent auto-override
                      setManuallyExpandedSections(prev => new Set(prev).add('reports'));
                    }}
                    className={cn(
                      "flex items-center justify-between w-full px-3 py-2 text-left text-sm transition-colors duration-200 group",
                      isNgo 
                        ? "bg-white text-gray-600 border border-transparent rounded-lg hover:border-[#FB9745] hover:text-black hover:bg-white" 
                        : "text-gray-600 hover:text-gray-800"
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <BarChart3 className={cn(
                        "h-4 w-4", 
                        isNgo ? "text-gray-600" : ""
                      )} />
                      <span>Reports</span>
                    </div>
                    {isReportsExpanded ? (
                      <ChevronDown className={cn(
                        "h-4 w-4", 
                        isNgo ? "text-gray-600" : ""
                      )} />
                    ) : (
                      <ChevronRight className={cn(
                        "h-4 w-4", 
                        isNgo ? "text-gray-600" : ""
                      )} />
                    )}
                  </button>
                  
                  {isReportsExpanded && (
                    <div className="ml-6 space-y-1">
                      {reportItems.map((item) => {
                        const IconComponent = item.icon;
                        const isActive = location.startsWith(item.href);
                        
                        return (
                          <Link 
                            key={item.href} 
                            href={item.href} 
                            className={cn(
                              "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm group",
                              isActive 
                                ? (isNgo ? "bg-[#FB9745]" : "bg-[#4F8EF7] text-white")
                                : isNgo 
                                  ? "bg-white text-gray-600 border border-transparent hover:border-[#FB9745] hover:text-black hover:bg-white" 
                                  : "text-gray-600 hover:bg-gray-200"
                            )}
                            onClick={handleLinkClick}
                          >
                            <IconComponent className={cn(
                              "h-4 w-4 transition-colors duration-200", 
                              isActive 
                                ? (isNgo ? "text-white" : "")
                                : isNgo 
                                  ? "text-gray-600" 
                                  : ""
                            )} />
                            <span className={cn(
                              isActive 
                                ? (isNgo ? "!text-gray-900" : "")
                                : isNgo ? "text-gray-600" : ""
                            )}>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Compliance Reports Section - role-based access */}
                {canViewMenuItem("Compliance Reports") && complianceReportItems.length > 0 && (
                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        const newExpanded = !isComplianceReportsExpanded;
                        setIsComplianceReportsExpanded(newExpanded);
                        setManuallyExpandedSections(prev => new Set(prev).add('complianceReports'));
                      }}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2 text-left text-sm transition-colors duration-200 group",
                        isNgo 
                          ? "bg-white text-gray-600 border border-transparent rounded-lg hover:border-[#FB9745] hover:text-black hover:bg-white" 
                          : "text-gray-600 hover:text-gray-800"
                      )}
                    >
                      <div className="flex items-center space-x-3">
                        <FileCheck className={cn(
                          "h-4 w-4", 
                          isNgo ? "text-gray-600" : ""
                        )} />
                        <span>Compliance Reports</span>
                      </div>
                      {isComplianceReportsExpanded ? (
                        <ChevronDown className={cn(
                          "h-4 w-4", 
                          isNgo ? "text-gray-600" : ""
                        )} />
                      ) : (
                        <ChevronRight className={cn(
                          "h-4 w-4", 
                          isNgo ? "text-gray-600" : ""
                        )} />
                      )}
                    </button>
                    
                    {isComplianceReportsExpanded && (
                      <div className="ml-6 space-y-1">
                        {complianceReportItems.map((item) => {
                          const IconComponent = item.icon;
                          const isActive = location.startsWith(item.href);
                          
                          return (
                            <Link 
                              key={item.href} 
                              href={item.href} 
                              className={cn(
                                "flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm group",
                                isActive 
                                  ? (isNgo ? "bg-[#FB9745]" : "bg-[#4F8EF7] text-white")
                                  : isNgo 
                                    ? "bg-white text-gray-600 border border-transparent hover:border-[#FB9745] hover:text-black hover:bg-white" 
                                    : "text-gray-600 hover:bg-gray-200"
                              )}
                              onClick={handleLinkClick}
                            >
                              <IconComponent className={cn(
                                "h-4 w-4 transition-colors duration-200", 
                                isActive 
                                  ? (isNgo ? "text-white" : "")
                                  : isNgo 
                                    ? "text-gray-600" 
                                    : ""
                              )} />
                              <span className={cn(
                                isActive 
                                  ? (isNgo ? "!text-gray-900" : "")
                                  : isNgo ? "text-gray-600" : ""
                              )}>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </nav>
        </div>
        
        {/* Loading view - show loading placeholder during permission loading */}
        {effectiveView === null && (
          <div className="px-4 py-6 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        )}
        
        {/* Minimal view for users without dashboard access - show nothing */}
        {effectiveView === 'minimal' && (
          <div className="px-4 py-6 text-center">
            <div className="text-gray-500 text-sm">
              <p>No dashboard access</p>
              <p className="text-xs mt-1">Contact your administrator for permissions</p>
            </div>
          </div>
        )}
        
        {/* View Toggle Button - only show if user has both access types */}
        {hasBothAccess && effectiveView !== null && (
          <div className="mt-auto p-4 border-t border-gray-200 flex-shrink-0">
            <div className="p-2 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-center space-x-1">
                <Button
                  variant={effectiveView === 'admin' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    "flex-1 text-xs",
                    effectiveView === 'admin' 
                      ? (isNgo ? 'bg-[#FB9745] hover:bg-[#FB9745]' : 'bg-[#4F8EF7] text-white hover:bg-[#4F8EF7]')
                      : isNgo ? 'text-gray-600 border-gray-300 hover:bg-gray-100' : 'text-gray-600 border-gray-300 hover:bg-gray-100'
                  )}
                  onClick={() => handleViewToggle('admin')}
                  data-testid="button-toggle-admin-view"
                >
                      <LayoutDashboard className={cn(
                        "h-3 w-3 mr-1", 
                        effectiveView === 'admin' && isNgo ? "text-white" : effectiveView !== 'admin' && isNgo ? "text-gray-600" : ""
                      )} />
                  <span className={cn(
                    effectiveView === 'admin' 
                      ? (isNgo ? "text-gray-900" : "")
                      : ""
                  )}>Team</span>
                </Button>
                <Button
                  variant={effectiveView === 'employee' ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    "flex-1 text-xs",
                    effectiveView === 'employee' 
                      ? (isNgo ? 'bg-[#FB9745] hover:bg-[#FB9745]' : 'bg-[#4F8EF7] text-white hover:bg-[#4F8EF7]')
                      : isNgo ? 'text-gray-600 border-gray-300 hover:bg-gray-100' : 'text-gray-600 border-gray-300 hover:bg-gray-100'
                  )}
                  onClick={() => handleViewToggle('employee')}
                  data-testid="button-toggle-employee-view"
                >
                      <User className={cn(
                        "h-3 w-3 mr-1", 
                        effectiveView === 'employee' && isNgo ? "text-white" : effectiveView !== 'employee' && isNgo ? "text-gray-600" : ""
                      )} />
                  <span className={cn(
                    effectiveView === 'employee' 
                      ? (isNgo ? "text-gray-900" : "")
                      : ""
                  )}>My View</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </aside>
  );
}

export default Sidebar;