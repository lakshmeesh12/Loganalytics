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
  type: 'snowflake' | 'eks' | 'windows' | 'linux' | 'macos' | 'datadog';
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
    lastUpdated: '2025-01-27 14:30:00',
    config: { url: 'acme.snowflakecomputing.com', username: 'admin' }
  },
  {
    id: '2',
    name: 'EKS Cluster Main',
    type: 'eks',
    status: 'active',
    lastUpdated: '2025-01-27 13:15:00',
    config: { clusterName: 'main-cluster', region: 'us-east-1' }
  },
  {
    id: '3',
    name: 'Windows Server 01',
    type: 'windows',
    status: 'inactive',
    lastUpdated: '2025-01-26 09:45:00',
    config: { hostname: '192.168.1.100', username: 'administrator' }
  },
  {
    id: '4',
    name: 'Production DataDog',
    type: 'datadog',
    status: 'inactive',
    lastUpdated: '2025-01-26 10:00:00',
    config: { 
      apiKey: 'dd_api_1234567890', 
      appKey: 'dd_app_0987654321', 
      clientToken: 'dd_client_abcdef', 
      site: 'us1.datadoghq.com',
      rumEnabled: true,
      apmEnabled: false
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

  const [macosForm, setMacosForm] = useState({
    name: '',
    hostname: '',
    username: '',
    password: '',
    keyFile: '',
    systemLogPath: '/var/log/system.log',
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-success text-success-foreground"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'inactive':
        return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />Inactive</Badge>;
      case 'testing':
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Testing</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
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
      case 'macos':
        formData = macosForm;
        break;
      case 'datadog':
        formData = datadogForm;
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
      case 'macos':
        setMacosForm({ name: '', hostname: '', username: '', password: '', keyFile: '', systemLogPath: '/var/log/system.log', logFormat: 'Syslog' });
        break;
      case 'datadog':
        setDatadogForm({ name: '', apiKey: '', appKey: '', clientToken: '', site: 'us1.datadoghq.com', rumEnabled: false, apmEnabled: false });
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
        return <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />;
      case 'eks':
        return <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />;
      case 'windows':
        return <img src="https://th.bing.com/th/id/R.b57d432bf7e29c5738e5fe80278f1258?rik=auCFqC7NXcnbww&riu=http%3a%2f%2fgetdrawings.com%2ffree-icon%2fmicrosoft-windows-icon-63.png&ehk=6%2faDRtRmsK%2fy3Z4gZN%2b5J%2bO%2bGv2Ax8h4kiK7q32D3mc%3d&risl=&pid=ImgRaw&r=0" alt="Windows" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />;
      case 'linux':
        return <img src="https://cdn.iconscout.com/icon/free/png-256/linux-3521549-2944967.png" alt="Linux" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />;
      case 'macos':
        return <img src="https://www.pinclipart.com/picdir/big/236-2364339_macos-icon-clipart.png" alt="macOS" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />;
      case 'datadog':
        return <img src="https://www.datadoghq.com/favicon.ico" alt="DataDog" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />;
      default:
        return <Settings className="w-5 h-5" />;
    }
  };

  return (
    <AppLayout title="Data Source Configurations" breadcrumbs={["Configurations"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Data Source Configurations</h2>
            <p className="text-muted-foreground">Configure and manage your data sources for log monitoring</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Import Config
            </Button>
            <Button>
              <Save className="w-4 h-4 mr-2" />
              Save All
            </Button>
          </div>
        </div>

        {/* Configuration Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="snowflake" className="flex items-center gap-2">
              <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
              Snowflake
            </TabsTrigger>
            <TabsTrigger value="eks" className="flex items-center gap-2">
              <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
              AWS EKS
            </TabsTrigger>
            <TabsTrigger value="windows" className="flex items-center gap-2">
              <img src="https://th.bing.com/th/id/R.b57d432bf7e29c5738e5fe80278f1258?rik=auCFqC7NXcnbww&riu=http%3a%2f%2fgetdrawings.com%2ffree-icon%2fmicrosoft-windows-icon-63.png&ehk=6%2faDRtRmsK%2fy3Z4gZN%2b5J%2bO%2bGv2Ax8h4kiK7q32D3mc%3d&risl=&pid=ImgRaw&r=0" alt="Windows" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
              Windows
            </TabsTrigger>
            <TabsTrigger value="linux" className="flex items-center gap-2">
              <img src="https://cdn.iconscout.com/icon/free/png-256/linux-3521549-2944967.png" alt="Linux" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
              Linux
            </TabsTrigger>
            <TabsTrigger value="macos" className="flex items-center gap-2">
              <img src="https://www.pinclipart.com/picdir/big/236-2364339_macos-icon-clipart.png" alt="macOS" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
              macOS
            </TabsTrigger>
            <TabsTrigger value="datadog" className="flex items-center gap-2">
              <img src="https://www.datadoghq.com/favicon.ico" alt="DataDog" className="w-6 h-6 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
              DataDog
            </TabsTrigger>
          </TabsList>

          {/* Snowflake Configuration */}
          <TabsContent value="snowflake" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <img src="https://companieslogo.com/img/orig/SNOW-35164165.png?t=1720244494" alt="Snowflake" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
                  Snowflake Configuration
                </CardTitle>
                <CardDescription>
                  Configure Snowflake data warehouse connections for query log monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sf-name">Configuration Name *</Label>
                    <Input
                      id="sf-name"
                      placeholder="e.g., Production Snowflake"
                      value={snowflakeForm.name}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-url">Account URL *</Label>
                    <Input
                      id="sf-url"
                      placeholder="account.snowflakecomputing.com"
                      value={snowflakeForm.url}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, url: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-username">Username *</Label>
                    <Input
                      id="sf-username"
                      placeholder="username"
                      value={snowflakeForm.username}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-password">Password *</Label>
                    <Input
                      id="sf-password"
                      type="password"
                      placeholder="••••••••"
                      value={snowflakeForm.password}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, password: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-role">Role</Label>
                    <Input
                      id="sf-role"
                      placeholder="ACCOUNTADMIN"
                      value={snowflakeForm.role}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, role: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-warehouse">Warehouse</Label>
                    <Input
                      id="sf-warehouse"
                      placeholder="COMPUTE_WH"
                      value={snowflakeForm.warehouse}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, warehouse: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-database">Database</Label>
                    <Input
                      id="sf-database"
                      placeholder="PRODUCTION"
                      value={snowflakeForm.database}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, database: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-schema">Schema</Label>
                    <Input
                      id="sf-schema"
                      placeholder="PUBLIC"
                      value={snowflakeForm.schema}
                      onChange={(e) => setSnowflakeForm(prev => ({ ...prev, schema: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('snowflake')}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline">
                    <TestTube className="w-4 h-4 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Snowflake Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle>Saved Snowflake Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('snowflake').map((config) => (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">{config.name}</TableCell>
                        <TableCell>{config.config.url}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell>{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)}>
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)}>
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
                <CardTitle className="flex items-center gap-2">
                  <img src="https://res.cloudinary.com/hy4kyit2a/f_auto,fl_lossy,q_70/learn/modules/core-aws-services/explore-cloud-compute-with-aws/images/bfc2e1ee7013936df78568067c7ffeb6_30-e-1482-c-3561-4860-aaf-2-57-bee-7501266.png" alt="AWS EKS" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
                  AWS EKS Configuration
                </CardTitle>
                <CardDescription>
                  Configure AWS EKS cluster connections for Kubernetes log monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="eks-name">Configuration Name *</Label>
                    <Input
                      id="eks-name"
                      placeholder="e.g., Production EKS Cluster"
                      value={eksForm.name}
                      onChange={(e) => setEksForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-cluster">Cluster Name *</Label>
                    <Input
                      id="eks-cluster"
                      placeholder="my-cluster"
                      value={eksForm.clusterName}
                      onChange={(e) => setEksForm(prev => ({ ...prev, clusterName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-region">AWS Region *</Label>
                    <Select onValueChange={(value) => setEksForm(prev => ({ ...prev, region: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us-east-1">us-east-1</SelectItem>
                        <SelectItem value="us-west-2">us-west-2</SelectItem>
                        <SelectItem value="eu-west-1">eu-west-1</SelectItem>
                        <SelectItem value="ap-southeast-1">ap-southeast-1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-namespace">Namespace</Label>
                    <Input
                      id="eks-namespace"
                      placeholder="default"
                      value={eksForm.namespace}
                      onChange={(e) => setEksForm(prev => ({ ...prev, namespace: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-access-key">Access Key ID *</Label>
                    <Input
                      id="eks-access-key"
                      placeholder="AKIA..."
                      value={eksForm.accessKeyId}
                      onChange={(e) => setEksForm(prev => ({ ...prev, accessKeyId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eks-secret-key">Secret Access Key *</Label>
                    <Input
                      id="eks-secret-key"
                      type="password"
                      placeholder="••••••••"
                      value={eksForm.secretAccessKey}
                      onChange={(e) => setEksForm(prev => ({ ...prev, secretAccessKey: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eks-kubeconfig">Kubeconfig File</Label>
                  <Textarea
                    id="eks-kubeconfig"
                    placeholder="Paste kubeconfig content or upload file..."
                    rows={6}
                    value={eksForm.kubeconfig}
                    onChange={(e) => setEksForm(prev => ({ ...prev, kubeconfig: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('eks')}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline">
                    <TestTube className="w-4 h-4 mr-2" />
                    Test Connection
                  </Button>
                  <Button variant="outline">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Kubeconfig
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* EKS Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle>Saved EKS Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Cluster</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('eks').map((config) => (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">{config.name}</TableCell>
                        <TableCell>{config.config.clusterName}</TableCell>
                        <TableCell>{config.config.region}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell>{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)}>
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)}>
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
                <CardTitle className="flex items-center gap-2">
                  <img src="https://th.bing.com/th/id/R.b57d432bf7e29c5738e5fe80278f1258?rik=auCFqC7NXcnbww&riu=http%3a%2f%2fgetdrawings.com%2ffree-icon%2fmicrosoft-windows-icon-63.png&ehk=6%2faDRtRmsK%2fy3Z4gZN%2b5J%2bO%2bGv2Ax8h4kiK7q32D3mc%3d&risl=&pid=ImgRaw&r=0" alt="Windows" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
                  Windows Configuration
                </CardTitle>
                <CardDescription>
                  Configure Windows Event Log monitoring and PowerShell execution
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="win-name">Configuration Name *</Label>
                    <Input
                      id="win-name"
                      placeholder="e.g., Windows Server 01"
                      value={windowsForm.name}
                      onChange={(e) => setWindowsForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-hostname">Hostname/IP *</Label>
                    <Input
                      id="win-hostname"
                      placeholder="localhost or 192.168.1.100"
                      value={windowsForm.hostname}
                      onChange={(e) => setWindowsForm(prev => ({ ...prev, hostname: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-username">Username *</Label>
                    <Input
                      id="win-username"
                      placeholder="administrator"
                      value={windowsForm.username}
                      onChange={(e) => setWindowsForm(prev => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-password">Password *</Label>
                    <Input
                      id="win-password"
                      type="password"
                      placeholder="••••••••"
                      value={windowsForm.password}
                      onChange={(e) => setWindowsForm(prev => ({ ...prev, password: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-event-log">Event Log Name</Label>
                    <Select onValueChange={(value) => setWindowsForm(prev => ({ ...prev, eventLogName: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="System" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="System">System</SelectItem>
                        <SelectItem value="Application">Application</SelectItem>
                        <SelectItem value="Security">Security</SelectItem>
                        <SelectItem value="Setup">Setup</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="win-exec-policy">PowerShell Execution Policy</Label>
                    <Select onValueChange={(value) => setWindowsForm(prev => ({ ...prev, executionPolicy: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="RemoteSigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Restricted">Restricted</SelectItem>
                        <SelectItem value="RemoteSigned">RemoteSigned</SelectItem>
                        <SelectItem value="Unrestricted">Unrestricted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('windows')}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline">
                    <TestTube className="w-4 h-4 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Windows Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle>Saved Windows Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Hostname</TableHead>
                      <TableHead>Event Log</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('windows').map((config) => (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">{config.name}</TableCell>
                        <TableCell>{config.config.hostname}</TableCell>
                        <TableCell>{config.config.eventLogName}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell>{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)}>
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)}>
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

          /* Linux Configuration */
          <TabsContent value="linux" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <img src="https://cdn.iconscout.com/icon/free/png-256/linux-3521549-2944967.png" alt="Linux" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
                  Linux Configuration
                </CardTitle>
                <CardDescription>
                  Configure Linux system log monitoring via SSH and Syslog
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="linux-name">Configuration Name *</Label>
                    <Input
                      id="linux-name"
                      placeholder="e.g., Production Linux Server"
                      value={linuxForm.name}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-hostname">Hostname/IP *</Label>
                    <Input
                      id="linux-hostname"
                      placeholder="server.example.com or 192.168.1.50"
                      value={linuxForm.hostname}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, hostname: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-username">SSH Username *</Label>
                    <Input
                      id="linux-username"
                      placeholder="ubuntu or root"
                      value={linuxForm.username}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-password">SSH Password</Label>
                    <Input
                      id="linux-password"
                      type="password"
                      placeholder="••••••••"
                      value={linuxForm.password}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, password: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-syslog">Syslog Path</Label>
                    <Input
                      id="linux-syslog"
                      placeholder="/var/log/syslog"
                      value={linuxForm.syslogPath}
                      onChange={(e) => setLinuxForm(prev => ({ ...prev, syslogPath: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="linux-format">Log Format</Label>
                    <Select onValueChange={(value) => setLinuxForm(prev => ({ ...prev, logFormat: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Syslog" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Syslog">Syslog</SelectItem>
                        <SelectItem value="JSON">JSON</SelectItem>
                        <SelectItem value="Plain Text">Plain Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linux-key">SSH Private Key</Label>
                  <Textarea
                    id="linux-key"
                    placeholder="-----BEGIN PRIVATE KEY-----
Paste your SSH private key here...
-----END PRIVATE KEY-----"
                    rows={6}
                    value={linuxForm.keyFile}
                    onChange={(e) => setLinuxForm(prev => ({ ...prev, keyFile: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('linux')}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline">
                    <TestTube className="w-4 h-4 mr-2" />
                    Test SSH Connection
                  </Button>
                  <Button variant="outline">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Key File
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Linux Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle>Saved Linux Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Hostname</TableHead>
                      <TableHead>Syslog Path</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('linux').map((config) => (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">{config.name}</TableCell>
                        <TableCell>{config.config.hostname}</TableCell>
                        <TableCell>{config.config.syslogPath}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell>{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)}>
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)}>
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

          {/* macOS Configuration */}
          <TabsContent value="macos" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <img src="https://www.pinclipart.com/picdir/big/236-2364339_macos-icon-clipart.png" alt="macOS" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
                  macOS Configuration
                </CardTitle>
                <CardDescription>
                  Configure macOS system log monitoring via SSH and system logs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="macos-name">Configuration Name *</Label>
                    <Input
                      id="macos-name"
                      placeholder="e.g., MacBook Pro Development"
                      value={macosForm.name}
                      onChange={(e) => setMacosForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="macos-hostname">Hostname/IP *</Label>
                    <Input
                      id="macos-hostname"
                      placeholder="macbook.local or 192.168.1.200"
                      value={macosForm.hostname}
                      onChange={(e) => setMacosForm(prev => ({ ...prev, hostname: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="macos-username">SSH Username *</Label>
                    <Input
                      id="macos-username"
                      placeholder="admin or username"
                      value={macosForm.username}
                      onChange={(e) => setMacosForm(prev => ({ ...prev, username: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="macos-password">SSH Password</Label>
                    <Input
                      id="macos-password"
                      type="password"
                      placeholder="••••••••"
                      value={macosForm.password}
                      onChange={(e) => setMacosForm(prev => ({ ...prev, password: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="macos-log-path">System Log Path</Label>
                    <Input
                      id="macos-log-path"
                      placeholder="/var/log/system.log"
                      value={macosForm.systemLogPath}
                      onChange={(e) => setMacosForm(prev => ({ ...prev, systemLogPath: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="macos-format">Log Format</Label>
                    <Select onValueChange={(value) => setMacosForm(prev => ({ ...prev, logFormat: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Syslog" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Syslog">Syslog</SelectItem>
                        <SelectItem value="JSON">JSON</SelectItem>
                        <SelectItem value="Plain Text">Plain Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="macos-key">SSH Private Key</Label>
                  <Textarea
                    id="macos-key"
                    placeholder="-----BEGIN PRIVATE KEY-----
Paste your SSH private key here...
-----END PRIVATE KEY-----"
                    rows={6}
                    value={macosForm.keyFile}
                    onChange={(e) => setMacosForm(prev => ({ ...prev, keyFile: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('macos')}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline">
                    <TestTube className="w-4 h-4 mr-2" />
                    Test SSH Connection
                  </Button>
                  <Button variant="outline">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Key File
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* macOS Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle>Saved macOS Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Hostname</TableHead>
                      <TableHead>Log Path</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('macos').map((config) => (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">{config.name}</TableCell>
                        <TableCell>{config.config.hostname}</TableCell>
                        <TableCell>{config.config.systemLogPath}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell>{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)}>
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)}>
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
                <CardTitle className="flex items-center gap-2">
                  <img src="https://www.datadoghq.com/favicon.ico" alt="DataDog" className="w-8 h-8 rounded-md border border-gray-200 p-1 bg-white shadow-sm" />
                  DataDog Configuration
                </CardTitle>
                <CardDescription>
                  Configure DataDog integration for frontend and backend monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dd-name">Configuration Name *</Label>
                    <Input
                      id="dd-name"
                      placeholder="e.g., Production DataDog"
                      value={datadogForm.name}
                      onChange={(e) => setDatadogForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dd-api-key">API Key *</Label>
                    <Input
                      id="dd-api-key"
                      placeholder="Enter DataDog API Key"
                      value={datadogForm.apiKey}
                      onChange={(e) => setDatadogForm(prev => ({ ...prev, apiKey: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dd-app-key">Application Key *</Label>
                    <Input
                      id="dd-app-key"
                      placeholder="Enter DataDog Application Key"
                      value={datadogForm.appKey}
                      onChange={(e) => setDatadogForm(prev => ({ ...prev, appKey: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dd-client-token">Client Token (RUM)</Label>
                    <Input
                      id="dd-client-token"
                      placeholder="Enter DataDog Client Token"
                      value={datadogForm.clientToken}
                      onChange={(e) => setDatadogForm(prev => ({ ...prev, clientToken: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dd-site">DataDog Site</Label>
                    <Select
                      value={datadogForm.site}
                      onValueChange={(value) => setDatadogForm(prev => ({ ...prev, site: value }))}
                    >
                      <SelectTrigger id="dd-site">
                        <SelectValue placeholder="Select DataDog site" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us1.datadoghq.com">US1</SelectItem>
                        <SelectItem value="us3.datadoghq.com">US3</SelectItem>
                        <SelectItem value="us5.datadoghq.com">US5</SelectItem>
                        <SelectItem value="eu1.datadoghq.com">EU1</SelectItem>
                        <SelectItem value="ap1.datadoghq.com">AP1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Monitoring Options</Label>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="dd-rum-enabled"
                          checked={datadogForm.rumEnabled}
                          onCheckedChange={(checked) => setDatadogForm(prev => ({ ...prev, rumEnabled: checked }))}
                        />
                        <Label htmlFor="dd-rum-enabled">Enable RUM</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="dd-apm-enabled"
                          checked={datadogForm.apmEnabled}
                          onCheckedChange={(checked) => setDatadogForm(prev => ({ ...prev, apmEnabled: checked }))}
                        />
                        <Label htmlFor="dd-apm-enabled">Enable APM</Label>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => saveConfiguration('datadog')}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Configuration
                  </Button>
                  <Button variant="outline">
                    <TestTube className="w-4 h-4 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* DataDog Configurations Table */}
            <Card>
              <CardHeader>
                <CardTitle>Saved DataDog Configurations</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>API Key</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>RUM</TableHead>
                      <TableHead>APM</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredConfigurations('datadog').map((config) => (
                      <TableRow key={config.id}>
                        <TableCell className="font-medium">{config.name}</TableCell>
                        <TableCell>{config.config.apiKey.slice(0, 8)}...</TableCell>
                        <TableCell>{config.config.site}</TableCell>
                        <TableCell>{config.config.rumEnabled ? 'Enabled' : 'Disabled'}</TableCell>
                        <TableCell>{config.config.apmEnabled ? 'Enabled' : 'Disabled'}</TableCell>
                        <TableCell>{getStatusBadge(config.status)}</TableCell>
                        <TableCell>{config.lastUpdated}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => testConnection(config)}>
                              <TestTube className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => deleteConfiguration(config.id)}>
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