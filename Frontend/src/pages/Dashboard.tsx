import { AppLayout } from "@/components/layout/AppLayout";
import { AgentStatusCard } from "@/components/dashboard/AgentStatusCard";
import { MetricsOverview } from "@/components/dashboard/MetricsOverview";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Shield, 
  Wrench, 
  Eye, 
  Database, 
  RefreshCw,
  Server,
  Zap
} from "lucide-react";

export default function Dashboard() {
  const agents = [
    {
      name: "Error Analyzer",
      status: "online" as const,
      icon: Shield,
      lastActivity: "2 mins ago",
      description: "Analyzing logs and detecting errors",
      metrics: {
        processed: 15420,
        errors: 12,
        successRate: 98.2
      }
    },
    {
      name: "Fixer Agent", 
      status: "online" as const,
      icon: Wrench,
      lastActivity: "1 min ago",
      description: "Applying automated remediation",
      metrics: {
        processed: 124,
        errors: 2,
        successRate: 96.8
      }
    },
    {
      name: "Monitor Agent",
      status: "warning" as const,
      icon: Eye,
      lastActivity: "5 mins ago", 
      description: "Monitoring log sources",
      metrics: {
        processed: 2400000,
        errors: 5,
        successRate: 99.9
      }
    },
    {
      name: "Log Forwarder",
      status: "online" as const,
      icon: Database,
      lastActivity: "30 secs ago",
      description: "Forwarding logs to central storage",
      metrics: {
        processed: 58930,
        errors: 0,
        successRate: 100
      }
    }
  ];

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-4">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">System Overview</h2>
            <p className="text-xs text-muted-foreground">
              Monitor your log analytics agents and system health
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs">
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Metrics Overview */}
        <MetricsOverview />

        {/* Agent Status Grid */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Agent Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {agents.map((agent) => (
              <AgentStatusCard
                key={agent.name}
                {...agent}
                onViewDetails={() => console.log(`View details for ${agent.name}`)}
              />
            ))}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Activity Feed */}
          <div className="lg:col-span-2">
            <ActivityFeed />
          </div>

          {/* System Health & Quick Actions */}
          <div className="space-y-4">
            {/* System Health */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Server className="h-4 w-4" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs">CPU Usage</span>
                  <span className="text-xs font-medium">23%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="bg-success h-1.5 rounded-full" style={{ width: "23%" }} />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs">Memory Usage</span>
                  <span className="text-xs font-medium">67%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="bg-warning h-1.5 rounded-full" style={{ width: "67%" }} />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs">Disk Usage</span>
                  <span className="text-xs font-medium">45%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div className="bg-primary h-1.5 rounded-full" style={{ width: "45%" }} />
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <Zap className="h-4 w-4" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start text-xs h-8">
                  <Shield className="h-3 w-3 mr-2" />
                  Configure Sources
                </Button>
                <Button variant="outline" className="w-full justify-start text-xs h-8">
                  <Eye className="h-3 w-3 mr-2" />
                  View Live Console
                </Button>
                <Button variant="outline" className="w-full justify-start text-xs h-8">
                  <Database className="h-3 w-3 mr-2" />
                  Manage Integrations
                </Button>
                <Button variant="outline" className="w-full justify-start text-xs h-8">
                  <Wrench className="h-3 w-3 mr-2" />
                  System Settings
                </Button>
              </CardContent>
            </Card>

            {/* Source Connectivity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Source Connectivity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs">Windows Event Logs</span>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-success rounded-full" />
                    <span className="text-xs text-success">Connected</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">Snowflake</span>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-success rounded-full" />
                    <span className="text-xs text-success">Connected</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs">Kubernetes</span>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-warning rounded-full" />
                    <span className="text-xs text-warning">Degraded</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}