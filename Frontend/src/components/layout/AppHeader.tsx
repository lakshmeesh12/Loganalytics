import {
  Bell,
  Settings,
  User,      // <-- User icon is already here, no need for Hand
  Moon,
  Sun,
  Menu,
  Play,
  Loader2,
  Sparkles,
} from "lucide-react";
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
import { motion } from "framer-motion";
import { startAgents } from "@/api";

interface AppHeaderProps {
  title?: string;
  breadcrumbs?: string[];
}

export function AppHeader({ title = "Dashboard", breadcrumbs = [] }: AppHeaderProps) {
  const [isDark, setIsDark] = useState(true);
  const [isStartingAgents, setIsStartingAgents] = useState(false);
  const [agentsRunning, setAgentsRunning] = useState(false);
  const [mode, setMode] = useState<'semi-autonomous' | 'autonomous'>('semi-autonomous');
  const { toggleSidebar } = useSidebar();

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("light");
  };

  const handleStartAgents = async () => {
    try {
      setIsStartingAgents(true);
      const response = await startAgents(mode);
      console.log(`Agents started successfully in ${mode} mode:`, response);
      setAgentsRunning(true);
    } catch (error) {
      console.error(`Failed to start agents in ${mode} mode:`, error);
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
        <div className="flex items-center gap-4">
          {/* ✨ UPDATED: Mode Selector with higher contrast and new icon ✨ */}
          <div className="relative flex w-[160px] items-center rounded-full bg-muted p-1">
            <motion.div
              className="absolute z-0 h-7 w-[75px] rounded-full bg-primary" // <-- UPDATED: High-contrast background
              layout
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              animate={{ x: mode === 'semi-autonomous' ? 2 : 81 }}
            />
            {/* Manual Button */}
            <button
              onClick={() => setMode('semi-autonomous')}
              className={`relative z-10 flex w-1/2 items-center justify-center gap-1.5 rounded-full p-1.5 text-xs font-semibold transition-colors ${
                mode === 'semi-autonomous'
                  ? 'text-primary-foreground' // <-- UPDATED: Text color for selected state
                  : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              <User className="h-3.5 w-3.5" /> {/* <-- UPDATED: Icon changed to User */}
              Manual
            </button>
            {/* Auto Button */}
            <button
              onClick={() => setMode('autonomous')}
              className={`relative z-10 flex w-1/2 items-center justify-center gap-1.5 rounded-full p-1.5 text-xs font-semibold transition-colors ${
                mode === 'autonomous'
                  ? 'text-primary-foreground' // <-- UPDATED: Text color for selected state
                  : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              Auto
            </button>
          </div>

          {/* ✨ UPDATED: Start Agents Button with dynamic text ✨ */}
          <Button
            onClick={handleStartAgents}
            disabled={isStartingAgents || agentsRunning}
            size="sm"
            className={`w-[155px] transition-all duration-200 ${ // Increased width to fit longer text
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
                {/* <-- UPDATED: Text syncs with selected mode --> */}
                {mode === 'semi-autonomous' ? 'Start Manually' : 'Start Automatically'}
              </>
            )}
          </Button>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground h-8 w-8"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-8 w-8">
                <Bell className="h-4 w-4" />
                <Badge
                  variant="destructive"
                  className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] justify-center"
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
              <Button variant="ghost" size="icon" className="h-8 w-8">
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