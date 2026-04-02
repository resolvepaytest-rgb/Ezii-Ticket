import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Menu } from "lucide-react";
import { useState } from "react";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const [selectedCompany, setSelectedCompany] = useState("default");

  return (
    <header className="bg-white dark:bg-card border-b border-border px-4 lg:px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 lg:space-x-4 min-w-0 flex-1">
          <Button variant="ghost" size="icon" className="lg:hidden shrink-0">
            <Menu className="h-5 w-5" />
          </Button>
          
          <div className="min-w-0 flex-1">
            <h1 className="text-lg lg:text-2xl font-bold text-foreground truncate">{title}</h1>
            {subtitle && (
              <p className="text-muted-foreground text-xs lg:text-sm mt-1 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2 lg:space-x-4 shrink-0">
          <div className="hidden sm:flex items-center space-x-2 text-sm text-muted-foreground">
            <span className="hidden md:inline">Switch To</span>
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="w-32 lg:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Company</SelectItem>
                <SelectItem value="branch">Branch Office</SelectItem>
                <SelectItem value="remote">Remote Division</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button variant="ghost" size="icon" className="relative shrink-0">
            <Bell className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full text-[10px] flex items-center justify-center text-destructive-foreground">
              3
            </span>
          </Button>
        </div>
      </div>
    </header>
  );
}
