import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Terminal, 
  Play, 
  Pause, 
  Trash2, 
  Copy,
  Download,
  ArrowLeft,
  Activity,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface LiveAction {
  id: string;
  timestamp: string;
  agent: "ErrorAnalyzer" | "FixerAgent" | "MonitorAgent" | "LogForwarder";
  dataSource: "Windows" | "Snowflake" | "EKS" | "Linux" | "macOS";
  actionType: "error_detected" | "analysis_complete" | "remediation_applied" | "logs_forwarded";
  status: "success" | "failed" | "in_progress";
  details: string;
  incidentId: string;
  isNew?: boolean;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "ERROR" | "WARNING" | "DEBUG";
  agent: string;
  message: string;
  source?: string;
}

const dataSourceIcons = {
  Windows: <img src="https://icon-library.com/images/icon-windows/icon-windows-16.jpg" alt="Windows" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
  Snowflake: <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
  EKS: <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
  Linux: <img src="https://tse2.mm.bing.net/th/id/OIP.uPU6a6Tyqd520jmJABytaAHaHa?rs=1&pid=ImgDetMain&o=7&rm=3" alt="Linux" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
  macOS: <img src="https://www.pinclipart.com/picdir/big/236-2364339_macos-icon-clipart.png" alt="macOS" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
};

const agentIcons = {
  ErrorAnalyzer: <img src="https://img.icons8.com/?size=100&id=10829&format=png" alt="ErrorAnalyzer" className="w-4 h-4 rounded-md border border-gray-200 p-0.5 bg-white shadow-sm" />,
  FixerAgent: <img src="https://img.icons8.com/?size=100&id=10449&format=png" alt="FixerAgent" className="w-4 h-4 rounded-md border border-gray-200 p-0.5 bg-white shadow-sm" />,
  MonitorAgent: <img src="https://img.icons8.com/?size=100&id=10383&format=png" alt="MonitorAgent" className="w-4 h-4 rounded-md border border-gray-200 p-0.5 bg-white shadow-sm" />,
  LogForwarder: <img src="https://img.icons8.com/?size=100&id=10451&format=png" alt="LogForwarder" className="w-4 h-4 rounded-md border border-gray-200 p-0.5 bg-white shadow-sm" />
};

const agentColors = {
  ErrorAnalyzer: "text-agent-error bg-agent-error/10",
  FixerAgent: "text-agent-fixer bg-agent-fixer/10",
  MonitorAgent: "text-agent-monitor bg-agent-monitor/10",
  LogForwarder: "text-agent-forwarder bg-agent-forwarder/10"
};

const levelConfig = {
  INFO: { color: "text-primary", bg: "bg-primary/10" },
  ERROR: { color: "text-destructive", bg: "bg-destructive/10" },
  WARNING: { color: "text-warning", bg: "bg-warning/10" },
  DEBUG: { color: "text-muted-foreground", bg: "bg-muted/10" }
};

