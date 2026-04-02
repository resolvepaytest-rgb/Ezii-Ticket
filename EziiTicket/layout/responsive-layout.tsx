import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeaderRibbon } from "./header-ribbon";
import { ProductNav } from "./product-nav";
import Sidebar from "./sidebar";

interface ResponsiveLayoutProps {
  children: React.ReactNode;
}

export function ResponsiveLayout({ children }: ResponsiveLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 flex-col">
      {/* Header Ribbon - Full width spanning entire top */}
      <HeaderRibbon title="Attendance Management" />
      
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-gray-200">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-gray-800">Attendance</h1>
        <div className="w-8"></div> {/* Spacer for centering */}
      </div>
      
      {/* Content area with product nav, sidebar and main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Product Navigation - Hidden on mobile */}
        <div className="hidden lg:block">
          <ProductNav />
        </div>
        
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div 
              className="absolute inset-0 bg-black bg-opacity-50"
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-80 max-w-[80vw] bg-white">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="h-6"></div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="h-full overflow-y-auto">
                <Sidebar onNavigate={() => setIsSidebarOpen(false)} />
              </div>
            </div>
          </div>
        )}
        
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}