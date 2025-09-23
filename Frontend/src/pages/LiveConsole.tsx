// LiveConsole.tsx
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Terminal, 
  Play, 
  Pause, 
  Trash2, 
  Search,
  Filter,
  Copy,
  Download
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { connectWebSocket } from "@/api";

// Interface for LogEntry
interface LogEntry {
  id: string;
  timestamp: string;
  level: string;
  agent: string;
  message: string;
  source?: string;
}

const levelConfig = {
  INFO: { color: "text-primary", bg: "bg-primary/10" },
  ERROR: { color: "text-destructive", bg: "bg-destructive/10" },
  WARNING: { color: "text-warning", bg: "bg-warning/10" },
  DEBUG: { color: "text-muted-foreground", bg: "bg-muted/10" }
};

export default function LiveConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set(["INFO", "ERROR", "WARNING", "DEBUG"]));
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket connection for real-time logs
  useEffect(() => {
    const ws = connectWebSocket(
      (message) => {
        if (!isRunning) return;
        const logEntry: LogEntry = {
          id: message.id || `id-${Date.now()}-${Math.random()}`, // Fallback ID
          timestamp: message.timestamp,
          level: message.level,
          agent: message.agent,
          message: message.message,
          source: message.source
        };
        setLogs(prev => {
          const updated = [...prev, logEntry];
          return updated.slice(-1000); // Keep last 1000 logs
        });
      },
      (error) => {
        console.error("WebSocket error:", error);
      }
    );

    wsRef.current = ws;

    return () => {
      wsRef.current?.close();
    };
  }, [isRunning]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.agent.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLevel = selectedLevels.has(log.level);
    const matchesAgent = selectedAgent === "all" || log.agent === selectedAgent;
    return matchesSearch && matchesLevel && matchesAgent;
  });

  const toggleLevel = (level: string) => {
    const newSelected = new Set(selectedLevels);
    if (newSelected.has(level)) {
      newSelected.delete(level);
    } else {
      newSelected.add(level);
    }
    setSelectedLevels(newSelected);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const copyLogs = () => {
    const logText = filteredLogs.map(log => 
      `[${log.timestamp}] [${log.level}] [${log.agent}] ${log.message}`
    ).join('\n');
    navigator.clipboard.writeText(logText);
  };

  // Get unique agents for filter
  const uniqueAgents = Array.from(new Set(logs.map(log => log.agent)));

  return (
    <AppLayout title="Live Console" breadcrumbs={["Monitoring"]}>
      <div className="space-y-4">
        {/* Header Controls */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Live Console</h2>
            <p className="text-muted-foreground">
              Real-time log streaming from all agents
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={isRunning ? "default" : "outline"}
              size="sm"
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {isRunning ? "Pause" : "Resume"}
            </Button>
            <Button variant="outline" size="sm" onClick={copyLogs}>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={clearLogs}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filters */}
              <div className="flex items-center gap-4 flex-wrap">
                {/* Log Levels */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Levels:</span>
                  {Object.keys(levelConfig).map((level) => (
                    <Button
                      key={level}
                      variant={selectedLevels.has(level) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleLevel(level)}
                      className={cn(
                        "text-xs",
                        selectedLevels.has(level) && levelConfig[level as keyof typeof levelConfig].color
                      )}
                    >
                      {level}
                    </Button>
                  ))}
                </div>

                {/* Agent Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Agent:</span>
                  {["all", ...uniqueAgents].map((agent) => (
                    <Button
                      key={agent}
                      variant={selectedAgent === agent ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedAgent(agent)}
                      className="text-xs capitalize"
                    >
                      {agent === "all" ? "All" : agent}
                    </Button>
                  ))}
                </div>

                {/* Auto-scroll toggle */}
                <div className="flex items-center gap-2 ml-auto">
                  <Button
                    variant={autoScroll ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAutoScroll(!autoScroll)}
                    className="text-xs"
                  >
                    Auto-scroll: {autoScroll ? "ON" : "OFF"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Console */}
        <Card className="h-[600px]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Console Output
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isRunning ? "bg-success animate-pulse-subtle" : "bg-muted-foreground"
                )} />
                <span className="text-sm text-muted-foreground">
                  {filteredLogs.length} entries
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea ref={scrollAreaRef} className="h-[520px] font-mono text-sm">
              <div className="p-4 space-y-1">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 hover:bg-muted/30 p-1 rounded group">
                    <span className="text-muted-foreground text-xs min-w-[60px]">
                      {log.timestamp}
                    </span>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs min-w-[70px] justify-center",
                        levelConfig[log.level]?.bg || "bg-muted/10",
                        levelConfig[log.level]?.color || "text-muted-foreground"
                      )}
                    >
                      {log.level}
                    </Badge>
                    <Badge variant="outline" className="text-xs min-w-[100px] justify-center">
                      {log.agent}
                    </Badge>
                    <span className="flex-1">{log.message}</span>
                    {log.source && (
                      <Badge variant="secondary" className="text-xs">
                        {log.source}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0"
                      onClick={() => navigator.clipboard.writeText(`[${log.timestamp}] [${log.level}] [${log.agent}] ${log.message}`)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                
                {filteredLogs.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No logs match your current filters</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}