// Mock data generators
const generateMockAction = (): LiveAction => {
  const agents: LiveAction["agent"][] = ["ErrorAnalyzer", "FixerAgent", "MonitorAgent", "LogForwarder"];
  const sources: LiveAction["dataSource"][] = ["Windows", "Snowflake", "EKS", "Linux", "macOS"];
  const types: LiveAction["actionType"][] = ["error_detected", "analysis_complete", "remediation_applied", "logs_forwarded"];
  const statuses: LiveAction["status"][] = ["success", "failed", "in_progress"];
  
  const actions = [
    "Windows Event ID 7003 detected - Print Spooler service failed",
    "Root cause identified: Invalid service dependency 'FakeService'",
    "Applying remediation: sc config Spooler depend= RPCSS",
    "Successfully restarted Print Spooler service",
    "Snowflake query timeout detected: QID SF-4A3B7",
    "Performance optimization recommended for analytics query",
    "Kubernetes pod restart loop detected: webapp-deployment-xyz",
    "Memory limit increased from 2GB to 4GB",
    "Log forwarding batch completed: 1,247 entries processed",
    "Connection health check passed for all data sources"
  ];

  return {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    agent: agents[Math.floor(Math.random() * agents.length)],
    dataSource: sources[Math.floor(Math.random() * sources.length)],
    actionType: types[Math.floor(Math.random() * types.length)],
    status: statuses[Math.floor(Math.random() * statuses.length)],
    details: actions[Math.floor(Math.random() * actions.length)],
    incidentId: `INC-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    isNew: true
  };
};

const generateMockLog = (): LogEntry => {
  const agents = ["ErrorAnalyzer", "FixerAgent", "MonitorAgent", "LogForwarder"];
  const levels: LogEntry["level"][] = ["INFO", "ERROR", "WARNING", "DEBUG"];
  const messages = [
    "Processing Windows Event Log entries",
    "Detected service failure: Print Spooler",
    "Applying remediation: sc config Spooler depend= RPCSS",
    "Successfully restarted Print Spooler service",
    "Monitoring Kubernetes pod health",
    "High CPU usage detected in pod webapp-123",
    "Forwarding 1,247 log entries to central storage",
    "Snowflake query optimization suggested",
    "Connection established to data source",
    "Batch processing completed: 5,632 events",
    "Failed to execute command: insufficient privileges",
    "Retrying connection to Snowflake endpoint",
    "Memory usage threshold exceeded: 85%",
    "Log rotation completed successfully"
  ];

  return {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString().slice(11, 19),
    level: levels[Math.floor(Math.random() * levels.length)],
    agent: agents[Math.floor(Math.random() * agents.length)],
    message: messages[Math.floor(Math.random() * messages.length)],
    source: Math.random() > 0.5 ? ["Windows", "Snowflake", "EKS", "Linux", "macOS"][Math.floor(Math.random() * 5)] : undefined
  };
};

export default function RealTimeMonitoring() {
  const [liveActions, setLiveActions] = useState<LiveAction[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const actionsScrollRef = useRef<HTMLDivElement>(null);
  const logsScrollRef = useRef<HTMLDivElement>(null);

  // Simulate real-time data streaming
  useEffect(() => {
    if (!isRunning) return;

    const actionsInterval = setInterval(() => {
      const newAction = generateMockAction();
      setLiveActions(prev => {
        const updated = [newAction, ...prev].slice(0, 100); // Keep only last 100 actions
        setTimeout(() => {
          setLiveActions(current => 
            current.map(action => 
              action.id === newAction.id ? { ...action, isNew: false } : action
            )
          );
        }, 3000);
        return updated;
      });
    }, 3000);

    const logsInterval = setInterval(() => {
      const newLog = generateMockLog();
      setLogs(prev => [...prev, newLog].slice(-1000)); // Keep only last 1000 logs
    }, 1500);

    return () => {
      clearInterval(actionsInterval);
      clearInterval(logsInterval);
    };
  }, [isRunning]);

  // Auto-scroll for actions
  useEffect(() => {
    if (autoScroll && actionsScrollRef.current) {
      const scrollContainer = actionsScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = 0; // Scroll to top for actions (newest first)
      }
    }
  }, [liveActions, autoScroll]);

  // Auto-scroll for logs
  useEffect(() => {
    if (autoScroll && logsScrollRef.current) {
      const scrollContainer = logsScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight; // Scroll to bottom for logs
      }
    }
  }, [logs, autoScroll]);

  const clearActions = () => setLiveActions([]);
  const clearLogs = () => setLogs([]);

  const copyLogs = () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] [${log.level}] [${log.agent}] ${log.message}`
    ).join('\n');
    navigator.clipboard.writeText(logText);
  };

  return (
    <AppLayout title="Real-Time Monitoring" breadcrumbs={["Monitoring", "Real-Time"]}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/agents">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Agents
              </Button>
            </Link>
            <div>
              <h2 className="text-2xl font-bold">Real-Time Monitoring</h2>
              <p className="text-muted-foreground">
                Live agent actions and console output across all data sources
              </p>
            </div>
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
              Copy Logs
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button
              variant={autoScroll ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
            >
              Auto-scroll: {autoScroll ? "ON" : "OFF"}
            </Button>
          </div>
        </div>

        {/* Two Horizontal Splits */}
        <div className="grid grid-rows-2 gap-4 h-[800px]">
          {/* Top Half: Live Agent Actions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Live Agent Actions
                </CardTitle>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex items-center gap-2",
                    isRunning ? "text-success" : "text-muted-foreground"
                  )}>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      isRunning ? "bg-success animate-pulse" : "bg-muted-foreground"
                    )} />
                    <span className="text-sm font-medium">
                      {isRunning ? "Live" : "Paused"}
                    </span>
                  </div>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-sm text-muted-foreground">
                    {liveActions.length} actions
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearActions}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea ref={actionsScrollRef} className="h-[350px]">
                <div className="p-4 space-y-3">
                  {liveActions.map((action) => (
                    <div 
                      key={action.id} 
                      className={cn(
                        "flex gap-3 p-3 rounded-lg border transition-all",
                        action.isNew ? "animate-slide-in border-primary bg-primary/5" : "bg-muted/30 border-border",
                        action.status === "success" ? "border-l-4 border-l-success" :
                        action.status === "failed" ? "border-l-4 border-l-destructive" :
                        action.status === "in_progress" ? "border-l-4 border-l-primary" : ""
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{dataSourceIcons[action.dataSource]}</span>
                        <div className={cn("p-1.5 rounded", agentColors[action.agent])}>
                          {agentIcons[action.agent]}
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{action.agent}</span>
                            <Badge variant="outline" className="text-xs">
                              {action.actionType.replace('_', ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {action.timestamp}
                            </span>
                            {action.isNew && (
                              <Badge variant="secondary" className="text-xs animate-pulse">
                                NEW
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {action.status === "success" && <CheckCircle className="h-4 w-4 text-success" />}
                            {action.status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
                            {action.status === "in_progress" && <Activity className="h-4 w-4 text-primary animate-spin" />}
                          </div>
                        </div>
                        <p className="text-sm">{action.details}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Incident: {action.incidentId}</span>
                          <span>•</span>
                          <span>{action.dataSource}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {liveActions.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No live actions available</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Bottom Half: Console Output */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Console Output
                </CardTitle>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {logs.length} entries
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearLogs}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea ref={logsScrollRef} className="h-[350px] font-mono text-sm">
                <div className="p-4 space-y-1">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 hover:bg-muted/30 p-1 rounded group">
                      <span className="text-muted-foreground text-xs min-w-[60px] font-mono">
                        {log.timestamp}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs min-w-[60px] justify-center font-mono",
                          levelConfig[log.level].bg,
                          levelConfig[log.level].color
                        )}
                      >
                        {log.level}
                      </Badge>
                      <Badge variant="outline" className="text-xs min-w-[100px] justify-center font-mono">
                        {log.agent}
                      </Badge>
                      <span className="flex-1 font-mono">{log.message}</span>
                      {log.source && (
                        <Badge variant="secondary" className="text-xs font-mono">
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
                  {logs.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No console output available</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}