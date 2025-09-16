import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Database, 
  Cloud, 
  Monitor, 
  Server, 
  Apple, 
  Brain,
  LineChart,
  Zap,
  CheckCircle,
  XCircle,
  Settings,
  Trash2,
  ArrowRight,
  Workflow
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import aiAgentIcon from "@/assets/ai-agent-icon.jpg";

interface DataSource {
  id: string;
  name: string;
  type: 'snowflake' | 'eks' | 'windows' | 'linux' | 'macos' | 'datadog';
  status: 'connected' | 'disconnected' | 'error';
  description: string;
  lastSync: string;
  metrics: {
    logsProcessed: number;
    errorsDetected: number;
    lastError?: string;
  };
}

const mockDataSources: DataSource[] = [
  {
    id: '1',
    name: 'Production Snowflake',
    type: 'snowflake',
    status: 'connected',
    description: 'Main data warehouse for analytics queries',
    lastSync: '2025-01-27 15:30:00',
    metrics: { logsProcessed: 15420, errorsDetected: 3 }
  },
  {
    id: '2',
    name: 'EKS Main Cluster',
    type: 'eks',
    status: 'connected',
    description: 'Production Kubernetes cluster logs',
    lastSync: '2025-01-27 15:25:00',
    metrics: { logsProcessed: 98745, errorsDetected: 12 }
  },
  {
    id: '3',
    name: 'Windows Servers',
    type: 'windows',
    status: 'error',
    description: 'Windows Event Logs monitoring',
    lastSync: '2025-01-27 14:45:00',
    metrics: { logsProcessed: 2340, errorsDetected: 8, lastError: 'Connection timeout' }
  },
  {
    id: '4',
    name: 'Datadog Metrics',
    type: 'datadog',
    status: 'connected',
    description: 'Application performance monitoring',
    lastSync: '2025-01-27 15:28:00',
    metrics: { logsProcessed: 45230, errorsDetected: 5 }
  }
];

const dataSourceTypes = [
  {
    type: 'snowflake',
    name: 'Snowflake',
    icon: <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake" className="w-12 h-12 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
    description: 'Data warehouse query logs and performance metrics',
    category: 'Database'
  },
  {
    type: 'eks',
    name: 'AWS EKS',
    icon: <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS" className="w-12 h-12 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
    description: 'Kubernetes cluster logs and container metrics',
    category: 'Cloud'
  },
  {
    type: 'windows',
    name: 'Windows',
    icon: <img src="https://th.bing.com/th/id/R.b57d432bf7e29c5738e5fe80278f1258?rik=auCFqC7NXcnbww&riu=http%3a%2f%2fgetdrawings.com%2ffree-icon%2fmicrosoft-windows-icon-63.png&ehk=6%2faDRtRmsK%2fy3Z4gZN%2b5J%2bO%2bGv2Ax8h4kiK7q32D3mc%3d&risl=&pid=ImgRaw&r=0" alt="Windows" className="w-12 h-12 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
    description: 'Windows Event Logs and system monitoring',
    category: 'System'
  },
  {
    type: 'linux',
    name: 'Linux',
    icon: <img src="https://cdn.iconscout.com/icon/free/png-256/linux-3521549-2944967.png" alt="Linux" className="w-12 h-12 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
    description: 'Linux system logs and application logs',
    category: 'System'
  },
  {
    type: 'macos',
    name: 'macOS',
    icon: <img src="https://www.pinclipart.com/picdir/big/236-2364339_macos-icon-clipart.png" alt="macOS" className="w-12 h-12 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
    description: 'macOS system logs and application monitoring',
    category: 'System'
  },
  {
    type: 'datadog',
    name: 'Datadog',
    icon: <img src="https://logowik.com/content/uploads/images/datadog9243.jpg" alt="Datadog" className="w-12 h-12 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />,
    description: 'Application monitoring and performance metrics',
    category: 'Monitoring'
  }
];

