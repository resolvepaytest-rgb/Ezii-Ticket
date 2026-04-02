import { IndianRupee, FileText, Calendar, Wallet, Loader2, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import { useClientProducts } from "@/contexts/ClientProductsContext";

type ProductNavItem = {
  icon: typeof IndianRupee;
  label: string;
  active: boolean;
  redirect?:
    | { type: "direct"; url: string }
    | { type: "token"; baseUrl: string };
};

const allProductNavItems: ProductNavItem[] = [
  {
    icon: Building2,
    label: "Core Master",
    active: false,
    redirect: {
      type: "direct",
      url: "https://qa.resolveindia.com/company-setup-for-customer",
    },
  },
  {
    icon: IndianRupee,
    label: "Payroll",
    active: false,
    redirect: {
      type: "direct",
      url: "https://qa.resolveindia.com/dashboard/worker-dashboard/worker-dashboard",
    },
  },
  { icon: FileText, label: "Attendance", active: true },
  {
    icon: Calendar,
    label: "Leave",
    active: false,
    redirect: { type: "token", baseUrl: "https://qa-eziileave.resolveindia.com" },
  },
  {
    icon: Wallet,
    label: "Expense",
    active: false,
    redirect: { type: "token", baseUrl: "https://qa-expense.resolveindia.com" },
  },
];

export function ProductNav() {
  const [switchingProduct, setSwitchingProduct] = useState<string | null>(null);
  const { clientProducts, isLoading: isLoadingProducts } = useClientProducts();

  useEffect(() => {
    setSwitchingProduct(null);
  }, []);

  // Filter products based on client access - only show products with true access
  const getFilteredProducts = (): ProductNavItem[] => {
    if (!clientProducts) {
      // Default: show only Attendance while loading or if API fails
      return allProductNavItems.filter((item) => item.label === "Attendance");
    }

    const filtered: ProductNavItem[] = [];

    // Only show Core Master if isCore is true
    if (clientProducts.isCore === true) {
      const coreMaster = allProductNavItems.find((item) => item.label === "Core Master");
      if (coreMaster) filtered.push(coreMaster);
    }

    // Only show Payroll if isPayroll is true
    if (clientProducts.isPayroll === true) {
      const payroll = allProductNavItems.find((item) => item.label === "Payroll");
      if (payroll) filtered.push(payroll);
    }

    // Only show Attendance if isAttendance is true
    if (clientProducts.isAttendance === true) {
      const attendance = allProductNavItems.find((item) => item.label === "Attendance");
      if (attendance) filtered.push(attendance);
    }

    // Only show Leave if isLeave is true
    if (clientProducts.isLeave === true) {
      const leave = allProductNavItems.find((item) => item.label === "Leave");
      if (leave) filtered.push(leave);
    }

    // Only show Expense if isExpense is true
    if (clientProducts.isExpense === true) {
      const expense = allProductNavItems.find((item) => item.label === "Expense");
      if (expense) filtered.push(expense);
    }

    return filtered;
  };

  const productNavItems = getFilteredProducts();

  const handleProductClick = (item: ProductNavItem) => {
    if (!item.redirect) {
      return;
    }

    setSwitchingProduct(item.label);

    const timeoutId = window.setTimeout(() => {
      setSwitchingProduct(null);
    }, 5000);

    const clearSwitchingState = () => {
      clearTimeout(timeoutId);
      setSwitchingProduct(null);
    };

    if (item.redirect.type === "direct") {
      window.location.href = item.redirect.url;
      return;
    }

    try {
      const orgAuth = localStorage.getItem("orgAuth");
      if (!orgAuth) {
        clearSwitchingState();
        throw new Error("No orgAuth found in localStorage");
      }

      const authData = JSON.parse(orgAuth);
      const token = authData?.token;

      if (!token) {
        clearSwitchingState();
        throw new Error("No token found in orgAuth");
      }

      const redirectUrl = `${item.redirect.baseUrl}/id/${encodeURIComponent(token)}`;
      window.location.href = redirectUrl;
    } catch (error) {
      console.error("Error switching product:", error);
      clearSwitchingState();
    }
  };

  return (
    <TooltipProvider>
      <div className="w-24 bg-gray-900 min-h-screen flex flex-col items-center py-4 space-y-5">
       
        
        {/* Navigation Items */}
        {productNavItems.map((item) => {
          const Icon = item.icon;
          const isSwitching = switchingProduct === item.label;
          const isClickable = Boolean(item.redirect);
          // Show pointer cursor for Payroll and Attendance, or any item with redirect
          const showPointer = item.label === "Payroll" || item.label === "Attendance" || isClickable;
          
          return (
            <Tooltip key={item.label}>
              <TooltipTrigger asChild>
                <div 
                  className={cn(
                    "flex flex-col items-center transition-colors group w-full px-1",
                    showPointer ? "cursor-pointer" : "cursor-default"
                  )}
                  onClick={() => isClickable && !isSwitching && handleProductClick(item)}
                >
                  <div
                    className={cn(
                      "w-11 h-11 rounded-lg flex items-center justify-center transition-colors relative",
                      item.active 
                        ? (clientProducts?.is_ngo ? "bg-[#FB9745] text-white" : "bg-blue-600 text-white")
                        : "text-gray-400 hover:text-white hover:bg-gray-800",
                      isSwitching && "opacity-50"
                    )}
                  >
                    {isSwitching ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span className={cn(
                    "text-xs mt-1.5 text-center font-medium leading-tight",
                    item.active 
                      ? "text-white"
                      : "text-gray-400",
                    isSwitching && "opacity-50"
                  )}>
                    {isSwitching ? "Switching..." : item.label}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                <p>{item.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}