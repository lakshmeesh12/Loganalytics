import {
  Bell,
  Settings,
  User,
  Moon,
  Sun,
  Menu,
  Play,
  Loader2,
  Sparkles,
  StopCircle,
  Shield,
  Wrench,
  Eye,
  Activity,
  ChevronDown,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { motion } from "framer-motion";
import { startAgents, stopAgents } from "@/api";
import { cn } from "@/lib/utils"; // Added for className utility

interface AppHeaderProps {
  title?: string;
  breadcrumbs?: string[];
}

export function AppHeader({ title = "Dashboard", breadcrumbs = [] }: AppHeaderProps) {
  const [isDark, setIsDark] = useState(true);
  const [isStartingAgents, setIsStartingAgents] = useState(false);
  const [isStoppingAgents, setIsStoppingAgents] = useState(false);
  const [agentsRunning, setAgentsRunning] = useState(false);
  const [mode, setMode] = useState<'semi-autonomous' | 'autonomous'>('semi-autonomous');
  const [selectedAgents, setSelectedAgents] = useState({
    LogForwarder: true,
    Monitor: true,
    ErrorAnalyzer: true,
    Fixer: true,
  });
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

  const handleStopAgents = async () => {
    try {
      setIsStoppingAgents(true);
      const response = await stopAgents();
      console.log("Agents stopped successfully:", response);
      setAgentsRunning(false);
    } catch (error) {
      console.error("Failed to stop agents:", error);
    } finally {
      setIsStoppingAgents(false);
    }
  };

  const handleAgentToggle = (agent: keyof typeof selectedAgents) => {
    setSelectedAgents((prev) => ({
      ...prev,
      [agent]: !prev[agent],
    }));
  };

  const agentIcons = {
    LogForwarder: Activity,
    Monitor: Eye,
    ErrorAnalyzer: Shield,
    Fixer: Wrench,
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
        <div className="flex items-center gap-3">
          {/* Mode Selector */}
          <div className="relative flex w-[140px] h-8 items-center rounded-full bg-muted p-1">
            <motion.div
              className="absolute z-0 h-6 w-[66px] rounded-full bg-primary"
              layout
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              animate={{ x: mode === 'semi-autonomous' ? 2 : 71 }}
            />
            {/* Human Button */}
            <button
              onClick={() => setMode('semi-autonomous')}
              className={`relative z-10 flex w-1/2 h-6 items-center justify-center gap-1 rounded-full text-xs font-medium transition-colors ${
                mode === 'semi-autonomous'
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              <User className="h-3 w-3" />
              Manual
            </button>
            {/* Agent Button */}
            <button
              onClick={() => setMode('autonomous')}
              className={`relative z-10 flex w-1/2 h-6 items-center justify-center gap-1 rounded-full text-xs font-medium transition-colors ${
                mode === 'autonomous'
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground/80'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              Auto
            </button>
          </div>

          {/* Start Agents Button with Dropdown */}
          <div className="relative flex items-center">
            <Button
              onClick={handleStartAgents}
              disabled={isStartingAgents || agentsRunning}
              size="sm"
              className={`w-[120px] h-8 text-xs font-medium transition-all duration-200 ${
                agentsRunning
                  ? "bg-green-600 hover:bg-green-700 text-white rounded-full"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground rounded-r-none"
              } disabled:opacity-50`}
            >
              {isStartingAgents ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Starting...
                </>
              ) : agentsRunning ? (
                <>
                  <div className="w-1.5 h-1.5 bg-green-300 rounded-full mr-1 animate-pulse" />
                  Agents Running
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  Start Agents
                </>
              )}
            </Button>
            {!agentsRunning && !isStartingAgents && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    className="w-6 h-8 rounded-l-none border-l-0 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[150px] p-1">
                  {Object.entries(selectedAgents).map(([agent, isSelected]) => {
                    const AgentIcon = agentIcons[agent as keyof typeof agentIcons];
                    return (
                      <DropdownMenuCheckboxItem
                        key={agent}
                        checked={isSelected}
                        onCheckedChange={() => handleAgentToggle(agent as keyof typeof selectedAgents)}
                        className={cn(
                          "text-xs flex items-center gap-2 p-1.5 rounded-sm",
                          isSelected ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground"
                        )}
                      >
                        <AgentIcon className="h-3 w-3" />
                        {agent}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Stop Agents Button */}
          <Button
            onClick={handleStopAgents}
            disabled={!agentsRunning || isStoppingAgents}
            size="sm"
            className="w-[120px] h-8 text-xs font-medium transition-all duration-200 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 rounded-full"
          >
            {isStoppingAgents ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <StopCircle className="h-3 w-3 mr-1" />
                Stop Agents
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