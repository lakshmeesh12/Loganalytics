import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentStatusCardProps {
  name: string;
  status: "online" | "offline" | "warning" | "error";
  icon: LucideIcon;
  lastActivity: string;
  description: string;
  metrics: {
    processed: number;
    errors: number;
    successRate: number;
  };
  onViewDetails?: () => void;
}

const statusConfig = {
  online: {
    color: "bg-success text-success-foreground",
    badge: "success",
    dot: "bg-success"
  },
  warning: {
    color: "bg-warning text-warning-foreground", 
    badge: "warning",
    dot: "bg-warning"
  },
  error: {
    color: "bg-destructive text-destructive-foreground",
    badge: "destructive", 
    dot: "bg-destructive"
  },
  offline: {
    color: "bg-muted text-muted-foreground",
    badge: "secondary",
    dot: "bg-muted-foreground"
  }
};

export function AgentStatusCard({
  name,
  status,
  icon: Icon,
  lastActivity,
  description,
  metrics,
  onViewDetails
}: AgentStatusCardProps) {
  const config = statusConfig[status];

  return (
    <Card className="relative overflow-hidden group hover:shadow-lg transition-all duration-200">
      {/* Status Indicator */}
      <div className={cn("absolute top-0 left-0 right-0 h-1", config.color)} />
      
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg", config.color)}>
              <Icon className="h-3 w-3" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{name}</CardTitle>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse-subtle", config.dot)} />
            <Badge variant={config.badge as any} className="capitalize text-[10px] px-1.5 py-0.5">
              {status}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-sm font-bold text-primary">{metrics.processed.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">Processed</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-destructive">{metrics.errors}</div>
            <div className="text-[10px] text-muted-foreground">Errors</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-success">{metrics.successRate}%</div>
            <div className="text-[10px] text-muted-foreground">Success Rate</div>
          </div>
        </div>

        {/* Last Activity */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Last Activity:</span>
          <span className="font-medium">{lastActivity}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs h-7"
            onClick={onViewDetails}
          >
            View Details
          </Button>
          <Button
            variant={status === "offline" ? "default" : "secondary"}
            size="sm"
            className="flex-1 text-xs h-7"
          >
            {status === "offline" ? "Start" : "Restart"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}