export default function DataSources() {
  const [dataSources, setDataSources] = useState<DataSource[]>(mockDataSources);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [sourceName, setSourceName] = useState('');
  const { toast } = useToast();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="default" className="bg-success text-success-foreground">
            <CheckCircle className="w-3 h-3 mr-1" />
            Connected
          </Badge>
        );
      case 'disconnected':
        return (
          <Badge variant="secondary">
            <XCircle className="w-3 h-3 mr-1" />
            Disconnected
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getDataSourceIcon = (type: string) => {
    const source = dataSourceTypes.find(s => s.type === type);
    return source?.icon || <Database className="w-6 h-6" />;
  };

  const addDataSource = () => {
    if (!selectedType || !sourceName) {
      toast({
        title: "Validation Error",
        description: "Please select a data source type and provide a name",
        variant: "destructive"
      });
      return;
    }

    const sourceType = dataSourceTypes.find(s => s.type === selectedType);
    const newSource: DataSource = {
      id: Date.now().toString(),
      name: sourceName,
      type: selectedType as any,
      status: 'disconnected',
      description: sourceType?.description || '',
      lastSync: 'Never',
      metrics: { logsProcessed: 0, errorsDetected: 0 }
    };

    setDataSources(prev => [...prev, newSource]);
    setIsAddDialogOpen(false);
    setSelectedType('');
    setSourceName('');

    toast({
      title: "Data Source Added",
      description: `${sourceName} has been added to your monitoring sources`,
    });
  };

  const removeDataSource = (id: string) => {
    setDataSources(prev => prev.filter(s => s.id !== id));
    toast({
      title: "Data Source Removed",
      description: "Data source has been removed from monitoring",
    });
  };

  const connectedSources = dataSources.filter(s => s.status === 'connected').length;
  const totalLogs = dataSources.reduce((sum, s) => sum + s.metrics.logsProcessed, 0);
  const totalErrors = dataSources.reduce((sum, s) => sum + s.metrics.errorsDetected, 0);

  return (
    <AppLayout title="Data Sources" breadcrumbs={["Data Sources"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Agent Data Sources</h2>
            <p className="text-muted-foreground">Configure data sources for your AI monitoring agents</p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Data Source
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Data Source</DialogTitle>
                <DialogDescription>
                  Connect a new data source to your AI monitoring agents
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="source-type">Data Source Type</Label>
                  <Select onValueChange={setSelectedType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select data source type" />
                    </SelectTrigger>
                    <SelectContent>
                      {dataSourceTypes.map((source) => (
                        <SelectItem key={source.type} value={source.type}>
                          <div className="flex items-center gap-2">
                            {source.icon}
                            <span>{source.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-name">Source Name</Label>
                  <Input
                    id="source-name"
                    placeholder="e.g., Production Database"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button onClick={addDataSource} className="flex-1">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Source
                  </Button>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Agent Overview */}
        <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                <img src={aiAgentIcon} alt="AI Agent" className="w-8 h-8 rounded" />
              </div>
              <div>
                <h3 className="text-xl">AI Monitoring Agent</h3>
                <p className="text-sm text-muted-foreground">Intelligent log analysis and error remediation</p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-success">{connectedSources}</div>
                <div className="text-sm text-muted-foreground">Connected Sources</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{totalLogs.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Logs Processed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-warning">{totalErrors}</div>
                <div className="text-sm text-muted-foreground">Errors Detected</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">4</div>
                <div className="text-sm text-muted-foreground">Active Agents</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connected Data Sources */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Workflow className="w-5 h-5" />
            Connected Data Sources
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dataSources.map((source) => (
              <Card key={source.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getDataSourceIcon(source.type)}
                      <div>
                        <CardTitle className="text-lg">{source.name}</CardTitle>
                        <CardDescription className="text-xs">{source.description}</CardDescription>
                      </div>
                    </div>
                    {getStatusBadge(source.status)}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">Logs Processed</div>
                      <div className="font-medium">{source.metrics.logsProcessed.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Errors Found</div>
                      <div className="font-medium text-warning">{source.metrics.errorsDetected}</div>
                    </div>
                  </div>
                  
                  {/* Last Sync */}
                  <div className="text-sm">
                    <div className="text-muted-foreground">Last Sync</div>
                    <div className="font-medium">{source.lastSync}</div>
                  </div>

                  {/* Error Message */}
                  {source.metrics.lastError && (
                    <div className="text-sm p-2 bg-destructive/10 border border-destructive/20 rounded">
                      <div className="text-destructive font-medium">Last Error</div>
                      <div className="text-muted-foreground">{source.metrics.lastError}</div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1">
                      <Settings className="w-3 h-3 mr-1" />
                      Configure
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => removeDataSource(source.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>

                {/* Connection Flow Arrow */}
                <div className="absolute -right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                  <ArrowRight className="w-3 h-3" />
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Available Data Source Types */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Available Data Source Types</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dataSourceTypes.map((sourceType) => (
              <Card key={sourceType.type} className="hover:shadow-lg transition-shadow cursor-pointer border-dashed">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-2">
                    {sourceType.icon}
                  </div>
                  <CardTitle className="text-lg">{sourceType.name}</CardTitle>
                  <CardDescription>{sourceType.description}</CardDescription>
                  <Badge variant="outline" className="mx-auto">{sourceType.category}</Badge>
                </CardHeader>
                <CardContent className="text-center">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setSelectedType(sourceType.type);
                      setIsAddDialogOpen(true);
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Source
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Agent Processing Flow */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Agent Processing Flow
            </CardTitle>
            <CardDescription>
              How your AI agents process data from connected sources
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Database className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="font-medium">Data Ingestion</div>
                  <div className="text-sm text-muted-foreground">Collect logs from sources</div>
                </div>
              </div>
              
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <img src={aiAgentIcon} alt="AI" className="w-6 h-6 rounded" />
                </div>
                <div>
                  <div className="font-medium">AI Analysis</div>
                  <div className="text-sm text-muted-foreground">Detect patterns & errors</div>
                </div>
              </div>
              
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <div className="font-medium">Auto Remediation</div>
                  <div className="text-sm text-muted-foreground">Apply fixes automatically</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}