import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Shield, 
  Wrench, 
  Eye, 
  Database,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  agent: "ErrorAnalyzer" | "Fixer" | "Monitor" | "LogForwarder";
  action: string;
  source: "Windows" | "Snowflake" | "Kubernetes";
  status: "success" | "error" | "warning" | "info";
  timestamp: string;
  details?: string;
}

const agentConfig = {
  ErrorAnalyzer: { icon: Shield, color: "text-primary" },
  Fixer: { icon: Wrench, color: "text-success" },
  Monitor: { icon: Eye, color: "text-warning" },
  LogForwarder: { icon: Database, color: "text-accent" }
};

const statusConfig = {
  success: { icon: CheckCircle, color: "text-success", bg: "bg-success/10" },
  error: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
  info: { icon: Shield, color: "text-primary", bg: "bg-primary/10" }
};

// Mock data - in real app this would come from API
const activities: ActivityItem[] = [
  {
    id: "1",
    agent: "ErrorAnalyzer",
    action: "Detected Windows Event ID 7003 error",
    source: "Windows",
    status: "error",
    timestamp: "2 mins ago",
    details: "Print Spooler service failed due to FakeService dependency"
  },
  {
    id: "2", 
    agent: "Fixer",
    action: "Applied remediation for Print Spooler",
    source: "Windows",
    status: "success", 
    timestamp: "1 min ago",
    details: "Executed: sc config Spooler depend= RPCSS"
  },
  {
    id: "3",
    agent: "Monitor",
    action: "High log volume detected",
    source: "Kubernetes",
    status: "warning",
    timestamp: "5 mins ago",
    details: "Pod restarts in production namespace"
  },
  {
    id: "4",
    agent: "LogForwarder",
    action: "Forwarded 1.2K logs to central storage",
    source: "Snowflake",
    status: "success",
    timestamp: "8 mins ago"
  },
  {
    id: "5",
    agent: "ErrorAnalyzer",
    action: "Snowflake query optimization suggested",
    source: "Snowflake",
    status: "info",
    timestamp: "12 mins ago",
    details: "Query execution time > 30s threshold"
  }
];

function ActivityItem({ activity }: { activity: ActivityItem }) {
  const agentInfo = agentConfig[activity.agent];
  const statusInfo = statusConfig[activity.status];
  const AgentIcon = agentInfo.icon;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="flex items-start gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
      <div className={cn("p-2 rounded-lg", statusInfo.bg)}>
        <StatusIcon className={cn("h-4 w-4", statusInfo.color)} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{activity.action}</span>
          <Badge variant="outline" className="text-xs">
            <AgentIcon className={cn("h-3 w-3 mr-1", agentInfo.color)} />
            {activity.agent}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <span>Source: {activity.source}</span>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {activity.timestamp}
          </div>
        </div>
        
        {activity.details && (
          <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded mt-2">
            {activity.details}
          </p>
        )}
      </div>
    </div>
  );
}

export function ActivityFeed() {
  return (
    <Card className="h-[600px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[520px] px-6">
          <div className="space-y-2">
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}