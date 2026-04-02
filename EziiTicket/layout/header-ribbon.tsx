import { Bell, BellRing, User, ChevronDown, Home, ArrowRight, Power, Search, Mail, IdCard, Briefcase, Calendar, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { getPlanStatus } from "@/lib/planStatusService";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useClientProducts } from "@/contexts/ClientProductsContext";
import { cn } from "@/lib/utils";
import { GlobalSearchModal } from "./global-search-modal";

interface HeaderRibbonProps {
  title?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

interface EmployeeData {
  employeeNumber: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  designation: string;
  dateOfJoining: string | null;
  date_of_joining?: string | null;
}

export function HeaderRibbon({ title = "Attendance Management", breadcrumbs = [] }: HeaderRibbonProps) {
  const [employeeNumber, setEmployeeNumber] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState<'unread' | 'all'>('unread');
  const [hasClickedNotification, setHasClickedNotification] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { notifications, unreadCount, isLoading: isNotificationsLoading, markAsRead, markAllAsRead } = useNotifications();

  const filteredNotifications = notificationTab === 'unread'
    ? notifications.filter((n) => !n.isRead)
    : notifications;
  const { orgAuth } = useAuth();
  const { isNgo } = useClientProducts();
  
  // Check if user is an employee
  const isEmployee = orgAuth?.roleName?.toLowerCase() === 'employee' || 
                     orgAuth?.role_name?.toLowerCase() === 'employee' ||
                     orgAuth?.attendance_role_name?.toLowerCase() === 'employee';
  
  // Check if we should show notifications in different style (3+ unread and no clicks)
  const shouldShowDifferentStyle = unreadCount >= 3 && !hasClickedNotification;
  
  // Mark all notifications as read when modal opens (like WhatsApp)
  // But only if user has clicked on a notification
  useEffect(() => {
    if (notificationOpen && unreadCount > 0 && !markAllAsRead.isPending && hasClickedNotification) {
      // Small delay to ensure modal is fully open before marking as read
      const timer = setTimeout(() => {
        markAllAsRead.mutate();
      }, 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationOpen, hasClickedNotification]); // Mark as read only if user has clicked a notification
  
  // Fetch plan status to determine which logo to display
  const { data: planStatus, isLoading: isPlanLoading } = useQuery({
    queryKey: ['plan-status'],
    queryFn: getPlanStatus,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1
  });

  // Get employee number from localStorage and subscribe to updates
  useEffect(() => {
    const updateEmployeeNumber = () => {
      const empNum = localStorage.getItem('employee_number');
      setEmployeeNumber(empNum);
    };

    updateEmployeeNumber();

    window.addEventListener('employee_number_updated', updateEmployeeNumber);
    window.addEventListener('storage', updateEmployeeNumber);

    return () => {
      window.removeEventListener('employee_number_updated', updateEmployeeNumber);
      window.removeEventListener('storage', updateEmployeeNumber);
    };
  }, []);

  // Fetch employee details from our backend (Users table). Works with or without employee_number in localStorage.
  const orgId = orgAuth?.orgId ?? (typeof window !== 'undefined' ? (() => {
    try {
      const a = localStorage.getItem('orgAuth');
      return a ? JSON.parse(a).orgId : null;
    } catch { return null; }
  })() : null);
  const token = orgAuth?.token ?? (typeof window !== 'undefined' ? (() => {
    try {
      const a = localStorage.getItem('orgAuth');
      return a ? JSON.parse(a).token : null;
    } catch { return null; }
  })() : null);

  const { data: employeeData, isLoading: isEmployeeLoading, error: employeeError } = useQuery<{
    success: boolean;
    data: EmployeeData;
  }>({
    queryKey: ['/api/employee-details', orgId, employeeNumber],
    queryFn: async () => {
      if (!token) throw new Error('Authentication token not found');
      if (!orgId) throw new Error('Organization ID not found');

      const params = new URLSearchParams({ orgId: String(orgId) });
      if (employeeNumber) params.set('employee_number', employeeNumber);
      const url = `/api/employee-details?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch employee details: ${response.status} - ${errorText}`);
      }

      const json = await response.json();
      if (!json?.success || !json?.data) {
        throw new Error('Invalid employee details response');
      }

      const d = json.data;
      return {
        success: true,
        data: {
          employeeNumber: d.employeeNumber ?? d.employee_number ?? employeeNumber ?? '',
          name: d.name ?? (d.firstName && d.lastName ? `${d.firstName} ${d.lastName}`.trim() : d.firstName ?? d.lastName ?? '') ?? 'User',
          firstName: d.firstName ?? d.first_name ?? '',
          lastName: d.lastName ?? d.last_name ?? '',
          email: d.email ?? '',
          department: d.department ?? '',
          designation: d.designation ?? d.designation_name ?? '',
          dateOfJoining: (d.dateOfJoining ?? d.date_of_joining ?? null) || null,
          date_of_joining: d.date_of_joining ?? d.dateOfJoining ?? null
        }
      };
    },
    enabled: !!(token && orgId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Keep localStorage in sync when we get employee number from API (e.g. when loaded by userId before useAuth set it)
  useEffect(() => {
    const fromApi = employeeData?.data?.employeeNumber;
    if (fromApi && typeof window !== 'undefined') {
      const current = localStorage.getItem('employee_number');
      if (current !== fromApi) {
        localStorage.setItem('employee_number', fromApi);
        window.dispatchEvent(new Event('employee_number_updated'));
      }
    }
  }, [employeeData?.data?.employeeNumber]);

  // Format date of joining as DD-MMM-YYYY (e.g. 25-Jan-2016)
  const formatDoJ = (value: string | null | undefined): string => {
    if (!value) return '—';
    try {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      const day = d.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return String(value);
    }
  };

  // Get initials from employee name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Get display name and initials (from Users table via /api/employee-details)
  const displayName = employeeData?.data?.name || (employeeError ? `Employee ${employeeNumber || orgAuth?.userId || ''}` : 'Loading...');
  const initials = employeeData?.data?.name ? getInitials(employeeData.data.name) : (employeeData?.data?.employeeNumber || employeeNumber || orgAuth?.userId ? String(employeeData?.data?.employeeNumber || employeeNumber || orgAuth?.userId).charAt(0).toUpperCase() : 'U');
  const empNumber = employeeData?.data?.employeeNumber || employeeNumber || '';

  // Show logout confirmation dialog
  const handleLogoutClick = () => {
    setShowLogoutDialog(true);
  };

  // Perform actual logout
  const performLogout = () => {
    // Clear specific localStorage items
    localStorage.removeItem('orgAuth');
    localStorage.removeItem('employee_number');
    localStorage.removeItem('attendance-filters-startDate');
    localStorage.removeItem('attendance-filters-endDate');
    localStorage.removeItem('sidebar-selected-view');
    
    // Clear all employee_fetch_attempted_* keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('employee_fetch_attempted_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Redirect to login page (NGO: app.goodkarmaforngo.com)
    const loginUrl = isNgo ? "https://app.goodkarmaforngo.com/login" : "https://qa.resolveindia.com/login";
    window.location.href = loginUrl;
  };

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 w-full">
      {/* Left Section - Dynamic Logo and Breadcrumbs */}
      <div className="flex items-center space-x-4">
        {isPlanLoading ? (
          <div className="h-10 w-56 bg-gray-200 animate-pulse rounded"></div>
        ) : isNgo ? (
          <img 
            src="/assets/attendance-ngo-logo.svg" 
            alt="Attendance Logo"
            className="h-10 w-auto max-w-56 object-contain"
            onLoad={() => {}}
            onError={(e) => {
              console.error('❌ NGO Attendance logo failed to load:', e);
              console.error('❌ Logo URL:', '/assets/attendance-ngo-logo.svg');
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : planStatus?.isSaaS ? (
          <img 
            src="/assets/eziiattendance-logo.svg" 
            alt="EziiAttendance Logo"
            className="h-10 w-auto max-w-56 object-contain"
            onLoad={() => {}}
            onError={(e) => {
              console.error('❌ EziiAttendance logo failed to load:', e);
              console.error('❌ Logo URL:', '/assets/eziiattendance-logo.svg');
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <img 
            src="/assets/attendance-logo.svg" 
            alt="Attendance Logo"
            className="h-10 w-auto max-w-56 object-contain"
            onLoad={() => {}}
            onError={(e) => {
              console.error('❌ Attendance logo failed to load:', e);
              console.error('❌ Logo URL:', '/assets/attendance-logo.svg');
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        
        {breadcrumbs.length > 0 && (
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Home className="w-4 h-4" />
            {breadcrumbs.map((breadcrumb, index) => (
              <div key={index} className="flex items-center space-x-2">
                <ArrowRight className="w-3 h-3" />
                <span className={index === breadcrumbs.length - 1 ? "text-gray-900 font-medium" : ""}>
                  {breadcrumb.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Section - User Actions */}
      <div className="flex items-center space-x-4">
        {/* Global Search */}
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-700 dark:text-gray-300"
          onClick={() => setSearchOpen(true)}
          title="Search"
        >
          <Search className="w-8 h-8" />
        </Button>
        <GlobalSearchModal open={searchOpen} onOpenChange={setSearchOpen} />

        {/* Notifications */}
        <Popover open={notificationOpen} onOpenChange={(open) => {
          setNotificationOpen(open);
          if (!open) {
            setHasClickedNotification(false);
          }
        }}>
          <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className={`relative ${notificationOpen ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
            >
              {unreadCount > 0 ? (
                <BellRing className={`w-8 h-8 ${notificationOpen ? (isNgo ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400') : 'text-gray-700 dark:text-gray-300'}`} />
              ) : (
                <Bell className={`w-8 h-8 ${notificationOpen ? (isNgo ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400') : 'text-gray-700 dark:text-gray-300'}`} />
              )}
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-semibold px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[450px] p-0" align="end">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    markAllAsRead.mutate();
                    setHasClickedNotification(true);
                  }}
                  disabled={markAllAsRead.isPending}
                  className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  {markAllAsRead.isPending ? 'Marking...' : 'Mark all read'}
                </Button>
              )}
            </div>
            {/* Unread / All tabs */}
            <div className="flex border-b">
              <button
                type="button"
                onClick={() => setNotificationTab('unread')}
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition-colors",
                  notificationTab === 'unread'
                    ? isNgo
                      ? "text-amber-600 dark:text-amber-500 border-b-2 border-amber-600 dark:border-amber-500"
                      : "text-blue-600 dark:text-blue-500 border-b-2 border-blue-600 dark:border-blue-500"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                )}
              >
                Unread
              </button>
              <button
                type="button"
                onClick={() => setNotificationTab('all')}
                className={cn(
                  "flex-1 py-3 text-sm font-medium transition-colors",
                  notificationTab === 'all'
                    ? isNgo
                      ? "text-amber-600 dark:text-amber-500 border-b-2 border-amber-600 dark:border-amber-500"
                      : "text-blue-600 dark:text-blue-500 border-b-2 border-blue-600 dark:border-blue-500"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                )}
              >
                All
              </button>
            </div>
            <ScrollArea className="h-96">
              {isNotificationsLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Loading notifications...
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                  <Bell className={cn("w-12 h-12 mb-4", isNgo ? "text-amber-500/80" : "text-blue-500/80")} strokeWidth={1.5} />
                  <p className="text-sm font-medium text-foreground">No notifications right now.</p>
                  <p className="text-xs text-muted-foreground mt-1">We&apos;ll let you know when there&apos;s something new.</p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredNotifications.map((notification) => {
                    // Determine if this notification should be shown in different style
                    const isUnread = !notification.isRead;
                    const showDifferentStyle = shouldShowDifferentStyle && isUnread;
                    
                    return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                        showDifferentStyle 
                          ? 'bg-yellow-50 dark:bg-yellow-950/30 border-l-4 border-yellow-500' 
                          : isUnread 
                            ? isNgo ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-blue-50 dark:bg-blue-950/20'
                            : ''
                      }`}
                      onClick={() => {
                        // Mark that user has clicked on a notification
                        if (!hasClickedNotification) {
                          setHasClickedNotification(true);
                        }
                        
                        // Mark this notification as read
                        if (isUnread) {
                          markAsRead.mutate(notification.id);
                        }
                        
                        // For employees, always redirect to employee dashboard
                        // For other roles, use the link from metadata
                        if (isEmployee) {
                          window.location.href = '/employee-dashboard';
                        } else if (notification.metadata?.link) {
                          window.location.href = notification.metadata.link;
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                              {notification.title}
                            </p>
                            {!notification.isRead && (
                              <div className={cn("w-2 h-2 rounded-full flex-shrink-0 mt-1", isNgo ? "bg-amber-500" : "bg-blue-500")} />
                            )}
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>


        {/* User Profile */}
        <DropdownMenu open={profileOpen} onOpenChange={setProfileOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="flex items-center space-x-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center",
                isNgo ? "bg-[#FB9745]" : "bg-blue-600"
              )}>
                <span className="text-white font-medium text-sm">{initials}</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {isEmployeeLoading ? 'Loading...' : `${displayName} (${empNumber})`}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[360px] p-0" sideOffset={8}>
            <div className="p-4">
              {/* Header: Avatar + Name + Role */}
              <div className="flex items-start gap-3 mb-4">
                <div className={cn(
                  "w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 relative",
                  isNgo ? "bg-[#FB9745]" : "bg-blue-600"
                )}>
                  <span className="text-white font-semibold text-lg">{initials}</span>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" title="Online" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-gray-900 truncate">
                    {isEmployeeLoading ? 'Loading...' : displayName}
                  </div>
                  {(orgAuth?.roleName || orgAuth?.attendance_role_name) && (
                    <div className={cn(
                      "inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-xs font-medium",
                      isNgo ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"
                    )}>
                      <Shield className="w-3.5 h-3.5" />
                      <span>{orgAuth?.roleName ?? orgAuth?.attendance_role_name}</span>
                    </div>
                  )}
                </div>
              </div>
              {/* Info rows */}
              <div className="space-y-2">
                {employeeData?.data?.email && (
                  <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                    <div className={cn("p-1.5 rounded", isNgo ? "bg-orange-100" : "bg-blue-100")}>
                      <Mail className={cn("w-4 h-4", isNgo ? "text-orange-600" : "text-blue-600")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Email</div>
                      <div className="text-sm font-medium text-gray-900 truncate">{employeeData.data.email}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                  <div className={cn("p-1.5 rounded", isNgo ? "bg-orange-100" : "bg-blue-100")}>
                    <IdCard className={cn("w-4 h-4", isNgo ? "text-orange-600" : "text-blue-600")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Employee ID</div>
                    <div className="text-sm font-medium text-gray-900">{empNumber || '—'}</div>
                  </div>
                </div>
                {employeeData?.data?.designation?.trim() && (
                  <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                    <div className={cn("p-1.5 rounded", isNgo ? "bg-orange-100" : "bg-blue-100")}>
                      <Briefcase className={cn("w-4 h-4", isNgo ? "text-orange-600" : "text-blue-600")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Position</div>
                      <div className="text-sm font-medium text-gray-900 truncate">{employeeData.data.designation}</div>
                    </div>
                  </div>
                )}
                {(employeeData?.data?.dateOfJoining ?? employeeData?.data?.date_of_joining) && (
                  <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                    <div className={cn("p-1.5 rounded", isNgo ? "bg-orange-100" : "bg-blue-100")}>
                      <Calendar className={cn("w-4 h-4", isNgo ? "text-orange-600" : "text-blue-600")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 font-medium">Date of Joining</div>
                      <div className="text-sm font-medium text-gray-900">
                        {formatDoJ(employeeData?.data?.dateOfJoining ?? employeeData?.data?.date_of_joining)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Sign Out */}
              <Button
                variant="outline"
                className="w-full mt-4 gap-2 rounded-full bg-white border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                onClick={() => {
                  setProfileOpen(false);
                  handleLogoutClick();
                }}
              >
                <Power className="w-4 h-4 text-red-600" />
                Sign Out
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Logout */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleLogoutClick}
          className="text-gray-600 hover:text-gray-900"
        >
          <Power className="w-6 h-6" />
        </Button>
      </div>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to logout? You will be redirected to the login page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowLogoutDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={performLogout} className="bg-red-600 hover:bg-red-700">
              Logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}