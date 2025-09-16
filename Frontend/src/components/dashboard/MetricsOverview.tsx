import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  icon: React.ReactNode;
}

function MetricCard({ title, value, change, changeType, icon }: MetricCardProps) {
  const trendIcon = changeType === "positive" ? TrendingUp : 
                   changeType === "negative" ? TrendingDown : Activity;
  const TrendIcon = trendIcon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-lg font-bold">{value}</div>
        <div className="flex items-center gap-1 text-[10px]">
          <TrendIcon className={cn(
            "h-3 w-3",
            changeType === "positive" && "text-success",
            changeType === "negative" && "text-destructive", 
            changeType === "neutral" && "text-muted-foreground"
          )} />
          <span className={cn(
            "font-medium",
            changeType === "positive" && "text-success",
            changeType === "negative" && "text-destructive",
            changeType === "neutral" && "text-muted-foreground"
          )}>
            {change}
          </span>
          <span className="text-muted-foreground">from last hour</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function MetricsOverview() {
  const metrics = [
    {
      title: "Logs Processed",
      value: "2.4M",
      change: "+12.5%",
      changeType: "positive" as const,
      icon: <Activity className="h-3 w-3" />
    },
    {
      title: "Errors Detected", 
      value: "847",
      change: "-5.2%",
      changeType: "positive" as const,
      icon: <TrendingDown className="h-3 w-3" />
    },
    {
      title: "Auto-Fixes Applied",
      value: "124",
      change: "+18.3%", 
      changeType: "positive" as const,
      icon: <TrendingUp className="h-3 w-3" />
    },
    {
      title: "Avg Response Time",
      value: "1.2s",
      change: "-0.3s",
      changeType: "positive" as const,
      icon: <Clock className="h-3 w-3" />
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <MetricCard key={metric.title} {...metric} />
      ))}
    </div>
  );
}