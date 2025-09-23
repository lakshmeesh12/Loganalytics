import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { 
  Settings, 
  Save, 
  Upload, 
  TestTube, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  AlertCircle 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Configuration {
  id: string;
  name: string;
  type: 'snowflake' | 'eks' | 'windows' | 'linux' | 'datadog' | 'databricks';
  status: 'active' | 'inactive' | 'testing';
  lastUpdated: string;
  config: Record<string, any>;
}

const mockConfigurations: Configuration[] = [
  {
    id: '1',
    name: 'Production Snowflake',
    type: 'snowflake',
    status: 'active',
    lastUpdated: '2025-09-23 17:30:00',
    config: { url: 'acme.snowflakecomputing.com', username: 'admin' }
  },
  {
    id: '2',
    name: 'EKS Cluster Main',
    type: 'eks',
    status: 'active',
    lastUpdated: '2025-09-23 16:15:00',
    config: { clusterName: 'main-cluster', region: 'us-east-1' }
  },
  {
    id: '3',
    name: 'Windows Server 01',
    type: 'windows',
    status: 'inactive',
    lastUpdated: '2025-09-23 15:45:00',
    config: { hostname: '192.168.1.100', username: 'administrator' }
  },
  {
    id: '4',
    name: 'Production DataDog',
    type: 'datadog',
    status: 'inactive',
    lastUpdated: '2025-09-23 16:00:00',
    config: { 
      apiKey: 'dd_api_1234567890', 
      appKey: 'dd_app_0987654321', 
      clientToken: 'dd_client_abcdef', 
      site: 'us1.datadoghq.com',
      rumEnabled: true,
      apmEnabled: false
    }
  },
  {
    id: '5',
    name: 'Databricks Workspace',
    type: 'databricks',
    status: 'active',
    lastUpdated: '2025-09-23 17:45:00',
    config: { 
      workspaceUrl: 'https://adb-1234567890.azuredatabricks.net', 
      token: 'dapi_abcdef1234567890',
      clusterId: '0923-164500-xyz123',
      workspaceId: '1234567890',
      logPath: 'dbfs:/databricks/logs',
      logFormat: 'JSON'
    }
  }
];

export default function Configurations() {
  const [configurations, setConfigurations] = useState<Configuration[]>(mockConfigurations);
  const [activeTab, setActiveTab] = useState('snowflake');
  const [editingConfig, setEditingConfig] = useState<Configuration | null>(null);
  const { toast } = useToast();

  const [snowflakeForm, setSnowflakeForm] = useState({
    name: '',
    url: '',
    username: '',
    password: '',
    role: '',
    warehouse: '',
    database: '',
    schema: ''
  });

  const [eksForm, setEksForm] = useState({
    name: '',
    clusterName: '',
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    kubeconfig: '',
    namespace: ''
  });

  const [windowsForm, setWindowsForm] = useState({
    name: '',
    hostname: '',
    username: '',
    password: '',
    eventLogName: 'System',
    executionPolicy: 'RemoteSigned'
  });

  const [linuxForm, setLinuxForm] = useState({
    name: '',
    hostname: '',
    username: '',
    password: '',
    keyFile: '',
    syslogPath: '/var/log/syslog',
    logFormat: 'Syslog'
  });

  const [datadogForm, setDatadogForm] = useState({
    name: '',
    apiKey: '',
    appKey: '',
    clientToken: '',
    site: 'us1.datadoghq.com',
    rumEnabled: false,
    apmEnabled: false
  });

  const [databricksForm, setDatabricksForm] = useState({
    name: '',
    workspaceUrl: '',
    token: '',
    clusterId: '',
    workspaceId: '',
    logPath: 'dbfs:/databricks/logs',
    logFormat: 'JSON'
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="text-xs px-1.5 py-0.5 bg-success text-success-foreground"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'inactive':
        return <Badge variant="secondary" className="text-xs px-1.5 py-0.5"><XCircle className="w-3 h-3 mr-1" />Inactive</Badge>;
      case 'testing':
        return <Badge variant="outline" className="text-xs px-1.5 py-0.5"><AlertCircle className="w-3 h-3 mr-1" />Testing</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs px-1.5 py-0.5">Unknown</Badge>;
    }
  };

  const testConnection = async (config: Configuration) => {
    setConfigurations(prev => 
      prev.map(c => c.id === config.id ? { ...c, status: 'testing' } : c)
    );
    
    // Simulate API call
    setTimeout(() => {
      const success = Math.random() > 0.3; // 70% success rate
      setConfigurations(prev => 
        prev.map(c => c.id === config.id ? { ...c, status: success ? 'active' : 'inactive' } : c)
      );
      
      toast({
        title: success ? "Connection Successful" : "Connection Failed",
        description: success 
          ? `Successfully connected to ${config.name}` 
          : `Failed to connect to ${config.name}. Please check your credentials.`,
        variant: success ? "default" : "destructive"
      });
    }, 2000);
  };

  const saveConfiguration = (type: string) => {
    let formData;
    switch (type) {
      case 'snowflake':
        formData = snowflakeForm;
        break;
      case 'eks':
        formData = eksForm;
        break;
      case 'windows':
        formData = windowsForm;
        break;
      case 'linux':
        formData = linuxForm;
        break;
      case 'datadog':
        formData = datadogForm;
        break;
      case 'databricks':
        formData = databricksForm;
        break;
      default:
        return;
    }

    if (!formData.name) {
      toast({
        title: "Validation Error",
        description: "Configuration name is required",
        variant: "destructive"
      });
      return;
    }

    const newConfig: Configuration = {
      id: Date.now().toString(),
      name: formData.name,
      type: type as any,
      status: 'inactive',
      lastUpdated: new Date().toISOString().slice(0, 19).replace('T', ' '),
      config: formData
    };

    setConfigurations(prev => [...prev, newConfig]);
    
    // Reset form
    switch (type) {
      case 'snowflake':
        setSnowflakeForm({ name: '', url: '', username: '', password: '', role: '', warehouse: '', database: '', schema: '' });
        break;
      case 'eks':
        setEksForm({ name: '', clusterName: '', region: '', accessKeyId: '', secretAccessKey: '', kubeconfig: '', namespace: '' });
        break;
      case 'windows':
        setWindowsForm({ name: '', hostname: '', username: '', password: '', eventLogName: 'System', executionPolicy: 'RemoteSigned' });
        break;
      case 'linux':
        setLinuxForm({ name: '', hostname: '', username: '', password: '', keyFile: '', syslogPath: '/var/log/syslog', logFormat: 'Syslog' });
        break;
      case 'datadog':
        setDatadogForm({ name: '', apiKey: '', appKey: '', clientToken: '', site: 'us1.datadoghq.com', rumEnabled: false, apmEnabled: false });
        break;
      case 'databricks':
        setDatabricksForm({ name: '', workspaceUrl: '', token: '', clusterId: '', workspaceId: '', logPath: 'dbfs:/databricks/logs', logFormat: 'JSON' });
        break;
    }

    toast({
      title: "Configuration Saved",
      description: `${formData.name} configuration has been saved successfully`,
    });
  };

  const deleteConfiguration = (id: string) => {
    setConfigurations(prev => prev.filter(c => c.id !== id));
    toast({
      title: "Configuration Deleted",
      description: "Configuration has been removed successfully",
    });
  };

  const getFilteredConfigurations = (type: string) => {
    return configurations.filter(config => config.type === type);
  };

  const getPlatformIcon = (type: string) => {
    switch (type) {
      case 'snowflake':
        return <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />;
      case 'eks':
        return <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />;
      case 'windows':
        return <img src="https://th.bing.com/th/id/R.b57d432bf7e29c5738e5fe80278f1258?rik=auCFqC7NXcnbww&riu=http%3a%2f%2fgetdrawings.com%2ffree-icon%2fmicrosoft-windows-icon-63.png&ehk=6%2faDRtRmsK%2fy3Z4gZN%2b5J%2bO%2bGv2Ax8h4kiK7q32D3mc%3d&risl=&pid=ImgRaw&r=0" alt="Windows" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />;
      case 'linux':
        return <img src="https://cdn.iconscout.com/icon/free/png-256/linux-3521549-2944967.png" alt="Linux" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />;
      case 'datadog':
        return <img src="https://www.datadoghq.com/favicon.ico" alt="DataDog" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />;
      case 'databricks':
        return <img src="https://i.pinimg.com/736x/65/1d/d6/651dd6bdd503bd0aaba588b9e6439459.jpg" alt="Databricks" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />;
      default:
        return <Settings className="w-3 h-3" />;
    }
  };

  return (
    <AppLayout title="Data Source Configurations" breadcrumbs={["Configurations"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-base font-medium">Data Source Configurations</h2>
            <p className="text-sm text-muted-foreground">Configure and manage your data sources for log monitoring</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="text-xs h-8 px-3 py-1.5">
              <Upload className="w-3 h-3 mr-2" />
              Import Config
            </Button>
            <Button className="text-xs h-8 px-3 py-1.5">
              <Save className="w-3 h-3 mr-2" />
              Save All
            </Button>
          </div>
        </div>

        {/* Configuration Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 text-xs h-8">
            <TabsTrigger value="snowflake" className="gap-1 text-xs px-2 py-1">
              <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
              <span className="hidden sm:inline">Snowflake</span>
            </TabsTrigger>
            <TabsTrigger value="eks" className="gap-1 text-xs px-2 py-1">
              <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
              <span className="hidden sm:inline">AWS EKS</span>
            </TabsTrigger>
            <TabsTrigger value="windows" className="gap-1 text-xs px-2 py-1">
              <img src="https://th.bing.com/th/id/R.b57d432bf7e29c5738e5fe80278f1258?rik=auCFqC7NXcnbww&riu=http%3a%2f%2fgetdrawings.com%2ffree-icon%2fmicrosoft-windows-icon-63.png&ehk=6%2faDRtRmsK%2fy3Z4gZN%2b5J%2bO%2bGv2Ax8h4kiK7q32D3mc%3d&risl=&pid=ImgRaw&r=0" alt="Windows" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
              <span className="hidden sm:inline">Windows</span>
            </TabsTrigger>
            <TabsTrigger value="linux" className="gap-1 text-xs px-2 py-1">
              <img src="https://cdn.iconscout.com/icon/free/png-256/linux-3521549-2944967.png" alt="Linux" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
              <span className="hidden sm:inline">Linux</span>
            </TabsTrigger>
            <TabsTrigger value="datadog" className="gap-1 text-xs px-2 py-1">
              <img src="https://www.datadoghq.com/favicon.ico" alt="DataDog" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
              <span className="hidden sm:inline">DataDog</span>
            </TabsTrigger>
            <TabsTrigger value="databricks" className="gap-1 text-xs px-2 py-1">
              <img src="https://i.pinimg.com/736x/65/1d/d6/651dd6bdd503bd0aaba588b9e6439459.jpg" alt="Databricks" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
              <span className="hidden sm:inline">Databricks</span>
            </TabsTrigger>
          </TabsList>

          {/* Snowflake Configuration */}
          <TabsContent value="snowflake" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
                  Snowflake Configuration
                </CardTitle>
                <CardDescription className="text-sm">
                  Configure Snowflake data warehouse connections for query log monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sf-name" className="text-xs">Configuration Name *</Label>
                    <Input
                      id="sf-name"
                      placeholder="e.g., Production Snowflake"
                      value={snowflakeForm.name}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, name: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-url" className="text-xs">Account URL *</Label>
                    <Input
                      id="sf-url"
                      placeholder="account.snowflakecomputing.com"
                      value={snowflakeForm.url}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, url: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-username" className="text-xs">Username *</Label>
                    <Input
                      id="sf-username"
                      placeholder="username"
                      value={snowflakeForm.username}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, username: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-password" className="text-xs">Password *</Label>
                    <Input
                      id="sf-password"
                      type="password"
                      placeholder="••••••••"
                      value={snowflakeForm.password}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, password: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-role" className="text-xs">Role</Label>
                    <Input
                      id="sf-role"
                      placeholder="ACCOUNTADMIN"
                      value={snowflakeForm.role}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, role: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-warehouse" className="text-xs">Warehouse</Label>
                    <Input
                      id="sf-warehouse"
                      placeholder="COMPUTE_WH"
                      value={snowflakeForm.warehouse}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, warehouse: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-database" className="text-xs">Database</Label>
                    <Input
                      id="sf-database"
                      placeholder="PRODUCTION"
                      value={snowflakeForm.database}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, database: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-schema" className="text-xs">Schema</Label>
                    <Input
                      id="sf-schema"
                      placeholder="PUBLIC"
                      value={snowflakeForm.schema}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, schema: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('snowflake')} className="text-xs h-8 px-3 py-1.5">
                    <Save className="w-3 h-3 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline" className="text-xs h-8 px-3 py-1.5">
                    <TestTube className="w-3 h-3 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Snowflake Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Saved Snowflake Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-xs font-medium">Name</TableHead>
                      <TableHead className="text-xs font-medium">URL</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium">Last Updated</TableHead>
                      <TableHead className="text-xs font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('snowflake').map((config) => (
                      <TableRow key={config.id} className="text-xs">
                        <TableCell className="font-medium text-xs">{config.name}</TableCell>
                        <TableCell className="text-xs">{config.config.url}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell className="text-xs">{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)} className="h-6 w-6 p-0">
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 w-6 p-0">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)} className="h-6 w-6 p-0">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* EKS Configuration */}
          <TabsContent value="eks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
                  AWS EKS Configuration
                </CardTitle>
                <CardDescription className="text-sm">
                  Configure AWS EKS cluster connections for Kubernetes log monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="eks-name" className="text-xs">Configuration Name *</Label>
                    <Input
                      id="eks-name"
                      placeholder="e.g., Production EKS Cluster"
                      value={eksForm.name}
                      onChange={(e) => setEksForm(prev => ({ ...prev, name: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-cluster" className="text-xs">Cluster Name *</Label>
                    <Input
                      id="eks-cluster"
                      placeholder="my-cluster"
                      value={eksForm.clusterName}
                      onChange={(e) => setEksForm(prev => ({ ...prev, clusterName: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-region" className="text-xs">AWS Region *</Label>
                    <Select onValueChange={(value) => setEksForm(prev => ({ ...prev, region: value }))} defaultValue={eksForm.region}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us-east-1" className="text-xs">us-east-1</SelectItem>
                        <SelectItem value="us-west-2" className="text-xs">us-west-2</SelectItem>
                        <SelectItem value="eu-west-1" className="text-xs">eu-west-1</SelectItem>
                        <SelectItem value="ap-southeast-1" className="text-xs">ap-southeast-1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-namespace" className="text-xs">Namespace</Label>
                    <Input
                      id="eks-namespace"
                      placeholder="default"
                      value={eksForm.namespace}
                      onChange={(e) => setEksForm(prev => ({ ...prev, namespace: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-access-key" className="text-xs">Access Key ID *</Label>
                    <Input
                      id="eks-access-key"
                      placeholder="AKIA..."
                      value={eksForm.accessKeyId}
                      onChange={(e) => setEksForm(prev => ({ ...prev, accessKeyId: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-secret-key" className="text-xs">Secret Access Key *</Label>
                    <Input
                      id="eks-secret-key"
                      type="password"
                      placeholder="••••••••"
                      value={eksForm.secretAccessKey}
                      onChange={(e) => setEksForm(prev => ({ ...prev, secretAccessKey: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eks-kubeconfig" className="text-xs">Kubeconfig File</Label>
                  <Textarea
                    id="eks-kubeconfig"
                    placeholder="Paste kubeconfig content or upload file..."
                    rows={4}
                    value={eksForm.kubeconfig}
                    onChange={(e) => setEksForm(prev => ({ ...prev, kubeconfig: e.target.value }))}
                    className="text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('eks')} className="text-xs h-8 px-3 py-1.5">
                    <Save className="w-3 h-3 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline" className="text-xs h-8 px-3 py-1.5">
                    <TestTube className="w-3 h-3 mr-2" />
                    Test Connection
                  </Button>
                  <Button variant="outline" className="text-xs h-8 px-3 py-1.5">
                    <Upload className="w-3 h-3 mr-2" />
                    Upload Kubeconfig
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* EKS Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Saved EKS Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-xs font-medium">Name</TableHead>
                      <TableHead className="text-xs font-medium">Cluster</TableHead>
                      <TableHead className="text-xs font-medium">Region</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium">Last Updated</TableHead>
                      <TableHead className="text-xs font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('eks').map((config) => (
                      <TableRow key={config.id} className="text-xs">
                        <TableCell className="font-medium text-xs">{config.name}</TableCell>
                        <TableCell className="text-xs">{config.config.clusterName}</TableCell>
                        <TableCell className="text-xs">{config.config.region}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell className="text-xs">{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)} className="h-6 w-6 p-0">
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 w-6 p-0">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)} className="h-6 w-6 p-0">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Windows Configuration */}
          <TabsContent value="windows" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <img src="https://th.bing.com/th/id/R.b57d432bf7e29c5738e5fe80278f1258?rik=auCFqC7NXcnbww&riu=http%3a%2f%2fgetdrawings.com%2ffree-icon%2fmicrosoft-windows-icon-63.png&ehk=6%2faDRtRmsK%2fy3Z4gZN%2b5J%2bO%2bGv2Ax8h4kiK7q32D3mc%3d&risl=&pid=ImgRaw&r=0" alt="Windows" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
                  Windows Configuration
                </CardTitle>
                <CardDescription className="text-sm">
                  Configure Windows Event Log monitoring and PowerShell execution
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="win-name" className="text-xs">Configuration Name *</Label>
                    <Input
                      id="win-name"
                      placeholder="e.g., Windows Server 01"
                      value={windowsForm.name}
                      onChange={(e) => setWindowsForm(prev => ({ ...prev, name: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-hostname" className="text-xs">Hostname/IP *</Label>
                    <Input
                      id="win-hostname"
                      placeholder="localhost or 192.168.1.100"
                      value={windowsForm.hostname}
                      onChange={(e) => setWindowsForm(prev => ({ ...prev, hostname: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-username" className="text-xs">Username *</Label>
                    <Input
                      id="win-username"
                      placeholder="administrator"
                      value={windowsForm.username}
                      onChange={(e) => setWindowsForm(prev => ({ ...prev, username: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-password" className="text-xs">Password *</Label>
                    <Input
                      id="win-password"
                      type="password"
                      placeholder="••••••••"
                      value={windowsForm.password}
                      onChange={(e) => setWindowsForm(prev => ({ ...prev, password: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-event-log" className="text-xs">Event Log Name</Label>
                    <Select onValueChange={(value) => setWindowsForm(prev => ({ ...prev, eventLogName: value }))} defaultValue={windowsForm.eventLogName}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="System" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="System" className="text-xs">System</SelectItem>
                        <SelectItem value="Application" className="text-xs">Application</SelectItem>
                        <SelectItem value="Security" className="text-xs">Security</SelectItem>
                        <SelectItem value="Setup" className="text-xs">Setup</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-exec-policy" className="text-xs">PowerShell Execution Policy</Label>
                    <Select onValueChange={(value) => setWindowsForm(prev => ({ ...prev, executionPolicy: value }))} defaultValue={windowsForm.executionPolicy}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="RemoteSigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Restricted" className="text-xs">Restricted</SelectItem>
                        <SelectItem value="RemoteSigned" className="text-xs">RemoteSigned</SelectItem>
                        <SelectItem value="Unrestricted" className="text-xs">Unrestricted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('windows')} className="text-xs h-8 px-3 py-1.5">
                    <Save className="w-3 h-3 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline" className="text-xs h-8 px-3 py-1.5">
                    <TestTube className="w-3 h-3 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Windows Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Saved Windows Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-xs font-medium">Name</TableHead>
                      <TableHead className="text-xs font-medium">Hostname</TableHead>
                      <TableHead className="text-xs font-medium">Event Log</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium">Last Updated</TableHead>
                      <TableHead className="text-xs font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('windows').map((config) => (
                      <TableRow key={config.id} className="text-xs">
                        <TableCell className="font-medium text-xs">{config.name}</TableCell>
                        <TableCell className="text-xs">{config.config.hostname}</TableCell>
                        <TableCell className="text-xs">{config.config.eventLogName}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell className="text-xs">{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)} className="h-6 w-6 p-0">
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 w-6 p-0">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)} className="h-6 w-6 p-0">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Linux Configuration */}
          <TabsContent value="linux" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <img src="https://cdn.iconscout.com/icon/free/png-256/linux-3521549-2944967.png" alt="Linux" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
                  Linux Configuration
                </CardTitle>
                <CardDescription className="text-sm">
                  Configure Linux system log monitoring via SSH and Syslog
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="linux-name" className="text-xs">Configuration Name *</Label>
                    <Input
                      id="linux-name"
                      placeholder="e.g., Production Linux Server"
                      value={linuxForm.name}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, name: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-hostname" className="text-xs">Hostname/IP *</Label>
                    <Input
                      id="linux-hostname"
                      placeholder="server.example.com or 192.168.1.50"
                      value={linuxForm.hostname}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, hostname: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-username" className="text-xs">SSH Username *</Label>
                    <Input
                      id="linux-username"
                      placeholder="ubuntu or root"
                      value={linuxForm.username}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, username: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-password" className="text-xs">SSH Password</Label>
                    <Input
                      id="linux-password"
                      type="password"
                      placeholder="••••••••"
                      value={linuxForm.password}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, password: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-syslog" className="text-xs">Syslog Path</Label>
                    <Input
                      id="linux-syslog"
                      placeholder="/var/log/syslog"
                      value={linuxForm.syslogPath}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, syslogPath: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-format" className="text-xs">Log Format</Label>
                    <Select onValueChange={(value) => setLinuxForm(prev => ({ ...prev, logFormat: value }))} defaultValue={linuxForm.logFormat}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="Syslog" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Syslog" className="text-xs">Syslog</SelectItem>
                        <SelectItem value="JSON" className="text-xs">JSON</SelectItem>
                        <SelectItem value="Plain Text" className="text-xs">Plain Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linux-key" className="text-xs">SSH Private Key</Label>
                  <Textarea
                    id="linux-key"
                    placeholder="-----BEGIN PRIVATE KEY-----
Paste your SSH private key here...
-----END PRIVATE KEY-----"
                    rows={4}
                    value={linuxForm.keyFile}
                    onChange={(e) => setLinuxForm(prev => ({ ...prev, keyFile: e.target.value }))}
                    className="text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('linux')} className="text-xs h-8 px-3 py-1.5">
                    <Save className="w-3 h-3 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline" className="text-xs h-8 px-3 py-1.5">
                    <TestTube className="w-3 h-3 mr-2" />
                    Test SSH Connection
                  </Button>
                  <Button variant="outline" className="text-xs h-8 px-3 py-1.5">
                    <Upload className="w-3 h-3 mr-2" />
                    Upload Key File
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Linux Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Saved Linux Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-xs font-medium">Name</TableHead>
                      <TableHead className="text-xs font-medium">Hostname</TableHead>
                      <TableHead className="text-xs font-medium">Syslog Path</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium">Last Updated</TableHead>
                      <TableHead className="text-xs font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('linux').map((config) => (
                      <TableRow key={config.id} className="text-xs">
                        <TableCell className="font-medium text-xs">{config.name}</TableCell>
                        <TableCell className="text-xs">{config.config.hostname}</TableCell>
                        <TableCell className="text-xs">{config.config.syslogPath}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell className="text-xs">{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)} className="h-6 w-6 p-0">
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 w-6 p-0">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)} className="h-6 w-6 p-0">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DataDog Configuration */}
          <TabsContent value="datadog" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <img src="https://www.datadoghq.com/favicon.ico" alt="DataDog" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
                  DataDog Configuration
                </CardTitle>
                <CardDescription className="text-sm">
                  Configure DataDog integration for frontend and backend monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dd-name" className="text-xs">Configuration Name *</Label>
                    <Input
                      id="dd-name"
                      placeholder="e.g., Production DataDog"
                      value={datadogForm.name}
                      onChange={(e) => setDatadogForm(prev => ({ ...prev, name: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dd-api-key" className="text-xs">API Key *</Label>
                    <Input
                      id="dd-api-key"
                      placeholder="Enter DataDog API Key"
                      value={datadogForm.apiKey}
                      onChange={(e) => setDatadogForm(prev => ({ ...prev, apiKey: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dd-app-key" className="text-xs">Application Key *</Label>
                    <Input
                      id="dd-app-key"
                      placeholder="Enter DataDog Application Key"
                      value={datadogForm.appKey}
                      onChange={(e) => setDatadogForm(prev => ({ ...prev, appKey: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dd-client-token" className="text-xs">Client Token (RUM)</Label>
                    <Input
                      id="dd-client-token"
                      placeholder="Enter DataDog Client Token"
                      value={datadogForm.clientToken}
                      onChange={(e) => setDatadogForm(prev => ({ ...prev, clientToken: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dd-site" className="text-xs">DataDog Site</Label>
                    <Select
                      value={datadogForm.site}
                      onValueChange={(value) => setDatadogForm(prev => ({ ...prev, site: value }))}
                    >
                      <SelectTrigger id="dd-site" className="text-xs h-9">
                        <SelectValue placeholder="Select DataDog site" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us1.datadoghq.com" className="text-xs">US1</SelectItem>
                        <SelectItem value="us3.datadoghq.com" className="text-xs">US3</SelectItem>
                        <SelectItem value="us5.datadoghq.com" className="text-xs">US5</SelectItem>
                        <SelectItem value="eu1.datadoghq.com" className="text-xs">EU1</SelectItem>
                        <SelectItem value="ap1.datadoghq.com" className="text-xs">AP1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Monitoring Options</Label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="dd-rum-enabled"
                          checked={datadogForm.rumEnabled}
                          onCheckedChange={(checked) => setDatadogForm(prev => ({ ...prev, rumEnabled: checked }))}
                        />
                        <Label htmlFor="dd-rum-enabled" className="text-xs">Enable RUM</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="dd-apm-enabled"
                          checked={datadogForm.apmEnabled}
                          onCheckedChange={(checked) => setDatadogForm(prev => ({ ...prev, apmEnabled: checked }))}
                        />
                        <Label htmlFor="dd-apm-enabled" className="text-xs">Enable APM</Label>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('datadog')} className="text-xs h-8 px-3 py-1.5">
                    <Save className="w-3 h-3 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline" className="text-xs h-8 px-3 py-1.5">
                    <TestTube className="w-3 h-3 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* DataDog Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Saved DataDog Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-xs font-medium">Name</TableHead>
                      <TableHead className="text-xs font-medium">API Key</TableHead>
                      <TableHead className="text-xs font-medium">Site</TableHead>
                      <TableHead className="text-xs font-medium">RUM</TableHead>
                      <TableHead className="text-xs font-medium">APM</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium">Last Updated</TableHead>
                      <TableHead className="text-xs font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('datadog').map((config) => (
                      <TableRow key={config.id} className="text-xs">
                        <TableCell className="font-medium text-xs">{config.name}</TableCell>
                        <TableCell className="text-xs">{config.config.apiKey.slice(0, 8)}...</TableCell>
                        <TableCell className="text-xs">{config.config.site}</TableCell>
                        <TableCell className="text-xs">{config.config.rumEnabled ? 'Enabled' : 'Disabled'}</TableCell>
                        <TableCell className="text-xs">{config.config.apmEnabled ? 'Enabled' : 'Disabled'}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell className="text-xs">{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)} className="h-6 w-6 p-0">
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 w-6 p-0">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)} className="h-6 w-6 p-0">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Databricks Configuration */}
          <TabsContent value="databricks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                  <img src="https://i.pinimg.com/736x/65/1d/d6/651dd6bdd503bd0aaba588b9e6439459.jpg" alt="Databricks" className="w-4 h-4 rounded border border-gray-200 p-0.5 bg-white shadow-sm" />
                  Databricks Configuration
                </CardTitle>
                <CardDescription className="text-sm">
                  Configure Databricks workspace for log and cluster monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="db-name" className="text-xs">Configuration Name *</Label>
                    <Input
                      id="db-name"
                      placeholder="e.g., Databricks Workspace"
                      value={databricksForm.name}
                      onChange={(e) => setDatabricksForm(prev => ({ ...prev, name: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-workspace-url" className="text-xs">Workspace URL *</Label>
                    <Input
                      id="db-workspace-url"
                      placeholder="https://adb-1234567890.azuredatabricks.net"
                      value={databricksForm.workspaceUrl}
                      onChange={(e) => setDatabricksForm(prev => ({ ...prev, workspaceUrl: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-token" className="text-xs">Personal Access Token *</Label>
                    <Input
                      id="db-token"
                      type="password"
                      placeholder="dapi_abcdef1234567890"
                      value={databricksForm.token}
                      onChange={(e) => setDatabricksForm(prev => ({ ...prev, token: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-cluster-id" className="text-xs">Cluster ID *</Label>
                    <Input
                      id="db-cluster-id"
                      placeholder="0923-164500-xyz123"
                      value={databricksForm.clusterId}
                      onChange={(e) => setDatabricksForm(prev => ({ ...prev, clusterId: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-workspace-id" className="text-xs">Workspace ID</Label>
                    <Input
                      id="db-workspace-id"
                      placeholder="1234567890"
                      value={databricksForm.workspaceId}
                      onChange={(e) => setDatabricksForm(prev => ({ ...prev, workspaceId: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-log-path" className="text-xs">Log Path</Label>
                    <Input
                      id="db-log-path"
                      placeholder="dbfs:/databricks/logs"
                      value={databricksForm.logPath}
                      onChange={(e) => setDatabricksForm(prev => ({ ...prev, logPath: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-log-format" className="text-xs">Log Format</Label>
                    <Select onValueChange={(value) => setDatabricksForm(prev => ({ ...prev, logFormat: value }))} defaultValue={databricksForm.logFormat}>
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="JSON" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="JSON" className="text-xs">JSON</SelectItem>
                        <SelectItem value="Plain Text" className="text-xs">Plain Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('databricks')} className="text-xs h-8 px-3 py-1.5">
                    <Save className="w-3 h-3 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline" className="text-xs h-8 px-3 py-1.5">
                    <TestTube className="w-3 h-3 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Databricks Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Saved Databricks Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="text-xs font-medium">Name</TableHead>
                      <TableHead className="text-xs font-medium">Workspace URL</TableHead>
                      <TableHead className="text-xs font-medium">Cluster ID</TableHead>
                      <TableHead className="text-xs font-medium">Log Path</TableHead>
                      <TableHead className="text-xs font-medium">Status</TableHead>
                      <TableHead className="text-xs font-medium">Last Updated</TableHead>
                      <TableHead className="text-xs font-medium">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('databricks').map((config) => (
                      <TableRow key={config.id} className="text-xs">
                        <TableCell className="font-medium text-xs">{config.name}</TableCell>
                        <TableCell className="text-xs">{config.config.workspaceUrl}</TableCell>
                        <TableCell className="text-xs">{config.config.clusterId}</TableCell>
                        <TableCell className="text-xs">{config.config.logPath}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell className="text-xs">{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)} className="h-6 w-6 p-0">
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 w-6 p-0">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)} className="h-6 w-6 p-0">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}