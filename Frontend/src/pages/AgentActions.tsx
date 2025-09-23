import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Filter, 
  Download, 
  Shield,
  Wrench,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Trash2,
  ChevronRight,
  Copy,
  RotateCcw,
  AlertTriangle,
  Monitor,
  GripVertical,
  AlertCircle,
  Mail
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { connectAgentActionsWebSocket } from "@/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AgentAction {
  id: string;
  timestamp: string;
  agent: "ErrorAnalyzer" | "FixerAgent" | "WindowsMonitor" | "SnowflakeMonitor" | "KubernetesMonitor" | "DatabricksMonitor" | "EmailAgent";
  actionType: "error_detected" | "analysis_complete" | "remediation_applied" | "logs_forwarded" | "email_sent" | "email_received" | "intent_analyzed";
  status: "success" | "failed" | "in_progress";
  details: string;
  commands?: string[];
  output?: string;
  errorOutput?: string;
}

interface IncidentCycle {
  id: string;
  incidentId: string;
  dataSource: "Windows" | "Snowflake" | "EKS" | "Linux" | "macOS" | "Databricks";
  timestamp: string;
  errorSummary: string;
  rootCause?: string;
  status: "completed" | "in_progress" | "failed" | "pending";
  agentCount: number;
  actions: AgentAction[];
  isLive?: boolean;
}

const dataSourceIcons = {
  Windows: "🖥️",
  Snowflake: "❄️", 
  EKS: "☸️",
  Linux: "🐧",
  macOS: "🍎",
  Databricks: "https://i.pinimg.com/736x/65/1d/d6/651dd6bdd503bd0aaba588b9e6439459.jpg"
};

const agentIcons = {
  ErrorAnalyzer: Shield,
  FixerAgent: Wrench,
  WindowsMonitor: Eye,
  SnowflakeMonitor: Eye,
  KubernetesMonitor: Eye,
  DatabricksMonitor: Eye,
  EmailAgent: Mail,
  default: AlertCircle
};

const agentColors = {
  ErrorAnalyzer: "text-agent-error bg-agent-error/10",
  FixerAgent: "text-agent-fixer bg-agent-fixer/10",
  WindowsMonitor: "text-agent-monitor bg-agent-monitor/10",
  SnowflakeMonitor: "text-agent-monitor bg-agent-monitor/10",
  KubernetesMonitor: "text-agent-monitor bg-agent-monitor/10",
  DatabricksMonitor: "text-agent-monitor bg-agent-monitor/10",
  EmailAgent: "text-blue-500 bg-blue-500/10",
  default: "text-muted-foreground bg-muted/10"
};

const statusConfig = {
  completed: { color: "text-success bg-success/10 border-success/20", icon: CheckCircle },
  in_progress: { color: "text-primary bg-primary/10 border-primary/20", icon: Activity },
  failed: { color: "text-destructive bg-destructive/10 border-destructive/20", icon: XCircle },
  pending: { color: "text-warning bg-warning/10 border-warning/20", icon: Clock }
};

