import { Bell, Settings, User, Moon, Sun, Menu, Play, Loader2 } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { startAgents } from "@/api";

interface AppHeaderProps {
  title?: string;
  breadcrumbs?: string[];
}

export function AppHeader({ title = "Dashboard", breadcrumbs = [] }: AppHeaderProps) {
  const [isDark, setIsDark] = useState(true);
  const [isStartingAgents, setIsStartingAgents] = useState(false);
  const [agentsRunning, setAgentsRunning] = useState(false);
  const { toggleSidebar } = useSidebar();

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("light");
  };

  const handleStartAgents = async () => {
    try {
      setIsStartingAgents(true);
      const response = await startAgents();
      console.log("Agents started successfully:", response);
      setAgentsRunning(true);
      // You can add additional success handling here, like showing a toast notification
    } catch (error) {
      console.error("Failed to start agents:", error);
      // You can add error handling here, like showing an error toast notification
    } finally {
      setIsStartingAgents(false);
    }
  };

  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center justify-between h-full px-6">
        {/* Title and Breadcrumbs */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{title}</h1>
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>/</span>
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="text-sm">
                  {crumb}
                  {index < breadcrumbs.length - 1 && <span className="ml-2">/</span>}
                </span>
              ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Start Agents Button */}
          <Button
            onClick={handleStartAgents}
            disabled={isStartingAgents || agentsRunning}
            size="sm"
            className={`mr-4 ${
              agentsRunning 
                ? "bg-green-600 hover:bg-green-700 text-white" 
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            } disabled:opacity-50`}
          >
            {isStartingAgents ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : agentsRunning ? (
              <>
                <div className="w-2 h-2 bg-green-300 rounded-full mr-2 animate-pulse" />
                Agents Running
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Agents
              </>
            )}
          </Button>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-4 w-4" />
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs"
                >
                  3
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <div className="p-2">
                <h4 className="font-medium mb-2">Recent Alerts</h4>
                <div className="space-y-2">
                  <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-destructive rounded-full" />
                      <span className="text-sm font-medium">Windows Service Failed</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Print Spooler service failed to start - remediation applied
                    </p>
                  </div>
                  <div className="p-2 rounded bg-warning/10 border border-warning/20">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-warning rounded-full" />
                      <span className="text-sm font-medium">High Log Volume</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Kubernetes cluster generating 10k+ logs/min
                    </p>
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}