export default function AgentActions() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [leftPaneWidth, setLeftPaneWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [incidents, setIncidents] = useState<IncidentCycle[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Load incidents from localStorage on mount
  useEffect(() => {
    const storedIncidents = localStorage.getItem('incidentCycles');
    if (storedIncidents) {
      setIncidents(JSON.parse(storedIncidents));
    }
  }, []);

  // Save incidents to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('incidentCycles', JSON.stringify(incidents));
  }, [incidents]);

  // Delete incident function
  const deleteIncident = useCallback((incidentId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIncidents(prevIncidents => {
      const updatedIncidents = prevIncidents.filter(incident => incident.id !== incidentId);
      
      // If the deleted incident was selected, clear the selection or select another one
      if (selectedIncident === incidentId) {
        setSelectedIncident(updatedIncidents.length > 0 ? updatedIncidents[0].id : null);
      }
      
      return updatedIncidents;
    });
  }, [selectedIncident]);

  // Map WebSocket message status to actionType
  const statusToActionType = (status: string): AgentAction["actionType"] => {
    switch (status.toLowerCase()) {
      case "error detected":
        return "error_detected";
      case "analysis complete":
        return "analysis_complete";
      case "remediation applied":
        return "remediation_applied";
      case "logs forwarded":
        return "logs_forwarded";
      case "email sent":
        return "email_sent";
      case "email received":
        return "email_received";
      case "intent analyzed":
        return "intent_analyzed";
      default:
        return "error_detected";
    }
  };

  // Map WebSocket message to dataSource
  const getDataSource = (details: string | undefined, agent: AgentAction["agent"]): IncidentCycle["dataSource"] => {
    if (!details || typeof details !== 'string') {
      return agent === "WindowsMonitor" ? "Windows" : 
             agent === "SnowflakeMonitor" ? "Snowflake" : 
             agent === "KubernetesMonitor" ? "EKS" : 
             agent === "DatabricksMonitor" ? "Databricks" :
             agent === "EmailAgent" ? "Windows" : "Windows";
    }
    if (agent === "WindowsMonitor" || details.includes("Windows") || details.includes("Print Spooler")) return "Windows";
    if (agent === "SnowflakeMonitor" || details.includes("Snowflake")) return "Snowflake";
    if (agent === "KubernetesMonitor" || details.includes("pod") || details.includes("OOMKilled")) return "EKS";
    if (agent === "DatabricksMonitor" || details.includes("Databricks") || details.includes("protected_table")) return "Databricks";
    if (details.includes("Linux")) return "Linux";
    if (details.includes("macOS") || details.includes("Mac")) return "macOS";
    return "Windows";
  };

  // Map WebSocket message to incident status
  const getIncidentStatus = (actions: AgentAction[]): IncidentCycle["status"] => {
    const lastAction = actions[actions.length - 1];
    if (lastAction.agent === "FixerAgent" && lastAction.actionType === "remediation_applied") {
      return "completed";
    } else if (lastAction.status === "failed") {
      return "failed";
    } else if (lastAction.status === "in_progress" || lastAction.actionType === "email_sent" || lastAction.actionType === "intent_analyzed") {
      return "in_progress";
    }
    return "pending";
  };

  // Extract error summary and root cause from details
  const parseDetails = (details: string | undefined, actionType: AgentAction["actionType"]): { errorSummary: string; rootCause?: string } => {
    if (!details || typeof details !== 'string') {
      return { errorSummary: "Unknown error", rootCause: undefined };
    }
    const lines = details.split("\n");
    let errorSummary = lines[0] || "Unknown error";
    let rootCause: string | undefined;

    if (actionType === "analysis_complete") {
      const rootCauseMatch = details.match(/Root cause identified: (.+)/i);
      rootCause = rootCauseMatch ? rootCauseMatch[1] : undefined;
      errorSummary = rootCause || errorSummary;
    } else if (actionType === "error_detected") {
      errorSummary = details.split("\n")[0] || "Error detected";
    } else if (actionType === "remediation_applied") {
      errorSummary = "Remediation applied";
    } else if (actionType === "email_sent") {
      errorSummary = "Email sent for approval";
    } else if (actionType === "email_received") {
      errorSummary = "Reply email received";
    } else if (actionType === "intent_analyzed") {
      errorSummary = "Reply analyzed";
    }

    return { errorSummary, rootCause };
  };

  // Extract commands from details
  const extractCommands = (details: string | undefined): string[] | undefined => {
    if (!details || typeof details !== 'string') {
      return undefined;
    }
    const commandsMatch = details.match(/Commands:\n(.+)/s);
    if (commandsMatch) {
      return commandsMatch[1].split("\n").filter(cmd => cmd.trim());
    }
    return undefined;
  };

  useEffect(() => {
    const ws = connectAgentActionsWebSocket(
      (message) => {
        setIncidents((prevIncidents) => {
          const existingIncident = prevIncidents.find(inc => inc.incidentId === message.reference);
          const actionId = `${message.reference}-${Date.now()}`;
          const actionType = statusToActionType(message.status);
          const dataSource = getDataSource(message.details, message.agent);
          const { errorSummary, rootCause } = parseDetails(message.details, actionType);
          const commands = extractCommands(message.details);

          const newAction: AgentAction = {
            id: actionId,
            timestamp: message.time || message.timestamp || new Date().toISOString().slice(11, 19),
            agent: message.agent,
            actionType,
            status: actionType === "remediation_applied" || actionType === "email_sent" || actionType === "intent_analyzed" ? "success" : "in_progress",
            details: message.details || "No details provided",
            commands,
            output: actionType === "error_detected" ? message.details : undefined,
            errorOutput: undefined
          };

          if (existingIncident) {
            const updatedActions = [...existingIncident.actions, newAction];
            const updatedIncident: IncidentCycle = {
              ...existingIncident,
              actions: updatedActions,
              status: getIncidentStatus(updatedActions),
              agentCount: new Set(updatedActions.map(a => a.agent)).size,
              rootCause: rootCause || existingIncident.rootCause,
              errorSummary: existingIncident.errorSummary || errorSummary,
              isLive: updatedActions.some(a => a.status === "in_progress" && actionType !== "remediation_applied")
            };
            return prevIncidents.map(inc =>
              inc.incidentId === message.reference ? updatedIncident : inc
            );
          } else {
            const newIncident: IncidentCycle = {
              id: message.reference,
              incidentId: message.reference,
              dataSource,
              timestamp: message.time || message.timestamp || new Date().toISOString().slice(11, 19),
              errorSummary,
              rootCause: actionType === "analysis_complete" ? rootCause : undefined,
              status: getIncidentStatus([newAction]),
              agentCount: 1,
              actions: [newAction],
              isLive: newAction.status === "in_progress" && actionType !== "remediation_applied"
            };
            return [newIncident, ...prevIncidents];
          }
        });

        if (!selectedIncident) {
          setSelectedIncident(message.reference);
        }
      },
      (error) => {
        console.error("WebSocket error:", error);
      }
    );

    wsRef.current = ws;

    return () => {
      wsRef.current?.close();
    };
  }, [selectedIncident]);

  const filteredIncidents = incidents.filter(incident => {
    const matchesSearch = incident.errorSummary.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         incident.incidentId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSource = selectedSource === "all" || incident.dataSource === selectedSource;
    const matchesStatus = selectedStatus === "all" || incident.status === selectedStatus;
    return matchesSearch && matchesSource && matchesStatus;
  });

  const selectedIncidentData = incidents.find(inc => inc.id === selectedIncident);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    const minWidth = 280;
    const maxWidth = 800;
    
    setLeftPaneWidth(Math.min(Math.max(newWidth, minWidth), maxWidth));
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
  };

  return (
    <AppLayout title="Agent Actions" breadcrumbs={["Monitoring", "Agent Actions"]}>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Agent Actions</h2>
            <p className="text-muted-foreground text-xs">
              Monitor and analyze automated remediation activities across all data sources
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/monitoring">
              <Button variant="default" size="sm" className="bg-primary hover:bg-primary/90 text-xs">
                <Monitor className="h-3 w-3 mr-1" />
                Real-Time Monitoring
              </Button>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs">
                  <Filter className="h-3 w-3 mr-1" />
                  Filters
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {["all", "Windows", "Snowflake", "EKS", "Linux", "macOS", "Databricks"].map((source) => (
                  <DropdownMenuItem
                    key={source}
                    onClick={() => setSelectedSource(source)}
                    className={cn(
                      "text-xs",
                      selectedSource === source ? "bg-primary/10" : ""
                    )}
                  >
                    {source === "all" ? "All Sources" : (
                      <>
                        {source === "Databricks" ? (
                          <img src={dataSourceIcons[source]} alt="Databricks" className="h-4 w-4 mr-1" />
                        ) : (
                          <span className="mr-1">{dataSourceIcons[source as keyof typeof dataSourceIcons]}</span>
                        )}
                        {source}
                      </>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" className="text-xs">
              <Download className="h-3 w-3 mr-1" />
              Export
            </Button>
          </div>
        </div>

        <div className="relative w-1/3">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search incidents, errors, or IDs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 text-xs h-8"
          />
        </div>

        <div 
          ref={containerRef}
          className="flex gap-0 h-[700px] border border-border rounded-lg overflow-hidden bg-card"
        >
          <div 
            className="flex flex-col border-r border-border bg-muted/30"
            style={{ width: leftPaneWidth }}
          >
            <div className="p-3 border-b border-border bg-card">
              <h3 className="font-semibold text-sm">Recent Activity Cycles</h3>
              <p className="text-xs text-muted-foreground">
                {filteredIncidents.length} incidents found
              </p>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {filteredIncidents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Activity className="h-6 w-6 text-muted-foreground mb-2" />
                    <h4 className="font-medium text-sm text-muted-foreground">No Incidents Found</h4>
                    <p className="text-xs text-muted-foreground">
                      Incident cycles will appear here when agent actions are detected
                    </p>
                  </div>
                ) : (
                  filteredIncidents.map((incident) => {
                    const StatusIcon = statusConfig[incident.status].icon;
                    const isSelected = selectedIncident === incident.id;
                    
                    return (
                      <Card 
                        key={incident.id}
                        className={cn(
                          "cursor-pointer transition-all hover:shadow-sm",
                          isSelected ? "border-primary shadow-sm bg-primary/5" : "hover:bg-muted/50"
                        )}
                        onClick={() => setSelectedIncident(incident.id)}
                      >
                        <CardContent className="p-2">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                {incident.dataSource === "Databricks" ? (
                                  <img src={dataSourceIcons[incident.dataSource]} alt="Databricks" className="h-4 w-4" />
                                ) : (
                                  <span className="text-base">{dataSourceIcons[incident.dataSource]}</span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {incident.timestamp}
                                </span>
                                {incident.isLive && (
                                  <Badge variant="secondary" className="text-xs">LIVE</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <StatusIcon className="h-3 w-3" />
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive"
                                  onClick={(e) => deleteIncident(incident.id, e)}
                                  title="Delete incident"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            
                            <div>
                              <h4 className="font-medium text-sm">{incident.errorSummary}</h4>
                              <p className="text-xs text-muted-foreground">
                                {incident.agentCount} agents • {incident.incidentId}
                              </p>
                            </div>
                            
                            <Badge 
                              className={cn("text-xs", statusConfig[incident.status].color)}
                              variant="outline"
                            >
                              {incident.status.replace('_', ' ')}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <div 
            className="w-1 bg-border hover:bg-border/80 cursor-col-resize flex items-center justify-center group"
            onMouseDown={handleMouseDown}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
          </div>

          <div className="flex-1 flex flex-col">
            {selectedIncidentData ? (
              <>
                <div className="p-3 border-b border-border bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {selectedIncidentData.dataSource === "Databricks" ? (
                        <img src={dataSourceIcons[selectedIncidentData.dataSource]} alt="Databricks" className="h-5 w-5" />
                      ) : (
                        <span className="text-lg">{dataSourceIcons[selectedIncidentData.dataSource]}</span>
                      )}
                      <div>
                        <h3 className="font-semibold text-sm">{selectedIncidentData.errorSummary}</h3>
                        <p className="text-xs text-muted-foreground">
                          {selectedIncidentData.incidentId} • {selectedIncidentData.timestamp}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedIncidentData.isLive && (
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                          <span className="text-xs text-success font-medium">Live</span>
                        </div>
                      )}
                      <Button variant="outline" size="sm" className="text-xs">
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    </div>
                  </div>
                  
                  {selectedIncidentData.rootCause && (
                    <div className="mt-2 p-2 bg-muted/50 rounded-lg">
                      <p className="text-xs">
                        <span className="font-medium text-warning">Root Cause:</span>{" "}
                        {selectedIncidentData.rootCause}
                      </p>
                    </div>
                  )}
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-3">
                    {selectedIncidentData.actions.map((action, index) => {
                      const AgentIcon = agentIcons[action.agent] || agentIcons.default;
                      const isLatest = index === selectedIncidentData.actions.length - 1 && 
                                      selectedIncidentData.isLive && 
                                      action.status === "in_progress";
                      
                      return (
                        <div key={action.id} className="relative">
                          {index < selectedIncidentData.actions.length - 1 && (
                            <div className="absolute left-5 top-10 w-px h-6 bg-border" />
                          )}
                          
                          <div className={cn(
                            "flex gap-2 p-2 rounded-lg border",
                            action.status === "success" ? "bg-success/5 border-success/20" :
                            action.status === "failed" ? "bg-destructive/5 border-destructive/20" :
                            "bg-muted/30 border-border"
                          )}>
                            <div className={cn(
                              "p-1.5 rounded-lg",
                              agentColors[action.agent] || agentColors.default
                            )}>
                              <AgentIcon className="h-3 w-3" />
                            </div>
                            
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  <span className="font-medium text-xs">{action.agent}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {action.actionType.replace('_', ' ')}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {action.timestamp}
                                  </span>
                                  {isLatest && (
                                    <Badge variant="secondary" className="text-xs animate-pulse">
                                      LATEST
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {action.status === "success" && <CheckCircle className="h-3 w-3 text-success" />}
                                  {action.status === "failed" && <XCircle className="h-3 w-3 text-destructive" />}
                                  {action.status === "in_progress" && <Activity className="h-3 w-3 text-primary animate-spin" />}
                                </div>
                              </div>
                              
                              <p className="text-xs">{action.details}</p>
                              
                              {action.output && (
                                <div className="bg-card p-1.5 rounded border text-xs font-mono">
                                  {action.output}
                                </div>
                              )}
                              
                              {action.commands && (
                                <div className="space-y-1">
                                  <span className="text-xs font-medium text-muted-foreground">Commands:</span>
                                  {action.commands.map((cmd, cmdIndex) => (
                                    <div key={cmdIndex} className="flex items-center gap-1 bg-card p-1.5 rounded border">
                                      <code className="flex-1 text-xs font-mono">{cmd}</code>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-5 w-5 p-0"
                                        onClick={() => copyCommand(cmd)}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {action.errorOutput && (
                                <div className="bg-destructive/5 border border-destructive/20 p-1.5 rounded">
                                  <div className="flex items-center gap-1 mb-1">
                                    <AlertTriangle className="h-3 w-3 text-destructive" />
                                    <span className="text-xs font-medium text-destructive">Error Output</span>
                                  </div>
                                  <code className="text-xs font-mono text-destructive">{action.errorOutput}</code>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center">
                <div className="space-y-2">
                  <Activity className="h-10 w-10 text-muted-foreground mx-auto" />
                  <div>
                    <h3 className="font-medium text-sm">Select an Incident</h3>
                    <p className="text-xs text-muted-foreground">
                      Choose an incident cycle from the left to view detailed agent actions
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}